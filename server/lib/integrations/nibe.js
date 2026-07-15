/**
 * Nibe heat pump — myUplink cloud API (read-only v1).
 *
 * Nibe's official platform. OAuth2 authorization-code flow, hub-side (the
 * client_secret never reaches the browser). Reads the user's system, polls the
 * device's live parameters, and normalizes them into the driver-agnostic
 * `heatpump` payload the UI renders.
 *
 * Why the hub owns it: myUplink requires a confidential client (client_secret),
 * which can't live in the Vite bundle. Same pattern as
 * server/lib/integrations/sonos-cloud.js.
 *
 * Environment (.env.local, server-side):
 *   NIBE_CLIENT_ID      App identifier from dev.myuplink.com/apps
 *   NIBE_CLIENT_SECRET  App secret (never sent to the browser)
 *   NIBE_REDIRECT_URI   Callback registered in the myUplink app; must match
 *                       EXACTLY. Verified: plain http://localhost:5183/... IS
 *                       accepted (myUplink runs IdentityServer, which validates
 *                       redirect_uri before login and forwarded ours to the
 *                       login page). The path just has to load the SPA so the
 *                       ?code is caught — /api/integrations/nibe/callback works
 *                       because Vite only proxies /api/plejd.
 *
 * Tokens persist in server/nibe-tokens.json (gitignored) — never the broadcast
 * state cache.
 *
 * Pushes: hub.pushUpdate('heatpump', {
 *   online, source:'nibe', name, model, outdoorTemp, indoorTemp, supplyTemp,
 *   returnTemp, hotWaterTemp, hotWaterCharge, degreeMinutes, compressorHz,
 *   compressor, status, power, targetSupply, fetchedAt, points:[{label,value,unit}]
 * })
 *
 * Commands (hub.onCommand('nibe', ...)):
 *   beginAuth     {}              -> { url }   (REST /command)
 *   exchangeCode  { code, state } -> { ok }
 *   (no control actions in v1 — read-only, so no WRITESYSTEM scope requested)
 */

import { readFile, writeFile } from 'fs/promises';
import { randomBytes } from 'crypto';
import { join } from 'path';
import { fileURLToPath } from 'url';

const AUTHORIZE_URL = 'https://api.myuplink.com/oauth/authorize';
const TOKEN_URL     = 'https://api.myuplink.com/oauth/token';
const API           = 'https://api.myuplink.com';
const SCOPE         = 'READSYSTEM offline_access';
const POLL_MS       = 60_000; // HA polls at 60s — within myUplink's limits
const TOKENS_FILE   = join(fileURLToPath(import.meta.url), '..', '..', '..', 'nibe-tokens.json');

// "not available" sentinels from Nibe registers — treat as null, not a temp.
const NA = new Set([-32768, -32767]);

// Pull the Nibe sensor tag (BT1, BT2, …) out of a parameterName. Works for both
// F-series ("BT1 Outdoor Temperature") and S-series ("Außenlufttemperatur (BT1)")
// where the numeric parameterId differs but the tag is stable.
function extractBT(name) {
  const m = /\bBT\s?0*(\d+)\b/i.exec(name || '');
  return m ? parseInt(m[1], 10) : null;
}

export function startNibePoller(hub, { clientId, clientSecret, redirectUri } = {}) {
  if (!clientId || !clientSecret || !redirectUri) {
    console.log('[hub:nibe] Skipped — set NIBE_CLIENT_ID/SECRET/REDIRECT_URI in .env.local');
    return;
  }

  let tokens        = null;   // { access_token, refresh_token, expires_at }
  let deviceId      = null;
  let deviceInfo    = null;
  let pendingState  = null;
  let pollTimer     = null;
  let refreshInFlight = null;
  let lastHash      = '';

  // ── Token persistence (own file, never the broadcast cache) ────────────────
  async function loadTokens() {
    try { tokens = JSON.parse(await readFile(TOKENS_FILE, 'utf8')); } catch { tokens = null; }
  }
  async function saveTokens() {
    try { await writeFile(TOKENS_FILE, JSON.stringify(tokens)); }
    catch (e) { console.error('[hub:nibe] token persist failed:', e.message); }
  }

  // ── OAuth ──────────────────────────────────────────────────────────────────
  async function tokenRequest(params) {
    const r = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...params }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error_description || j.error || `myUplink token ${r.status}`);
    return {
      access_token:  j.access_token,
      refresh_token: j.refresh_token || tokens?.refresh_token,
      // Drive expiry off the server's expires_in (short-lived, ~1h). 60s slack.
      expires_at:    Date.now() + ((j.expires_in ?? 3600) - 60) * 1000,
    };
  }

  function doRefresh() {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = tokenRequest({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token })
      .then(async (t) => { tokens = t; await saveTokens(); return t; })
      .finally(() => { refreshInFlight = null; });
    return refreshInFlight;
  }

  async function api(path) {
    if (!tokens) throw new Error('Nibe not authorized — sign in from Settings');
    if (Date.now() >= (tokens.expires_at || 0)) await doRefresh();
    const doFetch = () => fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    let r = await doFetch();
    if (r.status === 401) { await doRefresh(); r = await doFetch(); }
    if (r.status === 429) throw new Error('myUplink rate limited (429) — backing off');
    if (!r.ok) throw new Error(`myUplink ${r.status} ${path}`);
    return r.json();
  }

  // ── Normalize a device's /points into the heatpump payload ─────────────────
  function normalize(points) {
    const clean = (p) => {
      if (!p) return null;
      const v = p.value;
      if (v == null || NA.has(v)) return null;
      return v;
    };
    const byBT   = {};
    const findByName = (re) => points.find(p => re.test(p.parameterName || ''));
    const findById   = (id) => points.find(p => String(p.parameterId) === id);
    // Bind each BT tag to the LIVE sensor, not an average/min/max/setpoint
    // variant (many pumps expose "BT1 Average" alongside "BT1"), and prefer the
    // primary climate system (EB100) over a secondary one (EB101, dual-climate).
    const isVariant = (n) => /\baverage\b|\bavg\b|\bmin\b|\bmax\b|set ?point|calc|börvärde|\bmedel|mittel|mittlere/i.test(n);
    for (const p of points) {
      const name = p.parameterName || '';
      if (isVariant(name)) continue;
      const bt = extractBT(name);
      if (bt == null) continue;
      const existing = byBT[bt];
      if (existing === undefined) { byBT[bt] = p; continue; }
      if (/EB100/i.test(name) && !/EB100/i.test(existing.parameterName || '')) byBT[bt] = p;
    }

    const compState = findById('43427') || findByName(/compressor state/i);
    const prio      = findById('43086') || findByName(/\bprio\b|priorit/i);
    const enumText  = (p) => p ? (p.strVal || p.enumValues?.find(e => String(e.value) === String(p.value))?.text || null) : null;

    const dm   = findByName(/degree ?minute|gradminut/i) || points.find(p => /^DM$/i.test(p.parameterUnit || ''));
    const comp = findByName(/compressor.*freq|verdichterfrequenz/i);
    const pow  = points.find(p => /kw$/i.test(p.parameterUnit || '') && /power|leistung|effekt/i.test(p.parameterName || ''));
    const calc = findByName(/calc.*supply|berechneter vorlauf|calc\. supply/i);

    // A small, human-labelled reading list for the card (skip nulls).
    const readings = [
      ['Outdoor',      clean(byBT[1]),  '°C'],
      ['Indoor',       clean(byBT[50]), '°C'],
      ['Hot water',    clean(byBT[7]) ?? clean(byBT[6]), '°C'],
      ['Supply',       clean(byBT[2]),  '°C'],
      ['Return',       clean(byBT[3]),  '°C'],
      ['Degree min',   clean(dm),       'DM'],
      ['Compressor',   comp ? clean(comp) : null, 'Hz'],
      ['Power',        clean(pow),      'kW'],
    ].filter(([, v]) => v != null).map(([label, value, unit]) => ({ label, value, unit }));

    return {
      // Real connection state from /systems/me, not a hardcoded true — a pump
      // that dropped off myUplink shouldn't read as online with empty tiles.
      online:         deviceInfo?.connectionState ? /connected/i.test(deviceInfo.connectionState) : true,
      source:         'nibe',
      name:           deviceInfo?.product?.name || 'Nibe heat pump',
      model:          deviceInfo?.product?.name || null,
      outdoorTemp:    clean(byBT[1]),
      indoorTemp:     clean(byBT[50]),
      supplyTemp:     clean(byBT[2]),
      returnTemp:     clean(byBT[3]),
      hotWaterTemp:   clean(byBT[7]) ?? clean(byBT[6]),
      hotWaterCharge: clean(byBT[6]),
      degreeMinutes:  clean(dm),
      compressorHz:   comp ? clean(comp) : null,
      compressor:     enumText(compState),
      status:         enumText(prio),
      power:          clean(pow),
      targetSupply:   clean(calc),
      readings,
      fetchedAt:      new Date().toISOString(),
    };
  }

  // ── Poll ────────────────────────────────────────────────────────────────────
  async function poll() {
    if (!tokens) return;
    try {
      // Re-resolve the device each cycle (two cheap calls/min, well within
      // limits): keeps connectionState fresh and picks up a hardware swap
      // instead of caching a stale deviceId for the whole process lifetime.
      const sys = await api('/v2/systems/me');
      const first = sys?.systems?.[0];
      const dev = first?.devices?.[0];
      if (!dev?.id) throw new Error('No Nibe system/device on this myUplink account');
      if (dev.id !== deviceId) console.log(`[hub:nibe] System "${first.name}" · device ${dev.product?.name || dev.id}`);
      deviceId = dev.id;
      deviceInfo = dev;
      const points = await api(`/v2/devices/${deviceId}/points`);
      const payload = normalize(Array.isArray(points) ? points : []);
      const hash = JSON.stringify(payload);
      if (hash !== lastHash) { lastHash = hash; hub.pushUpdate('heatpump', payload); }
      hub.pushHealth('nibe', 'ok', `${payload.name} · ${payload.outdoorTemp ?? '?'}°C out`);
    } catch (e) {
      if (/invalid_grant/i.test(e.message)) {
        tokens = null; await saveTokens().catch(() => {});
        hub.pushUpdate('heatpump', { online: false, source: 'nibe' });
        hub.pushError('nibe', 'Session expired — sign in again from Settings');
      } else {
        hub.pushError('nibe', `Poll failed: ${e.message}`);
      }
    }
  }

  // ── Commands (auth only — read-only v1) ────────────────────────────────────
  hub.onCommand('nibe', async (action, params = {}) => {
    switch (action) {
      case 'beginAuth': {
        pendingState = 'hdg-nibe-' + randomBytes(12).toString('hex');
        const url = new URL(AUTHORIZE_URL);
        url.searchParams.set('response_type', 'code');
        url.searchParams.set('client_id', clientId);
        url.searchParams.set('redirect_uri', redirectUri);
        url.searchParams.set('scope', SCOPE);
        url.searchParams.set('state', pendingState);
        return { url: url.toString() };
      }
      case 'exchangeCode': {
        const { code, state } = params;
        if (!code) throw new Error('exchangeCode requires code');
        if (!pendingState || state !== pendingState) throw new Error('OAuth state mismatch — restart sign-in');
        pendingState = null;
        tokens = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
        await saveTokens();
        deviceId = null; deviceInfo = null;
        console.log('[hub:nibe] Authorized — polling');
        await poll();
        return { ok: true };
      }
      default:
        throw new Error(`Unknown nibe action: "${action}"`);
    }
  });

  // ── Startup ──────────────────────────────────────────────────────────────
  loadTokens().then(() => {
    if (tokens) { console.log('[hub:nibe] Restored tokens — polling'); poll(); }
    else {
      console.log('[hub:nibe] Waiting for sign-in (Settings → Nibe → Sign in)');
      hub.pushUpdate('heatpump', { online: false, source: 'nibe' });
    }
    pollTimer = setInterval(poll, POLL_MS);
  });

  return () => { if (pollTimer) clearInterval(pollTimer); };
}
