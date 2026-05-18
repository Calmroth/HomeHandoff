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
// the proxy to cloud.plejd.com). For prod deploys with a different proxy
// path, change here. See vite.config.js server.proxy.
//
// Note: auth.api.plejd.cloud (the newer auth host) requires a proprietary
// app-level token embedded in the Plejd mobile binary before it accepts
// user credentials. cloud.plejd.com/parse/login is the stable public path
// used by all known third-party integrations and does not have that gate.
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
// Reads body as text first so we can detect Vite proxy HTML error pages
// (which aren't JSON and would cause json() to throw, losing the status).
async function parsedError(res) {
  try {
    const text = await res.text();
    if (text.trimStart().startsWith('<')) {
      // Vite dev proxy returns an HTML error page when it can't reach cloud.plejd.com
      return `Plejd proxy error [HTTP ${res.status}]`;
    }
    const j = JSON.parse(text);
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
  const res = await fetch(`${BASE}/parse/functions/getSiteList`, {
    method: 'POST',
    headers: parseHeaders(sessionToken),
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(await parsedError(res));
  const j = await res.json();
  return (j.result || []).map(item => {
    const s = item.site || item;
    return {
      id: s.siteId || s.objectId,
      objectId: s.objectId || s.siteId,
      title: s.title || s.siteName || s.objectId,
    };
  });
}

// Fetch every device on a site + the room layout. Plejd uses a few classes
// (Device, Room, Outputs) and stitches them together client-side; this
// function does the same and returns one flat list of { id, title, room,
// type, isOn, dim } rows.
export async function plejdFetchDevices({ sessionToken, siteId }) {
  if (!siteId) throw new Error('siteId required');
  // The site detail endpoint Plejd's app uses is /parse/functions/getSiteDetails.
  // It returns: { site, plejdDevices, rooms, scenes, deviceAddresses, ... }.
  const res = await fetch(`${BASE}/parse/functions/getSiteById`, {
    method: 'POST',
    headers: parseHeaders(sessionToken),
    body: JSON.stringify({ siteId }),
  });
  if (!res.ok) throw new Error(await parsedError(res));
  const j = await res.json();
  // getSiteById returns result as an array; getSiteDetails returned a plain object
  const detail = (Array.isArray(j.result) ? j.result[0] : j.result) || j;
  // Index room titles by every ID variant the API might use as a key.
  // The rooms array occasionally contains Parse pointers (no title field) on
  // some API versions — only store entries where we have a real title.
  const roomsArr = detail.rooms || detail.site?.rooms || [];
  const roomMap = roomsArr.reduce((acc, r) => {
    const title = r.title || r.name || r.roomTitle || r.roomName || null;
    if (r.objectId) acc[r.objectId] = title;
    if (r.roomId && r.roomId !== r.objectId) acc[r.roomId] = title;
    return acc;
  }, {});

  // Resolve a room name for a device using all the forms the API may use:
  //   d.roomId        — direct string ID (most common)
  //   d.room.objectId — Parse pointer  { __type:'Pointer', objectId:'xxx' }
  //   d.room.title    — embedded full object with title already present
  //   d.room (string) — raw id or name string
  //   out0.room.*     — same variants inside outputSettings[0]
  const resolveRoom = (d, out0) => {
    if (d.roomId && roomMap[d.roomId]) return roomMap[d.roomId];
    const ref = d.room;
    if (ref && typeof ref === 'object') {
      if (ref.title) return ref.title;
      if (ref.objectId && roomMap[ref.objectId]) return roomMap[ref.objectId];
    }
    if (typeof ref === 'string' && ref) {
      if (roomMap[ref]) return roomMap[ref];
      // Only use the string directly if it looks like a human name, not a bare objectId.
      // Parse objectIds are exactly 10 alphanumeric chars; anything else is a real name.
      if (!/^[A-Za-z0-9]{10}$/.test(ref)) return ref;
    }
    const outRef = out0?.room;
    if (outRef && typeof outRef === 'object') {
      if (outRef.title) return outRef.title;
      if (outRef.objectId && roomMap[outRef.objectId]) return roomMap[outRef.objectId];
    }
    if (typeof outRef === 'string' && outRef && roomMap[outRef]) return roomMap[outRef];
    return '';
  };

  const devices = (detail.plejdDevices || detail.devices || []).map(d => {
    // outputSettings is an array of per-output configs. Access index 0 for the
    // first (usually only) output. Accessing .state directly on the array gives
    // undefined — that was causing everything to show as off.
    const out0 = Array.isArray(d.outputSettings) ? d.outputSettings[0] : d.outputSettings;
    return {
      id: d.objectId || d.deviceId,
      title: out0?.name || d.title || d.name || d.objectId || d.deviceId,
      room: resolveRoom(d, out0),
      type: out0?.outputType || d.outputType || d.deviceType || d.traits || 'Light',
      isOn: !!(out0?.state ?? d.state),
      dim:  out0?.dim ?? d.dim ?? null,
      dimmable: out0?.dimmable ?? d.dimmable ?? true,
      roomId: d.roomId || null,
      _device: d,
    };
  });
  return { devices, rooms: detail.rooms || [], cryptoKey: detail.plejdMesh?.cryptoKey || detail.cryptoKey || detail.site?.cryptoKey };
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
