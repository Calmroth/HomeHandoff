/**
 * Server-side LAN scanner.
 *
 * Unlike the browser version (src/App.jsx), this runs in Node.js so there
 * are no CORS restrictions. We can probe any port, read any HTTP response
 * body, and use raw TCP connections (net.connect) for fast host detection.
 *
 * Protocol probers:
 *   Shelly     — GET /rpc/Shelly.GetDeviceInfo (Gen2) or /shelly (Gen1). CORS-open.
 *   Sonos      — GET :1400/xml/device_description.xml (UPnP XML, no CORS needed)
 *   Chromecast — GET :8008/setup/eureka_info (JSON)
 *   Hue bridge — GET /description.xml (UPnP XML)
 *   Samsung TV — GET :8001/api/v2/  (JSON)
 *   LG WebOS   — TCP connect :3000 (just detect open port)
 *   Tasmota    — GET /cm?cmnd=Status (JSON)
 *
 * All probes run in parallel per IP. Concurrency limited to avoid ARP table
 * overflow on cheap home routers (16 IPs at a time is safe in practice).
 */

import { createConnection } from 'net';

const PROBE_MS = 1500;

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
  // Try Gen2 first (richer metadata), fall back to Gen1
  let r = await httpGet(`http://${ip}/rpc/Shelly.GetDeviceInfo`);
  if (!r) r = await httpGet(`http://${ip}/shelly`);
  if (!r) return null;
  const j = await r.json().catch(() => null);
  if (!j || (!j.id && !j.mac && !j.type)) return null;
  return {
    id: `shelly-${(j.mac || j.id || ip).replace(/[^a-z0-9]/gi, '')}`,
    ip, name: j.name || j.id || j.type || ip,
    type: 'outlet', protocol: 'shelly',
    model: j.model || j.app || j.type || 'Shelly',
    gen: j.gen || 1, assignedTo: 'outlets',
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
  return {
    id: `sonos-${uuid.replace(/[^a-z0-9]/gi, '')}`,
    ip, name, type: 'speaker', protocol: 'sonos', model, assignedTo: 'music',
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
  return {
    id: `cast-${(d.device_info?.mac_address || ip).replace(/[^a-z0-9]/gi, '')}`,
    ip, name, type: isAudio ? 'speaker' : 'tv',
    protocol: 'chromecast', model: d.build_info?.model_name || '',
    assignedTo: isAudio ? 'music' : 'tv',
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
  };
}

async function probeSamsungTV(ip) {
  const r = await httpGet(`http://${ip}:8001/api/v2/`);
  if (!r) return null;
  const d = await r.json().catch(() => null);
  if (!d?.device) return null;
  return {
    id: `samsung-${(d.device?.wifiMac || ip).replace(/[^a-z0-9]/gi, '')}`,
    ip, name: d.device?.name || 'Samsung TV', type: 'tv',
    protocol: 'samsung', model: d.device?.modelName || '',
    assignedTo: 'tv',
  };
}

async function probeLgTV(ip) {
  // LG WebOS doesn't speak plain HTTP on 3000 — just detect the open port
  const open = await tcpProbe(ip, 3000, 600);
  if (!open) return null;
  return {
    id: `lg-${ip.replace(/\./g, '')}`,
    ip, name: 'LG TV', type: 'tv', protocol: 'lg-webos', model: '',
    assignedTo: 'tv',
  };
}

async function probeTasmota(ip) {
  const r = await httpGet(`http://${ip}/cm?cmnd=Status`);
  if (!r) return null;
  const d = await r.json().catch(() => null);
  if (!d?.Status?.FriendlyName) return null;
  const names = d.Status.FriendlyName;
  const name  = Array.isArray(names) ? names[0] : names;
  return {
    id: `tasmota-${ip.replace(/\./g, '')}`,
    ip, name, type: 'outlet', protocol: 'tasmota',
    model: String(d.Status.Module || ''),
    assignedTo: 'outlets',
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
