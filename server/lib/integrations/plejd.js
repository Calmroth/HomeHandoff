/**
 * Plejd integration — cloud auth for discovery + local TCP for control.
 *
 * Architecture:
 *   1. Auth against Plejd cloud to get a session token, site ID, and crypto key.
 *   2. Fetch the device list from the cloud (names, types, initial state).
 *   3. Discover the GWY-01 gateway on the LAN (mDNS → TCP probe → env override).
 *   4. Open a persistent TCP:9001 connection via PlejdGateway.
 *   5. Route all commands through the local TCP socket — no cloud round-trips.
 *   6. Receive real-time state updates from the TCP socket — no polling needed.
 *   7. Fall back to cloud polling every FALLBACK_POLL_MS if local TCP is unavailable.
 *
 * Environment variables:
 *   PLEJD_EMAIL        Plejd account email
 *   PLEJD_PASSWORD     Plejd account password
 *   PLEJD_SITE_ID      (optional) Site ID; auto-discovered if absent
 *   PLEJD_GATEWAY_IP   (optional) LAN IP of GWY-01; auto-discovered if absent
 *
 * Pushes:
 *   hub.pushUpdate('plejd_lights',   Room[])   — dimmable / on-off lights
 *   hub.pushUpdate('plejd_switches', Outlet[]) — relay outputs / plugs
 *
 * Commands (hub.onCommand('plejd', handler)):
 *   action: 'toggle'  params: { deviceId, on: boolean }
 *   action: 'dim'     params: { deviceId, brightness: 0–100 }
 */

import { createConnection } from 'net';
import { PlejdGateway } from '../plejd-gateway.js';

const PLEJD_BASE      = 'https://cloud.plejd.com';
const PLEJD_APP_ID    = 'zHtVqXt8k4yFyk2QGmgp48D9xZr2G94xWYnF4dak';
const GWY_TCP_PORT    = 9001;
const FALLBACK_POLL_MS = 30_000;  // cloud fallback when local TCP is down
const RECONNECT_MS    = 15_000;   // retry local TCP after disconnect
const DISCOVERY_MS    = 10_000;   // TCP probe timeout during gateway scan

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function plejdHeaders(sessionToken) {
  const h = {
    'X-Parse-Application-Id': PLEJD_APP_ID,
    'Content-Type': 'application/json',
  };
  if (sessionToken) h['X-Parse-Session-Token'] = sessionToken;
  return h;
}

async function plejdFetch(path, { method = 'GET', sessionToken, body } = {}) {
  const r = await fetch(`${PLEJD_BASE}${path}`, {
    method,
    headers: plejdHeaders(sessionToken),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!r.ok) {
    const err = new Error(`Plejd HTTP ${r.status} ${path}`);
    err.status = r.status;
    throw err;
  }
  return r.json();
}

async function login(email, password) {
  const j = await plejdFetch('/parse/login', {
    method: 'POST',
    body: { username: email, password },
  });
  if (!j.sessionToken) throw new Error('Plejd login: no sessionToken in response');
  return j.sessionToken;
}

async function getFirstSiteId(sessionToken) {
  const j = await plejdFetch('/parse/classes/Site?limit=100', { sessionToken });
  const first = (j.results || [])[0];
  if (!first) throw new Error('Plejd: no sites found for this account');
  return first.siteId || first.objectId;
}

/**
 * Fetch site details — device list, crypto key, and BLE address maps.
 * Returns { devices, cryptoKey, addressMap, meshToCloudId }.
 *
 * addressMap:    Map<meshId:number, bleAddr:Buffer(6)>  — for PlejdGateway per-device cipher
 * meshToCloudId: Map<meshId:number, cloudObjectId:string> — to correlate TCP state events
 */
async function fetchSiteDetails(sessionToken, siteId) {
  const j = await plejdFetch('/parse/functions/getSiteDetails', {
    method: 'POST', sessionToken, body: { siteId },
  });
  const detail = j.result || j;
  const rooms = (detail.rooms || []).reduce((acc, r) => {
    acc[r.roomId || r.objectId] = r.title;
    return acc;
  }, {});

  // Build address maps from deviceAddresses: { objectId → 12-char hex MAC }
  const addressMap    = new Map();  // meshId → bleAddr Buffer(6)
  const meshToCloudId = new Map();  // meshId → cloud objectId
  const cloudToMeshId = new Map();  // cloud objectId → meshId
  const addrEntries = detail.deviceAddresses || {};
  for (const [objId, rawAddr] of Object.entries(addrEntries)) {
    if (typeof rawAddr === 'string' && rawAddr.length === 12) {
      // BLE addr in normal MAC order (big-endian); reverse gives mesh byte order
      const bleAddr = Buffer.from(rawAddr, 'hex').reverse();
      const meshId  = bleAddr[0]; // first byte after reversal = mesh address
      addressMap.set(meshId, bleAddr);
      meshToCloudId.set(meshId, objId);
      cloudToMeshId.set(objId, meshId);
    }
  }

  const roomNames = new Map(
    (detail.rooms || []).map(r => [r.roomId || r.objectId, r.title])
  );

  const devices = (detail.plejdDevices || detail.devices || []).map(d => {
    const objectId = d.objectId || d.deviceId;
    const meshId   = cloudToMeshId.get(objectId) ?? (typeof d.deviceId === 'number' ? d.deviceId : undefined);
    return {
      id:       objectId,
      meshId,
      name:     d.title || d.name || objectId,
      roomId:   d.roomId || null,
      room:     roomNames.get(d.roomId) || d.room || '',
      type:     d.outputType || d.deviceType || d.traits || 'Light',
      isOn:     !!(d.outputSettings?.state || d.state),
      dim:      d.outputSettings?.dim ?? d.dim ?? null,
    };
  });

  // cryptoKey may be in detail.plejdMesh or detail.cryptoKey
  const cryptoKey = detail.plejdMesh?.cryptoKey
    || detail.cryptoKey
    || detail.key
    || null;
  return { devices, cryptoKey, addressMap, meshToCloudId, roomNames };
}

// Cloud fallback: send command via REST (used when local TCP is unavailable)
async function sendStateCloud(sessionToken, siteId, deviceId, state, dim) {
  return plejdFetch('/parse/functions/sendStateToDevice', {
    method: 'POST', sessionToken,
    body: {
      siteId, deviceId,
      state: !!state,
      ...(typeof dim === 'number' ? { dim } : {}),
    },
  });
}

// ── Gateway discovery ─────────────────────────────────────────────────────────

/**
 * Find the GWY-01 on the LAN.
 * Strategy:
 *   1. Use PLEJD_GATEWAY_IP env var if set.
 *   2. TCP-probe common subnets for an open port 9001.
 *      (mDNS would be cleaner but requires mdns/bonjour npm packages)
 *
 * Returns IP string or null.
 */
async function discoverGatewayIP(hint) {
  if (hint) {
    console.log(`[hub:plejd] Using gateway IP from env: ${hint}`);
    return hint;
  }

  // Determine likely subnet from process network interfaces
  const subnets = new Set();
  try {
    const { networkInterfaces } = await import('os');
    for (const ifaces of Object.values(networkInterfaces())) {
      for (const iface of (ifaces || [])) {
        if (iface.family === 'IPv4' && !iface.internal) {
          const parts = iface.address.split('.');
          parts[3] = '';
          subnets.add(parts.join('.'));
        }
      }
    }
  } catch { /* ignore */ }

  // Add common fallbacks
  subnets.add('192.168.1.');
  subnets.add('192.168.0.');
  subnets.add('10.0.0.');

  console.log('[hub:plejd] Scanning LAN for GWY-01 on port 9001…');

  for (const prefix of subnets) {
    const candidates = Array.from({ length: 254 }, (_, i) => `${prefix}${i + 1}`);
    // Check 20 IPs at a time to avoid flooding the router
    const BATCH = 20;
    for (let i = 0; i < candidates.length; i += BATCH) {
      const batch = candidates.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(ip => tcpProbe(ip, GWY_TCP_PORT, 600))
      );
      for (let j = 0; j < batch.length; j++) {
        if (results[j].value === true) {
          console.log(`[hub:plejd] Found GWY-01 candidate at ${batch[j]}`);
          return batch[j];
        }
      }
    }
  }

  console.warn('[hub:plejd] GWY-01 not found on LAN — will use cloud fallback');
  return null;
}

function tcpProbe(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const sock = createConnection({ host, port }, () => { sock.destroy(); resolve(true); });
    sock.on('error', () => resolve(false));
    sock.setTimeout(timeoutMs, () => { sock.destroy(); resolve(false); });
  });
}

// ── Mappers ───────────────────────────────────────────────────────────────────

const isPlug = (d) => /relay|outlet|plug|switch/i.test(d.type || '');

const bri255to100 = (dim) => typeof dim === 'number' ? Math.round((dim / 255) * 100) : 100;

/**
 * Map Plejd lights to room cards — grouped by Plejd room where possible.
 * Devices with no room assignment get individual cards (bulbs: 1).
 * Room card id = Plejd roomObjectId; _cloudDevice.id = 'room:<roomObjectId>'
 * so the command handler can fan out to all devices in the room.
 */
function mapRooms(devices) {
  const lights = devices.filter(d => !isPlug(d));
  const byRoom = new Map();  // roomObjectId → device[]
  const noRoom = [];

  for (const d of lights) {
    if (d.roomId) {
      if (!byRoom.has(d.roomId)) byRoom.set(d.roomId, []);
      byRoom.get(d.roomId).push(d);
    } else {
      noRoom.push(d);
    }
  }

  const result = [];

  // One card per Plejd room
  for (const [roomId, devs] of byRoom) {
    const onDevs = devs.filter(d => d.isOn);
    const on = onDevs.length > 0;
    const brightness = on
      ? Math.round(onDevs.reduce((s, d) => s + bri255to100(d.dim), 0) / onDevs.length)
      : 0;
    result.push({
      id:           roomId,
      name:         devs[0].room || roomId,
      bulbs:        devs.length,
      on,
      brightness,
      _cloudDevice: { id: `room:${roomId}` },
      _platform:    'plejd',
    });
  }

  // Ungrouped devices — individual cards
  for (const d of noRoom) {
    result.push({
      id:           d.id,
      name:         d.name,
      bulbs:        1,
      on:           d.isOn,
      brightness:   d.isOn ? bri255to100(d.dim) : 0,
      _cloudDevice: { id: d.id },
      _platform:    'plejd',
    });
  }

  return result;
}

function mapSwitches(devices) {
  return devices.filter(isPlug).map(d => ({
    id:           d.id,
    name:         d.name,
    room:         d.room || '',
    watts:        0,
    on:           d.isOn,
    alwaysOn:     false,
    icon:         'Plug',
    _cloudDevice: { id: d.id },
    _platform:    'plejd',
  }));
}

// ── Hash helper (skip broadcast when nothing changed) ─────────────────────────

const hsh = (arr, keyFn) => arr.map(keyFn).join('|');

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * @param {import('../wss.js').WssHub} hub
 * @param {{ email?: string, password?: string, siteId?: string, gatewayIp?: string }} opts
 * @returns {(() => void)|undefined}  cleanup fn
 */
export function startPlejdPoller(hub, {
  email,
  password,
  siteId: envSiteId,
  gatewayIp: envGatewayIp,
} = {}) {
  if (!email || !password) {
    console.log('[hub:plejd] Skipped — set PLEJD_EMAIL + PLEJD_PASSWORD in .env.local');
    return;
  }

  // ── Mutable state ──────────────────────────────────────────────────────────
  let sessionToken = null;
  let siteId       = envSiteId || null;
  let cryptoKey    = null;
  let gatewayIp    = envGatewayIp || null;

  /** @type {PlejdGateway|null} */
  let gateway      = null;
  let localActive  = false; // true when TCP connection is authenticated

  // BLE address maps populated from cloud; updated each fetch cycle
  let addressMap    = new Map();  // meshId:number → bleAddr:Buffer(6)
  let meshToCloudId = new Map();  // meshId:number → cloud objectId

  // Room grouping maps (populated from cloud getSiteDetails)
  let roomNames     = new Map();  // roomObjectId → room title
  let roomDeviceMap = new Map();  // roomObjectId → cloudDeviceId[]

  // In-memory device list (id → device object) for state merging
  /** @type {Map<string|number, object>} */
  const deviceMap  = new Map();
  const hashes     = {};
  let fallbackInterval = null;
  let reconnectTimer   = null;
  let cleanedUp        = false;

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function pushIfChanged(key, items, hashFn) {
    if (!items.length) return;
    const digest = hsh(items, hashFn);
    if (digest === hashes[key]) return;
    hashes[key] = digest;
    hub.pushUpdate(key, items);
  }

  function broadcastFromMap() {
    const devices = [...deviceMap.values()];
    pushIfChanged('plejd_lights',   mapRooms(devices),    l => `${l.id}:${l.on}:${l.brightness}`);
    pushIfChanged('plejd_switches', mapSwitches(devices), s => `${s.id}:${s.on}`);
  }

  // ── Cloud auth + device discovery ──────────────────────────────────────────

  async function ensureAuth() {
    sessionToken = await login(email, password);
    if (!siteId) {
      siteId = await getFirstSiteId(sessionToken);
      console.log(`[hub:plejd] Auto-discovered site: ${siteId}`);
    }
  }

  async function fetchAndSeedDevices() {
    const { devices, cryptoKey: ck, addressMap: am, meshToCloudId: mtc, roomNames: rn } =
      await fetchSiteDetails(sessionToken, siteId);
    if (ck) {
      cryptoKey = ck;
      console.log('[hub:plejd] Crypto key obtained from cloud');
    }
    if (am.size) {
      addressMap    = am;
      meshToCloudId = mtc;
      console.log(`[hub:plejd] Address map: ${am.size} devices`);
    }
    if (rn.size) {
      roomNames = rn;
      // Rebuild room → device index
      roomDeviceMap = new Map();
      for (const d of devices) {
        if (d.roomId) {
          if (!roomDeviceMap.has(d.roomId)) roomDeviceMap.set(d.roomId, []);
          roomDeviceMap.get(d.roomId).push(d.id);
        }
      }
      console.log(`[hub:plejd] Rooms: ${rn.size} (${[...rn.values()].join(', ')})`);
    }
    for (const d of devices) deviceMap.set(d.id, d);
    broadcastFromMap();
    return devices;
  }

  // ── Cloud fallback polling ─────────────────────────────────────────────────

  async function cloudPoll() {
    if (localActive) return; // local TCP is working — skip cloud poll
    try {
      if (!sessionToken) await ensureAuth();
      await fetchAndSeedDevices();
    } catch (e) {
      if (e.status === 401) {
        console.log('[hub:plejd] Session expired — will re-authenticate on next poll');
        sessionToken = null;
      } else {
        hub.pushError('plejd', `Cloud poll failed: ${e.message}`);
      }
    }
  }

  function startFallbackPoller() {
    if (fallbackInterval) return;
    fallbackInterval = setInterval(cloudPoll, FALLBACK_POLL_MS);
    console.log(`[hub:plejd] Cloud fallback polling every ${FALLBACK_POLL_MS / 1000}s`);
  }

  // ── Local TCP connection management ───────────────────────────────────────

  function connectLocal() {
    if (cleanedUp || !gatewayIp || !cryptoKey) return;

    console.log(`[hub:plejd] Connecting to GWY-01 at ${gatewayIp}:${GWY_TCP_PORT}`);
    gateway = new PlejdGateway(gatewayIp, cryptoKey, addressMap);

    gateway.on('state', ({ deviceId: meshId, on, brightness }) => {
      // TCP state events carry meshId (1-byte integer); deviceMap is keyed by cloud objectId
      const cloudId = meshToCloudId.get(meshId);
      const existing = deviceMap.get(meshId)
                    || deviceMap.get(String(meshId))
                    || (cloudId ? deviceMap.get(cloudId) : null);
      if (existing) {
        existing.isOn = on;
        existing.dim  = Math.round((brightness / 100) * 255); // store as 0-255 to match cloud format
      } else {
        // Unknown device reported by TCP — create minimal entry keyed by meshId
        deviceMap.set(meshId, {
          id: cloudId ?? meshId, meshId, name: `Plejd ${meshId}`, type: 'Light',
          isOn: on, dim: Math.round((brightness / 100) * 255), room: '',
        });
      }
      broadcastFromMap();
    });

    gateway.on('error', (err) => {
      console.error(`[hub:plejd] Gateway TCP error: ${err.message}`);
    });

    gateway.on('close', () => {
      localActive = false;
      console.log('[hub:plejd] Gateway connection closed — will retry');
      if (!cleanedUp) {
        reconnectTimer = setTimeout(connectLocal, RECONNECT_MS);
      }
    });

    gateway.connect()
      .then(() => {
        localActive = true;
        console.log(`[hub:plejd] Local TCP active — real-time state updates enabled`);
      })
      .catch((err) => {
        localActive = false;
        console.warn(`[hub:plejd] TCP connect failed: ${err.message} — retrying in ${RECONNECT_MS / 1000}s`);
        gateway = null;
        if (!cleanedUp) {
          reconnectTimer = setTimeout(connectLocal, RECONNECT_MS);
        }
      });
  }

  // ── Startup sequence ───────────────────────────────────────────────────────

  async function start() {
    try {
      await ensureAuth();
      await fetchAndSeedDevices();

      // Try to find the gateway even if we have no crypto key yet
      // (fetchSiteDetails should have given us the key — warn if not)
      if (!cryptoKey) {
        console.warn('[hub:plejd] No crypto key returned by cloud — local TCP commands unavailable');
      }

      // Discover gateway IP, then open TCP if we have the key
      gatewayIp = await discoverGatewayIP(gatewayIp);

      if (gatewayIp && cryptoKey) {
        connectLocal();
        // Still run a slow cloud poll so device metadata stays fresh
        // and we recover if the TCP socket silently stalls
        startFallbackPoller();
      } else {
        console.log('[hub:plejd] Running in cloud-only mode');
        startFallbackPoller();
      }
    } catch (e) {
      console.error(`[hub:plejd] Startup failed: ${e.message}`);
      hub.pushError('plejd', `Startup failed: ${e.message}`);
    }
  }

  start();

  // ── Command handler ────────────────────────────────────────────────────────
  hub.onCommand('plejd', async (action, params = {}) => {
    if (!sessionToken || !siteId) throw new Error('Plejd not yet initialized');

    const { deviceId, on, brightness } = params;
    if (deviceId === undefined || deviceId === null) {
      throw new Error('plejd command requires deviceId');
    }

    // ── Room fan-out ────────────────────────────────────────────────────────
    // _cloudDevice.id is 'room:<roomObjectId>' for grouped room cards.
    if (typeof deviceId === 'string' && deviceId.startsWith('room:')) {
      const roomId = deviceId.slice(5);
      const devIds = roomDeviceMap.get(roomId) || [];
      await Promise.allSettled(devIds.map(async (devObjectId) => {
        const dev = deviceMap.get(devObjectId);
        const devMeshId = dev?.meshId
          ?? [...meshToCloudId.entries()].find(([, cid]) => cid === devObjectId)?.[0];
        if (localActive && gateway && devMeshId != null) {
          if (action === 'toggle')      gateway.sendCommand(devMeshId, !!on);
          else if (action === 'dim')    gateway.sendCommand(devMeshId, (brightness ?? 0) > 0, brightness ?? 0);
          if (dev) {
            if (action === 'toggle')   { dev.isOn = !!on; }
            else if (action === 'dim') { dev.isOn = (brightness ?? 0) > 0; dev.dim = Math.round(((brightness ?? 0) / 100) * 255); }
          }
        } else {
          if (action === 'toggle')      await sendStateCloud(sessionToken, siteId, devObjectId, on, undefined);
          else if (action === 'dim') {
            const dim255 = Math.round(((brightness ?? 0) / 100) * 255);
            await sendStateCloud(sessionToken, siteId, devObjectId, (brightness ?? 0) > 0, dim255);
          }
        }
      }));
      broadcastFromMap();
      if (!localActive) setTimeout(cloudPoll, 600);
      return { ok: true, room: roomId, devices: devIds.length };
    }

    // ── Single-device path ───────────────────────────────────────────────────
    // Resolve cloud objectId and meshId from whatever the UI sent
    const d = deviceMap.get(deviceId) || deviceMap.get(String(deviceId));
    const cloudObjectId = d ? (d.id ?? deviceId) : String(deviceId);
    // meshId for TCP: from device record, or from meshToCloudId reverse lookup, or parseInt
    const meshId = d?.meshId
      ?? [...meshToCloudId.entries()].find(([, cid]) => cid === cloudObjectId)?.[0]
      ?? (typeof deviceId === 'number' ? deviceId : parseInt(deviceId, 10));

    if (localActive && gateway) {
      // Fast path: local TCP — sendCommand expects brightness in 0-100
      if (action === 'toggle') {
        gateway.sendCommand(meshId, !!on);
      } else if (action === 'dim') {
        gateway.sendCommand(meshId, (brightness ?? 0) > 0, brightness ?? 0);
      } else {
        throw new Error(`Unknown Plejd action: "${action}"`);
      }
      // Optimistically update local state so the UI responds immediately
      if (d) {
        if (action === 'toggle') {
          d.isOn = !!on;
        } else if (action === 'dim') {
          d.isOn = (brightness ?? 0) > 0;
          d.dim  = Math.round(((brightness ?? 0) / 100) * 255);
        }
        broadcastFromMap();
      }
    } else {
      // Slow path: cloud REST
      console.log('[hub:plejd] Using cloud REST for command (local TCP unavailable)');
      if (action === 'toggle') {
        await sendStateCloud(sessionToken, siteId, cloudObjectId, on, undefined);
      } else if (action === 'dim') {
        const dim255 = Math.round(((brightness ?? 0) / 100) * 255);
        await sendStateCloud(sessionToken, siteId, cloudObjectId, (brightness ?? 0) > 0, dim255);
      } else {
        throw new Error(`Unknown Plejd action: "${action}"`);
      }
      // Re-poll quickly to pick up updated state
      setTimeout(cloudPoll, 600);
    }

    return { ok: true };
  });

  // ── Cleanup ────────────────────────────────────────────────────────────────
  return () => {
    cleanedUp = true;
    if (fallbackInterval) clearInterval(fallbackInterval);
    if (reconnectTimer)   clearTimeout(reconnectTimer);
    if (gateway)          gateway.destroy();
  };
}
