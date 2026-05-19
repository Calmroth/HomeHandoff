/**
 * Server-side LAN scanner.
 *
 * Unlike the browser version (src/App.jsx), this runs in Node.js so there
 * are no CORS restrictions. We can probe any port, read any HTTP response
 * body, and use raw TCP connections (net.connect) for fast host detection.
 *
 * Protocol probers:
 *   Shelly     — Gen2: /rpc/Shelly.GetDeviceInfo + GetConfig + Switch.GetStatus
 *                Gen1: /shelly + /settings + /relay/0
 *   Sonos      — GET :1400/xml/device_description.xml (UPnP XML)
 *   Chromecast — GET :8008/setup/eureka_info (JSON)
 *   Hue bridge — GET /description.xml (UPnP XML)
 *   Samsung TV — GET :8001/api/v2/ (JSON)
 *   LG WebOS   — TCP connect :3000
 *   Tasmota    — GET /cm?cmnd=Status + /cm?cmnd=Power + /cm?cmnd=Status%208
 *   Plejd GWY  — TCP connect :9001 (encrypted mesh gateway)
 *
 * Every found device carries a consistent shape:
 *   { id, ip, name, type, protocol, model, assignedTo,
 *     on, watts, room, mac, gen? }
 *
 *   on    — live boolean on/off (null if device doesn't expose it)
 *   watts — live power draw in watts (null if unavailable)
 *   room  — heuristic room inferred from device name (null if unknown)
 *   mac   — hardware MAC address (null if unavailable)
 *
 * All probes run in parallel per IP. Concurrency is capped at 20 to avoid
 * ARP table overflow on cheap home routers.
 */

import { createConnection } from 'net';

const PROBE_MS  = 1500;  // initial probe timeout per protocol
const STATUS_MS = 1200;  // follow-up status calls (device already confirmed → shorter)

// ── Room heuristics ────────────────────────────────────────────────────────
//
// Infer a human-readable room label from a device name / hostname.
// Patterns cover English and Swedish (the household language context).

const ROOM_PATTERNS = [
  [/\b(kitchen|kök|köket)\b/i,                                          'Kitchen'],
  [/\b(living.?room|vardagsrum|vardags|lounge|salon)\b/i,              'Living Room'],
  [/\b(master.?bed(room)?|master)\b/i,                                  'Master Bedroom'],
  [/\b(bedroom|sovrum|bed\.?room)\b/i,                                  'Bedroom'],
  [/\b(kids?|barn(rum)?|child(ren)?|nursery)\b/i,                      'Kids Room'],
  [/\b(bathroom|badrum|bath(room)?|toilet|wc)\b/i,                     'Bathroom'],
  [/\b(hall(way)?|entrance|foyer|entr[eé]|korridor|hall)\b/i,         'Hallway'],
  [/\b(office|kontor|arbetsrum|study|workroom)\b/i,                    'Office'],
  [/\b(dining.?(room)?|matsal|matrum)\b/i,                             'Dining Room'],
  [/\b(garage|carport|bil)\b/i,                                        'Garage'],
  [/\b(basement|källare|cellar)\b/i,                                   'Basement'],
  [/\b(attic|vind|loft)\b/i,                                           'Attic'],
  [/\b(laundry|tvättstuga|utility|wash\.?room)\b/i,                   'Laundry'],
  [/\b(outdoor|utomhus|garden|trädgård|balcony|balkong|patio|terrace|uterum)\b/i, 'Outdoor'],
  [/\b(guest(room)?|gästrum|spare)\b/i,                                'Guest Room'],
];

function inferRoom(name) {
  if (!name) return null;
  for (const [pattern, room] of ROOM_PATTERNS) {
    if (pattern.test(name)) return room;
  }
  return null;
}

// ── Utilities ──────────────────────────────────────────────────────────────

async function httpGet(url, timeoutMs = PROBE_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    return r.ok ? r : null;
  } catch {
    clearTimeout(t);
    return null;
  }
}

/** TCP connect to detect if a port is open (no HTTP overhead). */
function tcpProbe(host, port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.setTimeout(timeoutMs, () => { socket.destroy(); resolve(false); });
  });
}

// ── Protocol probers ───────────────────────────────────────────────────────

async function probeShelly(ip) {
  // ── Gen2 path (richer — try first) ──
  const infoR = await httpGet(`http://${ip}/rpc/Shelly.GetDeviceInfo`);
  if (infoR) {
    const j = await infoR.json().catch(() => null);
    if (j && (j.id || j.mac)) {
      // Fire config (friendly name) + switch status in parallel — device already confirmed
      const [configR, statusR] = await Promise.all([
        httpGet(`http://${ip}/rpc/Shelly.GetConfig`,       STATUS_MS),
        httpGet(`http://${ip}/rpc/Switch.GetStatus?id=0`,  STATUS_MS),
      ]);
      const config = configR ? await configR.json().catch(() => null) : null;
      const status = statusR ? await statusR.json().catch(() => null) : null;

      const name  = config?.sys?.device?.name || j.name || j.id || ip;
      const on    = typeof status?.output === 'boolean' ? status.output : null;
      const watts = typeof status?.apower === 'number'  ? status.apower : null;

      return {
        id: `shelly-${(j.mac || j.id || ip).replace(/[^a-z0-9]/gi, '')}`,
        ip, name, type: 'outlet', protocol: 'shelly',
        model: j.model || j.app || 'Shelly',
        gen: j.gen || 2, assignedTo: 'outlets',
        on, watts, room: inferRoom(name), mac: j.mac || null,
      };
    }
  }

  // ── Gen1 fallback ──
  const shellyR = await httpGet(`http://${ip}/shelly`);
  if (!shellyR) return null;
  const j = await shellyR.json().catch(() => null);
  if (!j || (!j.mac && !j.type)) return null;

  // Fire settings (friendly name) + relay state in parallel
  const [settingsR, relayR] = await Promise.all([
    httpGet(`http://${ip}/settings`,  STATUS_MS),
    httpGet(`http://${ip}/relay/0`,   STATUS_MS),
  ]);
  const settings = settingsR ? await settingsR.json().catch(() => null) : null;
  const relay    = relayR    ? await relayR.json().catch(() => null)    : null;

  const name  = settings?.name || settings?.relays?.[0]?.name || j.hostname || j.type || ip;
  const on    = typeof relay?.ison  === 'boolean' ? relay.ison  : null;
  const watts = typeof relay?.power === 'number'  ? relay.power : null;

  return {
    id: `shelly-${(j.mac || ip).replace(/[^a-z0-9]/gi, '')}`,
    ip, name, type: 'outlet', protocol: 'shelly',
    model: j.type || 'Shelly', gen: 1, assignedTo: 'outlets',
    on, watts, room: inferRoom(name), mac: j.mac || null,
  };
}

async function probeSonos(ip) {
  const r = await httpGet(`http://${ip}:1400/xml/device_description.xml`);
  if (!r) return null;
  const text = await r.text().catch(() => '');
  if (!text.toLowerCase().includes('sonos') && !text.includes('rincon')) return null;

  const name  = text.match(/<friendlyName>(.*?)<\/friendlyName>/i)?.[1] || 'Sonos';
  const model = text.match(/<modelName>(.*?)<\/modelName>/i)?.[1]       || '';
  const uuid  = text.match(/<UDN>uuid:(.*?)<\/UDN>/i)?.[1]             || ip;

  // Sonos "on" = actively playing — tracked by the Sonos integration, not the scan
  return {
    id: `sonos-${uuid.replace(/[^a-z0-9]/gi, '')}`,
    ip, name, type: 'speaker', protocol: 'sonos',
    model, assignedTo: 'music',
    on: null, watts: null, room: inferRoom(name), mac: null,
  };
}

async function probeChromecast(ip) {
  const r = await httpGet(`http://${ip}:8008/setup/eureka_info?options=detail`);
  if (!r) return null;
  const d = await r.json().catch(() => null);
  if (!d) return null;

  const name     = d.name || d.device_info?.friendly_name || 'Google device';
  const castType = d.build_info?.cast_type;
  const isAudio  = castType === 2 || (d.build_info?.board_name || '').toLowerCase().includes('audio');
  const mac      = d.device_info?.mac_address || null;

  return {
    id: `cast-${(mac || ip).replace(/[^a-z0-9]/gi, '')}`,
    ip, name, type: isAudio ? 'speaker' : 'tv',
    protocol: 'chromecast', model: d.build_info?.model_name || '',
    assignedTo: isAudio ? 'music' : 'tv',
    on: null, watts: null, room: inferRoom(name), mac,
  };
}

async function probeHue(ip) {
  const r = await httpGet(`http://${ip}/description.xml`);
  if (!r) return null;
  const text = await r.text().catch(() => '');
  if (!text.includes('Philips') && !text.toLowerCase().includes('hue')) return null;

  const name = text.match(/<friendlyName>(.*?)<\/friendlyName>/i)?.[1] || 'Philips Hue';
  return {
    id: `hue-${ip.replace(/\./g, '')}`,
    ip, name: `${name} bridge`, type: 'lights', protocol: 'hue',
    model: 'Hue Bridge', assignedTo: 'lights',
    on: null, watts: null, room: null, mac: null,
  };
}

async function probeSamsungTV(ip) {
  const r = await httpGet(`http://${ip}:8001/api/v2/`);
  if (!r) return null;
  const d = await r.json().catch(() => null);
  if (!d?.device) return null;

  const mac = d.device?.wifiMac || null;
  return {
    id: `samsung-${(mac || ip).replace(/[^a-z0-9]/gi, '')}`,
    ip, name: d.device?.name || 'Samsung TV', type: 'tv',
    protocol: 'samsung', model: d.device?.modelName || '',
    assignedTo: 'tv',
    on: null, watts: null, room: inferRoom(d.device?.name || ''), mac,
  };
}

async function probeLgTV(ip) {
  const open = await tcpProbe(ip, 3000, 600);
  if (!open) return null;
  return {
    id: `lg-${ip.replace(/\./g, '')}`,
    ip, name: 'LG TV', type: 'tv', protocol: 'lg-webos', model: '',
    assignedTo: 'tv',
    on: null, watts: null, room: null, mac: null,
  };
}

async function probeTasmota(ip) {
  const r = await httpGet(`http://${ip}/cm?cmnd=Status`);
  if (!r) return null;
  const d = await r.json().catch(() => null);
  if (!d?.Status?.FriendlyName) return null;

  // Get power state + energy stats in parallel — device already confirmed
  const [powerR, energyR] = await Promise.all([
    httpGet(`http://${ip}/cm?cmnd=Power`,       STATUS_MS),
    httpGet(`http://${ip}/cm?cmnd=Status%208`,  STATUS_MS),  // StatusSNS energy
  ]);
  const power  = powerR  ? await powerR.json().catch(() => null)  : null;
  const energy = energyR ? await energyR.json().catch(() => null) : null;

  const names = d.Status.FriendlyName;
  const name  = Array.isArray(names) ? names[0] : names;

  // Only set on if we got a definitive response (avoid false null/undefined)
  let on = null;
  if (power) {
    if ('POWER'  in power) on = power.POWER  === 'ON';
    else if ('POWER1' in power) on = power.POWER1 === 'ON';
  }
  const watts = energy?.StatusSNS?.ENERGY?.Power ?? null;

  return {
    id: `tasmota-${ip.replace(/\./g, '')}`,
    ip, name, type: 'outlet', protocol: 'tasmota',
    model: String(d.Status.Module || ''),
    assignedTo: 'outlets',
    on, watts, room: inferRoom(name), mac: null,
  };
}

/**
 * Plejd GWY-01 gateway detection.
 * The gateway listens on TCP 9001 for the encrypted BLE-mesh relay protocol.
 * There is no unauthenticated HTTP API; TCP probe is the only reliable detector.
 */
async function probePlejd(ip) {
  const open = await tcpProbe(ip, 9001, 800);
  if (!open) return null;
  return {
    id: `plejd-gwy-${ip.replace(/\./g, '')}`,
    ip, name: 'Plejd Gateway', type: 'gateway', protocol: 'plejd',
    model: 'GWY-01', assignedTo: 'lights',
    on: null, watts: null, room: null, mac: null,
  };
}

/** Probe one IP against all known protocols simultaneously. */
async function probeIP(ip) {
  const results = await Promise.allSettled([
    probeShelly(ip),
    probeSonos(ip),
    probeChromecast(ip),
    probeHue(ip),
    probeSamsungTV(ip),
    probeLgTV(ip),
    probeTasmota(ip),
    probePlejd(ip),
  ]);
  return results
    .filter((r) => r.status === 'fulfilled' && r.value !== null)
    .map((r) => r.value);
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Sweep a /24 subnet for known smart home devices.
 *
 * @param {string} subnet          e.g. "192.168.1"
 * @param {{ onDevice?: (d) => void, onProgress?: (done, total) => void }} opts
 */
export async function scanLAN(subnet, { onDevice, onProgress } = {}) {
  const ips = Array.from({ length: 254 }, (_, i) => `${subnet}.${i + 1}`);
  const CONCURRENCY = 20; // safe for home routers; increase on fast LANs
  let cursor = 0, done = 0;

  const worker = async () => {
    while (cursor < ips.length) {
      const ip = ips[cursor++];
      try {
        const devices = await probeIP(ip);
        devices.forEach((d) => onDevice?.(d));
      } catch { /* ignore individual IP errors */ }
      done++;
      onProgress?.(done, ips.length);
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}

/**
 * Cross-reference scan results with live hub state.
 *
 * For Shelly devices already registered in the hub (by IP), fill in the
 * hub-assigned name and room from the stored config. For the Plejd gateway,
 * mark it as hub-registered if the IP matches PLEJD_GATEWAY_IP.
 *
 * @param {object[]} devices       Raw devices from scanLAN
 * @param {import('../state.js').HubState} hubState
 * @returns {object[]}             Enriched devices
 */
export function enrichFromHubState(devices, hubState) {
  const shellyRegistered = (hubState.get('shelly')?.devices ?? []);
  const shellyByIp = new Map(shellyRegistered.map(s => [s.ip, s]));
  const knownGatewayIp = process.env.PLEJD_GATEWAY_IP || '';

  return devices.map(device => {
    if (device.protocol === 'shelly') {
      const reg = shellyByIp.get(device.ip);
      if (reg) {
        return {
          ...device,
          name:  reg.name  || device.name,
          room:  reg.room  || device.room  || inferRoom(reg.name || ''),
          on:    device.on    ?? reg.on    ?? null,
          watts: device.watts ?? reg.watts ?? null,
          _hubRegistered: true,
        };
      }
    }
    if (device.protocol === 'plejd' && knownGatewayIp && device.ip === knownGatewayIp) {
      return { ...device, _hubRegistered: true };
    }
    return device;
  });
}
