/**
 * Plejd cloud integration — polls Plejd's parse-server API directly.
 * No Home Assistant required: authenticates with Plejd credentials,
 * discovers devices, and pushes state updates to all connected tabs.
 *
 * Environment variables:
 *   PLEJD_EMAIL     Plejd account email
 *   PLEJD_PASSWORD  Plejd account password
 *   PLEJD_SITE_ID   (optional) Site ID; auto-discovers first site if absent
 *
 * Security: password is used once per session to obtain a parse session token.
 * The token is held in memory and never written to disk.
 * On 401 the poller re-authenticates automatically.
 *
 * Pushes:
 *   hub.pushUpdate('plejd_lights',   Room[])   — dimmable / on-off lights
 *   hub.pushUpdate('plejd_switches', Outlet[]) — relay outputs / plugs
 *
 * Commands (hub.onCommand('plejd', handler)):
 *   action: 'toggle'  params: { deviceId, on: boolean }
 *   action: 'dim'     params: { deviceId, brightness: 0–100 }
 */

const PLEJD_BASE   = 'https://cloud.plejd.com';
const PLEJD_APP_ID = 'zHduJF2dgQX2BFEN3QcXmF8x';
const DEFAULT_POLL_MS = 30_000;

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

async function fetchSiteDevices(sessionToken, siteId) {
  const j = await plejdFetch('/parse/functions/getSiteDetails', {
    method: 'POST', sessionToken, body: { siteId },
  });
  const detail = j.result || j;
  const rooms = (detail.rooms || []).reduce((acc, r) => {
    acc[r.roomId || r.objectId] = r.title;
    return acc;
  }, {});
  return (detail.plejdDevices || detail.devices || []).map(d => ({
    id:   d.deviceId || d.objectId,
    name: d.title || d.name || d.deviceId || d.objectId,
    room: rooms[d.roomId] || d.room || '',
    type: d.outputType || d.deviceType || d.traits || 'Light',
    isOn: !!(d.outputSettings?.state || d.state),
    dim:  d.outputSettings?.dim ?? d.dim ?? null,
  }));
}

async function sendState(sessionToken, siteId, deviceId, state, dim) {
  return plejdFetch('/parse/functions/sendStateToDevice', {
    method: 'POST', sessionToken,
    body: {
      siteId, deviceId,
      state: !!state,
      ...(typeof dim === 'number' ? { dim } : {}),
    },
  });
}

// ── Mappers ───────────────────────────────────────────────────────────────────

const isPlug = (d) => /relay|outlet|plug|switch/i.test(d.type || '');

function mapLights(devices) {
  return devices.filter(d => !isPlug(d)).map(d => ({
    id:           d.id,
    name:         d.name,
    bulbs:        1,
    on:           d.isOn,
    brightness:   typeof d.dim === 'number'
                    ? Math.round((d.dim / 255) * 100)
                    : (d.isOn ? 100 : 0),
    _cloudDevice: { id: d.id },
    _platform:    'plejd',
  }));
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

const h = (arr, keyFn) => arr.map(keyFn).join('|');

// ── Poller ────────────────────────────────────────────────────────────────────

/**
 * @param {import('../wss.js').WssHub} hub
 * @param {{ email?: string, password?: string, siteId?: string, pollMs?: number }} opts
 * @returns {(() => void)|undefined}  cleanup fn (clears the interval)
 */
export function startPlejdPoller(hub, { email, password, siteId: envSiteId, pollMs = DEFAULT_POLL_MS } = {}) {
  if (!email || !password) {
    console.log('[hub:plejd] Skipped — set PLEJD_EMAIL + PLEJD_PASSWORD in .env.local');
    return;
  }

  let sessionToken = null;
  let siteId = envSiteId || null;
  const hashes = {};
  let interval;

  function pushIfChanged(key, items, hashFn) {
    if (!items.length) return;
    const digest = h(items, hashFn);
    if (digest === hashes[key]) return;
    hashes[key] = digest;
    hub.pushUpdate(key, items);
  }

  async function ensureAuth() {
    sessionToken = await login(email, password);
    if (!siteId) {
      siteId = await getFirstSiteId(sessionToken);
      console.log(`[hub:plejd] Auto-discovered site: ${siteId}`);
    }
  }

  async function poll() {
    try {
      if (!sessionToken) await ensureAuth();
      const devices = await fetchSiteDevices(sessionToken, siteId);
      pushIfChanged('plejd_lights',   mapLights(devices),   l => `${l.id}:${l.on}:${l.brightness}`);
      pushIfChanged('plejd_switches', mapSwitches(devices), s => `${s.id}:${s.on}`);
    } catch (e) {
      if (e.status === 401) {
        console.log('[hub:plejd] Session expired — will re-authenticate on next poll');
        sessionToken = null;
      } else {
        hub.pushError('plejd', `Poll failed: ${e.message}`);
      }
    }
  }

  // Authenticate and start polling
  ensureAuth()
    .then(() => {
      poll();
      interval = setInterval(poll, pollMs);
      console.log(`[hub:plejd] Polling site ${siteId} every ${pollMs / 1000}s`);
    })
    .catch(e => {
      console.error(`[hub:plejd] Auth failed: ${e.message}`);
      hub.pushError('plejd', `Auth failed: ${e.message}`);
    });

  // ── Command handler ─────────────────────────────────────────────────────────
  hub.onCommand('plejd', async (action, params = {}) => {
    if (!sessionToken || !siteId) throw new Error('Plejd not yet initialized');

    const { deviceId, on, brightness } = params;
    if (!deviceId) throw new Error('plejd command requires deviceId');

    if (action === 'toggle') {
      await sendState(sessionToken, siteId, deviceId, on, undefined);
    } else if (action === 'dim') {
      const dim255 = Math.round(((brightness ?? 0) / 100) * 255);
      await sendState(sessionToken, siteId, deviceId, (brightness ?? 0) > 0, dim255);
    } else {
      throw new Error(`Unknown Plejd action: "${action}"`);
    }

    // Re-poll quickly so updated state reaches all tabs
    setTimeout(poll, 600);
    return { ok: true };
  });

  return () => { if (interval) clearInterval(interval); };
}
