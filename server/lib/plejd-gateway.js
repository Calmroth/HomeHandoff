/**
 * PlejdGateway — local LAN TCP driver for the Plejd GWY-01 internet gateway.
 *
 * The GWY-01 bridges the Plejd BLE mesh to the local network over TCP:9001.
 * This driver authenticates with the site crypto key, then sends/receives the
 * same AES-128-ECB stream cipher packets used over BLE.
 *
 * Protocol (reverse-engineered from community implementations):
 *   1. Connect TCP → GWY-01:9001
 *   2. Write 0x00 to begin authentication
 *   3. Read 16-byte challenge from gateway
 *   4. Compute response: SHA256(cryptoKey XOR challenge)[0..15] XOR [16..31]
 *   5. Write 16-byte response — gateway accepts and forwards BLE mesh traffic
 *   6. Exchange 9-byte command/state packets (AES stream cipher per device)
 *   7. Send 0x00 keepalive every 3 minutes or the gateway drops the connection
 *
 * Stream cipher (per-packet):
 *   keystream = AES-128-ECB(siteKey, addr||addr||addr[0..3])  // 16 bytes
 *   ciphertext = plaintext XOR keystream[i % 16]
 *   where addr = 6-byte BLE device address (reversed from MAC notation)
 *
 * Packet layout (plaintext, 9 bytes):
 *   [0] deviceId   — 1-byte mesh address
 *   [1] 0x01
 *   [2] 0x10
 *   [3] 0x00
 *   [4-5] command  — 0x0097 = on/off, 0x0098 = dim
 *   [6] 0x00
 *   [7] state      — 0x01=on, 0x00=off
 *   [8] brightness — 0-255 (only meaningful for 0x0098)
 *
 * Single-client constraint:
 *   The GWY-01 accepts only ONE TCP connection at a time. When the Plejd mobile
 *   app connects it evicts this driver. The reconnect logic handles that with
 *   exponential backoff (5 s → 60 s).
 *
 * Emits:
 *   'ready'              — authenticated, ready to send commands
 *   'state'  { deviceId: number, on: boolean, brightness: number }
 *   'error'  Error       — socket error; reconnect will follow
 *   'close'              — connection closed; reconnect scheduled (unless destroyed)
 */

import { createConnection } from 'net';
import { createHash, createCipheriv } from 'crypto';
import { EventEmitter } from 'events';

const TCP_PORT        = 9001;
const KEEPALIVE_MS    = 3 * 60_000;    // 3-minute keepalive
const CONNECT_TIMEOUT = 8_000;
const AUTH_TIMEOUT    = 5_000;
const RECONNECT_BASE  = 5_000;
const RECONNECT_MAX   = 60_000;

// ── Crypto helpers ─────────────────────────────────────────────────────────────

function xorBuf(a, b) {
  return Buffer.from(a.map((v, i) => v ^ b[i]));
}

/**
 * AES-128-ECB stream cipher — Plejd's per-device encryption scheme.
 * key:  16-byte site crypto key
 * addr: 6-byte BLE device address (byte-reversed from normal MAC notation)
 * data: Buffer to encrypt or decrypt (symmetric)
 */
function plejdEncDec(key, addr, data) {
  const input  = Buffer.concat([addr, addr, addr.subarray(0, 4)]); // 16 bytes
  const cipher = createCipheriv('aes-128-ecb', key, null);
  cipher.setAutoPadding(false);
  const keystream = Buffer.concat([cipher.update(input), cipher.final()]);
  return Buffer.from(data.map((b, i) => b ^ keystream[i % 16]));
}

/**
 * Challenge-response: SHA256(key XOR challenge) → XOR first/second halves.
 */
function computeAuthResponse(key, challenge) {
  const hash = createHash('sha256').update(xorBuf(key, challenge)).digest();
  return xorBuf(hash.subarray(0, 16), hash.subarray(16));
}

// ── PlejdGateway ───────────────────────────────────────────────────────────────

export class PlejdGateway extends EventEmitter {
  /**
   * @param {string}        ip          LAN IP of the GWY-01
   * @param {Buffer|string} cryptoKey   16-byte site AES key (Buffer or hex string)
   * @param {Map<number,Buffer>} [addressMap]
   *        meshDeviceId → 6-byte BLE address Buffer (byte-reversed).
   *        Required for per-device encryption. Build from getSiteDetails
   *        deviceAddresses: each value is a 12-char hex string (6 bytes).
   *        Reversed: Buffer.from(hex, 'hex').reverse()
   */
  constructor(ip, cryptoKey, addressMap = new Map()) {
    super();
    this._ip  = ip;
    this._key = Buffer.isBuffer(cryptoKey)
      ? cryptoKey
      : Buffer.from(cryptoKey, 'hex');
    if (this._key.length !== 16) {
      throw new Error(`PlejdGateway: cryptoKey must be exactly 16 bytes (got ${this._key.length})`);
    }
    this._addrMap = addressMap; // Map<meshId:number, bleAddr:Buffer(6)>

    this._socket     = null;
    this._keepalive  = null;
    this._readBuf    = Buffer.alloc(0);
    this._authed     = false;
    this._destroyed  = false;
    this._pendingAuth = null;

    this._reconnectDelay = RECONNECT_BASE;
    this._reconnectTimer = null;
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  get isReady() { return this._authed; }

  /**
   * Open TCP connection and authenticate.
   * Resolves when authenticated; rejects on timeout or error.
   * After initial connect the driver handles reconnects automatically.
   */
  connect() {
    return new Promise((resolve, reject) => {
      if (this._destroyed) return reject(new Error('PlejdGateway: already destroyed'));
      this._doConnect(resolve, reject);
    });
  }

  /**
   * Send a toggle or dim command to a device.
   * @param {number}  deviceId    1-byte mesh device address
   * @param {boolean} on
   * @param {number}  [brightness] 0-100 (percent); omit for plain toggle
   */
  sendCommand(deviceId, on, brightness) {
    if (!this._authed || !this._socket) {
      throw new Error('PlejdGateway: not connected');
    }

    const hasDim = typeof brightness === 'number';
    const bri255 = hasDim ? Math.round((brightness / 100) * 255) : 0;

    // Plaintext 9-byte packet
    const plain = Buffer.from([
      deviceId,
      0x01, 0x10, 0x00,
      0x00, hasDim ? 0x98 : 0x97,
      0x00,
      on ? 0x01 : 0x00,
      bri255,
    ]);

    const enc = this._encryptPacket(deviceId, plain);
    this._socket.write(enc);
  }

  /** Permanently tear down — no further reconnects. */
  destroy() {
    this._destroyed = true;
    this._stopKeepalive();
    clearTimeout(this._reconnectTimer);
    this._socket?.destroy();
    this._socket = null;
  }

  // ── Connection lifecycle ──────────────────────────────────────────────────────

  _doConnect(onReady = null, onFail = null) {
    if (this._destroyed) return;

    this._readBuf = Buffer.alloc(0);
    this._authed  = false;

    const sock = createConnection({ host: this._ip, port: TCP_PORT });
    this._socket = sock;

    const connectTimer = setTimeout(() => {
      sock.destroy();
      const err = new Error(`PlejdGateway: connect timeout to ${this._ip}:${TCP_PORT}`);
      if (onFail) onFail(err);
      else this.emit('error', err);
    }, CONNECT_TIMEOUT);

    sock.once('connect', () => {
      clearTimeout(connectTimer);
      this._initiateAuth(onReady, onFail);
    });

    sock.on('data',  (chunk) => this._onData(chunk));
    sock.on('error', (err) => {
      if (err.code !== 'ECONNREFUSED' && err.code !== 'ETIMEDOUT') {
        console.error(`[plejd-gwy] Socket error: ${err.code || err.message}`);
      }
      if (!this._authed && onFail) onFail(err);
      else if (this._authed) this.emit('error', err);
    });
    sock.on('close', () => this._onClose());
  }

  _initiateAuth(onReady, onFail) {
    this._socket.write(Buffer.from([0x00]));

    const authTimer = setTimeout(() => {
      this._socket?.destroy();
      const err = new Error('PlejdGateway: auth timeout — no challenge from gateway');
      if (onFail) onFail(err);
      else this.emit('error', err);
    }, AUTH_TIMEOUT);

    this._pendingAuth = { onReady, onFail, timer: authTimer };
  }

  _handleChallenge(challenge) {
    const { onReady, onFail, timer } = this._pendingAuth;
    this._pendingAuth = null;
    clearTimeout(timer);

    try {
      const response = computeAuthResponse(this._key, challenge);
      this._socket.write(response);
      this._authed = true;
      this._reconnectDelay = RECONNECT_BASE; // reset backoff on successful auth
      this._startKeepalive();

      console.log(`[plejd-gwy] Authenticated with ${this._ip} — local control active`);
      this.emit('ready');
      if (onReady) onReady();
    } catch (err) {
      if (onFail) onFail(err);
      else this.emit('error', err);
    }
  }

  _onClose() {
    const wasReady = this._authed;
    this._authed = false;
    this._stopKeepalive();
    this._socket = null;

    if (wasReady) {
      console.log('[plejd-gwy] Connection closed — scheduling reconnect');
    }
    this.emit('close');

    if (!this._destroyed) {
      this._reconnectTimer = setTimeout(() => {
        console.log(`[plejd-gwy] Reconnecting to ${this._ip}…`);
        this._reconnectDelay = Math.min(this._reconnectDelay * 2, RECONNECT_MAX);
        this._doConnect();
      }, this._reconnectDelay);
    }
  }

  // ── Data parsing ─────────────────────────────────────────────────────────────

  _onData(chunk) {
    this._readBuf = Buffer.concat([this._readBuf, chunk]);

    // Auth phase: wait for 16-byte challenge
    if (this._pendingAuth) {
      if (this._readBuf.length >= 16) {
        const challenge = this._readBuf.subarray(0, 16);
        this._readBuf   = this._readBuf.subarray(16);
        this._handleChallenge(challenge);
        if (this._readBuf.length > 0) this._parsePackets();
      }
      return;
    }

    this._parsePackets();
  }

  _parsePackets() {
    const PKT = 9;
    while (this._readBuf.length >= PKT) {
      const raw = this._readBuf.subarray(0, PKT);
      this._readBuf = this._readBuf.subarray(PKT);
      this._parseStatePacket(raw);
    }
  }

  _parseStatePacket(raw) {
    const deviceId = raw[0];
    const dec = this._decryptPacket(deviceId, raw);
    if (!dec) return;

    // Decrypted layout: [0]=deviceId [4-5]=cmd [6]=0x00 [7]=state [8]=brightness
    const cmd = (dec[4] << 8) | dec[5];
    const on  = dec[7] !== 0;
    const bri = dec[8] ?? 0; // 0-255

    if (cmd === 0x0097) {
      this.emit('state', { deviceId, on, brightness: on ? 100 : 0 });
    } else if (cmd === 0x0098 || cmd === 0x00c8) {
      // 0x0098 = dim ack (older GWY-01 firmware)
      // 0x00c8 = dim ack (GWY-01 firmware v1.7+) — same payload layout
      this.emit('state', {
        deviceId,
        on,
        brightness: Math.round((bri / 255) * 100),
      });
    }
    // Ignore other command codes (button presses, time sync, etc.)
  }

  // ── Crypto ────────────────────────────────────────────────────────────────────

  _encryptPacket(deviceId, plain) {
    const addr = this._addrMap.get(deviceId);
    if (addr) {
      // Per-device stream cipher using BLE address
      return plejdEncDec(this._key, addr, plain);
    }
    // Fallback: pad to 16 bytes, raw AES block cipher (works on some firmware)
    const padded = Buffer.alloc(16);
    plain.copy(padded);
    const c = createCipheriv('aes-128-ecb', this._key, null);
    c.setAutoPadding(false);
    return Buffer.concat([c.update(padded), c.final()]);
  }

  _decryptPacket(deviceId, raw) {
    try {
      const addr = this._addrMap.get(deviceId);
      if (addr) {
        return plejdEncDec(this._key, addr, raw);
      }
      // Fallback: raw AES block decrypt
      const c = createCipheriv('aes-128-ecb', this._key, null);
      c.setAutoPadding(false);
      return Buffer.concat([c.update(raw), c.final()]);
    } catch {
      return null;
    }
  }

  // ── Keepalive ─────────────────────────────────────────────────────────────────

  _startKeepalive() {
    this._stopKeepalive();
    this._keepalive = setInterval(() => {
      if (this._socket && this._authed) {
        this._socket.write(Buffer.from([0x00]));
      }
    }, KEEPALIVE_MS);
  }

  _stopKeepalive() {
    if (this._keepalive) {
      clearInterval(this._keepalive);
      this._keepalive = null;
    }
  }
}
