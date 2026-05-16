// Home Domain — Home control surface: Lights, Power, Sound.
// Match DESIGN.md exactly: dark, clay/amber, flat translucent cards, 2px stack.

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useHomeStore, STATUS } from './store/useHomeStore.js';

// ─────────────────────────────────────────────────────────────────────────────
// Icons (inline SVG, 1.5 stroke — matches lucide weight)
// ─────────────────────────────────────────────────────────────────────────────
const Icon = ({ d, size = 16, fill = "none", stroke = 1.5, children, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" {...p}>
    {d ? <path d={d} /> : children}
  </svg>
);
const I = {
  Home:    (p) => <Icon {...p}><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></Icon>,
  Light:   (p) => <Icon {...p}><path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.6 1 2.5v1h6v-1c0-.9.3-1.8 1-2.5A6 6 0 0 0 12 3Z"/></Icon>,
  Plug:    (p) => <Icon {...p}><path d="M9 2v6"/><path d="M15 2v6"/><path d="M7 8h10v3a5 5 0 0 1-5 5 5 5 0 0 1-5-5V8Z"/><path d="M12 16v6"/></Icon>,
  Speaker: (p) => <Icon {...p}><rect x="6" y="3" width="12" height="18" rx="2"/><circle cx="12" cy="14" r="3.5"/><circle cx="12" cy="7" r="0.8" fill="currentColor"/></Icon>,
  Sun:     (p) => <Icon {...p}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></Icon>,
  Moon:    (p) => <Icon {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></Icon>,
  Film:    (p) => <Icon {...p}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4M11 4v16"/></Icon>,
  Utensils:(p) => <Icon {...p}><path d="M5 3v8a3 3 0 0 0 3 3v7M8 3v6M14 3c-1.5 2-2 4-2 6 0 1 .5 2 2 2v9"/></Icon>,
  PowerOff:(p) => <Icon {...p}><path d="M18.4 6.6a9 9 0 1 1-12.7 0"/><path d="M12 2v10"/></Icon>,
  Cloud:   (p) => <Icon {...p}><path d="M17.5 19a4.5 4.5 0 1 0-.9-8.9 6 6 0 0 0-11.6 2A4 4 0 0 0 6 19h11.5Z"/></Icon>,
  News:    (p) => <Icon {...p}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/></Icon>,
  Zap:     (p) => <Icon {...p}><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/></Icon>,
  Music:   (p) => <Icon {...p}><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></Icon>,
  Settings:(p) => <Icon {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .4 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.4 1.7 1.7 0 0 0-1.1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .4-1.9 1.7 1.7 0 0 0-1.6-1.1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.4-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.4H9a1.7 1.7 0 0 0 1.1-1.6V3a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 15.2 4.7a1.7 1.7 0 0 0 1.9-.4l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.4 1.9V9a1.7 1.7 0 0 0 1.6 1.1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></Icon>,
  Play:    (p) => <Icon {...p} fill="currentColor" stroke="none"><path d="M6 4v16l14-8L6 4Z"/></Icon>,
  Pause:   (p) => <Icon {...p} fill="currentColor" stroke="none"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></Icon>,
  Skip:    (p) => <Icon {...p} fill="currentColor" stroke="none"><path d="M5 4l11 8L5 20V4ZM17 4h2v16h-2V4Z"/></Icon>,
  Back:    (p) => <Icon {...p} fill="currentColor" stroke="none"><path d="M19 4 8 12l11 8V4ZM5 4h2v16H5V4Z"/></Icon>,
  Vol:     (p) => <Icon {...p}><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a4 4 0 0 1 0 7"/></Icon>,
  VolMute: (p) => <Icon {...p}><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M22 9l-6 6M16 9l6 6"/></Icon>,
  TV:      (p) => <Icon {...p}><rect x="3" y="5" width="18" height="13" rx="2"/><path d="M8 21h8M12 18v3"/></Icon>,
  Coffee:  (p) => <Icon {...p}><path d="M4 8h13a4 4 0 0 1 0 8h-1"/><path d="M4 8v8a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4V8H4Z"/><path d="M7 3v2M11 3v2M15 3v2"/></Icon>,
  Router:  (p) => <Icon {...p}><rect x="2" y="13" width="20" height="8" rx="2"/><path d="M6 17h.01M10 17h.01M7 13V9a5 5 0 0 1 10 0v4M12 9v4"/></Icon>,
  Fan:     (p) => <Icon {...p}><circle cx="12" cy="12" r="2"/><path d="M12 10c-2-4-1-7 1-7s3 3 1 7M12 14c2 4 1 7-1 7s-3-3-1-7M10 12c-4-2-7-1-7 1s3 3 7 1M14 12c4 2 7 1 7-1s-3-3-7-1"/></Icon>,
  Lamp:    (p) => <Icon {...p}><path d="M9 2h6l3 7H6l3-7Z"/><path d="M12 9v9M9 18h6"/></Icon>,
  Bulb:    (p) => <Icon {...p}><circle cx="12" cy="9" r="5"/><path d="M9 18h6M10 21h4"/></Icon>,
  Search:  (p) => <Icon {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></Icon>,
  Disc:    (p) => <Icon {...p}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/></Icon>,
};

// ─────────────────────────────────────────────────────────────────────────────
// Integrations — one persisted blob of per-service config (URLs, tokens,
// device lists). Lives in localStorage so each browser keeps its own setup.
// Each integration's "status" is derived: a non-empty URL/token = configured.
// Network calls live here so components can stay declarative.
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_INTEGRATIONS = {
  // Stockholm fallback; Settings lets the user change this.
  weather: { lat: '59.3293', lon: '18.0686', city: 'Stockholm' },
  plejd:   { url: '', token: '' },          // Home Assistant REST base URL + long-lived token
  sonos:   { url: '' },                     // node-sonos-http-api base URL
  shelly:  { devices: [] },                 // [{ id, name, room, ip, icon, alwaysOn }]
  tibber:  { token: '' },                   // Tibber personal access token (api.tibber.com)
};

function useIntegrations() {
  const [config, setConfig] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('hdg-integrations') || '{}');
      return { ...DEFAULT_INTEGRATIONS, ...raw };
    } catch (e) { return { ...DEFAULT_INTEGRATIONS }; }
  });
  const persist = useCallback((next) => {
    setConfig(next);
    try { localStorage.setItem('hdg-integrations', JSON.stringify(next)); } catch (e) {}
  }, []);
  const setIntegration = useCallback((id, patch) => {
    persist({ ...config, [id]: { ...(config[id] || {}), ...patch } });
  }, [config, persist]);
  const status = useCallback((id) => {
    const c = config[id] || {};
    switch (id) {
      case 'weather': return c.lat && c.lon ? 'configured' : 'default';
      case 'plejd':   return c.url ? 'configured' : 'not-configured';
      case 'sonos':   return c.url ? 'configured' : 'not-configured';
      case 'shelly':  return (c.devices?.length ?? 0) > 0 ? 'configured' : 'not-configured';
      case 'tibber':  return c.token ? 'configured' : 'not-configured';
      default: return 'not-configured';
    }
  }, [config]);
  return { config, setIntegration, status };
}

// Weather — open-meteo is free, no key, CORS-open. WMO weather codes map
// to our four buckets for the photo backdrop. Hourly+daily arrays populate
// the Weather page.
function wmoToBucket(code) {
  if (code == null) return 'clear';
  if (code === 0 || code === 1) return 'clear';
  if (code === 2 || code === 3 || code === 45 || code === 48) return 'cloudy';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (code >= 95 && code <= 99)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  return 'cloudy';
}
function wmoLabel(code) {
  return {
    0: 'Clear',  1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Fog',   48: 'Rime fog',
    51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
    61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
    71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
    80: 'Rain showers', 81: 'Rain showers', 82: 'Violent showers',
    85: 'Snow showers', 86: 'Snow showers',
    95: 'Thunderstorm', 96: 'Thunder + hail', 99: 'Thunder + heavy hail',
  }[code] ?? 'Unknown';
}
async function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}` +
    `&current=temperature_2m,weather_code,apparent_temperature,wind_speed_10m` +
    `&hourly=temperature_2m,weather_code` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&timezone=auto&forecast_days=7`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`open-meteo ${r.status}`);
  return r.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Google sign-in (Google Identity Services, client-only).
// User registers a Google OAuth Client ID at console.cloud.google.com,
// pastes it into Settings, then signs in via Google's One Tap / button.
// We decode the returned JWT for { sub, email, name, picture } and store
// in localStorage. No backend — identity is verified by Google's signed JWT,
// but we don't verify the signature locally (any malicious actor with dev
// tools can forge a local user object; that's an acceptable trade-off for a
// home dashboard where the threat model is "my flatmate, not the NSA").
// ─────────────────────────────────────────────────────────────────────────────
function decodeJwtPayload(jwt) {
  try {
    const b64 = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
    return JSON.parse(atob(padded));
  } catch (e) { return null; }
}

function useGoogleAuth() {
  const [clientId, setClientIdState] = useState(() => localStorage.getItem('hdg-g-clientid') || '');
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('hdg-g-user') || 'null'); } catch (e) { return null; }
  });
  const [error, setError] = useState(null);

  const handleCredential = useCallback((resp) => {
    if (!resp?.credential) { setError('No credential from Google'); return; }
    const payload = decodeJwtPayload(resp.credential);
    if (!payload) { setError('Invalid credential'); return; }
    const u = {
      sub: payload.sub,
      email: payload.email,
      email_verified: payload.email_verified,
      name: payload.name,
      given_name: payload.given_name,
      picture: payload.picture,
      iat: payload.iat,
      exp: payload.exp,
    };
    localStorage.setItem('hdg-g-user', JSON.stringify(u));
    localStorage.setItem('hdg-g-credential', resp.credential);
    setUser(u);
    setError(null);
  }, []);

  // Initialize GIS as soon as both the script and a client_id are available.
  // Idempotent — google.accounts.id.initialize can be called multiple times.
  useEffect(() => {
    if (!clientId) return;
    const init = () => {
      if (!window.google?.accounts?.id) return false;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredential,
        auto_select: !!user, // re-auth silently if we already have a user
        cancel_on_tap_outside: false,
      });
      return true;
    };
    if (init()) return;
    const t = setInterval(() => { if (init()) clearInterval(t); }, 300);
    return () => clearInterval(t);
  }, [clientId, handleCredential, user]);

  const promptSignIn = useCallback(() => {
    if (!clientId) { setError('Set a Google Client ID in Settings first.'); return; }
    if (!window.google?.accounts?.id) { setError('Google sign-in is still loading…'); return; }
    setError(null);
    window.google.accounts.id.prompt(); // One Tap. If suppressed, falls back to renderButton below.
  }, [clientId]);

  // For a richer button UX, callers can pass a container ref to renderButton.
  const renderButton = useCallback((el) => {
    if (!el || !clientId || !window.google?.accounts?.id) return;
    el.innerHTML = '';
    window.google.accounts.id.renderButton(el, {
      type: 'standard',
      theme: 'filled_black',
      size: 'large',
      text: 'continue_with',
      shape: 'pill',
    });
  }, [clientId]);

  const signOut = useCallback(() => {
    if (window.google?.accounts?.id) {
      try { window.google.accounts.id.disableAutoSelect(); } catch (e) {}
      if (user?.sub) try { window.google.accounts.id.revoke(user.sub, () => {}); } catch (e) {}
    }
    localStorage.removeItem('hdg-g-user');
    localStorage.removeItem('hdg-g-credential');
    setUser(null);
  }, [user]);

  const setClientId = useCallback((id) => {
    const v = (id || '').trim();
    if (v) localStorage.setItem('hdg-g-clientid', v);
    else localStorage.removeItem('hdg-g-clientid');
    setClientIdState(v);
  }, []);

  // Local sign-up -- creates a "profile" user object stored under the same
  // localStorage key as a Google sign-in. No backend, no real auth: this
  // browser is the only place this account exists. Useful for users who don't
  // want a Google account or for a quick first-run setup before they wire
  // OAuth properly.
  const signUpLocal = useCallback(({ name, email }) => {
    const n = (name || '').trim();
    const e = (email || '').trim();
    if (!n || !e || !/^.+@.+\..+$/.test(e)) {
      setError('Enter a name and a valid email address.');
      return false;
    }
    const u = {
      sub: 'local-' + Math.random().toString(36).slice(2, 12),
      email: e,
      email_verified: false,
      name: n,
      given_name: n.split(' ')[0],
      picture: '',
      provider: 'local',
      iat: Math.floor(Date.now() / 1000),
    };
    localStorage.setItem('hdg-g-user', JSON.stringify(u));
    setUser(u);
    setError(null);
    return true;
  }, []);

  return { clientId, setClientId, user, error, promptSignIn, renderButton, signOut, signUpLocal };
}

// ─────────────────────────────────────────────────────────────────────────────
// Plejd via Home Assistant REST API.
// HA exposes `/api/states` (list) and `/api/services/light/turn_on|off` (cmd).
// Plejd lights show up as `light.*` entities. The bridge runs on the user's
// LAN (e.g. http://homeassistant.local:8123); HA must have CORS enabled in
// configuration.yaml under `http: cors_allowed_origins: ['http://127.0.0.1:5183']`.
// ─────────────────────────────────────────────────────────────────────────────
async function plejdFetchRooms({ url, token }) {
  if (!url || !token) throw new Error('Plejd not configured');
  const base = url.replace(/\/$/, '');
  const r = await fetch(`${base}/api/states`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!r.ok) {
    if (r.status === 401) throw new Error('HA token rejected (401)');
    throw new Error(`HA ${r.status}`);
  }
  const states = await r.json();
  return states
    .filter(s => s.entity_id.startsWith('light.'))
    .map(s => ({
      id: s.entity_id.replace('light.', ''),
      name: s.attributes?.friendly_name || s.entity_id,
      // HA doesn't track "bulb count" per entity; assume 1 unless overridden.
      bulbs: s.attributes?.bulb_count || 1,
      on: s.state === 'on',
      brightness: Math.round((s.attributes?.brightness || 0) / 255 * 100),
      _entity: s.entity_id,
    }));
}
async function plejdCallService({ url, token }, service, entity_id, payload = {}) {
  const base = url.replace(/\/$/, '');
  const r = await fetch(`${base}/api/services/light/${service}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ entity_id, ...payload }),
  });
  if (!r.ok) throw new Error(`HA ${r.status}`);
  return r.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Sonos via node-sonos-http-api (https://github.com/jishi/node-sonos-http-api).
// GET /zones returns current zone state; GET /<room>/play|pause|volume/<n>
// drive playback. CORS is open by default in that project.
// ─────────────────────────────────────────────────────────────────────────────
async function sonosFetchSpeakers({ url }) {
  if (!url) throw new Error('Sonos not configured');
  const base = url.replace(/\/$/, '');
  const r = await fetch(`${base}/zones`);
  if (!r.ok) throw new Error(`Sonos ${r.status}`);
  const zones = await r.json();
  const speakers = [];
  zones.forEach(z => {
    const members = z.members || [z.coordinator];
    members.forEach(m => {
      speakers.push({
        id: (m.roomName || '').toLowerCase().replace(/\s+/g, '_'),
        name: m.roomName,
        source: z.coordinator?.state?.currentTrack?.title || (m.roomName === z.coordinator.roomName ? 'Standalone' : z.coordinator.roomName),
        on: (z.coordinator?.state?.playbackState === 'PLAYING'),
        volume: m.state?.volume ?? z.coordinator?.state?.volume ?? 0,
        primary: m.uuid === z.uuid,
        _room: m.roomName,
      });
    });
  });
  return speakers;
}
async function sonosCmd({ url }, room, command, ...args) {
  const base = url.replace(/\/$/, '');
  const path = `/${encodeURIComponent(room)}/${command}${args.length ? '/' + args.map(encodeURIComponent).join('/') : ''}`;
  const r = await fetch(`${base}${path}`);
  if (!r.ok) throw new Error(`Sonos ${r.status}`);
  return r.json();
}

// Tibber — GraphQL. Today's hourly spot prices for the user's first home.
async function fetchTibberPrices(token) {
  const query = `{ viewer { homes { currentSubscription { priceInfo { today { total startsAt } } } } } }`;
  const r = await fetch('https://api.tibber.com/v1-beta/gql', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) throw new Error(`Tibber ${r.status}`);
  const j = await r.json();
  if (j.errors) throw new Error(j.errors[0]?.message || 'Tibber error');
  return j.data?.viewer?.homes?.[0]?.currentSubscription?.priceInfo?.today || [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Spotify — PKCE OAuth + Web API client.
// Pure browser flow, no backend: the user opens Settings, pastes a Client ID
// they got from developer.spotify.com, clicks Connect → we run PKCE,
// Spotify redirects back with ?code, we exchange it for an access_token, and
// store {access, refresh, expires_at} in localStorage. Refresh happens on
// demand inside spotifyApi() before each call. Disconnect drops tokens.
// ─────────────────────────────────────────────────────────────────────────────
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
function spRedirectUri() {
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

function useSpotify() {
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
  // exchange it for a token and clean the URL. Runs before any API calls.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const err  = params.get('error');
    if (err) { setError(`Spotify denied: ${err}`); return; }
    if (!code) return;
    const cid = localStorage.getItem('hdg-sp-clientid');
    if (!cid) { setError('Missing Spotify Client ID after redirect.'); return; }
    spExchangeCode(cid, code).then(t => {
      localStorage.setItem('hdg-sp-token', JSON.stringify(t));
      setToken(t);
      const back = localStorage.getItem('hdg-sp-return') || '#music';
      localStorage.removeItem('hdg-sp-return');
      const clean = window.location.origin + window.location.pathname + back;
      window.history.replaceState({}, '', clean);
    }).catch(e => setError(String(e.message || e)));
  }, []);

  // Always-fresh accessor: refreshes the token if it's about to expire,
  // then calls the API. Callers use this for every fetch so retries on 401
  // never have to think about refresh state.
  const api = useCallback(async (path, options = {}) => {
    let tk = token;
    if (!tk) throw new Error('Not connected to Spotify');
    if (Date.now() >= (tk.expires_at || 0)) {
      const fresh = await spRefresh(clientId, tk.refresh_token);
      localStorage.setItem('hdg-sp-token', JSON.stringify(fresh));
      setToken(fresh);
      tk = fresh;
    }
    const r = await fetch(`${SP_API}${path}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${tk.access_token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    if (r.status === 204) return null;
    const text = await r.text();
    const j = text ? JSON.parse(text) : null;
    if (!r.ok) throw new Error(j?.error?.message || `Spotify API ${r.status}`);
    return j;
  }, [token, clientId]);

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

  return { clientId, setClientId, token, me, error, connect, disconnect, api, devices, refreshDevices, transferTo, pauseDevice, setDeviceVolume };
}

// ─────────────────────────────────────────────────────────────────────────────
// Routing — hash-based so the prototype works as a flat file with no router lib
// ─────────────────────────────────────────────────────────────────────────────
const ROUTES = ['home', 'rooms', 'music', 'energy', 'weather', 'news', 'settings'];

function useRoute() {
  const read = () => {
    const h = (window.location.hash || '#home').replace(/^#\/?/, '');
    return ROUTES.includes(h) ? h : 'home';
  };
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onHash = () => setRoute(read());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const navigate = useCallback((id) => { window.location.hash = '#' + id; }, []);
  return [route, navigate];
}

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar — visual continuity with Sidebar.tsx; active row reflects hash route
// ─────────────────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'home',     label: 'Home',     Icon: I.Home },
  { id: 'rooms',    label: 'Rooms',    Icon: I.Light },
  { id: 'music',    label: 'Music',    Icon: I.Music },
  { id: 'energy',   label: 'Energy',   Icon: I.Zap },
  { id: 'weather',  label: 'Weather',  Icon: I.Cloud },
  { id: 'news',     label: 'News',     Icon: I.News },
];

function Sidebar({ route, onNavigate, google }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"><I.Home size={15} /></div>
        <div className="brand-name">Home Domain</div>
      </div>

      <button className="search-trigger">
        <span>Search & go</span>
        <kbd>⌘ K</kbd>
      </button>

      <nav className="nav">
        {NAV_ITEMS.map(item => {
          const Ic = item.Icon;
          return (
            <button
              key={item.id}
              className={'nav-row' + (route === item.id ? ' row-active' : '')}
              onClick={() => onNavigate(item.id)}
              aria-current={route === item.id ? 'page' : undefined}
            >
              <span className="dot" />
              <Ic className="icon" /> {item.label}
            </button>
          );
        })}
        <button
          className={'nav-row' + (route === 'settings' ? ' row-active' : '')}
          style={{ marginTop: 'auto' }}
          onClick={() => onNavigate('settings')}
          aria-current={route === 'settings' ? 'page' : undefined}
        >
          <span className="dot" /><I.Settings className="icon" /> Settings
        </button>
      </nav>

      <button
        type="button"
        className="account"
        style={{ marginTop: 16, background: 'none', border: 0, padding: 0, width: '100%', textAlign: 'left', cursor: 'pointer', borderTop: '1px solid var(--border)', paddingTop: 16 }}
        onClick={() => onNavigate('settings')}
        title={google?.user ? 'Manage account in Settings' : 'Sign in via Settings'}
      >
        {google?.user ? (
          <>
            {google.user.picture
              ? <img className="avatar" src={google.user.picture} alt="" referrerPolicy="no-referrer" style={{ width: 32, height: 32, objectFit: 'cover', background: 'none' }} />
              : <div className="avatar">{(google.user.given_name || google.user.name || '?').slice(0, 1).toUpperCase()}</div>}
            <div style={{ minWidth: 0, overflow: 'hidden' }}>
              <div className="account-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{google.user.name}</div>
              <div className="account-email" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{google.user.email}</div>
            </div>
          </>
        ) : (
          <>
            <div className="avatar" style={{ background: 'color-mix(in oklch, var(--clay-50) 8%, transparent)', color: 'var(--muted-foreground)' }}>
              <I.Settings size={14} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="account-name">Sign in</div>
              <div className="account-email">Set up your account in Settings</div>
            </div>
          </>
        )}
      </button>
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Slider — drag-to-set, used by light brightness + speaker volume
// ─────────────────────────────────────────────────────────────────────────────
function Slider({ value, onChange, disabled }) {
  const ref = useRef(null);
  const dragging = useRef(false);

  const set = useCallback((clientX) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100));
    onChange(Math.round(pct));
  }, [onChange]);

  useEffect(() => {
    const mv = (e) => { if (!dragging.current) return; set(e.clientX ?? e.touches?.[0]?.clientX ?? 0); };
    const up = () => { dragging.current = false; document.body.style.cursor = ''; };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
  }, [set]);

  return (
    <div
      ref={ref}
      className="slider"
      style={{ opacity: disabled ? 0.45 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
      onPointerDown={(e) => {
        if (disabled) return;
        dragging.current = true;
        document.body.style.cursor = 'grabbing';
        set(e.clientX);
      }}
    >
      <div className="slider-fill" style={{ transform: `scaleX(${value / 100})` }} />
      <div className="slider-thumb" style={{ left: `${value}%` }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Power toggle (Switch)
// ─────────────────────────────────────────────────────────────────────────────
function Toggle({ on, onToggle, ariaLabel }) {
  return (
    <button
      type="button"
      className="power-toggle"
      data-on={on}
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Flicker pulse — quick acknowledgement when a state changes
// ─────────────────────────────────────────────────────────────────────────────
function useFlicker(deps) {
  const [k, setK] = useState(0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setK((x) => x + 1);
  }, deps);
  return k;
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain state — initial fixture
// ─────────────────────────────────────────────────────────────────────────────
// All device state starts empty. Real devices are pulled from the bridges
// configured in Settings (Plejd via Home Assistant, Sonos via node-sonos-
// http-api, Shelly per-device HTTP). Until a bridge is configured the
// corresponding section shows an empty state pointing to Settings.
const INITIAL_ROOMS = [];
const INITIAL_OUTLETS = [];
const INITIAL_SPEAKERS = [];

// Demo fixtures -- used by Settings -> "Load demo data". Room/outlet IDs are
// referenced by SCENES below; keep them in sync if you rename anything here.
const DEMO_ROOMS = [
  { id: 'kitchen', name: 'Kitchen',     bulbs: 4, on: true,  brightness: 80 },
  { id: 'dining',  name: 'Dining',      bulbs: 3, on: true,  brightness: 55 },
  { id: 'living',  name: 'Living room', bulbs: 5, on: true,  brightness: 65 },
  { id: 'hall',    name: 'Hallway',     bulbs: 2, on: false, brightness: 0  },
  { id: 'bedroom', name: 'Bedroom',     bulbs: 2, on: false, brightness: 0  },
  { id: 'bath',    name: 'Bathroom',    bulbs: 2, on: true,  brightness: 50 },
  { id: 'office',  name: 'Office',      bulbs: 3, on: true,  brightness: 90 },
  { id: 'kids',    name: "Kids' room",  bulbs: 4, on: false, brightness: 0  },
];
const DEMO_OUTLETS = [
  { id: 'fridge', name: 'Refrigerator', room: 'Kitchen',     watts: 120, on: true,  alwaysOn: true,  icon: 'Plug'    },
  { id: 'coffee', name: 'Coffee maker', room: 'Kitchen',     watts: 0,   on: false, alwaysOn: false, icon: 'Coffee'  },
  { id: 'tv',     name: 'TV + media',   room: 'Living room', watts: 180, on: true,  alwaysOn: false, icon: 'TV'      },
  { id: 'hifi',   name: 'Hi-fi amp',    room: 'Living room', watts: 35,  on: true,  alwaysOn: false, icon: 'Speaker' },
  { id: 'router', name: 'Network rack', room: 'Office',      watts: 28,  on: true,  alwaysOn: true,  icon: 'Router'  },
  { id: 'desk',   name: 'Desk lamp',    room: 'Office',      watts: 12,  on: true,  alwaysOn: false, icon: 'Lamp'    },
];
const DEMO_SPEAKERS = [
  { id: 'living',  name: 'Living room', source: 'Now playing', primary: true,  on: true,  volume: 32 },
  { id: 'kitchen', name: 'Kitchen',     source: 'Living room', primary: false, on: true,  volume: 24 },
  { id: 'office',  name: 'Office',      source: 'Standalone',  primary: false, on: false, volume: 0  },
  { id: 'bath',    name: 'Bathroom',    source: 'Standalone',  primary: false, on: false, volume: 0  },
];

// Scene definitions: which rooms on/off + brightness target, which outlets, speaker volumes.
const SCENES = [
  {
    id: 'morning', label: 'Morning', sub: 'Gentle start', icon: 'Sun',
    apply: (s) => ({
      rooms: s.rooms.map(r => ({ ...r, on: ['kitchen','dining','bath'].includes(r.id), brightness: r.id === 'kitchen' ? 90 : 60 })),
      outlets: s.outlets.map(o => ({ ...o, on: o.id === 'coffee' || o.alwaysOn ? true : o.id === 'router' })),
      speakers: s.speakers.map(sp => ({ ...sp, on: sp.id === 'kitchen', volume: 18 })),
    }),
  },
  {
    id: 'dinner', label: 'Dinner', sub: 'Warm & low', icon: 'Utensils',
    apply: (s) => ({
      rooms: s.rooms.map(r => ({ ...r, on: ['kitchen','dining','living'].includes(r.id), brightness: r.id === 'dining' ? 55 : 35 })),
      outlets: s.outlets.map(o => ({ ...o, on: o.alwaysOn || o.id === 'speaker' })),
      speakers: s.speakers.map(sp => ({ ...sp, on: ['kitchen','dining','living'].includes(sp.id) || sp.id === 'kitchen', volume: 28 })),
    }),
  },
  {
    id: 'movie', label: 'Movie', sub: 'Cinema dim', icon: 'Film',
    apply: (s) => ({
      rooms: s.rooms.map(r => ({ ...r, on: r.id === 'living', brightness: 8 })),
      outlets: s.outlets.map(o => ({ ...o, on: o.alwaysOn || o.id === 'tv' })),
      speakers: s.speakers.map(sp => ({ ...sp, on: sp.id === 'living', volume: 45 })),
    }),
  },
  {
    id: 'sleep', label: 'Sleep', sub: 'Bedroom only', icon: 'Moon',
    apply: (s) => ({
      rooms: s.rooms.map(r => ({ ...r, on: r.id === 'bed', brightness: 15 })),
      outlets: s.outlets.map(o => ({ ...o, on: o.alwaysOn })),
      speakers: s.speakers.map(sp => ({ ...sp, on: false, volume: 8 })),
    }),
  },
  {
    id: 'alloff', label: 'All off', sub: 'Goodnight', icon: 'PowerOff',
    apply: (s) => ({
      rooms: s.rooms.map(r => ({ ...r, on: false })),
      outlets: s.outlets.map(o => ({ ...o, on: o.alwaysOn === true })),
      speakers: s.speakers.map(sp => ({ ...sp, on: false })),
    }),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Backdrop selection — time-of-day + weather → photo
// ─────────────────────────────────────────────────────────────────────────────
const WEATHER_OPTIONS = [
  { id: 'clear',  label: 'Clear',         temp: '+14°', icon: 'Sun' },
  { id: 'cloudy', label: 'Light cloud',   temp: '+11°', icon: 'Cloud' },
  { id: 'rain',   label: 'Rain',          temp: '+8°',  icon: 'Cloud' },
  { id: 'snow',   label: 'Snow',          temp: '-2°',  icon: 'Cloud' },
];

function pickBackdrop(now, weather) {
  const h = now.getHours();
  // Night (21–5)
  if (h >= 21 || h < 5) return '/assets/backdrop-night.avif';
  // Sunrise (5–9)
  if (h < 9) return '/assets/backdrop-sunrise.avif';
  // Day (9–17) — weather decides
  if (h < 17) {
    if (weather === 'rain') return '/assets/backdrop-rain.avif';
    if (weather === 'snow') return '/assets/backdrop-winter.avif';
    if (weather === 'cloudy') return '/assets/backdrop-cabin.avif';
    return '/assets/backdrop-day.avif';
  }
  // Sunset (17–21)
  return '/assets/backdrop-sunset.avif';
}

function timeSlotLabel(now) {
  const h = now.getHours();
  if (h >= 21 || h < 5) return 'Night';
  if (h < 9) return 'Sunrise';
  if (h < 17) return 'Daytime';
  return 'Sunset';
}
// Format helpers for activity log
function fmtTime(d) {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
function fmtAgo(then, now) {
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

// Spotify iFrame API loader — exposes a single promise that resolves to the
// global IFrameAPI object once the async script has finished loading. The
// script may load before or after React mounts; this handles both cases by
// swapping in our callback if Spotify hasn't called it yet, or resolving
// immediately if it already did.
const spotifyIFrameApi = new Promise((resolve) => {
  if (typeof window === 'undefined') return;
  if (window.__hdgSpotifyApi) { resolve(window.__hdgSpotifyApi); return; }
  const original = window.onSpotifyIframeApiReady;
  window.onSpotifyIframeApiReady = (api) => {
    window.__hdgSpotifyApi = api;
    if (typeof original === 'function') try { original(api); } catch (e) {}
    resolve(api);
  };
});

// useSpotifyEmbed — wraps the iFrame API into a React-friendly hook. Returns
// an `attach` ref-callback for the container div (the API injects an iframe
// inside it), a `state` object with isPaused/position/duration, and play/
// pause/seek/skip helpers. The controller is created once; URI changes call
// loadUri so the iframe never reloads (audio doesn't blip between sources).
function useSpotifyEmbed(uri) {
  const controllerRef = useRef(null);
  const elementRef = useRef(null);
  const [state, setState] = useState({ isPaused: true, isBuffering: false, position: 0, duration: 0 });
  const lastUriRef = useRef(uri);

  const create = useCallback((api) => {
    const el = elementRef.current;
    if (!el || controllerRef.current) return;
    api.createController(el, { uri, width: '100%', height: '100%' }, (controller) => {
      controllerRef.current = controller;
      controller.addListener('playback_update', (e) => {
        if (e?.data) setState(prev => ({ ...prev, ...e.data }));
      });
      controller.addListener('ready', () => {});
    });
  }, []); // intentional: create only on initial attach; URI updates handled below

  const attach = useCallback((el) => {
    elementRef.current = el;
    if (!el) return;
    spotifyIFrameApi.then(create);
  }, [create]);

  // Load new URI when it changes — the controller stays the same, just
  // tells the embed to point at a new resource.
  useEffect(() => {
    if (lastUriRef.current === uri) return;
    lastUriRef.current = uri;
    if (controllerRef.current && uri) controllerRef.current.loadUri(uri);
  }, [uri]);

  const togglePlay   = useCallback(() => controllerRef.current?.togglePlay(), []);
  const play         = useCallback(() => controllerRef.current?.play(), []);
  const pause        = useCallback(() => controllerRef.current?.pause(), []);
  // The iFrame API has no track-skip; we approximate with a +/-15s seek.
  // Web Playback SDK has real next/prev but requires a Premium token.
  const seekRel = useCallback((deltaSec) => {
    const c = controllerRef.current;
    if (!c) return;
    setState(prev => {
      const newPos = Math.max(0, Math.min(prev.duration || 0, (prev.position || 0) + deltaSec * 1000));
      c.seek(newPos / 1000);
      return { ...prev, position: newPos };
    });
  }, []);

  return { attach, state, togglePlay, play, pause, seekRel };
}

// useSpotifyOEmbed — fetches the public oEmbed thumbnail + title for any
// Spotify resource (album/playlist/track/artist). No auth needed and CORS-
// friendly. Used for the album cover and human-readable title in the header
// player. Cached in-memory so navigating back to the same source is instant.
const oembedCache = new Map();
function useSpotifyOEmbed(type, id) {
  const [data, setData] = useState(() => {
    const k = `${type}/${id}`;
    return oembedCache.has(k) ? oembedCache.get(k) : null;
  });
  useEffect(() => {
    if (!type || !id) { setData(null); return; }
    const k = `${type}/${id}`;
    if (oembedCache.has(k)) { setData(oembedCache.get(k)); return; }
    let cancelled = false;
    const url = `https://open.spotify.com/oembed?url=${encodeURIComponent(`https://open.spotify.com/${type}/${id}`)}`;
    fetch(url).then(r => r.ok ? r.json() : null).then(j => {
      if (cancelled || !j) return;
      const next = { title: j.title, thumb: j.thumbnail_url, author: j.author_name || j.provider_name };
      oembedCache.set(k, next);
      setData(next);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [type, id]);
  return data;
}

// PersistentMusicPlayer — same role as before (own the iframe, position it),
// but now the iframe is created by Spotify's iFrame API via the `attach`
// callback. On Music it overlays the stage anchor; otherwise it's stashed
// off-screen so audio keeps playing while the user is on a different page.
function PersistentMusicPlayer({ attach, isOnMusic }) {
  const [pos, setPos] = useState(null);
  useEffect(() => {
    if (!isOnMusic) { setPos(null); return; }
    const update = () => {
      const a = document.getElementById('music-stage-anchor');
      // Anchor is gone (e.g. SearchResults replaced it). Hide the player so it
      // doesn't sit on top of whatever took the anchor's spot.
      if (!a) { setPos(null); return; }
      const r = a.getBoundingClientRect();
      setPos({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    const t1 = setTimeout(update, 0);
    const t2 = setTimeout(update, 120);
    // MutationObserver catches the anchor being added/removed by SearchResults
    // toggling -- scroll/resize listeners alone miss DOM swaps.
    const mo = new MutationObserver(update);
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      clearTimeout(t1); clearTimeout(t2);
      mo.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [isOnMusic]);

  // Spotify's iFrame API *replaces* the target element with the iframe. So
  // we render an outer wrapper we control + an inner placeholder div that
  // Spotify swaps out. Wrapper positioning persists across the swap.
  const style = isOnMusic && pos
    ? { position: 'fixed', top: pos.top, left: pos.left, width: pos.width, height: pos.height, zIndex: 40 }
    : { position: 'fixed', top: -9999, left: -9999, width: 360, height: 80, zIndex: 0, pointerEvents: 'none', visibility: 'hidden' };

  return (
    <div className="persistent-player" data-on-music={isOnMusic} style={style}>
      <div ref={attach} className="persistent-player-target" />
    </div>
  );
}

// HeaderMusic — the always-visible compact player that sits between the clock
// and the weather hero. No background, white-on-photo typography, clock-style
// text-shadow for legibility. Cover click → Music page. Controls drive the
// Spotify iFrame API directly.
function HeaderMusic({ playback, oembed, sourceLabel, sourceSub, onClickArt, togglePlay, seekRel }) {
  // Prefer our local label (curated or user pick) over oEmbed's. For artist,
  // oEmbed returns "Spotify" for most resources so we lean on sourceSub.
  const title  = sourceLabel || oembed?.title  || 'Music';
  const sub    = sourceSub   || oembed?.author || '';
  const cover  = oembed?.thumb;
  const paused = playback.isPaused !== false; // default to paused if unknown
  return (
    <div className="header-music">
      <button className="header-music-art" onClick={onClickArt} title="Open Music page" aria-label="Open Music page">
        {cover ? <img src={cover} alt="" /> : <I.Music size={22} />}
      </button>
      <div className="header-music-meta">
        <div className="header-music-title">{title}</div>
        {sub && <div className="header-music-artist">{sub}</div>}
      </div>
      <div className="header-music-controls">
        <button className="header-music-btn" onClick={() => seekRel(-15)} title="Back 15 s" aria-label="Skip back 15 seconds">
          <I.Back size={14} />
        </button>
        <button className="header-music-btn header-music-btn-play" onClick={togglePlay} title={paused ? 'Play' : 'Pause'} aria-label={paused ? 'Play' : 'Pause'}>
          {paused ? <I.Play size={20} /> : <I.Pause size={20} />}
        </button>
        <button className="header-music-btn" onClick={() => seekRel(15)} title="Forward 15 s" aria-label="Skip forward 15 seconds">
          <I.Skip size={14} />
        </button>
      </div>
    </div>
  );
}

// Prefers-reduced-motion (live)
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    const h = () => setReduced(m.matches);
    m.addEventListener?.('change', h);
    return () => m.removeEventListener?.('change', h);
  }, []);
  return reduced;
}

function App() {
  // Demo mode persists in localStorage so reloads keep the demo state alive.
  const [demoMode, setDemoMode] = useState(() => localStorage.getItem('hdg-demo-mode') === '1');
  const [rooms, setRooms] = useState(() => demoMode ? DEMO_ROOMS : INITIAL_ROOMS);
  const [outlets, setOutlets] = useState(() => demoMode ? DEMO_OUTLETS : INITIAL_OUTLETS);
  const [speakers, setSpeakers] = useState(() => demoMode ? DEMO_SPEAKERS : INITIAL_SPEAKERS);
  const loadDemoData = useCallback(() => {
    setRooms(DEMO_ROOMS); setOutlets(DEMO_OUTLETS); setSpeakers(DEMO_SPEAKERS);
    setDemoMode(true);
    localStorage.setItem('hdg-demo-mode', '1');
  }, []);
  const clearDemoData = useCallback(() => {
    setRooms([]); setOutlets([]); setSpeakers([]);
    setDemoMode(false);
    localStorage.removeItem('hdg-demo-mode');
  }, []);
  const [activeScene, setActiveScene] = useState(null);
  const [activeSceneAt, setActiveSceneAt] = useState(null); // timestamp when applied
  const [playing, setPlaying] = useState(true);
  const [groupAll, setGroupAll] = useState(false);
  const [now, setNow] = useState(new Date());
  const [activity, setActivity] = useState([]); // newest-first; cap at 8
  const reducedMotion = usePrefersReducedMotion();
  const [route, navigate] = useRoute();
  const [musicSource, setMusicSource] = useState('emotion');     // Curated source key (default fallback)
  const [musicCustom, setMusicCustom] = useState(null);          // { type, id, label } when playing a search/library pick
  const [musicFavs, setMusicFavs] = useState(() => {             // Local favourites — works without Spotify auth
    try { return JSON.parse(localStorage.getItem('hdg-music-favs') || '[]'); } catch (e) { return []; }
  });
  const spotify = useSpotify();
  const google = useGoogleAuth();
  const integrations = useIntegrations();
  const [plejdErr, setPlejdErr] = useState(null);
  const [sonosErr, setSonosErr] = useState(null);
  const [newsTab, setNewsTab] = useState('sr');
  // Weather is fetched live from open-meteo. `weatherData` holds the full
  // response (current/hourly/daily); `weather` is the derived bucket used by
  // the photo backdrop and the four-state UI.
  const [weatherData, setWeatherData] = useState(null);
  const [weatherErr, setWeatherErr] = useState(null);
  const weather = useMemo(() => wmoToBucket(weatherData?.current?.weather_code), [weatherData]);
  // Live Tibber prices when token is configured.
  const [tibberPrices, setTibberPrices] = useState(null);
  const [tibberErr, setTibberErr] = useState(null);

  // Push a single entry into the activity log; we cap at 8 so the panel
  // never grows unbounded — the rest live in History (future surface).
  const logActivity = useCallback((kind, text) => {
    setActivity(a => [{ id: Date.now() + Math.random(), kind, text, t: new Date() }, ...a].slice(0, 8));
  }, []);

  // Single theme product — Clay only. Set once and forget.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'clay');
  }, []);

  // Persist favourites whenever the list changes.
  useEffect(() => {
    try { localStorage.setItem('hdg-music-favs', JSON.stringify(musicFavs)); } catch (e) {}
  }, [musicFavs]);

  // Music favourite helpers — item = { id, type, name, sub, embed }
  const addFav = useCallback((item) => {
    setMusicFavs(f => f.some(x => x.id === item.id) ? f : [item, ...f].slice(0, 50));
    logActivity('music', `Saved **${item.name}** to favourites`);
  }, [logActivity]);
  const removeFav = useCallback((id) => {
    setMusicFavs(f => f.filter(x => x.id !== id));
  }, []);
  // Play any Spotify resource by URI parts. Sets the custom slot which the
  // App-level embed src computation prefers over the curated `musicSource`.
  const playSpotify = useCallback((type, id, label) => {
    setMusicCustom({ type, id, label });
    logActivity('music', `Playing **${label}**`);
  }, [logActivity]);
  // Switching the curated source clears any custom one.
  const pickCurated = useCallback((id) => {
    setMusicSource(id);
    setMusicCustom(null);
  }, []);

  // Time + weather → backdrop photo. Crossfade by swapping background-image.
  useEffect(() => {
    const url = pickBackdrop(now, weather);
    const el = document.querySelector('.bg-photo');
    if (el) el.style.backgroundImage = `url('${url}')`;
  }, [now, weather]);

  // Poll Spotify "currently playing" every 8 seconds while connected. Writes
  // straight into store.playback so NowPlaying, the header mini-player, and
  // any future widget all render from the same source of truth instead of a
  // hardcoded album the audit flagged as dead chrome.
  useEffect(() => {
    if (!spotify.token) {
      useHomeStore.getState().setPlayback({ track: null, artist: null, art: null, uri: null, deviceId: null, isPlaying: false });
      return;
    }
    let cancelled = false;
    const load = () => {
      spotify.api('/me/player/currently-playing?market=from_token')
        .then(j => {
          if (cancelled) return;
          if (!j || !j.item) {
            // 204 (nothing playing) -- clear the slice but keep token state.
            useHomeStore.getState().setPlayback({ track: null, artist: null, art: null, uri: null, deviceId: null, isPlaying: false });
            return;
          }
          const item = j.item;
          const art = item.album?.images?.[0]?.url || item.album?.images?.[1]?.url || null;
          const artist = (item.artists || []).map(a => a.name).join(', ');
          useHomeStore.getState().setPlayback({
            track: item.name,
            artist,
            art,
            uri: item.uri || null,
            albumUri: item.album?.uri || null,
            deviceId: j.device?.id || null,
            deviceName: j.device?.name || null,
            isPlaying: !!j.is_playing,
            progressMs: j.progress_ms || 0,
            durationMs: item.duration_ms || 0,
          });
        })
        .catch(e => {
          if (cancelled) return;
          // A 401 here means the access token died; the spotify hook handles
          // refresh internally. Just don't spam the dot on a transient miss.
          const msg = String(e?.message || e);
          if (!/401|429/.test(msg)) {
            useHomeStore.getState().setStatus('spotify', { detail: msg });
          }
        });
    };
    load();
    const t = setInterval(load, 8_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [spotify.token, spotify.api]);

  // Publish Spotify auth status to the home store.  The token's presence is
  // ground truth; the error string upgrades the dot to degraded.
  useEffect(() => {
    const s = useHomeStore.getState();
    if (spotify.error) {
      s.markFailed('spotify', spotify.error);
    } else if (spotify.token) {
      s.markOk('spotify', spotify.me ? `as ${spotify.me.display_name}` : 'connected');
    } else if (spotify.clientId) {
      s.setStatus('spotify', { state: STATUS.EMPTY, label: 'Not connected', detail: 'Click Connect in Settings' });
    } else {
      s.setStatus('spotify', { state: STATUS.EMPTY, label: 'Not connected', detail: null });
    }
  }, [spotify.token, spotify.me, spotify.error, spotify.clientId]);

  // Publish Google sign-in status. Local-email signups are also tracked here
  // (provider:'local') so the dot reflects "household account set up" generally.
  useEffect(() => {
    const s = useHomeStore.getState();
    if (google.error) {
      s.markFailed('google', google.error);
    } else if (google.user) {
      const provider = google.user.provider === 'local' ? 'local profile' : 'Google';
      s.markOk('google', `as ${google.user.name} (${provider})`);
    } else if (google.clientId) {
      s.setStatus('google', { state: STATUS.EMPTY, label: 'Not signed in', detail: 'Tap account in sidebar' });
    } else {
      s.setStatus('google', { state: STATUS.EMPTY, label: 'Not signed in', detail: null });
    }
  }, [google.user, google.error, google.clientId]);

  // Fetch live weather from open-meteo. Re-fetch every 30 min so the dashboard
  // stays current even on long sessions, and on config change (lat/lon).
  // Publishes status to the home store -- the section eyebrow dot reads from
  // there, so a 401 / network error becomes a glanceable amber dot, not a
  // toast or console line.
  useEffect(() => {
    const { lat, lon } = integrations.config.weather || {};
    if (!lat || !lon) {
      useHomeStore.getState().setStatus('weather', { state: STATUS.EMPTY, label: 'Using defaults', detail: null });
      return;
    }
    let cancelled = false;
    const load = () => {
      fetchWeather(lat, lon)
        .then(d => {
          if (cancelled) return;
          setWeatherData(d); setWeatherErr(null);
          useHomeStore.getState().markOk('weather', `${integrations.config.weather?.city || `${lat},${lon}`}`);
        })
        .catch(e => {
          if (cancelled) return;
          const msg = String(e.message || e);
          setWeatherErr(msg);
          useHomeStore.getState().markFailed('weather', msg);
        });
    };
    load();
    const t = setInterval(load, 30 * 60 * 1000);
    return () => { cancelled = true; clearInterval(t); };
  }, [integrations.config.weather?.lat, integrations.config.weather?.lon, integrations.config.weather?.city]);

  // Fetch live Plejd state (via Home Assistant) when configured. Poll 30s.
  // Errors surface in `plejdErr` AND in store.status.plejd so Settings can
  // show a connection problem AND the section eyebrow dot turns amber.
  useEffect(() => {
    if (demoMode) return; // demo fixtures take precedence over live bridges
    const cfg = integrations.config.plejd;
    if (!cfg?.url || !cfg?.token) {
      setPlejdErr(null);
      useHomeStore.getState().setStatus('plejd', { state: STATUS.EMPTY, label: 'Not set up', detail: null });
      return;
    }
    let cancelled = false;
    const load = () => plejdFetchRooms(cfg)
      .then(rs => {
        if (cancelled) return;
        setRooms(rs); setPlejdErr(null);
        useHomeStore.getState().markOk('plejd', `${rs.length} rooms`);
      })
      .catch(e => {
        if (cancelled) return;
        const msg = String(e.message || e);
        setPlejdErr(msg);
        useHomeStore.getState().markFailed('plejd', msg);
      });
    load();
    const t = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [integrations.config.plejd?.url, integrations.config.plejd?.token, demoMode]);

  // Fetch live Sonos state when configured. Poll 15s — playback changes
  // faster than light state so the UI feels responsive.
  useEffect(() => {
    if (demoMode) return; // demo fixtures take precedence over live bridges
    const cfg = integrations.config.sonos;
    if (!cfg?.url) {
      setSonosErr(null);
      useHomeStore.getState().setStatus('sonos', { state: STATUS.EMPTY, label: 'Not set up', detail: null });
      return;
    }
    let cancelled = false;
    const load = () => sonosFetchSpeakers(cfg)
      .then(sp => {
        if (cancelled) return;
        setSpeakers(sp); setSonosErr(null);
        useHomeStore.getState().markOk('sonos', `${sp.length} zones`);
      })
      .catch(e => {
        if (cancelled) return;
        const msg = String(e.message || e);
        setSonosErr(msg);
        useHomeStore.getState().markFailed('sonos', msg);
      });
    load();
    const t = setInterval(load, 15_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [integrations.config.sonos?.url, demoMode]);

  // When Spotify is connected AND there is no node-sonos-http-api bridge,
  // synthesize the speakers list from Spotify Connect devices. This is how
  // someone with a real Sonos on their LAN can control playback without any
  // bridge process -- Sonos shows up in /me/player/devices once it's linked
  // to their Spotify account. The shape mirrors what SoundSection expects.
  useEffect(() => {
    if (demoMode) return;
    if (integrations.config.sonos?.url) return; // bridge wins if present
    if (!spotify.token) return;
    if (!spotify.devices) return;
    const mapped = spotify.devices.map(d => ({
      id: d.id,
      name: d.name,
      // The first active device gets the "Now playing" caption; the rest get
      // their Spotify-reported device type (Speaker / Computer / Smartphone).
      source: d.is_active ? 'Now playing' : (d.type || 'Speaker'),
      primary: !!d.is_active,
      on: !!d.is_active,
      volume: typeof d.volume_percent === 'number' ? d.volume_percent : 30,
      // Carries the "this is from Spotify Connect, not a Sonos bridge" flag so
      // toggleSpeaker / setSpeakerVolume can dispatch to the right API.
      _spotify: true,
    }));
    setSpeakers(mapped);
  }, [spotify.token, spotify.devices, integrations.config.sonos?.url, demoMode]);

  // Fetch live Tibber prices when configured. Refresh hourly. Drives both
  // the local prices state and the home store's `price` slice -- the latter
  // is what the Power section's "live draw" tile reads. Hardcoded
  // 0.84 SEK/kWh fallback removed.
  useEffect(() => {
    const token = integrations.config.tibber?.token;
    const setPriceStore = useHomeStore.getState().setPrice;
    if (!token) {
      setTibberPrices(null);
      setPriceStore({ current: null, today: null, err: null });
      useHomeStore.getState().setStatus('tibber', { state: STATUS.EMPTY, label: 'Not set up', detail: null });
      return;
    }
    let cancelled = false;
    const load = () => {
      fetchTibberPrices(token)
        .then(p => {
          if (cancelled) return;
          setTibberPrices(p); setTibberErr(null);
          // Compute "current" price -- pick the slot whose [startsAt, +1h] window
          // contains now. Tibber returns 24 hourly slots ordered by startsAt.
          const nowMs = Date.now();
          const slot = (p || []).find(row => {
            const t0 = new Date(row.startsAt).getTime();
            return nowMs >= t0 && nowMs < t0 + 3_600_000;
          });
          const currentPrice = slot?.total ?? p?.[0]?.total ?? null;
          const currency = slot?.currency || p?.[0]?.currency || 'SEK';
          setPriceStore({ current: currentPrice, today: p, currency, err: null });
          useHomeStore.getState().markOk('tibber', `${currentPrice != null ? currentPrice.toFixed(2) + ' ' + currency + '/kWh' : 'live'}`);
        })
        .catch(e => {
          if (cancelled) return;
          const msg = String(e.message || e);
          setTibberErr(msg);
          setPriceStore({ err: msg });
          useHomeStore.getState().markFailed('tibber', msg);
        });
    };
    load();
    const t = setInterval(load, 60 * 60 * 1000);
    return () => { cancelled = true; clearInterval(t); };
  }, [integrations.config.tibber?.token]);

  // Live clock — slow tick (30s) for the wall clock; fast tick (15s) only
  // while a scene timer is showing so the "Active 12m" stays fresh.
  useEffect(() => {
    const period = activeScene ? 15_000 : 30_000;
    const t = setInterval(() => setNow(new Date()), period);
    return () => clearInterval(t);
  }, [activeScene]);

  // Update outlet watts to simulate live data. Skip when prefers-reduced-motion:
  // a ticking number-counter every 1.8s is exactly the kind of constant motion
  // that prompts the preference in the first place.
  useEffect(() => {
    if (reducedMotion) return;
    const t = setInterval(() => {
      setOutlets((os) => os.map(o => {
        if (!o.on) return { ...o, watts: 0 };
        const base = { tv: 142, router: 38, coffee: 920, desk: 96, fan: 45, speaker: 24 }[o.id] ?? 30;
        const jitter = (Math.random() - 0.5) * base * 0.06;
        return { ...o, watts: Math.max(2, Math.round(base + jitter)) };
      }));
    }, 1800);
    return () => clearInterval(t);
  }, [reducedMotion]);

  const onCount = rooms.filter(r => r.on).length;
  const litWatts = useMemo(
    () => rooms.filter(r => r.on).reduce((a, r) => a + r.bulbs * 9 * (r.brightness / 100), 0),
    [rooms]
  );
  const outletWatts = useMemo(() => outlets.reduce((a, o) => a + o.watts, 0), [outlets]);
  const speakerWatts = useMemo(
    () => speakers.filter(sp => sp.on).reduce((a, sp) => a + 6 + sp.volume * 0.15, 0),
    [speakers]
  );
  const totalW = Math.round(litWatts + outletWatts + speakerWatts);

  // Clear active scene whenever the user adjusts anything manually — the
  // preset no longer matches reality. Centralised so handlers stay terse.
  const breakScene = useCallback(() => {
    setActiveScene(null);
    setActiveSceneAt(null);
  }, []);

  const applyScene = useCallback((scene) => {
    setActiveScene(scene.id);
    setActiveSceneAt(new Date());
    const next = scene.apply({ rooms, outlets, speakers });
    setRooms(next.rooms);
    setOutlets(next.outlets);
    setSpeakers(next.speakers);
    logActivity('scene', `Scene **${scene.label}** applied`);
  }, [rooms, outlets, speakers, logActivity]);

  // Light handlers — optimistic local update + real HA call when configured.
  // If the HA call fails, the next poll (30s) will reconcile state from the
  // bridge so the UI corrects itself even without explicit error handling.
  const toggleRoom = (id) => {
    breakScene();
    const r = rooms.find(rr => rr.id === id);
    if (!r) return;
    const next = !r.on;
    setRooms(rs => rs.map(rr => rr.id === id ? { ...rr, on: next } : rr));
    logActivity('light', `${r.name} lights turned **${next ? 'on' : 'off'}**`);
    const cfg = integrations.config.plejd;
    if (cfg?.url && cfg?.token && r._entity) {
      plejdCallService(cfg, next ? 'turn_on' : 'turn_off', r._entity)
        .catch(e => logActivity('light', `Plejd error: ${e.message || e}`));
    }
  };
  const setBrightness = (id, b) => {
    breakScene();
    setRooms(rs => rs.map(r => r.id === id ? { ...r, brightness: b, on: b > 0 ? true : r.on } : r));
    const r = rooms.find(rr => rr.id === id);
    const cfg = integrations.config.plejd;
    if (r && cfg?.url && cfg?.token && r._entity) {
      const ha255 = Math.round((b / 100) * 255);
      plejdCallService(cfg, b > 0 ? 'turn_on' : 'turn_off', r._entity, b > 0 ? { brightness: ha255 } : {})
        .catch(e => logActivity('light', `Plejd error: ${e.message || e}`));
    }
  };
  const setAllLights = (on) => {
    breakScene();
    setRooms(rs => rs.map(r => ({ ...r, on })));
    logActivity('light', `All lights **${on ? 'on' : 'off'}**`);
    const cfg = integrations.config.plejd;
    if (cfg?.url && cfg?.token) {
      // HA accepts entity_id: 'all' on the light domain — turns all lights at once.
      plejdCallService(cfg, on ? 'turn_on' : 'turn_off', 'all')
        .catch(e => logActivity('light', `Plejd error: ${e.message || e}`));
    }
  };

  // Outlet handlers. Optimistic UI first (the toggle moves immediately),
  // then a real HTTP call to the Shelly device when an IP is configured.
  // Audit flagged the previous version as "theatre" -- the local state
  // changed but the device never saw the command. Now:
  //   1. Flip local state immediately for sub-100ms feedback.
  //   2. If the outlet has an `ip`, send the command to Shelly (Gen1 path
  //      `/relay/0?turn=on`, Gen2 path `/rpc/Switch.Set?id=0&on=true` -- we
  //      try Gen2 first since it's the current platform).
  //   3. On HTTP failure, revert + mark the Shelly status degraded so the
  //      section dot turns amber. Premium feel = the lie of an apparent
  //      success is worse than the honest revert.
  const toggleOutlet = (id) => {
    breakScene();
    const o = outlets.find(oo => oo.id === id);
    if (!o || o.alwaysOn) return;
    const next = !o.on;
    // (1) optimistic
    setOutlets(os => os.map(oo => oo.id === id ? { ...oo, on: next } : oo));
    logActivity('outlet', `${o.name} **${next ? 'on' : 'off'}**`);
    // (2) real device call -- only when we have an IP. Demo data has no IPs.
    if (!o.ip || demoMode) return;
    const ip = o.ip;
    const tryGen2 = fetch(`http://${ip}/rpc/Switch.Set?id=0&on=${next}`, { method: 'GET' });
    const tryGen1 = (resp) => (resp && resp.ok) ? resp : fetch(`http://${ip}/relay/0?turn=${next ? 'on' : 'off'}`, { method: 'GET' });
    tryGen2
      .then(tryGen1, () => tryGen1(null))
      .then(r => {
        if (r && r.ok) {
          useHomeStore.getState().markOk('shelly', `${outlets.filter(x => x.ip).length} device(s)`);
        } else {
          throw new Error(`Shelly ${ip} responded ${r?.status || 'unreachable'}`);
        }
      })
      .catch(err => {
        // (3) revert + surface
        setOutlets(os => os.map(oo => oo.id === id ? { ...oo, on: !next } : oo));
        logActivity('outlet', `${o.name} **rollback** (${String(err.message || err).slice(0, 40)})`);
        useHomeStore.getState().markFailed('shelly', String(err.message || err));
      });
  };

  // Speaker handlers -- three sources, dispatched in order of preference:
  // (1) Spotify Connect (`_spotify` flag on the speaker -- transferTo / pause /
  //     setDeviceVolume on Spotify's Web API). Works without any LAN bridge so
  //     long as the speaker is linked to the user's Spotify account.
  // (2) Sonos node-sonos-http-api bridge (`_room` cached field). Local LAN
  //     control with full track metadata.
  // (3) Demo / no-op (just updates local state).
  const toggleSpeaker = (id) => {
    const s = speakers.find(ss => ss.id === id);
    if (!s) return;
    const next = !s.on;
    setSpeakers(sp => sp.map(ss => ss.id === id ? { ...ss, on: next, primary: next ? true : ss.primary } : ss));
    if (groupAll) setGroupAll(false);
    logActivity('speaker', `${s.name} speaker **${next ? 'on' : 'off'}**`);
    if (s._spotify) {
      const p = next ? spotify.transferTo(id, true) : spotify.pauseDevice(id);
      Promise.resolve(p).then(ok => {
        if (!ok) logActivity('speaker', `Spotify Connect: couldn't ${next ? 'start' : 'pause'} ${s.name}`);
        else if (next) setSpeakers(sp => sp.map(ss => ({ ...ss, primary: ss.id === id, on: ss.id === id ? true : ss.on, source: ss.id === id ? 'Now playing' : ss.source })));
      });
      return;
    }
    const cfg = integrations.config.sonos;
    if (cfg?.url && s._room) {
      sonosCmd(cfg, s._room, next ? 'play' : 'pause')
        .catch(e => logActivity('speaker', `Sonos error: ${e.message || e}`));
    }
  };
  const setVolume = (id, v) => {
    setSpeakers(sp => sp.map(s => s.id === id ? { ...s, volume: v, on: v > 0 ? true : s.on } : s));
    if (groupAll) setGroupAll(false);
    const s = speakers.find(ss => ss.id === id);
    if (!s) return;
    if (s._spotify) {
      spotify.setDeviceVolume(id, v).catch(e => logActivity('speaker', `Spotify volume: ${e.message || e}`));
      return;
    }
    const cfg = integrations.config.sonos;
    if (cfg?.url && s._room) {
      sonosCmd(cfg, s._room, 'volume', String(Math.round(v)))
        .catch(e => logActivity('speaker', `Sonos error: ${e.message || e}`));
    }
  };
  // Group all: ON groups every speaker to the lead room and turns them on;
  // OFF restores each speaker to "Standalone" (we don't remember prior sources
  // — keeping the model simple. Future: stash sources per-speaker on group).
  const setGroup = () => {
    const next = !groupAll;
    setGroupAll(next);
    setSpeakers(sp => sp.map(s => next
      ? { ...s, on: true, source: s.primary ? 'Now playing' : 'Living room' }
      : { ...s, source: s.primary ? 'Now playing' : 'Standalone' }
    ));
    logActivity('speaker', next ? 'Speakers **grouped** to lead room' : 'Speakers **ungrouped**');
  };

  // Keyboard shortcuts (Home page scenes):
  //   1–5  → apply Scenes in order
  //   0    → All off (last scene)
  //   Esc  → clear active scene (return to free-form)
  //   g    → go to Home (the global default)
  // We bail when focus is inside an input/textarea/contenteditable so the
  // shortcuts don't fight form input.
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tgt = e.target;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return;
      if (e.key === 'Escape' && activeScene) { breakScene(); e.preventDefault(); return; }
      if (e.key === 'g' || e.key === 'G') { navigate('home'); e.preventDefault(); return; }
      // Scene shortcuts only matter on the Home page where scenes are visible.
      if (route !== 'home') return;
      const idx = (e.key === '0') ? 4 : (parseInt(e.key, 10) - 1);
      if (Number.isInteger(idx) && idx >= 0 && idx < SCENES.length) {
        applyScene(SCENES[idx]);
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [applyScene, breakScene, activeScene, route, navigate]);

  // Per-page sub-headers share a thinner version of the welcome row from Home
  // — the photo + clock makes everything feel like one product.

  // Resolve the active music source → Spotify URI (e.g. spotify:album:xxx).
  // The iFrame API loads URIs, not full embed URLs. Custom (search/library/
  // favourite picks) wins over curated.
  const [musicType, musicId] = useMemo(() => {
    if (musicCustom) return [musicCustom.type, musicCustom.id];
    const s = MUSIC_SOURCES.find(s => s.id === musicSource) ?? MUSIC_SOURCES[0];
    return s.embed.split('/');
  }, [musicSource, musicCustom]);
  const musicUri = `spotify:${musicType}:${musicId}`;
  const musicNowLabel = musicCustom?.label ?? (MUSIC_SOURCES.find(s => s.id === musicSource)?.name ?? 'Music');
  const musicNowSub   = musicCustom?.sub   ?? (MUSIC_SOURCES.find(s => s.id === musicSource)?.sub  ?? '');

  // Wire the Spotify iFrame API + oEmbed metadata at App level so both the
  // header player and the Music page can read playback state and drive it.
  const embed = useSpotifyEmbed(musicUri);
  const oembed = useSpotifyOEmbed(musicType, musicId);

  return (
    <div className="app">
      <Sidebar route={route} onNavigate={navigate} google={google} />
      <PersistentMusicPlayer attach={embed.attach} isOnMusic={route === 'music'} />
      <main className="main">
        <div className="page-stack">
          <PageHeader
            now={now}
            onCount={onCount}
            totalW={totalW}
            deviceCount={rooms.length + outlets.length + speakers.length}
            weather={weather}
            weatherData={weatherData}
            city={integrations.config.weather?.city || 'Stockholm'}
            route={route}
            playback={embed.state}
            togglePlay={embed.togglePlay}
            seekRel={embed.seekRel}
            oembed={oembed}
            musicLabel={musicNowLabel}
            musicSub={musicNowSub}
            onOpenMusic={() => navigate('music')}
          />
          {route === 'home' && (
            <HomePage
              rooms={rooms} outlets={outlets} speakers={speakers}
              onCount={onCount} litWatts={litWatts} outletWatts={outletWatts} speakerWatts={speakerWatts} totalW={totalW}
              groupAll={groupAll} setGroup={setGroup}
              toggleRoom={toggleRoom} setBrightness={setBrightness} setAllLights={setAllLights}
              toggleOutlet={toggleOutlet}
              toggleSpeaker={toggleSpeaker} setVolume={setVolume}
              activeScene={activeScene} activeSceneAt={activeSceneAt} now={now}
              applyScene={applyScene} breakScene={breakScene}
              activity={activity}
            />
          )}
          {route === 'rooms' && (
            <RoomsPage
              rooms={rooms} toggleRoom={toggleRoom} setBrightness={setBrightness} setAllLights={setAllLights}
              applyScene={applyScene} activeScene={activeScene}
            />
          )}
          {route === 'music' && (
            <MusicPage
              speakers={speakers}
              musicSource={musicSource}
              pickCurated={pickCurated}
              musicCustom={musicCustom}
              playSpotify={playSpotify}
              spotify={spotify}
              favourites={musicFavs}
              addFav={addFav}
              removeFav={removeFav}
              musicNowLabel={musicNowLabel}
            />
          )}
          {route === 'energy' && (
            <EnergyPage rooms={rooms} outlets={outlets} speakers={speakers}
              totalW={totalW} litWatts={litWatts} outletWatts={outletWatts} speakerWatts={speakerWatts}
              tibberPrices={tibberPrices} tibberErr={tibberErr}
              tibberConfigured={integrations.status('tibber') === 'configured'}
              now={now} />
          )}
          {route === 'weather' && (
            <WeatherPage weather={weather} weatherData={weatherData} weatherErr={weatherErr} city={integrations.config.weather?.city || 'Stockholm'} now={now} />
          )}
          {route === 'news' && (
            <NewsPage tab={newsTab} setTab={setNewsTab} />
          )}
          {route === 'settings' && (
            <SettingsPage
              rooms={rooms} outlets={outlets} speakers={speakers} activity={activity}
              spotify={spotify} google={google} integrations={integrations}
              demoMode={demoMode} onLoadDemo={loadDemoData} onClearDemo={clearDemoData}
            />
          )}

          <footer className="page-footer">
            <span>Home Domain Server · LAN-only · every device reached over Wi‑Fi, never via vendor cloud</span>
            <span className="mono">{now.toLocaleString('en-GB', { dateStyle: 'medium' })}</span>
          </footer>
        </div>
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HomePage — Music + Sound + Lights + Power + Scenes + Activity
// (extracted from App so each page can render independently)
// ─────────────────────────────────────────────────────────────────────────────
function HomePage({
  rooms, outlets, speakers,
  onCount, litWatts, outletWatts, speakerWatts, totalW,
  groupAll, setGroup,
  toggleRoom, setBrightness, setAllLights,
  toggleOutlet,
  toggleSpeaker, setVolume,
  activeScene, activeSceneAt, now,
  applyScene, breakScene,
  activity,
}) {
  // Cast-to-room handler for the NowPlaying hero. Two cases:
  // (1) a speaker is already active -> reassert it (no-op behavioral, but the
  //     button visibly confirms what's happening). Helpful UX when a guest
  //     wonders "did I tap it or not?"
  // (2) no active speaker but at least one is off -> turn the first off
  //     speaker ON (toggleSpeaker routes to Spotify Connect transferTo or
  //     Sonos bridge under the hood). Hero now reflects the change next poll.
  const handleCastToggle = useCallback((activeSpeaker) => {
    if (!speakers.length) return;
    const target = activeSpeaker || speakers.find(s => !s.on) || speakers[0];
    toggleSpeaker(target.id);
  }, [speakers, toggleSpeaker]);

  return (
    <>
      <Section
        title="Music"
        statusId="spotify"
        source="open.spotify.com/embed"
        summary={<>Streaming to <b>{speakers.filter(s => s.on).length}</b> of <b>{speakers.length}</b> rooms</>}
      >
        <NowPlaying speakers={speakers} onCastToggle={handleCastToggle} />
      </Section>

      <Section
        title="Sound"
        statusId="sonos"
        source={speakers.length ? 'sonos · live' : 'sonos not configured'}
        summary={
          speakers.length ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <b>{speakers.filter(s => s.on).length}</b> of <b>{speakers.length}</b> speakers
              <button className="group-toggle" data-active={groupAll} onClick={setGroup}>
                {groupAll ? 'Grouped' : 'Group all'}
              </button>
            </span>
          ) : <>No speakers found</>
        }
      >
        {speakers.length ? (
          <div className="speaker-grid">
            {speakers.map(sp => (
              <SpeakerCard key={sp.id} speaker={sp} onToggle={() => toggleSpeaker(sp.id)} onVolume={(v) => setVolume(sp.id, v)} />
            ))}
          </div>
        ) : (
          <EmptyIntegration title="No speakers found" sub="Add a Sonos bridge URL in Settings → Integrations." />
        )}
      </Section>

      <Section
        title="Lights"
        statusId="plejd"
        source={rooms.length ? 'plejd · live' : 'plejd not configured'}
        summary={rooms.length
          ? <><b>{onCount}</b> of <b>{rooms.length}</b> rooms · <b>{Math.round(litWatts)} W</b> drawn</>
          : <>No rooms loaded</>}
      >
        {rooms.length ? (
          <div className="stack">
            <div className="master">
              <div>
                <div className="master-title">All lights</div>
                <div className="master-sub">{rooms.reduce((a,r) => a + (r.on ? r.bulbs : 0), 0)} of {rooms.reduce((a,r)=>a+r.bulbs,0)} bulbs lit</div>
              </div>
              <div className="master-count mono">{onCount}/{rooms.length}</div>
              <Toggle
                on={onCount > 0}
                onToggle={() => setAllLights(onCount === 0)}
                ariaLabel="Toggle all lights"
              />
            </div>
            <div className="lights-grid">
              {rooms.map(r => <RoomCard key={r.id} room={r} onToggle={() => toggleRoom(r.id)} onBrightness={(b) => setBrightness(r.id, b)} />)}
            </div>
          </div>
        ) : (
          <EmptyIntegration title="No rooms found" sub="Add a Home Assistant URL + token in Settings → Integrations to surface your Plejd lights." />
        )}
      </Section>

      <Section
        title="Power"
        statusId="shelly"
        source={outlets.length ? 'shelly · live' : 'shelly not configured'}
        summary={outlets.length
          ? <>Live load <b className="mono">{outletWatts} W</b> across {outlets.filter(o=>o.on).length} outlets</>
          : <>No outlets configured</>}
      >
        {outlets.length ? (
          <div className="power-grid">
            <div className="outlets">
              {outlets.map(o => <OutletRow key={o.id} outlet={o} onToggle={() => toggleOutlet(o.id)} />)}
            </div>
            <PowerLive outlets={outlets} totalW={totalW} litWatts={litWatts} outletWatts={outletWatts} speakerWatts={speakerWatts} />
          </div>
        ) : (
          <EmptyIntegration title="No outlets configured" sub="Add Shelly device IPs in Settings → Integrations." />
        )}
      </Section>

      <Section
        title="Scenes"
        source="local"
        summary={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 0 }}>
            One tap. Affects <b style={{ margin: '0 4px' }}>{rooms.length}</b> rooms, <b style={{ margin: '0 4px' }}>{outlets.filter(o => !o.alwaysOn).length}</b> outlets, <b style={{ margin: '0 4px' }}>{speakers.length}</b> speakers.
            {activeScene && activeSceneAt && (
              <span className="scene-timer">
                <span className="mono">{SCENES.find(s => s.id === activeScene)?.label}</span>
                · Active <span className="mono">{fmtAgo(activeSceneAt, now)}</span>
                <button className="clear-btn" onClick={breakScene} title="Clear active scene" aria-label="Clear active scene">×</button>
              </span>
            )}
          </span>
        }
      >
        <div className="scenes">
          {SCENES.map((scene, i) => {
            const SceneIcon = I[scene.icon];
            const keyHint = i === 4 ? '0' : String(i + 1);
            return (
              <button
                key={scene.id}
                className="scene"
                data-active={activeScene === scene.id}
                onClick={() => applyScene(scene)}
                title={`Press ${keyHint} to apply ${scene.label}`}
              >
                <span className="scene-key">{keyHint}</span>
                <span className="scene-icon"><SceneIcon size={18} /></span>
                <div>
                  <div className="scene-label">{scene.label}</div>
                  <div className="scene-sub">{scene.sub}</div>
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      <Section
        title="Activity"
        source="local"
        summary={<>Last <b>{activity.length}</b> {activity.length === 1 ? 'action' : 'actions'} · <b className="mono">1–5</b> apply scenes · <b className="mono">G</b> back to Home</>}
      >
        <ActivityLog items={activity} now={now} />
      </Section>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pieces
// ─────────────────────────────────────────────────────────────────────────────
function PageHeader({ now, onCount, totalW, deviceCount, weather, weatherData, city, route, playback, togglePlay, seekRel, oembed, musicLabel, musicSub, onOpenMusic }) {
  const greeting = (() => {
    const h = now.getHours();
    if (h < 5) return 'Working late';
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  })();
  const dayStr = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const tempC = weatherData?.current?.temperature_2m;
  const code = weatherData?.current?.weather_code;
  const tempStr = tempC != null ? `${tempC > 0 ? '+' : ''}${Math.round(tempC)}°` : '—';
  const condLabel = wmoLabel(code) || 'Weather';
  const WIcon = I[{ clear: 'Sun', cloudy: 'Cloud', rain: 'Cloud', snow: 'Cloud' }[weather] || 'Cloud'];
  // The welcome subtitle changes per-route so the header stays meaningful when
  // the page below isn't the dashboard.
  const subByRoute = {
    home:     `${onCount} rooms lit · ${totalW} W now`,
    rooms:    `Plejd · ${onCount} on now`,
    music:    `Streaming to home · ${deviceCount} devices online`,
    energy:   `${totalW} W now · live`,
    weather:  `${condLabel} · ${city}`,
    news:     `Sveriges Radio · TT`,
    settings: `Devices, integrations, and about`,
  };
  return (
    <header className="page-header">
      <div className="welcome-row">
        <span className="welcome-text">{greeting}, Mira.</span>
        <span className="welcome-sep">·</span>
        <span className="welcome-sub">{subByRoute[route] ?? subByRoute.home}</span>
      </div>
      <div className="header-meta">
        <div className="clock-hero">
          <div className="clock-hero-time mono">{timeStr}</div>
          <div className="clock-hero-date">{dayStr}</div>
        </div>
        {/* Always-visible compact player — no background, white-on-photo
            like the clock. Sits between the clock and the weather. */}
        <HeaderMusic
          playback={playback}
          oembed={oembed}
          sourceLabel={musicLabel}
          sourceSub={musicSub}
          onClickArt={onOpenMusic}
          togglePlay={togglePlay}
          seekRel={seekRel}
        />
        <div className="header-right">
          <div className="header-controls">
            <span className="wifi-pill">
              <span className="wifi-dot" />
              {deviceCount} on Wi‑Fi
              <span className="wifi-sub mono">home.local</span>
            </span>
          </div>
          <div className="weather-hero">
            <a className="weather-hero-icon" href="#weather" title="Open Weather" aria-label="Open Weather">
              <WIcon size={72} />
            </a>
            <div>
              <div className="weather-hero-temp"><span className="mono">{tempStr}</span></div>
              <div className="weather-hero-meta">
                <span className="weather-hero-cond">{condLabel}</span>
                <span className="weather-hero-time">{timeSlotLabel(now)} · {city}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function Section({ title, summary, source, statusId, children }) {
  return (
    <section className="section">
      <div className="section-head">
        <div className="section-head-left">
          <h2 className="section-title">
            {statusId && <IntegrationStatusDot id={statusId} />}
            {title}
          </h2>
          {source && <span className="section-source mono">{source}</span>}
        </div>
        <div className="section-summary">{summary}</div>
      </div>
      {children}
    </section>
  );
}

// IntegrationStatusDot -- the breathing dot the council unanimously wanted.
// Reads `state` for a given integration id from the home store. Reactive: the
// dot re-renders only when *its own* status row changes (selector-scoped).
//
// Semantics:
//   empty    -- not configured. Faint grey. Hidden by default unless the
//               caller explicitly wants "you haven't set this up" surfaced.
//   ok       -- healthy. Solid amber-green.
//   degraded -- last call failed. Amber with breathing animation.
//   down     -- 3+ consecutive failures. Red. Click goes to Settings.
function IntegrationStatusDot({ id, showWhenEmpty = false }) {
  // Lazy import to avoid hoisting issues: useHomeStore lives in src/store/.
  // React rules say hooks must be called unconditionally, so we always run
  // the subscription; the early return below is post-hook.
  const status = useHomeStore(s => s.status[id]);
  if (!status) return null;
  if (status.state === 'empty' && !showWhenEmpty) return null;
  const title = status.detail
    ? `${status.label} -- ${status.detail}`
    : status.label;
  return (
    <span
      className="integration-dot"
      data-state={status.state}
      title={title}
      aria-label={`${id} status: ${status.label}`}
    />
  );
}

function RoomCard({ room, onToggle, onBrightness }) {
  const flick = useFlicker([room.on]);
  // CSS variable controls the warm glow opacity inside the card
  const glow = room.on ? 0.04 + (room.brightness / 100) * 0.18 : 0;
  return (
    <div className="light-room" data-on={room.on} style={{ '--glow': glow }}>
      {flick > 0 && room.on && <div key={flick} className="flick" />}
      <div className="room-head">
        <div>
          <div className="room-name">{room.name}</div>
          <span className="bulb-pill">
            <span className="dot-on" />
            {room.bulbs} {room.bulbs === 1 ? 'bulb' : 'bulbs'}
          </span>
        </div>
        <Toggle on={room.on} onToggle={onToggle} ariaLabel={`Turn ${room.on ? 'off' : 'on'} ${room.name}`} />
      </div>

      <div className="brightness">
        <div className="brightness-row">
          <span className="brightness-pct mono">{room.on ? room.brightness : 0}<span style={{ fontSize: 13, color: 'var(--muted-foreground)', marginLeft: 4 }}>%</span></span>
          <span className="brightness-label">Brightness</span>
        </div>
        <Slider value={room.on ? room.brightness : 0} onChange={onBrightness} disabled={!room.on} />
      </div>
    </div>
  );
}

function OutletRow({ outlet, onToggle }) {
  const Ic = I[outlet.icon] ?? I.Plug;
  return (
    <div className="outlet" data-on={outlet.on}>
      <div className="outlet-icon"><Ic size={16} /></div>
      <div>
        <div className="outlet-name">{outlet.name}</div>
        <div className="outlet-room">
          {outlet.room}
          {outlet.alwaysOn && <span style={{ marginLeft: 8, color: 'var(--primary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em' }}>Always on</span>}
        </div>
      </div>
      <div className="outlet-watts">
        {outlet.on ? <>{outlet.watts}<span style={{ fontSize: 10, color: 'var(--muted-foreground)', marginLeft: 3 }}>W</span></> : '—'}
        <small>{outlet.on ? 'Live' : 'Off'}</small>
      </div>
      <Toggle on={outlet.on} onToggle={onToggle} ariaLabel={`Toggle ${outlet.name}`} />
    </div>
  );
}

function PowerLive({ outlets, totalW, litWatts, outletWatts, speakerWatts }) {
  // Track recent W history for the mini-bar
  const [history, setHistory] = useState(Array(20).fill(totalW));
  useEffect(() => {
    setHistory(h => [...h.slice(1), totalW]);
  }, [totalW]);
  const max = Math.max(...history, 1);

  const cats = [
    { name: 'Lights',   val: Math.round(litWatts),    color: 'var(--chart-1)' },
    { name: 'Outlets',  val: Math.round(outletWatts), color: 'var(--chart-2)' },
    { name: 'Speakers', val: Math.round(speakerWatts),color: 'var(--chart-3)' },
  ];

  return (
    <div className="power-live">
      <div>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--muted-foreground)', marginBottom: 12 }}>Live draw</div>
        <div className="live-watts mono">
          {totalW}<span className="unit">W</span>
        </div>
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'flex-end', gap: 3, height: 36 }}>
          {history.map((v, i) => (
            <div key={i} style={{
              flex: 1,
              height: `${(v / max) * 100}%`,
              background: i === history.length - 1 ? 'var(--primary)' : 'color-mix(in oklch, var(--clay-50) 16%, transparent)',
              borderRadius: 1,
              transition: 'height 600ms var(--motion-ease-out-quart)',
              minHeight: 2,
            }} />
          ))}
        </div>
      </div>

      <div className="live-legend">
        {cats.map(c => (
          <div className="legend-row" key={c.name}>
            <span className="legend-swatch" style={{ background: c.color }} />
            <span className="legend-name">{c.name}</span>
            <span className="legend-val">{c.val} W</span>
          </div>
        ))}
      </div>

      <div className="live-meta">
        <TibberPriceCell totalW={totalW} />
        <span>This hour <b className="mono">{(totalW * 0.001).toFixed(2)} kWh</b></span>
      </div>
    </div>
  );
}

// Real Tibber price cell. Reads from the home store; falls back to a dash
// with an amber dot when no price is available (token missing, network
// failed, or the API returned an unexpected shape). The previous version
// hardcoded "0.84 SEK/kWh" regardless of state -- the audit flagged it as a
// trust-collapse lie on the most data-sensitive tile.
function TibberPriceCell({ totalW }) {
  const price = useHomeStore(s => s.price);
  const status = useHomeStore(s => s.status.tibber);
  const hasPrice = price.current != null && Number.isFinite(price.current);
  if (hasPrice) {
    return (
      <span title={`Tibber · ${price.current.toFixed(4)} ${price.currency}/kWh`}>
        Tibber · <b className="mono">{price.current.toFixed(2)} {price.currency}/kWh</b>
      </span>
    );
  }
  // No price: render the dash + a glanceable hint. The IntegrationStatusDot
  // inside the section header already shows the dot; we keep this cell quiet.
  return (
    <span title={status?.detail || 'Tibber not configured'} style={{ opacity: 0.7 }}>
      Tibber · <b className="mono">— {price.currency}/kWh</b>
    </span>
  );
}

function NowPlaying({ speakers, onCastToggle }) {
  // Reads live Spotify state from the home store. The hero now reflects what
  // is *actually* playing on the user's Spotify Connect target instead of a
  // hardcoded Carly Rae Jepsen album. When nothing is playing or Spotify is
  // not connected, the iframe stays as a curated discovery surface and the
  // side panel says so honestly.
  const playback     = useHomeStore(s => s.playback);
  const spotifyState = useHomeStore(s => s.status.spotify);
  const isConnected  = spotifyState.state === 'ok';
  const onCount      = speakers.filter(s => s.on).length;
  const activeSpeaker = speakers.find(s => s.primary || s.on);

  // The embed URL prefers the album of what's currently playing (so the user
  // sees their album art at full size). Falls back to a curated "Discover
  // Weekly" placeholder when no track is selected.
  const embedSrc = useMemo(() => {
    if (playback.albumUri) {
      const id = String(playback.albumUri).split(':').pop();
      return `https://open.spotify.com/embed/album/${id}?utm_source=generator&theme=0`;
    }
    if (playback.uri && playback.uri.startsWith('spotify:track:')) {
      const id = playback.uri.split(':').pop();
      return `https://open.spotify.com/embed/track/${id}?utm_source=generator&theme=0`;
    }
    // Editorial fallback -- a public Spotify-curated playlist that doesn't
    // require auth. Replace with a household-saved playlist later.
    return 'https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M?utm_source=generator&theme=0';
  }, [playback.albumUri, playback.uri]);

  return (
    <div className="music-hero">
      <div className="music-hero-embed">
        <iframe
          className="np-embed"
          src={embedSrc}
          title="Spotify Web Player"
          allow="autoplay; clipboard-write; encrypted-media; picture-in-picture"
          loading="lazy"
          frameBorder="0"
        />
      </div>
      <div className="music-hero-side">
        <div>
          <div className="np-label">{playback.isPlaying ? 'Now playing' : (isConnected ? 'Paused' : 'Discover')}</div>
          <div className="np-title-big">
            {playback.track ? playback.track : (isConnected ? 'Nothing playing' : 'Connect Spotify to see live')}
          </div>
          <div className="np-source mono">
            {playback.artist
              ? <>{playback.artist}{playback.deviceName ? <> · {playback.deviceName}</> : null}</>
              : 'open.spotify.com/embed'}
          </div>
        </div>

        <div className="hero-rooms">
          <div className="hero-rooms-head">
            <span className="micro-label">Streaming to</span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
              {onCount}/{speakers.length}
            </span>
          </div>
          <div className="hero-rooms-list">
            {speakers.length === 0 && (
              <div className="hero-room-row" data-on={false}>
                <span className="hero-room-dot" />
                <span className="hero-room-name">No speakers found</span>
                <span className="hero-room-state mono">—</span>
              </div>
            )}
            {speakers.map(sp => (
              <div key={sp.id} className="hero-room-row" data-on={sp.on}>
                <span className="hero-room-dot" />
                <span className="hero-room-name">{sp.name}</span>
                <span className="hero-room-state mono">{sp.on ? sp.volume : 'off'}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="hero-actions">
          <button
            className="group-toggle"
            data-active={!!activeSpeaker}
            disabled={!speakers.length}
            onClick={() => onCastToggle?.(activeSpeaker)}
            title={activeSpeaker ? `Active target: ${activeSpeaker.name}` : 'No speaker selected'}
          >
            <I.Speaker size={11} /> {activeSpeaker ? `Casting · ${activeSpeaker.name}` : 'Cast to room'}
          </button>
          <button
            className="group-toggle"
            onClick={() => { window.location.hash = '#music'; }}
            title="Open Music page for full player + search"
          >
            <I.Music size={11} /> Open Music
          </button>
        </div>
      </div>
    </div>
  );
}

function SpeakerCard({ speaker, onToggle, onVolume }) {
  return (
    <div className="speaker" data-on={speaker.on}>
      <div className="speaker-head">
        <div>
          <div className="speaker-name">{speaker.name}</div>
          <div className="speaker-source">
            {speaker.on ? speaker.source : 'Off'}
            {speaker.primary && <span style={{ marginLeft: 8, color: 'var(--primary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em' }}>Lead</span>}
          </div>
        </div>
        <Toggle on={speaker.on} onToggle={onToggle} ariaLabel={`Toggle ${speaker.name} speaker`} />
      </div>

      <div className="speaker-vol-row">
        <span className="vol-icon">{speaker.volume === 0 ? <I.VolMute size={16} /> : <I.Vol size={16} />}</span>
        <div style={{ flex: 1 }}>
          <Slider value={speaker.on ? speaker.volume : 0} onChange={onVolume} disabled={!speaker.on} />
        </div>
        <span className="vol-num mono">{speaker.on ? speaker.volume : '—'}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ActivityLog — newest-first feed of recent user actions
// Text supports a light markdown-bold (**word**) so callers can highlight
// names without manual span juggling. We split on **…** and emit <b>; safe
// because the source strings are produced by the page itself, not user input.
// ─────────────────────────────────────────────────────────────────────────────
function renderActivityText(text) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((p, i) => i % 2 === 1 ? <b key={i}>{p}</b> : <React.Fragment key={i}>{p}</React.Fragment>);
}

function ActivityLog({ items, now }) {
  return (
    <div className="activity-log">
      <div className="activity-head">
        <span className="micro-label">Recent</span>
        <span className="activity-count">{items.length} · live</span>
      </div>
      {items.length === 0 ? (
        <div className="activity-empty">No actions yet — toggle a light or apply a scene.</div>
      ) : (
        <div className="activity-rows">
          {items.map(it => (
            <div className="activity-row" key={it.id} data-kind={it.kind}>
              <span className="activity-dot" />
              <span className="activity-text">{renderActivityText(it.text)}</span>
              <span className="activity-time" title={fmtTime(it.t)}>{fmtAgo(it.t, now)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Shared empty-state block for unconfigured integrations.
function EmptyIntegration({ title, sub }) {
  return (
    <div className="integration-empty">
      <div className="integration-empty-icon"><I.PowerOff size={20} /></div>
      <div>
        <div className="integration-empty-title">{title}</div>
        <div className="integration-empty-sub">{sub} <a href="#settings" className="integration-empty-link">Open Settings ↗</a></div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RoomsPage — Plejd-style detail view, one card per room with everything the
// Plejd app exposes for that room: name, bulb count, on/off, brightness, and
// per-room scene shortcuts ("All on", "Half", "Dim", "Off"). Mirrors what the
// real Plejd web/iOS app does. In a real deployment this state would round-
// trip to a local Plejd agent (see DEPLOY.md); here it edits the same shared
// room state the Home page uses, so changes show up everywhere.
// ─────────────────────────────────────────────────────────────────────────────
const ROOM_SCENES = [
  { id: 'all-on',  label: 'All on',  brightness: 100 },
  { id: 'normal',  label: 'Normal',  brightness: 70 },
  { id: 'half',    label: 'Half',    brightness: 50 },
  { id: 'dim',     label: 'Dim',     brightness: 20 },
  { id: 'off',     label: 'Off',     brightness: 0,   off: true },
];

function RoomsPage({ rooms, toggleRoom, setBrightness, setAllLights, applyScene, activeScene }) {
  const onCount = rooms.filter(r => r.on).length;
  const totalBulbs = rooms.reduce((a, r) => a + r.bulbs, 0);
  const litBulbs   = rooms.reduce((a, r) => a + (r.on ? r.bulbs : 0), 0);

  // Helper: apply a per-room "scene" (just sets brightness, optionally turns
  // the room off). Keeps the existing room API; doesn't introduce a new
  // entity for what's really just brightness presets.
  const applyRoomScene = (roomId, scene) => {
    if (scene.off) {
      setBrightness(roomId, 0);
      const r = rooms.find(rr => rr.id === roomId);
      if (r && r.on) toggleRoom(roomId);
    } else {
      setBrightness(roomId, scene.brightness);
    }
  };

  if (rooms.length === 0) {
    return (
      <Section title="Rooms" source="plejd not configured" summary={<>Add a Plejd bridge to surface your room setup.</>}>
        <EmptyIntegration
          title="No Plejd rooms found"
          sub="Add a Home Assistant URL + long-lived token in Settings → Integrations. Your Plejd rooms will appear here exactly as you've set them up in the Plejd app."
        />
      </Section>
    );
  }

  return (
    <>
      <Section
        title="Rooms"
        source="plejd · live"
        summary={<><b>{onCount}</b> of <b>{rooms.length}</b> rooms · <b>{litBulbs}</b> of <b>{totalBulbs}</b> bulbs lit</>}
      >
        <div className="stack">
          <div className="master">
            <div>
              <div className="master-title">All rooms</div>
              <div className="master-sub">{litBulbs} bulbs lit across {onCount} rooms</div>
            </div>
            <div className="master-count mono">{onCount}/{rooms.length}</div>
            <Toggle on={onCount > 0} onToggle={() => setAllLights(onCount === 0)} ariaLabel="Toggle every room" />
          </div>
          <div className="rooms-grid">
            {rooms.map(r => (
              <div key={r.id} className="rooms-room" data-on={r.on}>
                <div className="rooms-room-head">
                  <div>
                    <div className="rooms-room-name">{r.name}</div>
                    <span className="bulb-pill">
                      <span className="dot-on" />
                      {r.bulbs} {r.bulbs === 1 ? 'bulb' : 'bulbs'} · Plejd
                    </span>
                  </div>
                  <Toggle on={r.on} onToggle={() => toggleRoom(r.id)} ariaLabel={`Turn ${r.on ? 'off' : 'on'} ${r.name}`} />
                </div>

                <div className="rooms-room-brightness">
                  <div className="brightness-row">
                    <span className="brightness-pct mono">
                      {r.on ? r.brightness : 0}
                      <span style={{ fontSize: 13, color: 'var(--muted-foreground)', marginLeft: 4 }}>%</span>
                    </span>
                    <span className="brightness-label">Brightness</span>
                  </div>
                  <Slider value={r.on ? r.brightness : 0} onChange={(b) => setBrightness(r.id, b)} disabled={!r.on} />
                </div>

                <div className="rooms-room-scenes">
                  {ROOM_SCENES.map(s => (
                    <button
                      key={s.id}
                      className="room-scene"
                      data-active={r.on === !s.off && r.brightness === s.brightness}
                      onClick={() => applyRoomScene(r.id, s)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section
        title="Global scenes"
        source="local"
        summary={<>Affect every room at once</>}
      >
        <div className="scenes">
          {SCENES.map((scene, i) => {
            const SceneIcon = I[scene.icon];
            return (
              <button
                key={scene.id}
                className="scene"
                data-active={activeScene === scene.id}
                onClick={() => applyScene(scene)}
              >
                <span className="scene-icon"><SceneIcon size={18} /></span>
                <div>
                  <div className="scene-label">{scene.label}</div>
                  <div className="scene-sub">{scene.sub}</div>
                </div>
              </button>
            );
          })}
        </div>
      </Section>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MusicPage — full Spotify Web Embed + a sidecar of switchable sources.
// All sources are Spotify embed URLs (no API key required) per the product
// philosophy of hosting vendor web UIs as iframes rather than calling APIs.
// ─────────────────────────────────────────────────────────────────────────────
const MUSIC_SOURCES = [
  { id: 'emotion',     icon: 'Disc',    name: 'E•MO•TION',                 sub: 'Carly Rae Jepsen',   embed: 'album/1DFixLWuPkv3KT3TnV35m3' },
  { id: 'liked',       icon: 'Music',   name: 'Liked songs (sample)',      sub: 'Curated playlist',   embed: 'playlist/37i9dQZF1DXcBWIGoYBM5M' },
  { id: 'dinner',      icon: 'Utensils',name: 'Dinner Jazz',               sub: 'Editorial playlist', embed: 'playlist/37i9dQZF1DXbITWG1ZJKYt' },
  { id: 'morning',     icon: 'Sun',     name: 'Morning Acoustic',          sub: 'Editorial playlist', embed: 'playlist/37i9dQZF1DX4E3UdUs7fUx' },
  { id: 'focus',       icon: 'Lamp',    name: 'Deep Focus',                sub: 'Editorial playlist', embed: 'playlist/37i9dQZF1DWZeKCadgRdKQ' },
  { id: 'sleep',       icon: 'Moon',    name: 'Sleep',                     sub: 'Editorial playlist', embed: 'playlist/37i9dQZF1DWZd79rJ6a7lp' },
];

// Helper: pick the first image URL from a Spotify object (album/playlist/artist)
const spImg = (item) => item?.images?.[item.images.length - 1]?.url
  ?? item?.album?.images?.[item.album.images.length - 1]?.url
  ?? null;

function MusicPage({
  speakers, musicSource, pickCurated, musicCustom, playSpotify,
  spotify, favourites, addFav, removeFav, musicNowLabel,
}) {
  const onCount = speakers.filter(s => s.on).length;

  // Search + library state
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);   // { tracks, artists, playlists, albums }
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState(null);
  const [library, setLibrary] = useState(null);   // user's playlists
  const [libErr, setLibErr] = useState(null);
  const [picker, setPicker] = useState(null);     // { trackUri, trackName } when user wants to "add to playlist"
  const [pickerMsg, setPickerMsg] = useState(null);

  // Load the user's playlists once when connected.
  useEffect(() => {
    if (!spotify.token) { setLibrary(null); return; }
    spotify.api('/me/playlists?limit=50')
      .then(r => setLibrary(r?.items ?? []))
      .catch(e => setLibErr(String(e.message || e)));
  }, [spotify.token, spotify.api]);

  // Debounced search. When not connected, just filter the curated list. When
  // connected, hit /v1/search across tracks/artists/playlists/albums.
  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults(null); setSearchErr(null); return; }
    if (!spotify.token) {
      // Offline fallback: filter curated sources by name.
      const filtered = MUSIC_SOURCES.filter(s =>
        s.name.toLowerCase().includes(q.toLowerCase()) || s.sub.toLowerCase().includes(q.toLowerCase())
      );
      setResults({
        curated: filtered,
        tracks: [], artists: [], playlists: [], albums: [],
      });
      return;
    }
    let cancelled = false;
    setSearching(true); setSearchErr(null);
    const t = setTimeout(() => {
      spotify.api(`/search?q=${encodeURIComponent(q)}&type=track,artist,playlist,album&limit=6`)
        .then(r => {
          if (cancelled) return;
          setResults({
            tracks: r?.tracks?.items ?? [],
            artists: r?.artists?.items ?? [],
            playlists: r?.playlists?.items ?? [],
            albums: r?.albums?.items ?? [],
          });
        })
        .catch(e => { if (!cancelled) setSearchErr(String(e.message || e)); })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, spotify.token, spotify.api]);

  // Add a track to a playlist (Spotify Web API).
  const addToPlaylist = useCallback(async (playlistId, trackUri) => {
    try {
      await spotify.api(`/playlists/${playlistId}/tracks`, {
        method: 'POST',
        body: JSON.stringify({ uris: [trackUri] }),
      });
      setPickerMsg('Added to playlist ✓');
      setTimeout(() => { setPicker(null); setPickerMsg(null); }, 900);
    } catch (e) {
      setPickerMsg(String(e.message || e));
    }
  }, [spotify.api]);

  // "Start radio" = play the artist/track in Spotify's embed. Spotify's
  // embed widget exposes "Go to artist's radio" via its own UI; we just send
  // the user there. For tracks, embedding /track plays it directly.
  const playArtist  = (a) => playSpotify('artist',   a.id, `${a.name} · artist`);
  const playTrack   = (t) => playSpotify('track',    t.id, `${t.name} — ${t.artists?.[0]?.name ?? ''}`.trim());
  const playPlaylst = (p) => playSpotify('playlist', p.id, p.name);
  const playAlbum   = (a) => playSpotify('album',    a.id, `${a.name} · ${a.artists?.[0]?.name ?? ''}`.trim());

  return (
    <Section
      title="Music"
      source={spotify.me ? `Spotify · ${spotify.me.display_name}` : 'open.spotify.com/embed'}
      summary={<>
        Now playing <b>{musicNowLabel}</b> · on <b>{onCount}</b> of <b>{speakers.length}</b> rooms
        {spotify.me && <> · <b>{library?.length ?? '…'}</b> playlists</>}
      </>}
    >
      <div className="music-page">
        <div className="music-page-stage">
          {/* Toolbar — search input + connect/disconnect state */}
          <div className="music-toolbar">
            <div className="music-search">
              <span className="music-search-icon"><I.Search size={14} /></span>
              <input
                type="search"
                placeholder={spotify.token ? 'Search tracks, artists, playlists…' : 'Search curated playlists (connect Spotify for full search)'}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search music"
              />
              {searching && <span className="music-search-status mono">…</span>}
            </div>
            {spotify.me ? (
              <div className="music-account" title={spotify.me.email}>
                <span className="music-account-dot" />
                {spotify.me.display_name}
              </div>
            ) : (
              <button className="group-toggle" data-active="true" onClick={spotify.connect}>
                Connect Spotify
              </button>
            )}
          </div>

          {/* Either show search results or the persistent player anchor */}
          {results ? (
            <SearchResults
              results={results}
              spotifyOn={!!spotify.token}
              onPlay={{ track: playTrack, artist: playArtist, playlist: playPlaylst, album: playAlbum }}
              onPickCurated={pickCurated}
              onAddFav={addFav}
              onAddToPlaylist={(uri, name) => setPicker({ trackUri: uri, trackName: name })}
              onClear={() => { setQuery(''); setResults(null); }}
              err={searchErr}
            />
          ) : (
            <div id="music-stage-anchor" className="music-page-frame music-page-frame-anchor" />
          )}
        </div>

        <div className="music-side">
          {/* Favourites — local, always available */}
          <div className="music-side-card">
            <div className="music-side-head">
              <div className="np-label">Favourites</div>
              <span className="mono" style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>{favourites.length}/50</span>
            </div>
            {favourites.length === 0 ? (
              <div className="music-empty">Nothing saved yet — ★ from search results.</div>
            ) : favourites.slice(0, 6).map(f => {
              const Ic = I.Disc;
              return (
                <div key={f.id} className="music-source-row" data-active={false}>
                  <span className="src-icon"><Ic size={12} /></span>
                  <button
                    className="music-source-text"
                    onClick={() => playSpotify(f.type, f.id, f.name)}
                  >
                    <div className="music-source-name">{f.name}</div>
                    <div className="music-source-sub">{f.sub}</div>
                  </button>
                  <button className="music-source-rm" onClick={() => removeFav(f.id)} aria-label="Remove">×</button>
                </div>
              );
            })}
          </div>

          {/* User's Spotify playlists (only when connected) */}
          {spotify.token && (
            <div className="music-side-card">
              <div className="music-side-head">
                <div className="np-label">Your library</div>
                <span className="mono" style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>{library?.length ?? '…'}</span>
              </div>
              {libErr && <div className="music-empty">{libErr}</div>}
              {library === null && !libErr && <div className="music-empty">Loading…</div>}
              {library?.length === 0 && <div className="music-empty">No playlists in your library.</div>}
              {library?.slice(0, 8).map(p => (
                <button
                  key={p.id}
                  className="music-source-row"
                  onClick={() => playPlaylst(p)}
                  data-active={musicCustom?.type === 'playlist' && musicCustom.id === p.id}
                >
                  <span className="src-icon">
                    {spImg(p) ? <img src={spImg(p)} alt="" width={20} height={20} style={{ borderRadius: 4 }} /> : <I.Music size={12} />}
                  </span>
                  <div>
                    <div className="music-source-name">{p.name}</div>
                    <div className="music-source-sub">{p.tracks?.total ?? 0} tracks</div>
                  </div>
                  <span className="music-source-state">Play</span>
                </button>
              ))}
            </div>
          )}

          {/* Curated sources stay visible — works without auth */}
          <div className="music-side-card">
            <div className="np-label">Curated</div>
            {MUSIC_SOURCES.map(s => {
              const Ic = I[s.icon] ?? I.Music;
              const active = !musicCustom && s.id === musicSource;
              return (
                <button
                  key={s.id}
                  className="music-source-row"
                  data-active={active}
                  onClick={() => pickCurated(s.id)}
                  aria-pressed={active}
                >
                  <span className="src-icon"><Ic size={12} /></span>
                  <div>
                    <div className="music-source-name">{s.name}</div>
                    <div className="music-source-sub">{s.sub}</div>
                  </div>
                  <span className="music-source-state">{active ? 'Playing' : 'Switch'}</span>
                </button>
              );
            })}
          </div>

          {/* Streaming-to rooms — same data as the Home Sound section */}
          <div className="music-side-card">
            <div className="np-label">Streaming to</div>
            <div className="hero-rooms-list">
              {speakers.map(sp => (
                <div key={sp.id} className="hero-room-row" data-on={sp.on}>
                  <span className="hero-room-dot" />
                  <span className="hero-room-name">{sp.name}</span>
                  <span className="hero-room-state mono">{sp.on ? sp.volume : 'off'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Modal: pick a playlist to add the selected track to */}
        {picker && (
          <div className="music-picker" role="dialog" aria-label="Add to playlist">
            <div className="music-picker-card">
              <div className="music-picker-head">
                <div>
                  <div className="np-label">Add to playlist</div>
                  <div className="music-picker-track">{picker.trackName}</div>
                </div>
                <button className="music-source-rm" onClick={() => { setPicker(null); setPickerMsg(null); }} aria-label="Close">×</button>
              </div>
              {pickerMsg && <div className="music-picker-msg">{pickerMsg}</div>}
              <div className="music-picker-list">
                {library?.filter(p => p.owner?.id === spotify.me?.id).map(p => (
                  <button key={p.id} className="music-source-row" onClick={() => addToPlaylist(p.id, picker.trackUri)}>
                    <span className="src-icon"><I.Music size={12} /></span>
                    <div>
                      <div className="music-source-name">{p.name}</div>
                      <div className="music-source-sub">{p.tracks?.total ?? 0} tracks</div>
                    </div>
                    <span className="music-source-state">Add</span>
                  </button>
                ))}
                {library?.filter(p => p.owner?.id === spotify.me?.id).length === 0 && (
                  <div className="music-empty">No editable playlists — create one in Spotify first.</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}

// Inner: results panel sits where the iframe would, until the user clears.
function SearchResults({ results, spotifyOn, onPlay, onPickCurated, onAddFav, onAddToPlaylist, onClear, err }) {
  const has = (k) => results[k]?.length > 0;
  const empty = !has('tracks') && !has('artists') && !has('playlists') && !has('albums') && !(results.curated?.length);
  return (
    <div className="music-results">
      <div className="music-results-head">
        <span className="np-label">Search results</span>
        <button className="group-toggle" onClick={onClear}>Clear</button>
      </div>
      {err && <div className="music-empty">{err}</div>}
      {empty && !err && <div className="music-empty">No matches.</div>}

      {results.curated?.length > 0 && (
        <ResultGroup title="Curated">
          {results.curated.map(c => (
            <div key={c.id} className="music-result-row">
              <span className="src-icon"><I.Music size={12} /></span>
              <div>
                <div className="music-source-name">{c.name}</div>
                <div className="music-source-sub">{c.sub}</div>
              </div>
              <button className="group-toggle" onClick={() => onPickCurated(c.id)}>Play</button>
            </div>
          ))}
        </ResultGroup>
      )}

      {has('tracks') && (
        <ResultGroup title="Tracks">
          {results.tracks.map(t => (
            <div key={t.id} className="music-result-row">
              {spImg(t)
                ? <img src={spImg(t)} alt="" width={28} height={28} style={{ borderRadius: 4 }} />
                : <span className="src-icon"><I.Disc size={12} /></span>}
              <div>
                <div className="music-source-name">{t.name}</div>
                <div className="music-source-sub">{t.artists?.map(a => a.name).join(', ')}</div>
              </div>
              <span style={{ display: 'inline-flex', gap: 6 }}>
                <button className="group-toggle" onClick={() => onPlay.track(t)}>Play</button>
                <button className="group-toggle" onClick={() => onAddFav({ id: t.id, type: 'track', name: t.name, sub: t.artists?.[0]?.name ?? '' })} title="Save to favourites">★</button>
                {spotifyOn && (
                  <button className="group-toggle" onClick={() => onAddToPlaylist(t.uri, t.name)} title="Add to a playlist">+</button>
                )}
              </span>
            </div>
          ))}
        </ResultGroup>
      )}

      {has('artists') && (
        <ResultGroup title="Artists">
          {results.artists.map(a => (
            <div key={a.id} className="music-result-row">
              {spImg(a)
                ? <img src={spImg(a)} alt="" width={28} height={28} style={{ borderRadius: 14 }} />
                : <span className="src-icon"><I.Music size={12} /></span>}
              <div>
                <div className="music-source-name">{a.name}</div>
                <div className="music-source-sub">{(a.genres?.[0]) || 'Artist'}</div>
              </div>
              <span style={{ display: 'inline-flex', gap: 6 }}>
                <button className="group-toggle" onClick={() => onPlay.artist(a)}>Radio</button>
                <button className="group-toggle" onClick={() => onAddFav({ id: a.id, type: 'artist', name: a.name, sub: 'Artist' })} title="Save artist">★</button>
              </span>
            </div>
          ))}
        </ResultGroup>
      )}

      {has('playlists') && (
        <ResultGroup title="Playlists">
          {results.playlists.map(p => p && (
            <div key={p.id} className="music-result-row">
              {spImg(p)
                ? <img src={spImg(p)} alt="" width={28} height={28} style={{ borderRadius: 4 }} />
                : <span className="src-icon"><I.Music size={12} /></span>}
              <div>
                <div className="music-source-name">{p.name}</div>
                <div className="music-source-sub">{p.owner?.display_name ?? ''} · {p.tracks?.total ?? 0} tracks</div>
              </div>
              <span style={{ display: 'inline-flex', gap: 6 }}>
                <button className="group-toggle" onClick={() => onPlay.playlist(p)}>Play</button>
                <button className="group-toggle" onClick={() => onAddFav({ id: p.id, type: 'playlist', name: p.name, sub: `${p.tracks?.total ?? 0} tracks` })} title="Save playlist">★</button>
              </span>
            </div>
          ))}
        </ResultGroup>
      )}

      {has('albums') && (
        <ResultGroup title="Albums">
          {results.albums.map(a => (
            <div key={a.id} className="music-result-row">
              {spImg(a)
                ? <img src={spImg(a)} alt="" width={28} height={28} style={{ borderRadius: 4 }} />
                : <span className="src-icon"><I.Disc size={12} /></span>}
              <div>
                <div className="music-source-name">{a.name}</div>
                <div className="music-source-sub">{a.artists?.map(x => x.name).join(', ')}</div>
              </div>
              <span style={{ display: 'inline-flex', gap: 6 }}>
                <button className="group-toggle" onClick={() => onPlay.album(a)}>Play</button>
                <button className="group-toggle" onClick={() => onAddFav({ id: a.id, type: 'album', name: a.name, sub: a.artists?.[0]?.name ?? '' })} title="Save album">★</button>
              </span>
            </div>
          ))}
        </ResultGroup>
      )}
    </div>
  );
}
function ResultGroup({ title, children }) {
  return (
    <div className="music-result-group">
      <div className="music-result-group-head"><span className="micro-label">{title}</span></div>
      <div className="music-result-group-body">{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EnergyPage — expanded Power view with hourly price + draw charts and a
// per-source bar breakdown. All numbers are computed locally from the same
// state as the Home page; no API. The price curve is a fixed seasonal model.
// ─────────────────────────────────────────────────────────────────────────────
// Real prices come from Tibber's GraphQL API when a token is configured in
// Settings. Until then the curve is null and the Energy page shows a
// "configure Tibber" empty state instead of a fake curve.

function MiniLineChart({ values, color, height = 60, fillRecent = true }) {
  if (!values?.length) return null;
  const max = Math.max(...values, 0.0001);
  const min = Math.min(...values, max);
  const range = Math.max(max - min, 0.0001);
  const stepX = 100 / (values.length - 1 || 1);
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = 100 - ((v - min) / range) * 90 - 5; // 5–95 range
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
  const lastIdx = values.length - 1;
  const lastX = lastIdx * stepX;
  const lastY = 100 - ((values[lastIdx] - min) / range) * 90 - 5;
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ height }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      {fillRecent && (
        <circle cx={lastX} cy={lastY} r="1.6" fill={color} />
      )}
    </svg>
  );
}

function EnergyPage({ rooms, outlets, speakers, totalW, litWatts, outletWatts, speakerWatts, tibberPrices, tibberErr, tibberConfigured, now }) {
  // Spot price values for the chart — real values from Tibber if configured,
  // otherwise empty (we show a "Configure Tibber" empty state).
  const priceValues = useMemo(() => (tibberPrices || []).map(p => p.total), [tibberPrices]);
  const currentPrice = useMemo(() => {
    if (!tibberPrices?.length) return null;
    const nowT = now.getTime();
    // Find the entry whose startsAt covers this hour.
    let idx = tibberPrices.findIndex(p => new Date(p.startsAt).getTime() + 3600_000 > nowT);
    if (idx < 0) idx = tibberPrices.length - 1;
    return tibberPrices[idx]?.total ?? null;
  }, [tibberPrices, now]);

  const cats = [
    { name: 'Lights',   val: Math.round(litWatts),     color: 'var(--chart-1)' },
    { name: 'Outlets',  val: Math.round(outletWatts),  color: 'var(--chart-2)' },
    { name: 'Speakers', val: Math.round(speakerWatts), color: 'var(--chart-3)' },
  ];
  const catMax = Math.max(...cats.map(c => c.val), 1);

  const litRooms = rooms.filter(r => r.on);
  const onOutlets = outlets.filter(o => o.on);
  const onSpeakers = speakers.filter(s => s.on);
  const anyDevices = rooms.length + outlets.length + speakers.length > 0;

  return (
    <Section
      title="Energy"
      source={tibberConfigured ? 'tibber.com · live' : 'no Tibber token configured'}
      summary={<>
        Live load <b className="mono">{totalW} W</b>
        {currentPrice != null && <> · spot <b className="mono">{currentPrice.toFixed(2)} SEK/kWh</b></>}
      </>}
    >
      <div className="energy-page">
        <div className="energy-hero">
          <div className="energy-hero-total">
            <span className="micro-label">Live draw</span>
            <div className="big mono">{totalW}<span className="unit">W</span></div>
          </div>
          <div className="energy-hero-meta">
            <span>Estimated this hour <b className="mono">{(totalW * 0.001).toFixed(2)} kWh</b>
              {currentPrice != null && <> · cost <b className="mono">{(totalW * 0.001 * currentPrice).toFixed(2)} SEK</b></>}
            </span>
            <span>Active: <b>{litRooms.length}</b> rooms · <b>{onOutlets.length}</b> outlets · <b>{onSpeakers.length}</b> speakers</span>
            {!anyDevices && <span>No devices configured — set up Plejd/Shelly/Sonos in Settings.</span>}
            {currentPrice != null
              ? <span>Tibber spot <b className="mono">{currentPrice.toFixed(2)} SEK/kWh</b></span>
              : <span>{tibberErr ? <>Tibber error: {tibberErr}</> : <>Configure a Tibber token in Settings to see live prices.</>}</span>}
          </div>
        </div>

        <div className="energy-charts">
          <div className="energy-chart">
            <div className="energy-chart-head">
              <span className="micro-label">Spot price · today</span>
              <span className="energy-chart-now">
                {currentPrice != null
                  ? <>{currentPrice.toFixed(2)}<span style={{ fontSize: 10, color: 'var(--muted-foreground)', marginLeft: 4 }}>SEK/kWh</span></>
                  : <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{tibberConfigured ? 'loading…' : 'not configured'}</span>}
              </span>
            </div>
            {priceValues.length > 0 ? (
              <MiniLineChart values={priceValues} color="var(--amber-400)" />
            ) : (
              <div className="energy-chart-empty">{tibberConfigured ? 'Loading prices…' : 'Add a Tibber token in Settings.'}</div>
            )}
            <div className="energy-axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
          </div>
          <div className="energy-chart">
            <div className="energy-chart-head">
              <span className="micro-label">By source · now</span>
              <span className="energy-chart-now mono">{totalW}<span style={{ fontSize: 10, color: 'var(--muted-foreground)', marginLeft: 4 }}>W</span></span>
            </div>
            {anyDevices ? (
              <div className="energy-sources" style={{ background: 'transparent', backdropFilter: 'none', padding: 0 }}>
                {cats.map(c => (
                  <div key={c.name} className="energy-source-row">
                    <span className="energy-source-name">{c.name}</span>
                    <div className="energy-source-bar">
                      <div style={{ width: `${Math.round((c.val / catMax) * 100)}%`, background: c.color }} />
                    </div>
                    <span className="energy-source-val mono">{c.val} W</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="energy-chart-empty">No devices reporting — configure integrations in Settings.</div>
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WeatherPage — real data from open-meteo (no API key, CORS-open). Renders:
//   - Current temp + condition (from weatherData.current)
//   - Next 12 hourly readings starting from the current hour
//   - 7-day forecast (daily max/min/code/precipitation_probability_max)
// ─────────────────────────────────────────────────────────────────────────────
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const tempLabel = (t) => t == null ? '—' : `${t > 0 ? '+' : ''}${Math.round(t)}°`;

function WeatherPage({ weather, weatherData, weatherErr, city, now }) {
  if (weatherErr) {
    return (
      <Section title="Weather" source="open-meteo.com" summary={<>Could not load forecast</>}>
        <div className="settings-page"><div className="settings-section settings-about">
          <span>Weather fetch failed: <b>{weatherErr}</b></span>
          <span>open-meteo is public and needs no key. Check your network or update coordinates in Settings.</span>
        </div></div>
      </Section>
    );
  }
  if (!weatherData) {
    return (
      <Section title="Weather" source="open-meteo.com" summary={<>Loading…</>}>
        <div className="settings-page"><div className="settings-section settings-about">
          <span>Fetching live forecast from open-meteo for {city}…</span>
        </div></div>
      </Section>
    );
  }

  const cur = weatherData.current || {};
  const code = cur.weather_code;
  const WIcon = I[{ clear: 'Sun', cloudy: 'Cloud', rain: 'Cloud', snow: 'Cloud' }[weather] || 'Cloud'];
  const tempStr = tempLabel(cur.temperature_2m);
  const feelsStr = tempLabel(cur.apparent_temperature);

  // Next 12 hourly readings starting from the row whose time >= now.
  const hourly = useMemo(() => {
    const h = weatherData.hourly;
    if (!h?.time?.length) return [];
    const nowT = now.getTime();
    let startIdx = h.time.findIndex(t => new Date(t).getTime() >= nowT);
    if (startIdx < 0) startIdx = 0;
    return h.time.slice(startIdx, startIdx + 12).map((t, i) => {
      const idx = startIdx + i;
      const c = h.weather_code?.[idx];
      const bucket = wmoToBucket(c);
      return {
        hour: new Date(t).getHours(),
        temp: h.temperature_2m?.[idx],
        bucket,
        isWarm: bucket === 'clear',
      };
    });
  }, [weatherData, now]);

  const daily = useMemo(() => {
    const d = weatherData.daily;
    if (!d?.time?.length) return [];
    return d.time.slice(0, 7).map((t, i) => ({
      date: new Date(t),
      code: d.weather_code?.[i],
      hi: d.temperature_2m_max?.[i],
      lo: d.temperature_2m_min?.[i],
      rain: d.precipitation_probability_max?.[i] ?? 0,
    }));
  }, [weatherData]);

  return (
    <Section
      title="Weather"
      source={`open-meteo.com · ${city}`}
      summary={<>
        <b>{wmoLabel(code)}</b> · {tempStr} · feels like <b className="mono">{feelsStr}</b>
        {cur.wind_speed_10m != null && <> · wind <b className="mono">{Math.round(cur.wind_speed_10m)}</b> m/s</>}
      </>}
    >
      <div className="weather-page">
        <div className="weather-current">
          <div className="weather-current-icon"><WIcon size={132} /></div>
          <div>
            <div className="weather-current-temp mono">{tempStr}</div>
            <div className="weather-current-feels">Feels like <span className="mono">{feelsStr}</span></div>
          </div>
          <div className="weather-current-meta">
            <div className="weather-current-cond">{wmoLabel(code)}</div>
            <div className="weather-current-sub">{timeSlotLabel(now)} · {city}</div>
            <div className="weather-current-feels">
              {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
          </div>
        </div>

        <div className="weather-hourly">
          <span className="micro-label">Next 12 hours</span>
          <div className="weather-hour-strip">
            {hourly.map((row, i) => {
              const Ic = I[{ clear: 'Sun', cloudy: 'Cloud', rain: 'Cloud', snow: 'Cloud' }[row.bucket] || 'Cloud'];
              return (
                <div key={i} className="weather-hour">
                  <span className="weather-hour-time mono">{String(row.hour).padStart(2, '0')}</span>
                  <span className={'weather-hour-icon' + (row.isWarm ? ' warm' : '')}><Ic size={22} /></span>
                  <span className="weather-hour-temp mono">{tempLabel(row.temp)}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="weather-days">
          {daily.map((d, i) => {
            const bucket = wmoToBucket(d.code);
            const Ic = I[{ clear: 'Sun', cloudy: 'Cloud', rain: 'Cloud', snow: 'Cloud' }[bucket] || 'Cloud'];
            const isToday = i === 0;
            return (
              <div key={i} className="weather-day">
                <span className="weather-day-name">{isToday ? 'Today' : DAY_NAMES[d.date.getDay()]}</span>
                <div className={'weather-day-icon' + (bucket === 'clear' ? ' warm' : '')}><Ic size={32} /></div>
                <div className="weather-day-hilo">
                  <span className="weather-day-hi mono">{tempLabel(d.hi)}</span>
                  <span className="weather-day-lo mono">{tempLabel(d.lo)}</span>
                </div>
                <span className="weather-day-rain">{Math.round(d.rain)}% rain</span>
              </div>
            );
          })}
        </div>
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NewsPage — Swedish news via Sveriges Radio + TT.
// TT.se is fully iframe-friendly (no X-Frame-Options, no frame-ancestors CSP)
// so it loads directly. SR's HTML site may set framing restrictions, so the
// SR tab also exposes their public MP3 live stream of P1 (the news channel)
// via a native <audio> element — guaranteed to work regardless of framing.
// ─────────────────────────────────────────────────────────────────────────────
const NEWS_TABS = [
  {
    id: 'sr',
    label: 'Sveriges Radio',
    url: 'https://sverigesradio.se/',
    // P1 (channel id 132) live MP3 — SR's public stream, no auth.
    stream: 'https://sverigesradio.se/topsy/direkt/srapi/132.mp3',
    streamLabel: 'P1 Live · news, talk',
  },
  {
    id: 'tt',
    label: 'TT',
    url: 'https://www.tt.se/',
  },
];

// Hand-curated Swedish headlines so the sidebar reads as a real news desk
// even before any iframe loads. Both sources publish RSS at .../rss but we
// stay pure-frontend per the product's "no API" posture.
// No mock headlines. The iframe shows live SR/TT content directly. The
// sidebar reads from the iframe when possible; otherwise it stays empty
// (iframe content can't be DOM-accessed from a different origin).
const SAVED_STORIES = { sr: [], tt: [] };

function NewsPage({ tab, setTab }) {
  const active = NEWS_TABS.find(t => t.id === tab) ?? NEWS_TABS[0];
  const stories = SAVED_STORIES[active.id] ?? [];
  return (
    <Section
      title="Nyheter"
      source="sverigesradio.se · tt.se"
      summary={<>Källa <b>{active.label}</b> · {stories.length} senaste rubriker</>}
    >
      <div className="news-page">
        <div className="news-frame">
          <div className="news-tabs">
            {NEWS_TABS.map(t => (
              <button
                key={t.id}
                className="news-tab"
                data-active={t.id === active.id}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
            <a className="news-tab" href={active.url} target="_blank" rel="noopener noreferrer" title="Öppna i ny flik" style={{ marginLeft: 'auto' }}>↗ Öppna</a>
          </div>

          {/* SR live audio — always rendered on SR tab so users can hear the
              news regardless of whether the iframe site loads. Browser-native
              <audio> handles the public MP3 stream from sverigesradio.se. */}
          {active.stream && (
            <div className="news-audio">
              <div className="news-audio-meta">
                <span className="micro-label">{active.streamLabel}</span>
                <span className="news-audio-source mono">{active.stream.replace(/^https?:\/\//, '')}</span>
              </div>
              <audio controls preload="none" src={active.stream}>
                Din webbläsare stöder inte ljuduppspelning.
              </audio>
            </div>
          )}

          <div className="news-frame-body">
            <iframe
              key={active.id}
              src={active.url}
              title={`${active.label} embedded reader`}
              referrerPolicy="no-referrer"
              loading="lazy"
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
            />
            <div className="news-frame-fallback">
              Om sidan blockerar inbäddning, använd ↗ Öppna ovan.
            </div>
          </div>
        </div>
        <div className="news-side">
          <div className="micro-label">Senaste</div>
          {stories.map((s, i) => (
            <a
              key={i}
              className="news-item"
              href={active.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <img
                className="news-item-image"
                src={s.image}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
              <div className="news-item-text">
                <span className="news-item-source">{s.source}</span>
                <span className="news-item-title">{s.title}</span>
                <span className="news-item-meta">{s.meta}</span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Integration catalog -- shape per entry:
//   { id, name, icon, kind, tagline, keywords, status(integrations, spotify) }
// "kind" is used in the badge ("Cloud OAuth" / "LAN bridge" / "Cloud token" / "LAN devices")
// `keywords` are searched in addition to name and tagline.
// ─────────────────────────────────────────────────────────────────────────────
const INTEGRATION_CATALOG = [
  {
    id: 'plejd', name: 'Plejd lights', icon: 'Light', kind: 'LAN bridge',
    tagline: 'Swedish smart-bulb network. Needs a Home Assistant bridge on your LAN.',
    keywords: ['plejd', 'lights', 'bulbs', 'home assistant', 'ha', 'lighting'],
    status: (i) => i.config.plejd?.url && i.config.plejd?.token ? 'configured' : 'not-configured',
  },
  {
    id: 'sonos', name: 'Sonos speakers', icon: 'Speaker', kind: 'LAN bridge',
    tagline: 'Multi-room audio. Needs node-sonos-http-api on your LAN.',
    keywords: ['sonos', 'speakers', 'audio', 'multi-room', 'sound'],
    status: (i) => i.config.sonos?.url ? 'configured' : 'not-configured',
  },
  {
    id: 'shelly', name: 'Shelly outlets', icon: 'Plug', kind: 'LAN devices',
    tagline: 'Smart plugs with live wattage. Each device has its own HTTP API.',
    keywords: ['shelly', 'outlets', 'plugs', 'power', 'switches'],
    status: (i) => (i.config.shelly?.devices?.length ?? 0) > 0 ? 'configured' : 'not-configured',
  },
  {
    id: 'spotify', name: 'Spotify', icon: 'Music', kind: 'Cloud OAuth',
    tagline: 'Music search, your library, and playback in the embedded player.',
    keywords: ['spotify', 'music', 'playback', 'streaming'],
    status: (i, sp) => sp?.token ? 'configured' : (sp?.clientId ? 'partial' : 'not-configured'),
  },
  {
    id: 'tibber', name: 'Tibber energy', icon: 'Zap', kind: 'Cloud token',
    tagline: 'Live electricity prices (Nordics). Bring your personal access token.',
    keywords: ['tibber', 'energy', 'price', 'electricity', 'nordic'],
    status: (i) => i.config.tibber?.token ? 'configured' : 'not-configured',
  },
  {
    id: 'weather', name: 'Local weather', icon: 'Cloud', kind: 'Cloud, no key',
    tagline: 'Hourly + daily forecast from open-meteo. No API key, free.',
    keywords: ['weather', 'forecast', 'open-meteo', 'temperature', 'rain'],
    status: (i) => i.config.weather?.lat && i.config.weather?.lon ? 'configured' : 'default',
  },
];

const STATUS_LABEL = { configured: 'Connected', partial: 'Half set up', 'not-configured': 'Not set up', default: 'Using defaults' };

// Shelly device discovery -- best-effort HTTP probe of a /24 subnet. Browser
// can't do mDNS/BLE, but Shelly's HTTP server speaks CORS, so we can read the
// /shelly endpoint (Gen1) and /rpc/Shelly.GetDeviceInfo (Gen2) directly.
// Returns Promise<Array<{ ip, name, model, gen }>>.
async function scanShellySubnet(subnet, onProgress) {
  const found = [];
  const concurrency = 20;
  const ips = [];
  for (let i = 1; i <= 254; i++) ips.push(`${subnet}.${i}`);
  let cursor = 0;
  let done = 0;
  const worker = async () => {
    while (cursor < ips.length) {
      const ip = ips[cursor++];
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 1500);
        // Try Gen2 first, fall back to Gen1.
        let r = await fetch(`http://${ip}/rpc/Shelly.GetDeviceInfo`, { signal: ctrl.signal }).catch(() => null);
        if (!r || !r.ok) {
          r = await fetch(`http://${ip}/shelly`, { signal: ctrl.signal }).catch(() => null);
        }
        clearTimeout(t);
        if (r && r.ok) {
          const j = await r.json().catch(() => null);
          if (j && (j.id || j.mac || j.type)) {
            found.push({
              ip,
              name: j.name || j.id || j.type || ip,
              model: j.model || j.type || 'Shelly',
              gen: j.gen || 1,
            });
          }
        }
      } catch (e) {}
      done++;
      onProgress?.(done, ips.length, found.length);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return found;
}

function IntegrationCatalog({ integrations, spotify }) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(null);
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return INTEGRATION_CATALOG;
    return INTEGRATION_CATALOG.filter(it =>
      it.name.toLowerCase().includes(q) ||
      it.tagline.toLowerCase().includes(q) ||
      it.keywords.some(k => k.includes(q))
    );
  }, [query]);

  return (
    <div className="settings-page">
      <div className="catalog-search">
        <I.Search size={14} />
        <input
          className="settings-input"
          type="text"
          placeholder="Search integrations… (e.g. lights, music, energy)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          spellCheck="false"
        />
      </div>
      <div className="settings-section">
        {items.length === 0 && (
          <div className="settings-row">
            <span className="settings-row-icon"><I.Search size={14} /></span>
            <div>
              <div className="settings-row-name">No matches</div>
              <div className="settings-row-sub">Try a different search term.</div>
            </div>
          </div>
        )}
        {items.map(it => {
          const Ic = I[it.icon] ?? I.Plug;
          const status = it.status(integrations, spotify);
          const isOpen = expanded === it.id;
          return (
            <div key={it.id} className="catalog-item" data-status={status} data-open={isOpen}>
              <button
                type="button"
                className="catalog-head"
                onClick={() => setExpanded(isOpen ? null : it.id)}
                aria-expanded={isOpen}
              >
                <span className="settings-row-icon"><Ic size={14} /></span>
                <div className="catalog-head-meta">
                  <div className="catalog-head-name">{it.name}</div>
                  <div className="catalog-head-sub">{it.tagline}</div>
                </div>
                <span className="catalog-kind">{it.kind}</span>
                <span className="catalog-status" data-status={status}>{STATUS_LABEL[status]}</span>
                <span className="catalog-chev" aria-hidden="true">{isOpen ? '−' : '+'}</span>
              </button>
              {isOpen && (
                <div className="catalog-body">
                  <IntegrationConfig id={it.id} integrations={integrations} spotify={spotify} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Per-vendor inline config form. Branches on id; reuses the integrations hook
// or the spotify hook depending on the vendor.
function IntegrationConfig({ id, integrations, spotify }) {
  if (id === 'plejd') return <PlejdConfig integrations={integrations} />;
  if (id === 'sonos') return <SonosConfig integrations={integrations} />;
  if (id === 'shelly') return <ShellyConfig integrations={integrations} />;
  if (id === 'spotify') return <SpotifyConfig spotify={spotify} />;
  if (id === 'tibber') return <TibberConfig integrations={integrations} />;
  if (id === 'weather') return <WeatherConfig integrations={integrations} />;
  return null;
}

function PlejdConfig({ integrations }) {
  const cfg = integrations.config.plejd || { url: '', token: '' };
  const [url, setUrl] = useState(cfg.url);
  const [token, setToken] = useState(cfg.token);
  useEffect(() => { setUrl(cfg.url); setToken(cfg.token); }, [cfg.url, cfg.token]);
  return (
    <div className="catalog-form">
      <p className="catalog-help">
        Run <a href="https://www.home-assistant.io/" target="_blank" rel="noreferrer">Home Assistant</a> with the <span className="mono">hassio-plejd</span> add-on on a Pi or NAS, generate a long-lived access token under your HA profile, then paste both below. HA's <span className="mono">configuration.yaml</span> must include this site's origin under <span className="mono">http.cors_allowed_origins</span>.
      </p>
      <label className="catalog-label">Home Assistant URL</label>
      <input className="settings-input" type="url" placeholder="http://homeassistant.local:8123" value={url} onChange={(e) => setUrl(e.target.value)} autoComplete="off" />
      <label className="catalog-label">Long-lived access token</label>
      <input className="settings-input" type="password" placeholder="eyJhbGciOi..." value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
      <div className="catalog-actions">
        <button className="group-toggle" data-active="true" onClick={() => integrations.setIntegration('plejd', { url: url.trim(), token: token.trim() })}>Save</button>
        {(cfg.url || cfg.token) && <button className="group-toggle" onClick={() => integrations.setIntegration('plejd', { url: '', token: '' })}>Disconnect</button>}
      </div>
    </div>
  );
}

function SonosConfig({ integrations }) {
  const cfg = integrations.config.sonos || { url: '' };
  const [url, setUrl] = useState(cfg.url);
  useEffect(() => { setUrl(cfg.url); }, [cfg.url]);
  return (
    <div className="catalog-form">
      <p className="catalog-help">
        Run <a href="https://github.com/jishi/node-sonos-http-api" target="_blank" rel="noreferrer">node-sonos-http-api</a> on any LAN box (Pi, NAS, Docker). It auto-discovers your Sonos zones; paste its base URL below.
      </p>
      <label className="catalog-label">sonos-http-api base URL</label>
      <input className="settings-input" type="url" placeholder="http://sonos.local:5005" value={url} onChange={(e) => setUrl(e.target.value)} autoComplete="off" />
      <div className="catalog-actions">
        <button className="group-toggle" data-active="true" onClick={() => integrations.setIntegration('sonos', { url: url.trim() })}>Save</button>
        {cfg.url && <button className="group-toggle" onClick={() => integrations.setIntegration('sonos', { url: '' })}>Disconnect</button>}
      </div>
    </div>
  );
}

function ShellyConfig({ integrations }) {
  const cfg = integrations.config.shelly || { devices: [] };
  const [subnet, setSubnet] = useState('192.168.1');
  const [scanState, setScanState] = useState({ running: false, done: 0, total: 0, hits: 0, error: null });
  const [scanResults, setScanResults] = useState([]);
  const [ip, setIp] = useState('');
  const [name, setName] = useState('');
  const [room, setRoom] = useState('');

  const addDevice = (dev) => {
    const next = [...(cfg.devices || []), { id: dev.id || `shelly-${Date.now().toString(36)}`, name: dev.name, ip: dev.ip, room: dev.room || '', icon: dev.icon || 'Plug', alwaysOn: false }];
    integrations.setIntegration('shelly', { devices: next });
  };
  const removeDevice = (idx) => {
    const next = (cfg.devices || []).filter((_, i) => i !== idx);
    integrations.setIntegration('shelly', { devices: next });
  };
  const addManual = () => {
    if (!ip.trim() || !name.trim()) return;
    addDevice({ ip: ip.trim(), name: name.trim(), room: room.trim() });
    setIp(''); setName(''); setRoom('');
  };
  const runScan = async () => {
    setScanResults([]);
    setScanState({ running: true, done: 0, total: 254, hits: 0, error: null });
    try {
      const found = await scanShellySubnet(subnet.trim(), (done, total, hits) => {
        setScanState((s) => ({ ...s, done, total, hits }));
      });
      setScanResults(found);
      setScanState((s) => ({ ...s, running: false }));
    } catch (e) {
      setScanState({ running: false, done: 0, total: 0, hits: 0, error: String(e.message || e) });
    }
  };
  const knownIps = new Set((cfg.devices || []).map(d => d.ip));

  return (
    <div className="catalog-form">
      <p className="catalog-help">
        Each Shelly speaks HTTP at <span className="mono">http://&lt;device-ip&gt;/</span>. Add devices by IP, or scan your local subnet — Shelly devices return CORS-friendly responses, so this works from the browser. (mDNS / Bluetooth discovery doesn't.)
      </p>
      {(cfg.devices || []).length > 0 && (
        <div className="catalog-list">
          {(cfg.devices || []).map((d, i) => (
            <div key={i} className="catalog-list-row">
              <span><b>{d.name}</b> <span className="mono" style={{ color: 'var(--muted-foreground)' }}>{d.ip}</span> {d.room && <>· {d.room}</>}</span>
              <button className="group-toggle" onClick={() => removeDevice(i)}>Remove</button>
            </div>
          ))}
        </div>
      )}
      <div className="catalog-add-grid">
        <input className="settings-input" placeholder="192.168.1.42" value={ip} onChange={e => setIp(e.target.value)} autoComplete="off" />
        <input className="settings-input" placeholder="Coffee maker" value={name} onChange={e => setName(e.target.value)} autoComplete="off" />
        <input className="settings-input" placeholder="Kitchen" value={room} onChange={e => setRoom(e.target.value)} autoComplete="off" />
        <button className="group-toggle" onClick={addManual} disabled={!ip.trim() || !name.trim()}>Add</button>
      </div>
      <div className="catalog-scan">
        <label className="catalog-label">Or scan subnet for Shelly devices</label>
        <div className="catalog-add-grid" style={{ gridTemplateColumns: '1fr auto' }}>
          <input className="settings-input" placeholder="192.168.1" value={subnet} onChange={e => setSubnet(e.target.value)} autoComplete="off" />
          <button className="group-toggle" data-active="true" onClick={runScan} disabled={scanState.running}>
            {scanState.running ? `Scanning ${scanState.done}/${scanState.total} · ${scanState.hits} found` : 'Scan'}
          </button>
        </div>
        {scanState.error && <div style={{ color: 'var(--destructive)', fontSize: 11, marginTop: 6 }}>{scanState.error}</div>}
        {scanResults.length > 0 && (
          <div className="catalog-list" style={{ marginTop: 8 }}>
            {scanResults.map((r) => (
              <div key={r.ip} className="catalog-list-row">
                <span><b>{r.name}</b> <span className="mono" style={{ color: 'var(--muted-foreground)' }}>{r.ip}</span> · {r.model} (Gen{r.gen})</span>
                <button className="group-toggle" data-active="true" disabled={knownIps.has(r.ip)} onClick={() => addDevice({ ip: r.ip, name: r.name, room: '' })}>
                  {knownIps.has(r.ip) ? 'Added' : 'Add'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SpotifyConfig({ spotify }) {
  const [draft, setDraft] = useState(spotify.clientId || '');
  useEffect(() => { setDraft(spotify.clientId || ''); }, [spotify.clientId]);
  const onLocalhost = window.location.hostname === 'localhost';
  const suggested127 = `http://127.0.0.1${window.location.port ? ':' + window.location.port : ''}${window.location.pathname}`;
  return (
    <div className="catalog-form">
      <p className="catalog-help">
        Create a Spotify app at <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">developer.spotify.com</a>. Set the redirect URI to exactly <span className="mono">{spRedirectUri()}</span>. Each user signs in with their own Spotify account; tokens stay in this browser.
      </p>
      {onLocalhost && (
        <p className="catalog-help" style={{ color: 'var(--primary)', borderLeft: '2px solid var(--primary)', paddingLeft: 10 }}>
          <b>Heads up:</b> Spotify rejects <span className="mono">localhost</span> as a redirect-URI host since 2024 — they only accept <span className="mono">127.0.0.1</span> for non-HTTPS URIs. Either register <span className="mono">{suggested127}</span> in your Spotify app AND access this page at <a href={suggested127}>{suggested127}</a>, or deploy to an HTTPS host (Netlify / Vercel) and register that URL instead.
        </p>
      )}
      {spotify.error && <div style={{ color: 'var(--destructive)', fontSize: 11, marginBottom: 6 }}>{spotify.error}</div>}
      <label className="catalog-label">Client ID</label>
      <input className="settings-input" type="text" placeholder="32-char hex" value={draft} onChange={e => setDraft(e.target.value)} autoComplete="off" spellCheck="false" />
      <div className="catalog-actions">
        <button className="group-toggle" onClick={() => spotify.setClientId(draft.trim())}>Save Client ID</button>
        {spotify.token ? (
          <button className="group-toggle" onClick={spotify.disconnect}>Disconnect ({spotify.me?.display_name || 'Spotify'})</button>
        ) : (
          <button className="group-toggle" data-active="true" onClick={spotify.connect} disabled={!spotify.clientId}>Connect with Spotify</button>
        )}
      </div>
      {spotify.me && <div className="catalog-help" style={{ marginTop: 8 }}>Signed in as <b>{spotify.me.display_name}</b>{spotify.me.email && <> ({spotify.me.email})</>}.</div>}
    </div>
  );
}

function TibberConfig({ integrations }) {
  const cfg = integrations.config.tibber || { token: '' };
  const [token, setToken] = useState(cfg.token);
  useEffect(() => { setToken(cfg.token); }, [cfg.token]);
  return (
    <div className="catalog-form">
      <p className="catalog-help">
        Generate a personal access token at <a href="https://developer.tibber.com" target="_blank" rel="noreferrer">developer.tibber.com</a>. CORS-friendly; called directly from the browser.
      </p>
      <label className="catalog-label">Personal access token</label>
      <input className="settings-input" type="password" placeholder="Bearer ..." value={token} onChange={e => setToken(e.target.value)} autoComplete="off" />
      <div className="catalog-actions">
        <button className="group-toggle" data-active="true" onClick={() => integrations.setIntegration('tibber', { token: token.trim() })}>Save</button>
        {cfg.token && <button className="group-toggle" onClick={() => integrations.setIntegration('tibber', { token: '' })}>Disconnect</button>}
      </div>
    </div>
  );
}

function WeatherConfig({ integrations }) {
  const cfg = integrations.config.weather || { lat: '', lon: '', city: '' };
  const [lat, setLat] = useState(cfg.lat);
  const [lon, setLon] = useState(cfg.lon);
  const [city, setCity] = useState(cfg.city);
  useEffect(() => { setLat(cfg.lat); setLon(cfg.lon); setCity(cfg.city); }, [cfg.lat, cfg.lon, cfg.city]);
  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      setLat(pos.coords.latitude.toFixed(4));
      setLon(pos.coords.longitude.toFixed(4));
    });
  };
  return (
    <div className="catalog-form">
      <p className="catalog-help">
        Weather comes from <a href="https://open-meteo.com" target="_blank" rel="noreferrer">open-meteo.com</a> — free, no API key, CORS-open. Set your latitude / longitude (or click "Use my location") and the city label that shows in the header.
      </p>
      <div className="catalog-add-grid">
        <input className="settings-input" placeholder="Latitude (59.3293)" value={lat} onChange={e => setLat(e.target.value)} autoComplete="off" />
        <input className="settings-input" placeholder="Longitude (18.0686)" value={lon} onChange={e => setLon(e.target.value)} autoComplete="off" />
        <input className="settings-input" placeholder="City (Stockholm)" value={city} onChange={e => setCity(e.target.value)} autoComplete="off" />
        <button className="group-toggle" onClick={useMyLocation}>Use my location</button>
      </div>
      <div className="catalog-actions">
        <button className="group-toggle" data-active="true" onClick={() => integrations.setIntegration('weather', { lat: String(lat).trim(), lon: String(lon).trim(), city: String(city).trim() })}>Save</button>
      </div>
    </div>
  );
}

function SettingsPage({ rooms, outlets, speakers, activity, spotify, google, integrations, demoMode, onLoadDemo, onClearDemo }) {
  const deviceTotal = rooms.length + outlets.length + speakers.length;
  const [draftClient, setDraftClient] = useState(spotify.clientId);
  useEffect(() => { setDraftClient(spotify.clientId); }, [spotify.clientId]);
  const saveClient = () => spotify.setClientId(draftClient);

  // Google -- mirrors the Spotify draft/save pattern. The Sign-in button is
  // rendered by Google Identity Services into the gsiBtnRef container the
  // moment a Client ID is present (the hook's renderButton is idempotent).
  const [draftGoogleClient, setDraftGoogleClient] = useState(google?.clientId || '');
  useEffect(() => { setDraftGoogleClient(google?.clientId || ''); }, [google?.clientId]);
  const saveGoogleClient = () => google?.setClientId(draftGoogleClient);
  const gsiBtnRef = useRef(null);
  useEffect(() => {
    if (!google?.user && google?.clientId && gsiBtnRef.current) {
      google.renderButton(gsiBtnRef.current);
    }
  }, [google?.user, google?.clientId, google?.renderButton]);

  // Local sign-up state
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const submitSignup = () => {
    if (google?.signUpLocal?.({ name: signupName, email: signupEmail })) {
      setSignupName(''); setSignupEmail('');
    }
  };

  return (
    <>
      <Section
        title="Account"
        source={google?.user ? `signed in as ${google.user.email || google.user.name}` : 'not signed in'}
        summary={google?.user
          ? <>Identity verified by Google · this browser only</>
          : <>Sign in with Google to personalize this household</>}
      >
        <div className="settings-page">
          <div className="settings-section">
            {google?.error && (
              <div className="settings-row" style={{ color: 'var(--destructive)' }}>
                <span className="settings-row-icon"><I.PowerOff size={14} /></span>
                <div>
                  <div className="settings-row-name">Google sign-in error</div>
                  <div className="settings-row-sub">{google.error}</div>
                </div>
                <span className="settings-row-state">Check ID</span>
              </div>
            )}
            <div className="settings-row" data-on={!!google?.user}>
              <span className="settings-row-icon">
                {google?.user?.picture
                  ? <img src={google.user.picture} alt="" referrerPolicy="no-referrer" style={{ width: 22, height: 22, borderRadius: 999, objectFit: 'cover' }} />
                  : <I.Home size={14} />}
              </span>
              <div style={{ width: '100%' }}>
                <div className="settings-row-name">Account</div>
                <div className="settings-row-sub">
                  {google?.user
                    ? <>Signed in as <b>{google.user.name}</b> ({google.user.email || 'no email scope'})</>
                    : google?.clientId
                      ? <>Click the Google button to sign in.</>
                      : <>Add a Google OAuth Client ID below, then sign in.</>}
                </div>
                {!google?.user && google?.clientId && (
                  <div ref={gsiBtnRef} style={{ marginTop: 8, minHeight: 40 }} />
                )}
              </div>
              {google?.user ? (
                <button className="group-toggle" onClick={google.signOut}>Sign out</button>
              ) : null}
            </div>
            {!google?.user && (
              <div className="settings-row">
                <span className="settings-row-icon"><I.Home size={14} /></span>
                <div style={{ width: '100%' }}>
                  <div className="settings-row-name">Or sign up with email</div>
                  <div className="settings-row-sub">
                    Local profile, this browser only. No password, no recovery — pair with Google later if you want sync.
                  </div>
                  <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8 }}>
                    <input
                      className="settings-input"
                      type="text"
                      autoComplete="off"
                      placeholder="Name"
                      value={signupName}
                      onChange={(e) => setSignupName(e.target.value)}
                    />
                    <input
                      className="settings-input"
                      type="email"
                      autoComplete="off"
                      placeholder="you@example.com"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                    />
                    <button className="group-toggle" onClick={submitSignup} disabled={!signupName.trim() || !signupEmail.trim()}>Create</button>
                  </div>
                </div>
              </div>
            )}
            <div className="settings-row">
              <span className="settings-row-icon"><I.Settings size={14} /></span>
              <div style={{ width: '100%' }}>
                <div className="settings-row-name">Google OAuth Client ID</div>
                <div className="settings-row-sub">
                  From console.cloud.google.com → APIs &amp; Services → Credentials.
                  Add this site's origin (<span className="mono">{window.location.origin}</span>) under <b>Authorized JavaScript origins</b>. No redirect URI is needed for One Tap / GIS.
                </div>
                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                  <input
                    className="settings-input"
                    type="text"
                    autoComplete="off"
                    spellCheck="false"
                    placeholder="123456789-abc.apps.googleusercontent.com"
                    value={draftGoogleClient}
                    onChange={(e) => setDraftGoogleClient(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button className="group-toggle" onClick={saveGoogleClient}>Save</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="Integrations"
        source={(() => {
          const total = INTEGRATION_CATALOG.length;
          const ok = INTEGRATION_CATALOG.filter(it => it.status(integrations, spotify) === 'configured').length;
          return `${ok} of ${total} connected`;
        })()}
        summary={<>Search for a service, expand to set it up, or scan your LAN for Shelly devices.</>}
      >
        <IntegrationCatalog integrations={integrations} spotify={spotify} />
      </Section>

      <Section
        title="Devices"
        source="local inventory"
        summary={<><b>{deviceTotal}</b> devices · <b>{rooms.length}</b> rooms · <b>{outlets.length}</b> outlets · <b>{speakers.length}</b> speakers</>}
      >
        <div className="settings-page">
          <div className="settings-section">
            <div className="settings-row" data-on={true}>
              <span className="settings-row-icon"><I.Light size={14} /></span>
              <div>
                <div className="settings-row-name">Plejd bulbs</div>
                <div className="settings-row-sub">{rooms.reduce((a,r) => a + r.bulbs, 0)} bulbs across {rooms.length} rooms</div>
              </div>
              <span className="settings-row-state">Online</span>
            </div>
            <div className="settings-row" data-on={true}>
              <span className="settings-row-icon"><I.Plug size={14} /></span>
              <div>
                <div className="settings-row-name">Shelly outlets</div>
                <div className="settings-row-sub">{outlets.length} outlets · {outlets.filter(o => o.alwaysOn).length} always-on</div>
              </div>
              <span className="settings-row-state">Online</span>
            </div>
            <div className="settings-row" data-on={true}>
              <span className="settings-row-icon"><I.Speaker size={14} /></span>
              <div>
                <div className="settings-row-name">Sonos speakers</div>
                <div className="settings-row-sub">{speakers.length} speakers · lead room: {speakers.find(s => s.primary)?.name ?? '—'}</div>
              </div>
              <span className="settings-row-state">Online</span>
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="About"
        source="Home Domain"
        summary={<>Last activity: <b>{activity.length}</b> events tracked locally</>}
      >
        <div className="settings-page">
          <div className="settings-section settings-about">
            <span><b>Home Domain</b> — a one-screen control surface for a multi-vendor smart home.</span>
            <span>This build hosts vendor web UIs (Spotify, news sites) as iframes and computes everything else locally. No API keys, no cloud accounts.</span>
            <span>Version <span className="mono">2026.5.0-prototype</span></span>
            <span>Keyboard: <b className="mono">1–5</b> apply Home scenes · <b className="mono">G</b> jump to Home · <b className="mono">Esc</b> clear scene</span>
          </div>
          <div className="settings-section" style={{ marginTop: 12 }}>
            <div className="settings-row" data-on={demoMode}>
              <span className="settings-row-icon"><I.Disc size={14} /></span>
              <div style={{ width: '100%' }}>
                <div className="settings-row-name">Demo data</div>
                <div className="settings-row-sub">
                  {demoMode
                    ? <>Populated with 8 rooms, 6 outlets, 4 speakers. Toggles, sliders, scenes, and Cast-to-room all work locally — no hardware required.</>
                    : <>No integrations are wired in this browser yet. Load demo data to explore every control as if you'd already configured Plejd, Sonos, and Shelly.</>}
                </div>
              </div>
              {demoMode
                ? <button className="group-toggle" onClick={onClearDemo}>Clear</button>
                : <button className="group-toggle" data-active="true" onClick={onLoadDemo}>Load demo data</button>}
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}

// Mount logic moved to `src/main.jsx`. Export the root component instead.
export default App;
