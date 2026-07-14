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
import { PlejdBle } from '../plejd-ble.js';

const PLEJD_BASE      = 'https://cloud.plejd.com';
const PLEJD_APP_ID    = 'zHtVqXt8k4yFyk2QGmgp48D9xZr2G94xWYnF4dak';
const GWY_TCP_PORT    = 9001;
const FALLBACK_POLL_MS = 30_000;  // cloud fallback when local TCP is down
const RECONNECT_MS    = 15_000;   // retry local TCP after disconnect
const DISCOVERY_MS    = 10_000;   // TCP probe timeout during gateway scan

// ── Array normalisation ────────────────────────────────────────────────────────
//
// The Plejd cloud API is inconsistent: some fields that should be arrays come
// back as JSON strings, Parse Relation pointers, or plain objects.
// toPlejdArray() handles all of these safely.
//
// Returns a non-empty array when the input contains usable data, or null so
// callers can use ?? chaining:
//   const nested = toPlejdArray(sc.sceneDevices) ?? toPlejdArray(sc.settings) ?? [];

function toPlejdArray(val) {
  if (Array.isArray(val) && val.length > 0) return val;
  // Some Plejd endpoints return arrays JSON-stringified inside the response body
  if (typeof val === 'string') {
    try {
      const p = JSON.parse(val);
      if (Array.isArray(p) && p.length > 0) return p;
    } catch {}
  }
  return null; // null → try next ?? candidate
}

// The site crypto key comes back as a Parse "Bytes" type
// ({__type:'Bytes', base64:'...'}), NOT the hex string the transports assumed.
// Passing that object to Buffer.from(x,'hex') silently yields 1 garbage byte,
// which the BLE/TCP constructors reject. Normalise every form to a 16-byte
// Buffer (or null).
function normalizeCryptoKey(v) {
  if (!v) return null;
  if (Buffer.isBuffer(v)) return v.length === 16 ? v : null;
  if (typeof v === 'object' && typeof v.base64 === 'string') {
    const b = Buffer.from(v.base64, 'base64');
    return b.length === 16 ? b : null;
  }
  if (typeof v === 'string') {
    const hex = v.replace(/[^0-9a-fA-F]/g, '');
    if (hex.length === 32) return Buffer.from(hex, 'hex');
    try { const b = Buffer.from(v, 'base64'); if (b.length === 16) return b; } catch {}
  }
  return null;
}

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
  // Parse the body regardless of status — we need it for error messages either way.
  let json;
  try { json = await r.json(); } catch { json = {}; }
  if (!r.ok) {
    const msg = json?.error || `HTTP ${r.status}`;
    const err = new Error(`Plejd ${r.status} ${path}: ${msg}`);
    err.status = r.status;
    throw err;
  }
  // Parse Cloud Functions signal errors via { error, code } even on HTTP 200.
  // Without this check, a "Device not found" or "Invalid session" error would
  // silently appear as a successful response to the caller.
  if (json?.error && json?.code != null) {
    const err = new Error(`Plejd ${path}: ${json.error} (code ${json.code})`);
    err.status = json.code;
    throw err;
  }
  return json;
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
  const j = await plejdFetch('/parse/functions/getSiteList', {
    method: 'POST', sessionToken, body: {},
  });
  const items = j.result || [];
  const first = items[0];
  if (!first) throw new Error('Plejd: no sites found for this account');
  const s = first.site || first;
  return s.siteId || s.objectId;
}

/**
 * Fetch site details via getSiteById — device list, crypto key, and BLE address maps.
 * Returns { devices, cryptoKey, addressMap, meshToCloudId, roomNames }.
 *
 * addressMap:    Map<meshId:number, bleAddr:Buffer(6)>  — for PlejdGateway per-device cipher
 * meshToCloudId: Map<meshId:number, cloudObjectId:string> — to correlate TCP state events
 */
async function fetchSiteDetails(sessionToken, siteId) {
  const j = await plejdFetch('/parse/functions/getSiteById', {
    method: 'POST', sessionToken, body: { siteId },
  });
  // getSiteById returns result as an array; handle both array and plain object
  const detail = (Array.isArray(j.result) ? j.result[0] : j.result) || j;

  // One-time diagnostic log — shows exact field names from the live API
  console.log('[hub:plejd] rooms[0]:', JSON.stringify(detail.rooms?.[0] ?? null));
  console.log('[hub:plejd] plejdDevices[0]:', JSON.stringify(detail.plejdDevices?.[0] ?? null));
  const firstAddr = Object.entries(detail.deviceAddresses ?? detail.outputAddress ?? {})[0];
  console.log('[hub:plejd] deviceAddresses[0]:', firstAddr ?? null);
  console.log('[hub:plejd] cryptoKey paths: plejdMesh=', !!detail.plejdMesh?.cryptoKey,
    'site=', !!detail.site?.cryptoKey, 'root=', !!detail.cryptoKey);

  // Room name lookup — index by BOTH roomId and objectId so either reference works.
  // getSiteById sometimes returns rooms as Parse pointers {__type:'Pointer', objectId}
  // with no title field. In that case we fall back to a direct /parse/classes/Room query.
  const roomNames = new Map();
  for (const r of (toPlejdArray(detail.rooms) ?? [])) {
    const title = r.title || r.name || r.roomTitle || r.roomName || null;
    if (r.objectId) roomNames.set(r.objectId, title);
    if (r.roomId && r.roomId !== r.objectId) roomNames.set(r.roomId, title);
  }

  // If all (or any) rooms came back without a title, fetch full Room objects directly.
  // Filter by site so we only get rooms belonging to this installation.
  const missingTitles = roomNames.size === 0 || [...roomNames.values()].some(v => !v);
  if (missingTitles) {
    // Try two query forms: pointer to Installation (new API) and plain siteId field (old API)
    const queries = [
      `/parse/classes/Room?where=${encodeURIComponent(JSON.stringify({ site: { __type: 'Pointer', className: 'Installation', objectId: siteId } }))}`,
      `/parse/classes/Room?where=${encodeURIComponent(JSON.stringify({ siteId }))}`,
      `/parse/classes/Room`,
    ];
    for (const q of queries) {
      try {
        const roomsJ = await plejdFetch(q, { sessionToken });
        const results = roomsJ.results || [];
        console.log(`[hub:plejd] Room query "${q.split('?')[0]}" returned ${results.length} rooms`);
        if (results.length === 0) continue;
        for (const r of results) {
          const title = r.title || r.name || r.roomTitle || r.roomName || null;
          if (r.objectId) roomNames.set(r.objectId, title || roomNames.get(r.objectId) || null);
          if (r.roomId && r.roomId !== r.objectId) roomNames.set(r.roomId, title || roomNames.get(r.roomId) || null);
        }
        console.log('[hub:plejd] Room titles resolved:',
          [...new Set(roomNames.values())].filter(Boolean).join(', ') || '(none found)');
        break; // stop after first query that returns results
      } catch (e) {
        console.warn(`[hub:plejd] Room query failed (${q.split('?')[0]}):`, e.message);
      }
    }
  }

  // BLE address lookup — try deviceAddresses first, then outputAddress.
  // Keys are plejdDevice objectIds (hardware layer); values are MAC hex strings.
  // We build two indexes:
  //   deviceBleAddr: hwObjId → Buffer(6) reversed BLE addr
  //   macToBleAddr:  MAC_hex_lower → Buffer(6)   (lets us look up by user-device deviceId field)
  const deviceBleAddr = new Map();  // hwObjId → Buffer(6) reversed BLE addr
  const macToBleAddr  = new Map();  // MAC hex (lowercase) → Buffer(6)
  const macToMeshId   = new Map();  // MAC hex (lowercase) → meshId:number
  const rawAddrMap = detail.deviceAddresses ?? detail.outputAddress ?? {};
  for (const [objId, rawEntry] of Object.entries(rawAddrMap)) {
    // Three observed shapes of a deviceAddresses entry:
    //   A (v4 firmware): key = MAC hex,  value = { '0': meshId }   ← the mesh
    //                    address is the value under output index '0', NOT the
    //                    last byte of the MAC. Deriving it from the MAC is wrong.
    //   B (older):       key = objId,    value = MAC hex string
    //   C:               value = { address|bleAddress: MAC hex }
    const keyIsMac = /^[0-9a-fA-F]{12}$/.test(objId);
    let macHex = keyIsMac ? objId.toLowerCase() : null;
    let meshId = null;

    if (typeof rawEntry === 'string' && rawEntry.length === 12) {
      macHex = rawEntry.toLowerCase();                     // B
    } else if (rawEntry && typeof rawEntry === 'object') {
      if (rawEntry['0'] != null) meshId = Number(rawEntry['0']); // A
      const addr = rawEntry.address ?? rawEntry.bleAddress;
      if (typeof addr === 'string' && addr.length === 12) macHex = addr.toLowerCase(); // C
    }

    if (macHex) {
      // Plejd MAC stored big-endian; reversed = mesh byte order.
      const buf = Buffer.from(macHex, 'hex').reverse();
      deviceBleAddr.set(objId, buf);
      macToBleAddr.set(macHex, buf);
      if (Number.isInteger(meshId)) macToMeshId.set(macHex, meshId);
    }
  }

  // Build address maps (meshId ↔ cloudObjectId) and flat device list.
  //
  // Data layers:
  //   detail.devices      — USER LAYER: user-given names, room assignments, Parse objectIds
  //                         that match what sendStateToDevice expects and what the browser sends
  //   detail.plejdDevices — HARDWARE LAYER: BLE MACs, firmware, no user names
  //
  // Strategy: iterate detail.devices (user layer) as primary source for names/rooms.
  // Resolve the BLE address for each user device via its MAC (d.deviceId field)
  // cross-referenced into deviceAddresses. Fall back to plejdDevices if user
  // devices are absent (older API format).
  const addressMap    = new Map();  // meshId:number → bleAddr Buffer(6)
  const meshToCloudId = new Map();  // meshId:number → user-device objectId
  const cloudToMeshId = new Map();  // user-device objectId → first meshId

  // outputSettings may be a flat top-level list or nested per-device
  const topLevelOutputSettings = Array.isArray(detail.outputSettings) ? detail.outputSettings : [];

  // Iterate user-layer devices first; fall back to hardware devices if absent.
  // This gives real user names and room UUIDs that match the browser's cloud poller IDs.
  // Deduplicate by objectId — the Plejd API sometimes returns each device twice.
  const rawSourceDevices = toPlejdArray(detail.devices)
    ?? toPlejdArray(detail.plejdDevices)
    ?? [];
  const _seenIds = new Set();
  const sourceDevices = rawSourceDevices.filter(d => {
    const key = d.objectId || String(d.deviceId ?? '');
    if (!key || _seenIds.has(key)) return false;
    _seenIds.add(key);
    return true;
  });

  const devices = [];
  for (const d of sourceDevices) {
    const objectId = d.objectId || String(d.deviceId ?? '');
    const roomId   = d.roomId || (typeof d.room === 'object' ? d.room?.objectId : null) || null;
    const roomTitle = roomId ? (roomNames.get(roomId) || null) : null;
    const room     = roomTitle || (typeof d.room === 'string' ? d.room : '') || '';

    // Resolve BLE address:
    //   1. For user-layer devices: d.deviceId is the MAC address → macToBleAddr lookup
    //   2. For hardware-layer devices: d.objectId is the deviceAddresses key → deviceBleAddr
    const macHex = (typeof d.deviceId === 'string' && d.deviceId.length === 12)
      ? d.deviceId.toLowerCase() : null;
    const bleAddr = (macHex ? macToBleAddr.get(macHex) : null)
      ?? deviceBleAddr.get(objectId);

    // Per-device outputSettings — may be an array, a single object, or absent.
    // The Plejd API returns either [{name,outputType,...}] or {name,outputType,...} per device.
    // Fall back to top-level list if neither is present (check both user-layer and hardware IDs).
    const perDeviceOutputs = Array.isArray(d.outputSettings) ? d.outputSettings
      : d.outputSettings && typeof d.outputSettings === 'object' ? [d.outputSettings]
      : topLevelOutputSettings.filter(o =>
          o.deviceParseId === objectId || o.deviceId === objectId
          || (macHex && (o.deviceId ?? '').toLowerCase() === macHex));

    if (perDeviceOutputs.length > 0) {
      for (const out of perDeviceOutputs) {
        // Mesh address priority: deviceAddresses {'0':meshId} (authoritative on
        // v4 firmware) > outputSettings.deviceId small int (older) > MAC last
        // byte (last-ditch; wrong on v4, kept only for legacy sites).
        const outMeshId = macToMeshId.get(macHex)
          ?? (typeof out.deviceId === 'number' && out.deviceId < 256 ? out.deviceId : undefined)
          ?? (bleAddr ? bleAddr[0] : undefined);
        if (outMeshId !== undefined && bleAddr) {
          addressMap.set(outMeshId, bleAddr);
          meshToCloudId.set(outMeshId, objectId);
          if (!cloudToMeshId.has(objectId)) cloudToMeshId.set(objectId, outMeshId);
        }
        devices.push({
          id:       objectId,
          meshId:   outMeshId,
          name:     d.title || d.name || out.name || out.title || objectId,
          roomId,
          room,
          type:     d.outputType || d.deviceType || d.traits || out.outputType || 'Light',
          isOn:     !!(out.state ?? d.state),
          dim:      out.dim ?? d.dim ?? null,
          dimmable: d.dimmable ?? out.dimmable ?? true,
        });
      }
    } else {
      // Single-output device — authoritative meshId from deviceAddresses,
      // else MAC last byte (legacy only).
      const meshId = macToMeshId.get(macHex) ?? (bleAddr ? bleAddr[0] : undefined);
      if (meshId !== undefined) {
        if (bleAddr) addressMap.set(meshId, bleAddr);
        meshToCloudId.set(meshId, objectId);
        cloudToMeshId.set(objectId, meshId);
      }
      devices.push({
        id:       objectId,
        meshId,
        name:     d.title || d.name || d.deviceTitle || objectId,
        roomId,
        room,
        type:     d.outputType || d.deviceType || d.traits || 'Light',
        isOn:     !!(d.state),
        dim:      d.dim ?? null,
        dimmable: d.dimmable ?? true,
      });
    }
  }

  // Crypto key — check all known nesting paths, normalise Parse Bytes → Buffer
  const cryptoKey = normalizeCryptoKey(
    detail.plejdMesh?.cryptoKey
    || detail.site?.cryptoKey
    || detail.cryptoKey
    || detail.key
    || null
  );

  // Parse scenes — sceneDevices may be a separate top-level list or nested per scene.
  // toPlejdArray() handles JSON-string responses that caused "nested.map is not a function".
  const sceneDevLookup = new Map();  // sceneId → device step[]
  for (const sd of (toPlejdArray(detail.sceneDevices) ?? [])) {
    const sid = sd.sceneId || sd.scene?.objectId;
    if (!sid) continue;
    if (!sceneDevLookup.has(sid)) sceneDevLookup.set(sid, []);
    const val = sd.value ?? sd.dim;
    sceneDevLookup.get(sid).push({
      deviceId:   sd.deviceId || sd.deviceObjectId || sd.objectId,
      on:         val != null ? val > 0 : (sd.state != null ? !!sd.state : true),
      brightness: val != null ? Math.round((val / 255) * 100) : 100,
    });
  }
  const scenes = (toPlejdArray(detail.scenes) ?? []).map(sc => {
    // sc.sceneDevices / settings / steps may be a JSON string, array, or Relation pointer.
    // toPlejdArray() returns a non-empty array or null so ?? chaining works correctly.
    const nested = toPlejdArray(sc.sceneDevices)
      ?? toPlejdArray(sc.settings)
      ?? toPlejdArray(sc.steps)
      ?? [];
    const devList = nested.length > 0
      ? nested.map(sd => {
          const val = sd.value ?? sd.dim;
          return {
            deviceId:   sd.deviceId || sd.deviceObjectId || sd.objectId,
            on:         val != null ? val > 0 : (sd.state != null ? !!sd.state : true),
            brightness: val != null ? Math.round((val / 255) * 100) : 100,
          };
        })
      : (sceneDevLookup.get(sc.objectId) ?? []);
    return { id: sc.objectId, title: sc.title || sc.name || sc.objectId, devices: devList };
  }).filter(sc => sc.devices.length > 0);

  console.log(`[hub:plejd] Parsed: ${devices.length} devices, ${roomNames.size / 2 | 0} rooms, `
    + `${addressMap.size} BLE addresses, ${scenes.length} scenes, cryptoKey ${cryptoKey ? 'ok' : 'MISSING'}`);
  return { devices, cryptoKey, addressMap, meshToCloudId, roomNames, scenes };
}

// Cloud fallback: send command via REST (used when local TCP is unavailable).
// NOTE: Plejd's Parse backend rejects this with 400 'Invalid function' as of
// 2026 — the function was removed (or never public). Kept for older backends;
// callers detect e.invalidFn and stop retrying.
async function sendStateCloud(sessionToken, siteId, deviceId, state, dim) {
  const body = {
    siteId, deviceId,
    state: !!state,
    ...(typeof dim === 'number' ? { dim } : {}),
  };
  console.log(`[hub:plejd] cloud cmd → deviceId=${deviceId} state=${!!state}${typeof dim === 'number' ? ` dim=${dim}` : ''}`);
  try {
    const result = await plejdFetch('/parse/functions/sendStateToDevice', {
      method: 'POST', sessionToken, body,
    });
    console.log(`[hub:plejd] cloud cmd ✓ result=${JSON.stringify(result?.result ?? result)}`);
    return result;
  } catch (e) {
    if (/invalid function/i.test(String(e.message || ''))) e.invalidFn = true;
    throw e;
  }
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

const isPlug = (d) => {
  if (/relay|outlet|plug/i.test(d.type || '')) return true;
  // Plejd relay modules report dimmable:false; lights/dimmers report true or omit it
  if (d.dimmable === false && !/button|sensor|pir|gwy|gateway/i.test(d.type || '')) return true;
  return false;
};

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
      _cloudDevice:  { id: `room:${roomId}` },
      // Per-device list — enables individual control from the expanded room card.
      // Each entry carries the cloud objectId (what hub and cloud commands expect),
      // the user-given name, current state, and whether the device is dimmable.
      _cloudDevices: devs.map(d => ({
        id:       d.id,
        name:     d.name,
        type:     d.type,
        isOn:     d.isOn,
        dim:      d.dim,
        dimmable: d.dimmable !== false,
        meshId:   d.meshId,
      })),
      _platform:    'plejd',
    });
  }

  // Ungrouped devices — individual cards (single-element _cloudDevices for consistency)
  for (const d of noRoom) {
    result.push({
      id:           d.id,
      name:         d.name,
      bulbs:        1,
      on:           d.isOn,
      brightness:   d.isOn ? bri255to100(d.dim) : 0,
      _cloudDevice:  { id: d.id },
      _cloudDevices: [{ id: d.id, name: d.name, type: d.type, isOn: d.isOn, dim: d.dim, dimmable: d.dimmable !== false, meshId: d.meshId }],
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
  // Two boot paths:
  //   1. email + password in env → hub authenticates itself, auto-starts
  //   2. No env credentials → register command handler and wait for browser
  //      to send a `setSession` command with its cloud session token.
  //      The user logs in once via the Settings UI; the browser hands the
  //      token to the hub on each WebSocket connect.
  const hasCredentials = !!(email && password);
  if (!hasCredentials) {
    console.log('[hub:plejd] No PLEJD_EMAIL/PASSWORD — will bootstrap session from browser setSession command');
  }

  // ── Mutable state ──────────────────────────────────────────────────────────
  let sessionToken = null;
  let siteId       = envSiteId || null;
  let cryptoKey    = null;
  let gatewayIp    = envGatewayIp || null;

  /** @type {PlejdGateway|null} */
  let gateway      = null;
  let localActive  = false; // true when TCP connection is authenticated
  let connecting   = false; // single-flight guard for the local transport
  let initDone     = false; // initFromSession has run once (idempotent thereafter)
  // Plejd removed the sendStateToDevice Parse function — every cloud command
  // 400s with "Invalid function". Flip this on first sighting so we fail fast
  // with an actionable message instead of spamming dead requests.
  let cloudControlDead = false;

  // BLE address maps populated from cloud; updated each fetch cycle
  let addressMap    = new Map();  // meshId:number → bleAddr:Buffer(6)
  let meshToCloudId = new Map();  // meshId:number → cloud objectId

  // Room grouping maps (populated from cloud getSiteDetails)
  let roomNames     = new Map();  // roomObjectId → room title
  let roomDeviceMap = new Map();  // roomObjectId → cloudDeviceId[]
  let scenesCache   = new Map();  // sceneId → { id, title, devices[] }

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
    const { devices, cryptoKey: ck, addressMap: am, meshToCloudId: mtc, roomNames: rn, scenes: fetchedScenes = [] } =
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
      // Rebuild room → device index (deduplicate: multi-output devices share objectId)
      roomDeviceMap = new Map();
      for (const d of devices) {
        if (d.roomId) {
          if (!roomDeviceMap.has(d.roomId)) roomDeviceMap.set(d.roomId, []);
          const arr = roomDeviceMap.get(d.roomId);
          if (!arr.includes(d.id)) arr.push(d.id);
        }
      }
      // Log unique room names (rn.size = 2× actual rooms because each room is stored by
      // both objectId and roomId; dividing by 2 gives the true count)
      const uniqueRoomTitles = [...new Set(rn.values())].filter(Boolean);
      console.log(`[hub:plejd] ${uniqueRoomTitles.length} rooms: ${uniqueRoomTitles.join(', ')}`);
      console.log(`[hub:plejd] roomDeviceMap: ${roomDeviceMap.size} entries — ` +
        [...roomDeviceMap.entries()].map(([k, v]) => `${k}→[${v.length}]`).join(', '));
    }
    for (const d of devices) deviceMap.set(d.id, d);
    broadcastFromMap();
    // Scenes — broadcast once on each fetch; only updates when titles change
    if (fetchedScenes.length) {
      scenesCache = new Map(fetchedScenes.map(sc => [sc.id, sc]));
      hub.pushUpdate('plejd_scenes', fetchedScenes.map(({ id, title }) => ({ id, title })));
    }
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

  // ── Local transport management (BLE preferred, TCP fallback) ──────────────
  //
  // Two local transports share one contract (connect / sendCommand / isReady /
  // destroy + ready|state|error|close events):
  //   PlejdBle     — talks Bluetooth straight to the mesh (what the phone does).
  //                  Works on modern GWY-01 firmware that closed the TCP socket.
  //   PlejdGateway — legacy TCP:9001 to the GWY-01 (older firmware only).
  // Whichever connects first becomes `gateway`; the command handler is unaware
  // which one it's driving.

  // Shared state-event handler — meshId (1-byte int) into the cloud-keyed map.
  function attachTransportEvents(transport, label, onClose) {
    transport.on('state', ({ deviceId: meshId, on, brightness }) => {
      const cloudId = meshToCloudId.get(meshId);
      const existing = deviceMap.get(meshId)
                    || deviceMap.get(String(meshId))
                    || (cloudId ? deviceMap.get(cloudId) : null);
      if (existing) {
        existing.isOn = on;
        existing.dim  = Math.round((brightness / 100) * 255);
      } else {
        deviceMap.set(meshId, {
          id: cloudId ?? meshId, meshId, name: `Plejd ${meshId}`, type: 'Light',
          isOn: on, dim: Math.round((brightness / 100) * 255), room: '',
        });
      }
      broadcastFromMap();
    });
    transport.on('error', (err) => console.error(`[hub:plejd] ${label} error: ${err.message}`));
    transport.on('close', onClose);
  }

  // Try BLE first (needs only the crypto key — no gateway IP, works on locked
  // firmware). If BLE can't find the mesh, fall through to TCP when an IP exists.
  function connectLocal() {
    if (cleanedUp || !cryptoKey) return;
    connectBle();
  }

  function connectBle() {
    // Single-flight: a second setSession (React re-fire) must not spin up a
    // rival BLE flow — two centrals fighting one adapter drop the link right
    // after auth. Skip if a connect is in progress or already active.
    if (cleanedUp || !cryptoKey || connecting || localActive) return;
    connecting = true;
    console.log('[hub:plejd] Connecting to Plejd mesh over Bluetooth…');
    let ble;
    try {
      ble = new PlejdBle(cryptoKey, addressMap);
    } catch (e) {
      connecting = false;
      console.warn(`[hub:plejd] BLE init failed: ${e.message} — trying TCP`);
      return connectTcp();
    }
    gateway = ble;
    attachTransportEvents(ble, 'BLE', () => {
      localActive = false;
      hub.pushHealth('plejd', 'down', 'Bluetooth link dropped — reconnecting');
      // PlejdBle reconnects itself; just reflect status.
    });
    ble.connect()
      .then(() => {
        connecting = false;
        localActive = true;
        hub.pushHealth('plejd', 'ok', 'Local control active over Bluetooth');
        console.log('[hub:plejd] Bluetooth mesh control active');
      })
      .catch((err) => {
        connecting = false;
        localActive = false;
        gateway = null;
        console.warn(`[hub:plejd] BLE connect failed: ${err.message}`);
        // Fall back to TCP if a gateway IP is available; else retry BLE later.
        if (gatewayIp) {
          connectTcp();
        } else {
          hub.pushHealth('plejd', 'degraded', `Bluetooth: ${err.message} — retrying`);
          if (!cleanedUp) reconnectTimer = setTimeout(connectBle, RECONNECT_MS);
        }
      });
  }

  function connectTcp() {
    if (cleanedUp || !gatewayIp || !cryptoKey || localActive) return;
    connecting = true;
    console.log(`[hub:plejd] Connecting to GWY-01 at ${gatewayIp}:${GWY_TCP_PORT}`);
    const tcp = new PlejdGateway(gatewayIp, cryptoKey, addressMap);
    gateway = tcp;
    attachTransportEvents(tcp, 'TCP', () => {
      localActive = false;
      hub.pushHealth('plejd', 'down', 'TCP disconnected — reconnecting');
      if (!cleanedUp) reconnectTimer = setTimeout(connectTcp, RECONNECT_MS);
    });
    tcp.connect()
      .then(() => {
        connecting = false;
        localActive = true;
        hub.pushHealth('plejd', 'ok', `Local TCP active — ${gatewayIp}:${GWY_TCP_PORT}`);
        console.log('[hub:plejd] Local TCP active');
      })
      .catch((err) => {
        connecting = false;
        localActive = false;
        gateway = null;
        hub.pushHealth('plejd', 'down', `GWY-01 TCP connect failed: ${err.message} — retrying BLE`);
        console.warn(`[hub:plejd] TCP connect failed: ${err.message} — retrying BLE in ${RECONNECT_MS / 1000}s`);
        if (!cleanedUp) reconnectTimer = setTimeout(connectBle, RECONNECT_MS);
      });
  }

  // ── Startup sequence ───────────────────────────────────────────────────────

  async function start() {
    try {
      await ensureAuth();
      await initFromSession();
    } catch (e) {
      console.error(`[hub:plejd] Startup failed: ${e.message}`);
      hub.pushError('plejd', `Startup failed: ${e.message}`);
    }
  }

  // Shared post-auth initialization — runs whether we booted via credentials
  // or via a browser-provided session token. Idempotent: the browser re-sends
  // setSession on every reconnect (and React can double-fire it), but the
  // local transport must be brought up exactly once — a second connect races
  // the first over the single BLE adapter and drops the link.
  async function initFromSession() {
    await fetchAndSeedDevices();     // always refresh device list/state
    startFallbackPoller();           // always poll cloud for display state

    if (initDone) return;            // transport already being managed
    initDone = true;

    if (!cryptoKey) {
      console.warn('[hub:plejd] No crypto key — local control unavailable');
      hub.pushHealth('plejd', 'degraded', 'No crypto key from Plejd cloud — sign in again in Settings');
      initDone = false;              // allow a later setSession with a key to retry
      return;
    }

    // BLE needs only the crypto key. Resolve the optional gateway IP in the
    // background so the TCP fallback is ready if BLE can't reach the mesh, but
    // don't block local control on it.
    discoverGatewayIP(gatewayIp).then((ip) => { gatewayIp = ip; }).catch(() => {});
    connectLocal(); // BLE first, TCP fallback inside
  }

  if (hasCredentials) {
    start();
  }
  // else: wait for setSession from browser

  // ── Command handler ────────────────────────────────────────────────────────
  hub.onCommand('plejd', async (action, params = {}) => {
    // ── Session bootstrap from browser ───────────────────────────────────────
    // Browser sends this on every hub connect after a successful Plejd cloud
    // login. Allows the hub to work without PLEJD_EMAIL/PASSWORD in .env.local.
    if (action === 'setSession') {
      const { sessionToken: tok, siteId: sid } = params || {};
      if (!tok) throw new Error('setSession requires sessionToken');
      sessionToken = tok;
      if (sid) siteId = sid;
      console.log('[hub:plejd] Session bootstrapped from browser, siteId:', siteId);
      try {
        await initFromSession();
      } catch (e) {
        hub.pushError('plejd', `Session init failed: ${e.message}`);
        throw e;
      }
      return { ok: true };
    }

    if (!sessionToken || !siteId) throw new Error('Plejd not yet initialized — waiting for setSession');

    const { deviceId, on, brightness, sceneId } = params;

    // ── Scene activation ─────────────────────────────────────────────────────
    if (action === 'activateScene') {
      if (!sceneId) throw new Error('activateScene requires sceneId');
      const scene = scenesCache.get(sceneId);
      if (!scene) throw new Error(`Plejd scene "${sceneId}" not found`);
      await Promise.allSettled(scene.devices.map(async (sd) => {
        const dev = deviceMap.get(sd.deviceId);
        const devMeshId = dev?.meshId
          ?? [...meshToCloudId.entries()].find(([, cid]) => cid === sd.deviceId)?.[0];
        if (localActive && gateway && devMeshId != null) {
          // await: PlejdBle.sendCommand is async (BLE write); PlejdGateway's is
          // sync and returns undefined — awaiting undefined is a no-op.
          await gateway.sendCommand(devMeshId, sd.on, sd.on ? sd.brightness : undefined);
          if (dev) { dev.isOn = sd.on; dev.dim = Math.round((sd.brightness / 100) * 255); }
        } else {
          if (cloudControlDead) throw new Error('Plejd cloud control unavailable — GWY-01 required');
          const dim255 = Math.round((sd.brightness / 100) * 255);
          await sendStateCloud(sessionToken, siteId, sd.deviceId, sd.on, sd.on ? dim255 : 0);
        }
      }));
      broadcastFromMap();
      if (!localActive) setTimeout(cloudPoll, 600);
      return { ok: true, sceneId };
    }

    if (deviceId === undefined || deviceId === null) {
      throw new Error('plejd command requires deviceId');
    }

    console.log(`[hub:plejd] CMD ${action} deviceId=${deviceId} on=${on} brightness=${brightness ?? '-'}`);

    // ── Room fan-out ────────────────────────────────────────────────────────
    // _cloudDevice.id is 'room:<roomObjectId>' for grouped room cards.
    if (typeof deviceId === 'string' && deviceId.startsWith('room:')) {
      const roomId = deviceId.slice(5);
      const devIds = roomDeviceMap.get(roomId) || [];
      const fanResults = await Promise.allSettled(devIds.map(async (devObjectId) => {
        const dev = deviceMap.get(devObjectId);
        const devMeshId = dev?.meshId
          ?? [...meshToCloudId.entries()].find(([, cid]) => cid === devObjectId)?.[0];
        // Guard: devMeshId must be a valid 1-byte integer.
        // NaN passes the old `!= null` check, silently becoming 0 in Buffer — sending to device 0.
        const devMeshIdValid = Number.isInteger(devMeshId) && devMeshId >= 0 && devMeshId <= 255;
        if (localActive && gateway && devMeshIdValid) {
          if (action === 'toggle')      await gateway.sendCommand(devMeshId, !!on);
          else if (action === 'dim')    await gateway.sendCommand(devMeshId, (brightness ?? 0) > 0, brightness ?? 0);
          if (dev) {
            if (action === 'toggle')   { dev.isOn = !!on; }
            else if (action === 'dim') { dev.isOn = (brightness ?? 0) > 0; dev.dim = Math.round(((brightness ?? 0) / 100) * 255); }
          }
        } else {
          if (cloudControlDead) {
            throw new Error('Plejd cloud control unavailable — GWY-01 local connection required');
          }
          if (action === 'toggle')      await sendStateCloud(sessionToken, siteId, devObjectId, on, undefined);
          else if (action === 'dim') {
            const dim255 = Math.round(((brightness ?? 0) / 100) * 255);
            await sendStateCloud(sessionToken, siteId, devObjectId, (brightness ?? 0) > 0, dim255);
          }
        }
      }));
      // Surface any per-device failures that Promise.allSettled would otherwise swallow
      const rejected = fanResults.filter(r => r.status === 'rejected');
      if (rejected.length) {
        console.error(`[hub:plejd] room ${roomId} fan-out: ${rejected.length}/${devIds.length} devices failed`,
          rejected.map(r => r.reason?.message).join(', '));
        // Session death fails the whole room at once — make it actionable.
        if (rejected.some(r => r.reason?.status === 401 || r.reason?.status === 209 || /invalid session/i.test(r.reason?.message || ''))) {
          sessionToken = null;
          hub.pushError('plejd', 'Plejd session expired — sign in again from Settings');
        }
        if (rejected.some(r => r.reason?.invalidFn)) {
          cloudControlDead = true;
          hub.pushHealth('plejd', 'degraded',
            'Plejd removed cloud control — connect the GWY-01 (set PLEJD_GATEWAY_IP in .env.local) to control devices');
        }
      } else {
        console.log(`[hub:plejd] room ${roomId} fan-out: ${devIds.length} devices ok`);
      }
      broadcastFromMap();
      if (!localActive) setTimeout(cloudPoll, 2000);
      return { ok: true, room: roomId, devices: devIds.length };
    }

    // ── Single-device path ───────────────────────────────────────────────────
    // Resolve cloud objectId and meshId from whatever the UI sent
    const d = deviceMap.get(deviceId) || deviceMap.get(String(deviceId));
    const cloudObjectId = d ? (d.id ?? deviceId) : String(deviceId);
    // meshId for TCP: from device record, or from meshToCloudId reverse lookup, or parseInt.
    // WARNING: parseInt(cloudObjectId, 10) can produce NaN for non-numeric cloud objectIds
    // (e.g. "zP4jDsm8Fk"). NaN is silently coerced to 0 by Buffer.from(), sending every
    // command to device 0. We validate before routing to the local TCP path.
    const meshId = d?.meshId
      ?? [...meshToCloudId.entries()].find(([, cid]) => cid === cloudObjectId)?.[0]
      ?? (typeof deviceId === 'number' ? deviceId : parseInt(deviceId, 10));
    const meshIdValid = Number.isInteger(meshId) && meshId >= 0 && meshId <= 255;
    console.log(`[hub:plejd] resolve deviceId=${deviceId} → cloudId=${cloudObjectId} meshId=${meshId} valid=${meshIdValid} localActive=${localActive} name="${d?.name ?? '?'}"`);

    if (!meshIdValid && localActive && gateway) {
      console.warn(`[hub:plejd] meshId unresolved for "${cloudObjectId}" (got ${meshId}) — falling back to cloud REST`);
    }

    if (localActive && gateway && meshIdValid) {
      // Fast path: local transport (BLE or TCP) — brightness in 0-100.
      // await surfaces a BLE write failure as command_result ok:false.
      if (action === 'toggle') {
        await gateway.sendCommand(meshId, !!on);
      } else if (action === 'dim') {
        await gateway.sendCommand(meshId, (brightness ?? 0) > 0, brightness ?? 0);
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
      if (cloudControlDead) {
        throw new Error('Plejd cloud control unavailable — connect the GWY-01 (set PLEJD_GATEWAY_IP in .env.local, restart hub)');
      }
      console.log('[hub:plejd] Using cloud REST for command (local TCP unavailable)');

      // Optimistic update — mutate deviceMap now so broadcastFromMap() reflects
      // the intended state immediately.  Snapshot the previous values so we can
      // revert if the cloud call fails.
      const prevIsOn = d?.isOn;
      const prevDim  = d?.dim;
      if (d) {
        if (action === 'toggle')    { d.isOn = !!on; }
        else if (action === 'dim')  { d.isOn = (brightness ?? 0) > 0; d.dim = Math.round(((brightness ?? 0) / 100) * 255); }
        broadcastFromMap();
      }

      try {
        if (action === 'toggle') {
          await sendStateCloud(sessionToken, siteId, cloudObjectId, on, undefined);
        } else if (action === 'dim') {
          const dim255 = Math.round(((brightness ?? 0) / 100) * 255);
          await sendStateCloud(sessionToken, siteId, cloudObjectId, (brightness ?? 0) > 0, dim255);
        } else {
          throw new Error(`Unknown Plejd action: "${action}"`);
        }
        // Re-poll after a longer window to confirm actual hardware state.
        // Using 2 s instead of 600 ms so the optimistic broadcast has time to
        // reach all tabs before the cloud poll can overwrite it.
        setTimeout(cloudPoll, 2000);
      } catch (e) {
        // Cloud command failed — revert the optimistic update immediately.
        if (d) {
          d.isOn = prevIsOn;
          d.dim  = prevDim;
          broadcastFromMap();
        }
        // Expired Parse session (209/401): every command bounces instantly.
        // Null the token and tell the browser exactly what to do.
        if (e.status === 401 || e.status === 209 || /invalid session/i.test(e.message)) {
          sessionToken = null;
          hub.pushError('plejd', 'Plejd session expired — sign in again from Settings');
        }
        // Dead cloud API: stop retrying, point at the real fix (local TCP).
        if (e.invalidFn) {
          cloudControlDead = true;
          hub.pushHealth('plejd', 'degraded',
            'Plejd removed cloud control — connect the GWY-01 (set PLEJD_GATEWAY_IP in .env.local) to control devices');
        }
        console.error(`[hub:plejd] cloud command failed for ${cloudObjectId}: ${e.message}`);
        throw e;
      }
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
