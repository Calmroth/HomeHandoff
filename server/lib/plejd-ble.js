/**
 * PlejdBle — direct Bluetooth LE driver for the Plejd mesh.
 *
 * This is the transport that works when the GWY-01's local TCP socket is
 * firmware-locked (newer gateways expose NO inbound TCP) and the cloud
 * control function has been removed. It does exactly what the Plejd phone app
 * does at home: connect over BLE to the nearest mesh device, authenticate with
 * the site crypto key, and write encrypted commands. The mesh relays each
 * command internally to the addressed device, so ONE BLE connection controls
 * every light in the home.
 *
 * Drop-in sibling of PlejdGateway: same public contract
 *   connect(): Promise         — scan, connect, authenticate
 *   sendCommand(meshId, on, brightness?)
 *   get isReady
 *   destroy()
 *   events: 'ready' | 'state' {deviceId,on,brightness} | 'error' | 'close'
 * so server/lib/integrations/plejd.js can use either transport unchanged.
 *
 * Protocol (Plejd BLE, reverse-engineered by the community — ha-plejd et al.):
 *   Service         31ba0001-6085-4726-be45-040c957391b5
 *   DATA  (0x0004)  write commands, notify state
 *   AUTH  (0x0009)  challenge/response handshake
 *   PING  (0x000a)  keepalive
 *
 *   Auth:  write [0x00] to AUTH -> read 16-byte challenge -> write response
 *          response = SHA256(key XOR challenge)[0..15] XOR [16..31]   (== TCP)
 *   Crypto: AES-128-ECB stream cipher keyed on the CONNECTED device's BLE
 *          address (byte-reversed), identical scheme to the TCP gateway.
 *   Command payload (BLE framing, differs from the TCP 9-byte packet):
 *          ON   [meshId, 0x01,0x10,0x00, 0x97, 0x01]
 *          OFF  [meshId, 0x01,0x10,0x00, 0x97, 0x00]
 *          DIM  [meshId, 0x01,0x10,0x00, 0x98, 0x01, bri, bri]   (bri 0-255)
 *
 * Requires @stoprocent/noble (N-API prebuild — loads on Node 24 + Windows
 * WinRT with no driver replacement). Loaded lazily so a hub without the
 * package, or without a BLE adapter, degrades gracefully instead of crashing.
 */

import { createHash, createCipheriv, randomBytes } from 'crypto';
import { EventEmitter } from 'events';

const PLEJD_SERVICE = '31ba000160854726be45040c957391b5';
const CHAR_DATA     = '31ba000460854726be45040c957391b5';
const CHAR_AUTH     = '31ba000960854726be45040c957391b5';
const CHAR_PING     = '31ba000a60854726be45040c957391b5';

const SCAN_TIMEOUT_MS = 15_000;
const PING_MS         = 20_000;   // Plejd drops idle BLE links after ~a minute
const RECONNECT_MS    = 8_000;

// ── Crypto (identical to plejd-gateway.js) ──────────────────────────────────
function xorBuf(a, b) { return Buffer.from(a.map((v, i) => v ^ b[i])); }

function plejdEncDec(key, addr, data) {
  const input  = Buffer.concat([addr, addr, addr.subarray(0, 4)]); // 16 bytes
  const cipher = createCipheriv('aes-128-ecb', key, null);
  cipher.setAutoPadding(false);
  const keystream = Buffer.concat([cipher.update(input), cipher.final()]);
  return Buffer.from(data.map((b, i) => b ^ keystream[i % 16]));
}

function computeAuthResponse(key, challenge) {
  const hash = createHash('sha256').update(xorBuf(key, challenge)).digest();
  return xorBuf(hash.subarray(0, 16), hash.subarray(16));
}

/** "aa:bb:cc:dd:ee:ff" or "aabbccddeeff" -> reversed 6-byte Buffer. */
function addrToReversedBuffer(address) {
  const hex = String(address).replace(/[^0-9a-fA-F]/g, '');
  return Buffer.from(hex, 'hex').reverse();
}

export class PlejdBle extends EventEmitter {
  /**
   * @param {Buffer|string} cryptoKey 16-byte site AES key
   * @param {Map<number,Buffer>} [addressMap] meshId -> reversed BLE addr (unused
   *        for encryption here — BLE keys on the connected node — but accepted
   *        for signature parity with PlejdGateway)
   */
  constructor(cryptoKey, addressMap = new Map()) {
    super();
    this._key = Buffer.isBuffer(cryptoKey) ? cryptoKey : Buffer.from(cryptoKey, 'hex');
    if (this._key.length !== 16) {
      throw new Error(`PlejdBle: cryptoKey must be 16 bytes (got ${this._key.length})`);
    }
    this._addrMap    = addressMap;
    this._noble      = null;
    this._peripheral = null;
    this._dataChar   = null;
    this._authChar   = null;
    this._pingChar   = null;
    this._connAddr   = null;   // reversed BLE addr of the connected node (cipher key input)
    this._authed     = false;
    this._destroyed  = false;
    this._pingTimer  = null;
    this._reconnectTimer = null;
  }

  get isReady() { return this._authed; }

  async connect() {
    if (this._destroyed) throw new Error('PlejdBle: destroyed');
    // Lazy-load noble so a missing package / adapter is a soft failure.
    if (!this._noble) {
      try {
        this._noble = (await import('@stoprocent/noble')).default;
      } catch (e) {
        throw new Error(`PlejdBle: @stoprocent/noble unavailable (${e.message})`);
      }
    }
    await this._waitPoweredOn();
    const peripheral = await this._scanForStrongest();
    if (!peripheral) throw new Error('PlejdBle: no Plejd mesh device found in range');
    await this._connectAndAuth(peripheral);
  }

  _waitPoweredOn() {
    const noble = this._noble;
    if (noble.state === 'poweredOn') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('PlejdBle: adapter not poweredOn')), 8_000);
      const onState = (s) => {
        if (s === 'poweredOn') { clearTimeout(t); noble.removeListener('stateChange', onState); resolve(); }
      };
      noble.on('stateChange', onState);
    });
  }

  // Scan the mesh, pick the strongest Plejd node (best link = most reliable relay).
  _scanForStrongest() {
    const noble = this._noble;
    return new Promise(async (resolve) => {
      const seen = new Map(); // address -> { peripheral, rssi }
      const onDiscover = (p) => {
        const name = p.advertisement?.localName || '';
        // Every device advertising the service is a mesh node; "P mesh" is the
        // canonical localName but not all nodes set it, so trust the filter.
        seen.set(p.address, { peripheral: p, rssi: p.rssi, name });
      };
      noble.on('discover', onDiscover);
      try { await noble.startScanningAsync([PLEJD_SERVICE], false); } catch (e) { /* fall through */ }

      setTimeout(async () => {
        noble.removeListener('discover', onDiscover);
        try { await noble.stopScanningAsync(); } catch {}
        const best = [...seen.values()].sort((a, b) => b.rssi - a.rssi)[0];
        if (best) console.log(`[plejd-ble] Connecting to ${best.peripheral.address} (rssi ${best.rssi}${best.name ? `, "${best.name}"` : ''})`);
        resolve(best?.peripheral ?? null);
      }, SCAN_TIMEOUT_MS);
    });
  }

  async _connectAndAuth(peripheral) {
    this._peripheral = peripheral;
    this._connAddr = addrToReversedBuffer(peripheral.address);

    peripheral.once('disconnect', () => this._onDisconnect());
    await peripheral.connectAsync();

    // Discover the Plejd service + the three characteristics we use.
    const { characteristics } = await peripheral.discoverSomeServicesAndCharacteristicsAsync(
      [PLEJD_SERVICE], [CHAR_DATA, CHAR_AUTH, CHAR_PING],
    );
    for (const c of characteristics) {
      if (c.uuid === CHAR_DATA) this._dataChar = c;
      else if (c.uuid === CHAR_AUTH) this._authChar = c;
      else if (c.uuid === CHAR_PING) this._pingChar = c;
    }
    if (!this._dataChar || !this._authChar) {
      throw new Error('PlejdBle: required characteristics not found on device');
    }

    // Challenge/response handshake.
    await this._authChar.writeAsync(Buffer.from([0x00]), false);
    const challenge = await this._authChar.readAsync();
    await this._authChar.writeAsync(computeAuthResponse(this._key, challenge), false);

    // Subscribe to state notifications (best-effort; cloud poll covers display).
    try {
      this._dataChar.on('data', (buf) => this._onNotify(buf));
      await this._dataChar.subscribeAsync();
    } catch (e) {
      console.warn('[plejd-ble] state notifications unavailable:', e.message);
    }

    this._authed = true;
    this._startPing();
    console.log('[plejd-ble] Authenticated — mesh control active over Bluetooth');
    this.emit('ready');
  }

  /**
   * @param {number} meshId  target device's 1-byte mesh address
   * @param {boolean} on
   * @param {number} [brightness] 0-100 percent; omit for plain toggle
   */
  async sendCommand(meshId, on, brightness) {
    if (!this._authed || !this._dataChar) throw new Error('PlejdBle: not connected');
    const hasDim = typeof brightness === 'number';

    let payload;
    if (hasDim && on) {
      const bri = Math.max(0, Math.min(255, Math.round((brightness / 100) * 255)));
      payload = Buffer.from([meshId, 0x01, 0x10, 0x00, 0x98, 0x01, bri, bri]);
    } else {
      payload = Buffer.from([meshId, 0x01, 0x10, 0x00, 0x97, on ? 0x01 : 0x00]);
    }

    const enc = plejdEncDec(this._key, this._connAddr, payload);
    // Write WITH response so a dropped link surfaces as a rejected promise.
    await this._dataChar.writeAsync(enc, false);
  }

  destroy() {
    this._destroyed = true;
    this._stopPing();
    clearTimeout(this._reconnectTimer);
    this._authed = false;
    try { this._peripheral?.disconnectAsync?.(); } catch {}
    this._peripheral = null;
  }

  // ── State notifications ─────────────────────────────────────────────────────
  _onNotify(raw) {
    try {
      const dec = plejdEncDec(this._key, this._connAddr, raw);
      const deviceId = dec[0];
      const cmd = (dec[3] << 8) | dec[4];
      // 0x0097 on/off, 0x0098 / 0x00c8 dim — layout mirrors the mobile app feed.
      if (cmd === 0x0097) {
        this.emit('state', { deviceId, on: dec[5] !== 0, brightness: dec[5] !== 0 ? 100 : 0 });
      } else if (cmd === 0x0098 || cmd === 0x00c8) {
        const bri = dec[6] ?? 0;
        this.emit('state', { deviceId, on: true, brightness: Math.round((bri / 255) * 100) });
      }
    } catch { /* undecodable frame — ignore */ }
  }

  // ── Keepalive ────────────────────────────────────────────────────────────────
  _startPing() {
    this._stopPing();
    this._pingTimer = setInterval(async () => {
      if (!this._authed || !this._pingChar) return;
      try {
        const ping = randomBytes(1);
        await this._pingChar.writeAsync(ping, false);
        await this._pingChar.readAsync(); // response proves the link is alive
      } catch (e) {
        console.warn('[plejd-ble] ping failed — link stale, reconnecting');
        this._onDisconnect();
      }
    }, PING_MS);
  }

  _stopPing() {
    if (this._pingTimer) { clearInterval(this._pingTimer); this._pingTimer = null; }
  }

  _onDisconnect() {
    if (this._destroyed) return;
    const wasReady = this._authed;
    this._authed = false;
    this._stopPing();
    this._dataChar = this._authChar = this._pingChar = null;
    try { this._peripheral?.disconnectAsync?.(); } catch {}
    this._peripheral = null;

    if (wasReady) this.emit('close');
    this._reconnectTimer = setTimeout(() => {
      console.log('[plejd-ble] Reconnecting to mesh…');
      this.connect().catch((e) => {
        this.emit('error', e);
        // keep retrying
        if (!this._destroyed) this._reconnectTimer = setTimeout(() => this._onDisconnect(), RECONNECT_MS);
      });
    }, RECONNECT_MS);
  }
}
