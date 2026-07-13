/**
 * Sonos Cloud integration — official Sonos Control API with OAuth2.
 *
 * Why hub-side: the Sonos token endpoint requires the client_secret
 * (Basic auth) — there is no PKCE public-client flow like Spotify's, so
 * the exchange MUST happen server-side. The browser only ever sees the
 * authorize URL and hands the returned ?code to the hub.
 *
 * Environment variables:
 *   SONOS_CLIENT_ID      Sonos integration key (developer.sonos.com)
 *   SONOS_CLIENT_SECRET  Secret — never leaves the hub
 *   SONOS_REDIRECT_URI   Registered redirect (the dashboard's own origin)
 *
 * Token persistence: server/sonos-tokens.json (gitignored). NEVER stored in
 * the HubState cache — that snapshot is broadcast to every browser client.
 *
 * Pushes: hub.pushUpdate('sonos_cloud', {
 *   authorized: boolean,
 *   players:  [{ id, name, volume }],
 *   groups:   [{ id, name, coordinatorId, playbackState, playerIds }],
 *   speakers: Speaker[]   // same shape SoundSection renders
 * })
 *
 * Commands (hub.onCommand('sonos-cloud', handler)):
 *   beginAuth        {}                          → { url }  (REST /command)
 *   exchangeCode     { code, state }             → { ok }
 *   play|pause       { groupId }                 → { ok }
 *   groupVolume      { groupId, volume }         → { ok }
 *   playerVolume     { playerId, volume }        → { ok }
 *   setGroupMembers  { groupId, playerIds }      → { ok }
 *   groupAll         {}                          → { ok }   (party mode)
 *   ungroupAll       {}                          → { ok }
 */

import { readFile, writeFile } from 'fs/promises';
import { randomBytes } from 'crypto';
import { join } from 'path';
import { fileURLToPath } from 'url';

const SONOS_AUTH_URL  = 'https://api.sonos.com/login/v3/oauth';
const SONOS_TOKEN_URL = 'https://api.sonos.com/login/v3/oauth/access';
const SONOS_API       = 'https://api.ws.sonos.com/control/api/v1';
const POLL_MS         = 10_000;
const TOKENS_FILE     = join(fileURLToPath(import.meta.url), '..', '..', '..', 'sonos-tokens.json');

export function startSonosCloudPoller(hub, { clientId, clientSecret, redirectUri } = {}) {
  if (!clientId || !clientSecret || !redirectUri) {
    console.log('[hub:sonos-cloud] Skipped — set SONOS_CLIENT_ID/SECRET/REDIRECT_URI in .env.local');
    return;
  }

  const basic = 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  // ── Mutable state ──────────────────────────────────────────────────────────
  let tokens        = null;   // { access_token, refresh_token, expires_at }
  let householdId   = null;
  let pendingState  = null;   // CSRF state for the in-flight authorize redirect
  let pollTimer     = null;
  let refreshInFlight = null; // single-flight refresh (same race as Spotify's)
  let lastHash      = '';

  // ── Token persistence (own file, NEVER the broadcast state cache) ─────────
  async function loadTokens() {
    try { tokens = JSON.parse(await readFile(TOKENS_FILE, 'utf8')); } catch { tokens = null; }
  }
  async function saveTokens() {
    try { await writeFile(TOKENS_FILE, JSON.stringify(tokens)); }
    catch (e) { console.error('[hub:sonos-cloud] token persist failed:', e.message); }
  }

  // ── OAuth ──────────────────────────────────────────────────────────────────
  async function tokenRequest(bodyParams) {
    const r = await fetch(SONOS_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': basic,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(bodyParams),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error_description || j.error || `Sonos token ${r.status}`);
    return {
      access_token:  j.access_token,
      refresh_token: j.refresh_token || tokens?.refresh_token,
      expires_at:    Date.now() + ((j.expires_in ?? 86400) - 120) * 1000,
    };
  }

  function doRefresh() {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
    })
      .then(async (t) => { tokens = t; await saveTokens(); return t; })
      .finally(() => { refreshInFlight = null; });
    return refreshInFlight;
  }

  // ── API helper — auto-refresh on expiry and on 401 ────────────────────────
  async function api(path, { method = 'GET', body } = {}) {
    if (!tokens) throw new Error('Sonos not authorized — sign in from Settings');
    if (Date.now() >= (tokens.expires_at || 0)) await doRefresh();
    const doFetch = () => fetch(`${SONOS_API}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let r = await doFetch();
    if (r.status === 401) { await doRefresh(); r = await doFetch(); }
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.errorCode || j.error || `Sonos API ${r.status} ${path}`);
    }
    return r.status === 204 ? null : r.json().catch(() => null);
  }

  // ── Poll: households → groups+players → broadcast ─────────────────────────
  async function poll() {
    if (!tokens) return;
    try {
      if (!householdId) {
        const hh = await api('/households');
        householdId = hh?.households?.[0]?.id ?? null;
        if (!householdId) throw new Error('No Sonos household on this account');
      }
      const g = await api(`/households/${householdId}/groups`);
      const players = (g?.players ?? []).map(p => ({ id: p.id, name: p.name }));
      const groups  = (g?.groups ?? []).map(gr => ({
        id: gr.id,
        name: gr.name,
        coordinatorId: gr.coordinatorId,
        playbackState: gr.playbackState,          // PLAYBACK_STATE_PLAYING / _PAUSED / _IDLE
        playerIds: gr.playerIds ?? [],
      }));

      // Speaker rows for SoundSection — one per PLAYER, carrying its group.
      const playing = new Set(
        groups.filter(gr => gr.playbackState === 'PLAYBACK_STATE_PLAYING').flatMap(gr => gr.playerIds)
      );
      const groupOf = new Map(groups.flatMap(gr => gr.playerIds.map(pid => [pid, gr])));
      const speakers = players.map(p => {
        const gr = groupOf.get(p.id);
        return {
          id:      p.id,
          name:    p.name,
          source:  playing.has(p.id) ? 'Playing' : null,
          on:      playing.has(p.id),
          paused:  gr?.playbackState === 'PLAYBACK_STATE_PAUSED',
          volume:  0,                       // per-player volume filled lazily below
          primary: gr?.coordinatorId === p.id,
          _sonosCloud: true,
          _groupId:    gr?.id ?? null,
          _groupSize:  gr?.playerIds.length ?? 1,
        };
      });

      // Per-player volume — parallel, tolerate individual failures.
      await Promise.allSettled(speakers.map(async (s) => {
        const v = await api(`/players/${s.id}/playerVolume`);
        if (typeof v?.volume === 'number') s.volume = v.volume;
      }));

      const payload = { authorized: true, players, groups, speakers };
      const hash = JSON.stringify(payload);
      if (hash !== lastHash) {
        lastHash = hash;
        hub.pushUpdate('sonos_cloud', payload);
      }
      hub.pushHealth('sonos-cloud', 'ok', `${players.length} players, ${groups.length} groups`);
    } catch (e) {
      // invalid_grant → refresh token dead → require re-auth, stop hammering
      if (/invalid_grant/i.test(e.message)) {
        tokens = null; await saveTokens().catch(() => {});
        hub.pushUpdate('sonos_cloud', { authorized: false, players: [], groups: [], speakers: [] });
        hub.pushError('sonos-cloud', 'Session expired — sign in again from Settings');
      } else {
        hub.pushError('sonos-cloud', `Poll failed: ${e.message}`);
      }
    }
  }

  // groupId churns when membership changes — resolve current group for a
  // player at command time instead of trusting a possibly-stale id.
  async function freshGroups() {
    const g = await api(`/households/${householdId}/groups`);
    return (g?.groups ?? []);
  }

  // ── Commands ───────────────────────────────────────────────────────────────
  hub.onCommand('sonos-cloud', async (action, params = {}) => {
    switch (action) {
      case 'beginAuth': {
        pendingState = 'hdg-sonos-' + randomBytes(12).toString('hex');
        const url = new URL(SONOS_AUTH_URL);
        url.searchParams.set('client_id', clientId);
        url.searchParams.set('response_type', 'code');
        url.searchParams.set('state', pendingState);
        url.searchParams.set('scope', 'playback-control-all');
        url.searchParams.set('redirect_uri', redirectUri);
        return { url: url.toString() };
      }

      case 'exchangeCode': {
        const { code, state } = params;
        if (!code) throw new Error('exchangeCode requires code');
        if (!pendingState || state !== pendingState) throw new Error('OAuth state mismatch — restart sign-in');
        pendingState = null; // single-use, code is single-use too
        tokens = await tokenRequest({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
        });
        await saveTokens();
        householdId = null;
        console.log('[hub:sonos-cloud] Authorized — starting poll');
        await poll();
        return { ok: true };
      }

      case 'play':
      case 'pause': {
        const { groupId } = params;
        if (!groupId) throw new Error(`${action} requires groupId`);
        await api(`/groups/${groupId}/playback/${action}`, { method: 'POST' });
        setTimeout(poll, 600);
        return { ok: true };
      }

      case 'groupVolume': {
        const { groupId, volume } = params;
        await api(`/groups/${groupId}/groupVolume`, { method: 'POST', body: { volume: Math.round(volume ?? 0) } });
        setTimeout(poll, 600);
        return { ok: true };
      }

      case 'playerVolume': {
        const { playerId, volume } = params;
        await api(`/players/${playerId}/playerVolume`, { method: 'POST', body: { volume: Math.round(volume ?? 0) } });
        setTimeout(poll, 600);
        return { ok: true };
      }

      // Join a player into a target group / eject a player to its own group.
      case 'setGroupMembers': {
        const { groupId, playerIds } = params;
        if (!groupId || !Array.isArray(playerIds)) throw new Error('setGroupMembers requires groupId and playerIds');
        await api(`/groups/${groupId}/groups/setGroupMembers`, { method: 'POST', body: { playerIds } });
        setTimeout(poll, 800);
        return { ok: true };
      }

      // Party mode: everything into the currently-playing group (or the
      // largest group when nothing is playing).
      case 'groupAll': {
        const groups = await freshGroups();
        if (!groups.length) throw new Error('No Sonos groups found');
        const target = groups.find(g => g.playbackState === 'PLAYBACK_STATE_PLAYING')
          ?? groups.reduce((a, b) => (a.playerIds.length >= b.playerIds.length ? a : b));
        const allPlayerIds = [...new Set(groups.flatMap(g => g.playerIds))];
        await api(`/groups/${target.id}/groups/setGroupMembers`, { method: 'POST', body: { playerIds: allPlayerIds } });
        setTimeout(poll, 800);
        return { ok: true, grouped: allPlayerIds.length };
      }

      // Every player back to standalone.
      case 'ungroupAll': {
        const groups = await freshGroups();
        const multi = groups.filter(g => g.playerIds.length > 1);
        for (const g of multi) {
          await api(`/groups/${g.id}/groups/setGroupMembers`, {
            method: 'POST', body: { playerIds: [g.coordinatorId] },
          });
        }
        setTimeout(poll, 800);
        return { ok: true, ungrouped: multi.length };
      }

      default:
        throw new Error(`Unknown sonos-cloud action: "${action}"`);
    }
  });

  // ── Startup ────────────────────────────────────────────────────────────────
  loadTokens().then(() => {
    if (tokens) {
      console.log('[hub:sonos-cloud] Restored tokens — polling');
      poll();
    } else {
      console.log('[hub:sonos-cloud] Waiting for sign-in (Settings → Sonos → Sign in)');
      hub.pushUpdate('sonos_cloud', { authorized: false, players: [], groups: [], speakers: [] });
    }
    pollTimer = setInterval(poll, POLL_MS);
  });

  return () => { if (pollTimer) clearInterval(pollTimer); };
}
