// Spotify — PKCE OAuth + Web API client.
// Pure browser flow, no backend: the user opens Settings, pastes a Client ID
// they got from developer.spotify.com, clicks Connect → we run PKCE,
// Spotify redirects back with ?code, we exchange it for an access_token, and
// store {access, refresh, expires_at} in localStorage. Refresh happens on
// demand inside spotifyApi() before each call. Disconnect drops tokens.

import { useState, useEffect, useCallback, useRef } from 'react';

const SP_AUTH_URL   = 'https://accounts.spotify.com/authorize';
const SP_TOKEN_URL  = 'https://accounts.spotify.com/api/token';
const SP_API        = 'https://api.spotify.com/v1';
const SP_SCOPES = [
  'user-read-private',
  'user-read-email',
  'user-library-read',
  'user-library-modify',
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-private',
  'playlist-modify-public',
  'user-top-read',
  'user-read-recently-played',
  // Spotify Connect -- list playback targets (Sonos shows up here once it's
  // linked to your Spotify account in the Sonos app) and steer playback to
  // them without needing a LAN bridge process.
  'user-read-playback-state',
  'user-modify-playback-state',
].join(' ');

function spB64u(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
async function spPkce() {
  const verifier = spB64u(crypto.getRandomValues(new Uint8Array(32)));
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: spB64u(hash) };
}
export function spRedirectUri() {
  return window.location.origin + window.location.pathname;
}
async function spBeginAuth(clientId, returnHash) {
  const { verifier, challenge } = await spPkce();
  localStorage.setItem('hdg-sp-verifier', verifier);
  localStorage.setItem('hdg-sp-return', returnHash || '#music');
  const url = new URL(SP_AUTH_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', spRedirectUri());
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('scope', SP_SCOPES);
  url.searchParams.set('show_dialog', 'false');
  window.location.href = url.toString();
}
async function spExchangeCode(clientId, code) {
  const verifier = localStorage.getItem('hdg-sp-verifier');
  if (!verifier) throw new Error('Missing PKCE verifier');
  const r = await fetch(SP_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: spRedirectUri(),
      client_id: clientId,
      code_verifier: verifier,
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description || j.error || `token ${r.status}`);
  localStorage.removeItem('hdg-sp-verifier');
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: Date.now() + (j.expires_in - 60) * 1000,
  };
}
async function spRefresh(clientId, refresh_token) {
  const r = await fetch(SP_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token,
      client_id: clientId,
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description || j.error || `refresh ${r.status}`);
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token || refresh_token,
    expires_at: Date.now() + (j.expires_in - 60) * 1000,
  };
}

export function useSpotify() {
  const [clientId, setClientIdState] = useState(() => localStorage.getItem('hdg-sp-clientid') || '');
  const [token, setToken] = useState(() => {
    try { return JSON.parse(localStorage.getItem('hdg-sp-token') || 'null'); } catch (e) { return null; }
  });
  const [me, setMe] = useState(null);
  const [error, setError] = useState(null);
  // Spotify Connect playback targets. Sonos, phones, computers, smart TVs --
  // anything the user has linked to their Spotify account shows up here.
  const [devices, setDevices] = useState([]);

  // Handle the OAuth callback exactly once: if the URL has ?code=...,
  // exchange it for a token. Two hard rules, both learned the hard way:
  //   1. Authorization codes are SINGLE-USE. React.StrictMode double-invokes
  //      mount effects in dev, so an unguarded effect sends the same code
  //      twice -- the second exchange gets "Invalid authorization code" and
  //      can race the first one dead too. Guard with a ref (refs survive the
  //      StrictMode double-invoke).
  //   2. Strip ?code from the URL BEFORE exchanging, not after success.
  //      A failed exchange used to leave the dead code in the URL, so every
  //      reload re-burned it and the error never cleared.
  const exchangeStarted = useRef(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const err  = params.get('error');
    // Sonos OAuth shares this origin and also returns ?code= -- its state
    // param is prefixed so we can tell the flows apart. Not ours: skip.
    if ((params.get('state') || '').startsWith('hdg-sonos')) return;
    if (err) { setError(`Spotify denied: ${err}`); return; }
    if (!code) return;
    if (exchangeStarted.current) return;
    exchangeStarted.current = true;

    // Clean the URL immediately -- the code is consumed (or dead) either way.
    const back = localStorage.getItem('hdg-sp-return') || '#music';
    localStorage.removeItem('hdg-sp-return');
    window.history.replaceState({}, '', window.location.origin + window.location.pathname + back);

    const cid = localStorage.getItem('hdg-sp-clientid');
    if (!cid) { setError('Missing Spotify Client ID after redirect.'); return; }
    spExchangeCode(cid, code).then(t => {
      localStorage.setItem('hdg-sp-token', JSON.stringify(t));
      tokenRef.current = t; // sync ref before state commit, same as doRefresh
      setToken(t);
      setError(null); // clear any stale auth error from a previous attempt
    }).catch(e => setError(String(e.message || e)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Latest-token ref -- api() closures capture `token` at render time, but a
  // concurrent caller may rotate it mid-flight. The ref is updated
  // synchronously on every rotation so other callers pick up the fresh token
  // instead of burning (and invalidating) a second refresh.
  const tokenRef = useRef(token);
  useEffect(() => { tokenRef.current = token; }, [token]);

  // Hard disconnect -- token can no longer be refreshed (typically
  // invalid_grant from a revoked or rotated refresh_token). Clears local
  // state so subsequent api() calls fail fast instead of looping refresh
  // requests against accounts.spotify.com forever.
  const hardDisconnect = useCallback((reason) => {
    localStorage.removeItem('hdg-sp-token');
    tokenRef.current = null;
    setToken(null);
    setMe(null);
    setDevices([]);
    setError(reason || 'Spotify session expired -- click Connect to sign in again.');
  }, []);

  // Internal: do one fetch with the supplied token. Returns a normalized
  // shape so the caller can branch on status without re-reading the body.
  // Body parsing is defensive -- Spotify returns plain-text bodies for
  // some error states (e.g. 403 "User is not registered for this
  // application." on Dev-Mode allowlist failures), which would crash an
  // unconditional JSON.parse and bypass the 401/403 branches below.
  const _spFetch = useCallback(async (path, options, tk) => {
    const r = await fetch(`${SP_API}${path}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${tk.access_token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    if (r.status === 204) return { ok: true, json: null, status: 204, text: '' };
    const text = await r.text();
    let json = null;
    if (text) {
      try { json = JSON.parse(text); } catch { /* plain-text body, keep null */ }
    }
    return { ok: r.ok, json, status: r.status, text };
  }, []);

  // Refresh mutex -- Spotify rotates refresh tokens on use, so two
  // overlapping api() calls that both hit the expiry window must share ONE
  // refresh request. Without this, the second spRefresh presents an
  // already-consumed refresh_token, gets invalid_grant, and hard-disconnects
  // the user even though the session was perfectly recoverable.
  const refreshInFlight = useRef(null);
  const doRefresh = useCallback((tk) => {
    if (refreshInFlight.current) return refreshInFlight.current;
    // Always refresh with the NEWEST refresh_token -- the one in this
    // caller's closure may already have been consumed by another caller.
    const rt = (tokenRef.current || tk).refresh_token;
    refreshInFlight.current = spRefresh(clientId, rt)
      .then((fresh) => {
        tokenRef.current = fresh; // sync before any state/effect timing gap
        localStorage.setItem('hdg-sp-token', JSON.stringify(fresh));
        setToken(fresh);
        return fresh;
      })
      .finally(() => { refreshInFlight.current = null; });
    return refreshInFlight.current;
  }, [clientId]);

  // Always-fresh accessor: refreshes the token if it's about to expire,
  // then calls the API. If refresh fails (invalid_grant) or the server
  // returns 401 even after a fresh refresh, disconnects so polling stops
  // hammering Spotify with a dead token.
  const api = useCallback(async (path, options = {}) => {
    // Ref only -- falling back to the closure `token` would resurrect a
    // dead session after hardDisconnect (ref nulled, closure still stale).
    let tk = tokenRef.current;
    if (!tk) throw new Error('Not connected to Spotify');

    // Preemptive refresh if we know the token has expired locally.
    if (Date.now() >= (tk.expires_at || 0)) {
      try {
        tk = await doRefresh(tk);
      } catch (e) {
        hardDisconnect();
        throw new Error('Spotify session expired');
      }
    }

    let result = await _spFetch(path, options, tk);

    // Server-side rejection despite our local clock. One refresh + retry
    // covers the common case where the cached token was revoked server-side.
    if (result.status === 401) {
      try {
        // A concurrent caller may have rotated the token while our request
        // was in flight -- reuse that fresh token before spending a refresh.
        const latest = tokenRef.current;
        const borrowed = !!(latest && latest.access_token !== tk.access_token);
        tk = borrowed ? latest : await doRefresh(tk);
        result = await _spFetch(path, options, tk);
        // Borrowed token also rejected? Spend a real refresh before giving up.
        if (result.status === 401 && borrowed) {
          tk = await doRefresh(tk);
          result = await _spFetch(path, options, tk);
        }
      } catch (e) {
        hardDisconnect();
        throw new Error('Spotify session expired');
      }
      // If even the retry returns 401, the token issuance pipeline is
      // broken -- disconnect rather than loop.
      if (result.status === 401) {
        hardDisconnect();
        throw new Error('Spotify session expired');
      }
    }

    // 403 = token authenticated but rejected for this request. Two cases:
    //   A) Feature lock -- "Premium required", "Restriction violated", etc.
    //      Leave the session alone; the UI can show "Premium required".
    //   B) Anything else (/me, /me/tracks, /me/playlists return 403) means
    //      the token is globally rejected. Common causes:
    //        - App in Development Mode and this Spotify account isn't in
    //          the dashboard's user allowlist
    //        - User revoked the app at spotify.com/account/apps
    //        - Token issued under a different client_id than current VITE_SPOTIFY_CLIENT_ID
    //      Disconnect so polling stops looping 403s forever.
    if (result.status === 403) {
      // Spotify uses both JSON ({error:{message:"..."}}) and plain-text
      // bodies for 403s. Check both.
      const msg = result.json?.error?.message || result.text || '';
      const isFeatureLock = /premium|restriction/i.test(msg);
      if (!isFeatureLock) {
        hardDisconnect(`Spotify rejected token (403): ${msg || 'Forbidden'} — check Developer Dashboard user allowlist or click Connect to re-auth.`);
        throw new Error('Spotify session rejected');
      }
    }

    if (!result.ok) {
      const msg = result.json?.error?.message || result.text || `Spotify API ${result.status}`;
      throw new Error(msg);
    }
    return result.json;
  }, [token, doRefresh, _spFetch, hardDisconnect]);

  // Fetch the user profile once we have a token so the UI can greet them.
  useEffect(() => {
    if (!token) { setMe(null); return; }
    api('/me').then(setMe).catch(e => setError(String(e.message || e)));
  }, [token, api]);

  const setClientId = useCallback((id) => {
    const v = (id || '').trim();
    if (v) localStorage.setItem('hdg-sp-clientid', v);
    else localStorage.removeItem('hdg-sp-clientid');
    setClientIdState(v);
  }, []);
  const connect = useCallback(() => {
    if (!clientId) { setError('Set a Spotify Client ID in Settings first.'); return; }
    spBeginAuth(clientId, window.location.hash || '#music').catch(e => setError(String(e.message || e)));
  }, [clientId]);
  const disconnect = useCallback(() => {
    localStorage.removeItem('hdg-sp-token');
    tokenRef.current = null; // keep ref in lockstep -- api() reads ref only
    setToken(null);
    setMe(null);
    setDevices([]);
  }, []);

  // ---- Spotify Connect: list devices, transfer playback, control volume ----
  // /me/player/devices returns every Connect target the user has online --
  // Sonos speakers show up by their friendly name, e.g. "Living room".
  const refreshDevices = useCallback(async () => {
    if (!token) return [];
    try {
      const r = await api('/me/player/devices');
      const list = r?.devices || [];
      setDevices(list);
      return list;
    } catch (e) {
      // 403 means the user is on the free tier (Connect is Premium-only) --
      // surface it to the UI but don't spam errors.
      const msg = String(e.message || e);
      if (!/PREMIUM_REQUIRED|403/i.test(msg)) setError(msg);
      else setError('Spotify Connect requires Premium.');
      return [];
    }
  }, [token, api]);

  // Poll devices while connected so the speaker list stays fresh as Sonos
  // zones come online or get powered off.
  useEffect(() => {
    if (!token) { setDevices([]); return; }
    refreshDevices();
    const t = setInterval(refreshDevices, 12_000);
    return () => clearInterval(t);
  }, [token, refreshDevices]);

  // Transfer playback to a specific device. If `play` is true and nothing is
  // currently playing, Spotify will resume what was last played on the user's
  // queue. Returns true on success.
  const transferTo = useCallback(async (deviceId, play = true) => {
    if (!token) return false;
    try {
      await api('/me/player', {
        method: 'PUT',
        body: JSON.stringify({ device_ids: [deviceId], play }),
      });
      // Optimistic local update so the UI flips immediately; the next poll
      // will reconcile against Spotify's truth.
      setDevices(ds => ds.map(d => ({ ...d, is_active: d.id === deviceId })));
      return true;
    } catch (e) {
      setError(String(e.message || e));
      return false;
    }
  }, [token, api]);

  // Pause whatever's currently playing on a device. Spotify treats pause as
  // device-scoped, so this only stops the named target.
  const pauseDevice = useCallback(async (deviceId) => {
    if (!token) return false;
    try {
      await api(`/me/player/pause${deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : ''}`, { method: 'PUT' });
      setDevices(ds => ds.map(d => d.id === deviceId ? { ...d, is_active: false } : d));
      return true;
    } catch (e) {
      setError(String(e.message || e));
      return false;
    }
  }, [token, api]);

  // Set the volume on a specific device (0-100). Spotify clamps; we round.
  const setDeviceVolume = useCallback(async (deviceId, percent) => {
    if (!token) return false;
    const v = Math.max(0, Math.min(100, Math.round(percent)));
    try {
      await api(`/me/player/volume?volume_percent=${v}&device_id=${encodeURIComponent(deviceId)}`, { method: 'PUT' });
      setDevices(ds => ds.map(d => d.id === deviceId ? { ...d, volume_percent: v } : d));
      return true;
    } catch (e) {
      setError(String(e.message || e));
      return false;
    }
  }, [token, api]);

  // Transport controls — skip, resume, pause on the active/any device.
  const skipNext = useCallback(async () => {
    if (!token) return;
    try { await api('/me/player/next', { method: 'POST' }); } catch (e) { setError(String(e.message || e)); }
  }, [token, api]);

  const skipPrev = useCallback(async () => {
    if (!token) return;
    try { await api('/me/player/previous', { method: 'POST' }); } catch (e) { setError(String(e.message || e)); }
  }, [token, api]);

  const resumePlay = useCallback(async (deviceId) => {
    if (!token) return;
    try {
      await api(`/me/player/play${deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : ''}`, { method: 'PUT' });
    } catch (e) { setError(String(e.message || e)); }
  }, [token, api]);

  const pausePlay = useCallback(async (deviceId) => {
    if (!token) return;
    try {
      await api(`/me/player/pause${deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : ''}`, { method: 'PUT' });
    } catch (e) { setError(String(e.message || e)); }
  }, [token, api]);

  return { clientId, setClientId, token, me, error, connect, disconnect, api, devices, refreshDevices, transferTo, pauseDevice, setDeviceVolume, skipNext, skipPrev, resumePlay, pausePlay };
}
