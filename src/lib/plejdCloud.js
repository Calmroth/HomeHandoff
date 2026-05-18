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

// Fetch every device on a site + the room layout. Returns a flat list of
// { id, title, room, type, isOn, dim } rows.
//
// getSiteById returns two device arrays:
//   detail.devices      — user-configured virtual outputs: names, rooms, types
//   detail.plejdDevices — raw hardware records (MAC, firmware) — no user names
// We use detail.devices as the authoritative source.
export async function plejdFetchDevices({ sessionToken, siteId }) {
  if (!siteId) throw new Error('siteId required');
  const res = await fetch(`${BASE}/parse/functions/getSiteById`, {
    method: 'POST',
    headers: parseHeaders(sessionToken),
    body: JSON.stringify({ siteId }),
  });
  if (!res.ok) throw new Error(await parsedError(res));
  const j = await res.json();
  const detail = (Array.isArray(j.result) ? j.result[0] : j.result) || j;

  // Build roomMap. Rooms come back as full objects with title fields.
  const roomsArr = detail.rooms || detail.site?.rooms || [];
  const roomMap = {};
  for (const r of roomsArr) {
    const title = r.title || r.name || r.roomTitle || r.roomName || null;
    if (r.objectId) roomMap[r.objectId] = title;
    if (r.roomId && r.roomId !== r.objectId) roomMap[r.roomId] = title;
  }

  // Backfill any room pointers that arrived without a title.
  const missingIds = Object.keys(roomMap).filter(id => !roomMap[id]);
  if (missingIds.length > 0) {
    try {
      const where = encodeURIComponent(JSON.stringify({ objectId: { $in: missingIds } }));
      const rRes = await fetch(`${BASE}/parse/classes/Room?where=${where}`, {
        headers: parseHeaders(sessionToken),
      });
      if (rRes.ok) {
        const rJ = await rRes.json();
        for (const r of (rJ.results || [])) {
          const title = r.title || r.name || null;
          if (title) {
            if (r.objectId) roomMap[r.objectId] = title;
            if (r.roomId)   roomMap[r.roomId]   = title;
          }
        }
      }
    } catch (e) { console.warn('[plejd] Room fetch error:', e.message); }
  }

  const resolveRoom = (d) => {
    if (d.roomId && roomMap[d.roomId]) return roomMap[d.roomId];
    const ref = d.room;
    if (ref && typeof ref === 'object') {
      if (ref.title) return ref.title;
      if (ref.objectId && roomMap[ref.objectId]) return roomMap[ref.objectId];
    }
    if (typeof ref === 'string' && ref) {
      if (roomMap[ref]) return roomMap[ref];
      if (!/^[A-Za-z0-9]{10}$/.test(ref)) return ref;
    }
    return '';
  };

  const userDevices = detail.devices || detail.plejdDevices || [];

  const devices = userDevices.map(d => {
    const devId = d.objectId || d.deviceId;
    return {
      id: devId,
      title: d.title || d.name || devId,
      room: resolveRoom(d),
      type: d.outputType || d.deviceType || d.traits || 'Light',
      isOn: !!(d.state),
      dim:  d.dim ?? null,
      dimmable: d.dimmable ?? true,
      roomId: d.roomId || null,
      _device: d,
    };
  });

  // The cloud API (getSiteById) does not return real-time device state — the
  // `state` and `dim` fields are absent from detail.devices items. Callers use
  // this flag to decide whether to trust the returned isOn/dim values or
  // preserve whatever the UI already shows from prior toggles / hub events.
  const stateKnown = userDevices.some(d => 'state' in d);

  return {
    devices,
    stateKnown,
    rooms: detail.rooms || [],
    cryptoKey: detail.plejdMesh?.cryptoKey || detail.cryptoKey || detail.site?.cryptoKey,
  };
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
