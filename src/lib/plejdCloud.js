// Plejd cloud client. Wraps the parse-server REST API Plejd's mobile app
// uses, routed through Vite's dev proxy (see vite.config.js -> server.proxy
// for /api/plejd) so we don't hit CORS walls in the browser.
//
// Three things this module gives the rest of the app:
//
//   1. login(email, password) -> { sessionToken, userId } -- the credential
//      flow your phone's Plejd app does. The session token is what every
//      subsequent request authenticates with.
//
//   2. fetchSites(sessionToken) -> [{ id, title }, ...] -- the household
//      "installations" you have access to. Most users have one. We persist
//      the picked siteId so subsequent fetches go straight to its devices.
//
//   3. fetchDevices({ sessionToken, siteId }) -> [{ id, title, room, type,
//      isOn, dim }] -- the actual lights / plugs the dashboard will render.
//      Device names + room mapping come from Plejd's cloud, which is the
//      authoritative source the user maintains in their Plejd app.
//
// Honest scope note: the cloud API gives discovery + state. The on/off
// command is BLE-encrypted, not HTTP. Toggle control from a browser-only
// dashboard requires either a Plejd Hub (cloud-routable) or a small LAN
// bridge process. We attempt cloud-control endpoints below and surface
// "needs Hub" if they fail.

const PLEJD_APP_ID = 'zHtVqXt8k4yFyk2QGmgp48D9xZr2G94xWYnF4dak';

// Base path -- when running under Vite dev, this is /api/plejd (rewritten by
// the proxy). For prod deploys with a different proxy path, change here.
const BASE = '/api/plejd';

function parseHeaders(sessionToken) {
  const h = {
    'X-Parse-Application-Id': PLEJD_APP_ID,
    'Content-Type': 'application/json',
  };
  if (sessionToken) h['X-Parse-Session-Token'] = sessionToken;
  return h;
}

// Best-effort error text extraction -- Plejd's parse errors have a `code`
// and `error` field; passing those through helps the user understand
// "wrong password" vs "rate limited" vs "server down".
async function parsedError(res) {
  try {
    const j = await res.json();
    if (j?.error) return `${j.error}${j.code ? ` (code ${j.code})` : ''} [HTTP ${res.status}]`;
  } catch {}
  return `Plejd HTTP ${res.status}`;
}

export async function plejdLogin(email, password) {
  if (!email || !password) throw new Error('email and password required');
  const res = await fetch(`${BASE}/parse/login`, {
    method: 'POST',
    headers: parseHeaders(),
    body: JSON.stringify({ username: email, password }),
  });
  if (!res.ok) throw new Error(await parsedError(res));
  const j = await res.json();
  if (!j.sessionToken) throw new Error('login succeeded but no sessionToken returned');
  return { sessionToken: j.sessionToken, userId: j.objectId, email: j.email || email };
}

// List sites visible to the signed-in user. Most homes have exactly one
// "installation"; the user picks it once and we persist the choice.
export async function plejdFetchSites(sessionToken) {
  const res = await fetch(`${BASE}/parse/classes/Site?limit=100`, {
    headers: parseHeaders(sessionToken),
  });
  if (!res.ok) throw new Error(await parsedError(res));
  const j = await res.json();
  return (j.results || []).map(s => ({
    id: s.siteId || s.objectId,
    objectId: s.objectId,
    title: s.title || s.siteName || s.objectId,
  }));
}

// Fetch every device on a site + the room layout. Plejd uses a few classes
// (Device, Room, Outputs) and stitches them together client-side; this
// function does the same and returns one flat list of { id, title, room,
// type, isOn, dim } rows.
export async function plejdFetchDevices({ sessionToken, siteId }) {
  if (!siteId) throw new Error('siteId required');
  // The site detail endpoint Plejd's app uses is /parse/functions/getSiteDetails.
  // It returns: { site, plejdDevices, rooms, scenes, deviceAddresses, ... }.
  const res = await fetch(`${BASE}/parse/functions/getSiteDetails`, {
    method: 'POST',
    headers: parseHeaders(sessionToken),
    body: JSON.stringify({ siteId }),
  });
  if (!res.ok) throw new Error(await parsedError(res));
  const j = await res.json();
  const detail = j.result || j;
  const rooms = (detail.rooms || []).reduce((acc, r) => { acc[r.roomId || r.objectId] = r.title; return acc; }, {});
  const devices = (detail.plejdDevices || detail.devices || []).map(d => ({
    id: d.deviceId || d.objectId,
    title: d.title || d.name || d.deviceId || d.objectId,
    room: rooms[d.roomId] || d.room || '',
    type: d.outputType || d.deviceType || d.traits || 'Light',
    // State / dim come from the Outputs list if available.
    isOn: !!d.outputSettings?.state || !!d.state,
    dim:  d.outputSettings?.dim ?? d.dim ?? null,
    // Carry through fields the control endpoint may need.
    _device: d,
  }));
  return { devices, rooms: detail.rooms || [], cryptoKey: detail.cryptoKey || detail.site?.cryptoKey };
}

// Cloud-control attempt -- works only if the user's installation has a
// Plejd Hub paired (or Plejd has cloud-routed control for that device).
// Returns true on success. On failure, callers should surface a "needs Hub"
// hint rather than treating it as a transient error.
export async function plejdSetDeviceState({ sessionToken, siteId, deviceId, on, dim }) {
  const res = await fetch(`${BASE}/parse/functions/sendStateToDevice`, {
    method: 'POST',
    headers: parseHeaders(sessionToken),
    body: JSON.stringify({
      siteId,
      deviceId,
      state: !!on,
      ...(typeof dim === 'number' ? { dim } : {}),
    }),
  });
  if (!res.ok) throw new Error(await parsedError(res));
  return true;
}
