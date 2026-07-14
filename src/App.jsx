// Home Domain — Home control surface: Lights, Power, Sound.
// Match DESIGN.md exactly: dark, clay/amber, flat translucent cards, 2px stack.

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useHomeStore, STATUS } from './store/useHomeStore.js';
import { usePageVisible, useWakeLock } from './lib/tabLifecycle.js';
import { pickBackdrop } from './lib/sunPhase.js';
import { useMediaSession } from './lib/mediaSession.js';
import { useHaEntities } from './lib/haEntities.js';
import { plejdLogin, plejdFetchSites, plejdFetchDevices, plejdSetDeviceState } from './lib/plejdCloud.js';
import { useWebSocketHub } from './lib/useWebSocketHub.js';
import { useIntegrations } from './hooks/useIntegrations.js';
import { useGoogleAuth } from './hooks/useGoogleAuth.js';
import { useSpotify, spRedirectUri } from './hooks/useSpotify.js';
import { useRoute } from './hooks/useRoute.js';
import { useFlicker } from './hooks/useFlicker.js';
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion.js';
import { useSpotifyEmbed } from './hooks/useSpotifyEmbed.js';
import { useSpotifyOEmbed } from './hooks/useSpotifyOEmbed.js';
import { Icon, I } from './components/icons.jsx';
import { Slider, Toggle, HoldToggle } from './components/primitives.jsx';
import { Sidebar } from './components/Sidebar.jsx';
import { BottomNav } from './components/BottomNav.jsx';

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
      const pbState = z.coordinator?.state?.playbackState;
      const track   = z.coordinator?.state?.currentTrack;
      speakers.push({
        id: (m.roomName || '').toLowerCase().replace(/\s+/g, '_'),
        name: m.roomName,
        // source: track title when playing/paused, fallback for stopped/ungrouped
        source: track?.title || (m.roomName === z.coordinator?.roomName ? null : z.coordinator?.roomName),
        artist: track?.artist || null,
        on:     pbState === 'PLAYING',
        paused: pbState === 'PAUSED_PLAYBACK',
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

// Hub REST /command — for one-shot calls that need the RESULT back (the
// WebSocket sendCommand is fire-and-forget). Used by OAuth handshakes where
// the hub returns an authorize URL or exchange confirmation.
const HUB_HTTP = ((typeof import.meta !== 'undefined' && import.meta.env?.VITE_HUB_URL) || 'ws://localhost:3001')
  .replace(/^ws/, 'http');
async function hubRest(integration, action, params) {
  const r = await fetch(`${HUB_HTTP}/command`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Hub-Secret': (typeof import.meta !== 'undefined' && import.meta.env?.VITE_HUB_SECRET) || '',
    },
    body: JSON.stringify({ integration, action, params }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new Error(j.error || `hub ${r.status}`);
  return j.result;
}

// Tibber prices + live power are fetched by the HUB (token stays server-side)
// and pushed over the WebSocket as 'tibber' / 'tibber_live'. No browser fetch.

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

// pickBackdrop is now in src/lib/sunPhase.js -- it uses suncalc + the saved
// lat/lon to pick the real solar phase ("sun is 4 degrees below the horizon")
// rather than the wall clock ("h < 9"). Stockholm in December has sunrise at
// 08:45; the old hour-bucket version showed a daytime photo when the sky
// outside was still pitch black.

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

// EnvSeedPrompt -- "we found credentials in your environment, want to
// connect them?". Replaces the silent seeder that used to auto-write
// import.meta.env.VITE_* into localStorage on mount. Per the user's request:
// "ask before auto connect integrations with the Google credentials."
//
// Per-item Connect or Skip; "Connect all" / "Skip all" for the impatient.
// The banner disappears as items are applied or skipped; once empty the
// `hdg-env-seeded-v1` latch is set so we don't re-prompt next reload.
function EnvSeedPrompt({ items, onApply, onApplyAll, onSkipAll }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="env-seed-banner" role="region" aria-label="Detected credentials">
      <div className="env-seed-head">
        <div>
          <div className="env-seed-title">We found connection details in your environment.</div>
          <div className="env-seed-sub">
            The dashboard isn't connecting anything automatically — pick what you want to wire up.
          </div>
        </div>
        <div className="env-seed-head-actions">
          <button className="group-toggle" onClick={onSkipAll}>Skip all</button>
          <button className="group-toggle" data-active="true" onClick={onApplyAll}>Connect all</button>
        </div>
      </div>
      <ul className="env-seed-list">
        {items.map((it) => (
          <li key={it.id} className="env-seed-row">
            <div>
              <div className="env-seed-row-name">{it.label}</div>
              <div className="env-seed-row-sub">{it.detail}</div>
            </div>
            <button className="group-toggle" onClick={() => onApply(it.id)}>Connect</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// LanLostBanner -- the watchdog's only UI. Renders a top-bleed amber strip
// (full width inside the main column) when no LAN integration has been
// reachable in the past 5 minutes despite the user having configured one.
// Reviewer 4: "premium feel is really a 24/7 uptime question." This is the
// affordance that puts an honest amber breath in the user's face when the
// router reboots at 3am.
function LanLostBanner() {
  const lanLost = useHomeStore(s => s.lanLost);
  if (!lanLost) return null;
  const retry = () => { window.location.reload(); };
  return (
    <div className="lan-lost-banner" role="alert" aria-live="polite">
      <span className="integration-dot" data-state="down" aria-hidden="true" />
      <div className="lan-lost-text">
        <div className="lan-lost-title">Can't reach your home network.</div>
        <div className="lan-lost-sub">
          Your lights, speakers, and outlets stopped answering. Usually a router or bridge restart fixes it.
        </div>
      </div>
      <button className="group-toggle" onClick={retry} title="Reload the dashboard and try every integration again">Retry now</button>
    </div>
  );
}

// FirstRunBanner -- post-sign-in setup nudge. Step 1 ("sign in") is handled
// by StartupScreen and never reached here. This component only covers:
//   step 2 ("connect"): Google user signed in, no Spotify token yet
//   step 3 ("real"):    Spotify connected, no real LAN integrations yet
//
// Hidden when dismissed, or when the user has a real integration with demo off,
// or when all steps are complete.
function FirstRunBanner({ demoMode, google, spotifyConnected, anyRealIntegration, onNavigate }) {
  const googleUser = google?.user;
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('hdg-onboarding-dismissed') === '1');

  if (dismissed) return null;
  if (!googleUser) return null;           // StartupScreen handles signed-out state
  if (!demoMode && anyRealIntegration && googleUser) return null;

  const dismiss = () => {
    localStorage.setItem('hdg-onboarding-dismissed', '1');
    setDismissed(true);
  };

  // STEP 2 / 3 -- straightforward CTA after sign-in.
  let title, sub, primary;
  if (!spotifyConnected) {
    title = `Welcome, ${googleUser.given_name || googleUser.name || 'friend'}.`;
    sub = 'Connect your music account next so the dashboard plays for real, not from the demo iframe.';
    primary = { label: 'Connect music', onClick: () => onNavigate('settings') };
  } else if (!anyRealIntegration && demoMode) {
    title = 'Demo data is on.';
    sub = "Ready to add real lights, outlets, or speakers? They take 5 minutes to wire and you'll see them appear here.";
    primary = { label: 'Add real devices', onClick: () => onNavigate('settings') };
  } else {
    // All complete -- auto-dismiss so the banner doesn't linger.
    if (localStorage.getItem('hdg-onboarding-dismissed') !== '1') {
      localStorage.setItem('hdg-onboarding-dismissed', '1');
    }
    return null;
  }

  return (
    <div className="first-run-banner" role="region" aria-label="Get started">
      <div className="first-run-text">
        <div className="first-run-title">{title}</div>
        <div className="first-run-sub">{sub}</div>
      </div>
      <div className="first-run-actions">
        <button className="group-toggle" data-active="true" onClick={primary.onClick}>{primary.label}</button>
        <button className="group-toggle" onClick={dismiss} title="Hide this banner. You can still add devices later in Settings.">Skip</button>
      </div>
    </div>
  );
}

// StartupScreen -- the front door. Mounts when nobody is signed in; unmounts
// the moment google.user is set and never re-mounts until explicit sign-out.
//
// Sign-in paths (both always shown when applicable):
//   1. Google -- GIS "Continue with Google" button, rendered when
//      VITE_GOOGLE_CLIENT_ID is present in .env.local. No Client ID input
//      here; the technical owner can change it in Settings > Advanced.
//   2. Email -- local-only profile, no password. Always available.
//
// Layout when Client ID is set: Google button, divider, then email below.
// Layout when not set: just email, no mention of Google.
function StartupScreen({ google }) {
  const gsiBtnRef = useRef(null);
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');

  // Render the GIS button when VITE_GOOGLE_CLIENT_ID is seeded. Self-healing
  // retry handles the parent/child effect ordering race on first commit.
  useEffect(() => {
    if (!google?.clientId || !gsiBtnRef.current) return;
    let cancelled = false;
    let attempts = 0;
    const tryRender = () => {
      if (cancelled || !gsiBtnRef.current) return;
      if (gsiBtnRef.current.querySelector('iframe')) return;
      google.renderButton(gsiBtnRef.current);
      attempts++;
      if (!gsiBtnRef.current.querySelector('iframe') && attempts < 12) {
        setTimeout(tryRender, 250);
      }
    };
    tryRender();
    return () => { cancelled = true; };
  }, [google?.clientId, google?.renderButton]);

  const submitSignup = () => {
    if (google?.signUpLocal?.({ name: signupName, email: signupEmail })) {
      setSignupName(''); setSignupEmail('');
    }
  };

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 5)  return 'Working late';
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  })();

  return (
    <div className="startup-screen" role="dialog" aria-modal="true" aria-labelledby="startup-title">
      <div className="startup-card">
        <div className="startup-eyebrow">{greeting}.</div>
        <h1 id="startup-title" className="startup-title">Home Domain</h1>
        <p className="startup-sub">
          Sign in to take ownership of this household. The dashboard reads your lights,
          music, energy use, and weather — then quietly gets out of the way.
        </p>

        {/* Google sign-in — only rendered when VITE_GOOGLE_CLIENT_ID is set in .env */}
        {google?.clientId && (
          <>
            <div className="startup-gsi">
              <div ref={gsiBtnRef} className="startup-gsi-target" />
            </div>
            {google?.error && <div className="startup-error">{google.error}</div>}
            <div className="startup-divider"><span>or</span></div>
          </>
        )}

        {/* Email / local profile — always available, no credentials required */}
        <div className="startup-form">
          <div className="startup-email-grid">
            <input
              className="settings-input"
              type="text"
              autoComplete="name"
              placeholder="Your name"
              value={signupName}
              onChange={(e) => setSignupName(e.target.value)}
            />
            <input
              className="settings-input"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={signupEmail}
              onChange={(e) => setSignupEmail(e.target.value)}
            />
            <button
              className="group-toggle"
              data-active={!google?.clientId || undefined}
              onClick={submitSignup}
              disabled={!signupName.trim() || !signupEmail.trim()}
            >
              Sign in
            </button>
          </div>
          <p className="startup-hint">Local profile, this browser only. No password required.</p>
        </div>
      </div>
    </div>
  );
}

function App() {
  // Demo mode persists in localStorage so reloads keep the demo state alive.
  // First-run heuristic: if neither demo nor any integration nor any user has
  // ever been touched in this browser, treat it as a brand-new install and
  // auto-load the demo house. The council was unanimous -- "the owner's house
  // is the demo" -- so visitors land inside a living dashboard, not empty
  // boxes. The `hdg-touched` flag is the latch that prevents re-running this
  // on subsequent visits even after the user explicitly clears the demo.
  const [demoMode, setDemoMode] = useState(() => {
    if (localStorage.getItem('hdg-demo-mode') === '1') return true;
    const touched = localStorage.getItem('hdg-touched') === '1';
    if (touched) return false;
    // Fresh browser -- arm demo on boot.
    return true;
  });
  const [rooms, setRooms] = useState(() => demoMode ? DEMO_ROOMS : INITIAL_ROOMS);
  const [outlets, setOutlets] = useState(() => demoMode ? DEMO_OUTLETS : INITIAL_OUTLETS);
  const [speakers, setSpeakers] = useState(() => demoMode ? DEMO_SPEAKERS : INITIAL_SPEAKERS);
  const [plejdScenes, setPlejdScenes] = useState([]);  // live scenes from Plejd cloud
  const [hubHasPlejd, setHubHasPlejd] = useState(false); // true once hub pushes plejd_lights
  // Latch the "touched" flag so the auto-demo doesn't re-arm on every reload.
  useEffect(() => {
    if (localStorage.getItem('hdg-touched') !== '1') {
      localStorage.setItem('hdg-touched', '1');
    }
  }, []);
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
  const [musicSource, setMusicSource] = useState(null);          // Curated source key; null = nothing selected yet
  const [musicCustom, setMusicCustom] = useState(null);          // { type, id, label } when playing a search/library pick
  const [musicFavs, setMusicFavs] = useState(() => {             // Local favourites — works without Spotify auth
    try { return JSON.parse(localStorage.getItem('hdg-music-favs') || '[]'); } catch (e) { return []; }
  });
  const spotify = useSpotify();
  const google = useGoogleAuth();
  const integrations = useIntegrations();

  // Real-time hub — WebSocket to server/index.js running on the LAN.
  // Falls back gracefully (hubConnected=false) when the hub isn't running;
  // the rest of the app uses direct polling in that case, unchanged.
  // hubDispatchRef lets the callbacks (defined here) call state setters that
  // are declared later in the component — the ref is assigned each render so
  // it always has the freshest setters without causing re-renders.
  const hubStateRef    = useRef({});
  const hubDispatchRef = useRef(null);
  const { connected: hubConnected, sendCommand: hubCommand } = useWebSocketHub({
    onSnapshot: useCallback((state) => {
      const integrations = state.integrations || {};
      hubStateRef.current = integrations;
      // Seed the store from the snapshot exactly as live updates flow. Without
      // this, any integration whose last hub push happened BEFORE this browser
      // connected (e.g. the hourly Tibber price poll) arrives only in the
      // snapshot and never reaches the store — leaving it stuck "connecting…".
      for (const [integration, payload] of Object.entries(integrations)) {
        hubDispatchRef.current?.(integration, payload);
      }
    }, []),
    onDeviceUpdate: useCallback((integration, payload) => {
      hubStateRef.current[integration] = payload;
      hubDispatchRef.current?.(integration, payload);
    }, []),
    onError: useCallback((integration, message) => {
      console.warn(`[hub:${integration || 'general'}]`, message);
    }, []),
    onCommandResult: useCallback((msg) => {
      if (msg.ok) return;
      // A failed hub command is why a card "bounces back" -- surface it.
      console.warn(`[hub:${msg.integration}] ${msg.action} failed:`, msg.error);
      const statusKey = msg.integration === 'sonos-cloud' ? 'sonos' : msg.integration;
      useHomeStore.getState().markFailed(statusKey, `${msg.action}: ${String(msg.error || 'command failed').slice(0, 80)}`);
    }, []),
    onHealthUpdate: useCallback((integration, status, detail) => {
      // Map the hub integration name to a store status row, then reflect the
      // pushed health. Fixes the dot being decoupled from ongoing polling
      // (previously only command results / OAuth exchange touched the dot).
      const key = { 'sonos-cloud': 'sonos', nibe: 'nibe', tibber: 'tibber', plejd: 'plejd', shelly: 'shelly' }[integration] || integration;
      const store = useHomeStore.getState();
      if (!store.status[key]) return; // unknown integration
      if (status === 'ok') store.markOk(key, detail || undefined);
      else store.setStatus(key, { state: status === 'down' ? STATUS.DOWN : STATUS.DEGRADED, detail: detail || null });
    }, []),
  });

  // Reset the hub-has-plejd latch whenever the hub drops so the frontend-direct
  // path re-activates until the hub reconnects and pushes plejd_lights again.
  useEffect(() => {
    if (!hubConnected) setHubHasPlejd(false);
  }, [hubConnected]);

  // When the hub connects (or when the Plejd session token changes), hand it the
  // browser's cloud session token so it can use the local TCP GWY-01 path without
  // needing PLEJD_EMAIL/PASSWORD in .env.local.
  // The hub's setSession handler initialises the gateway connection and starts
  // pushing real-time plejd_lights events back to the browser.
  const plejdCloudSession = integrations.config.plejd?.cloudSession;
  const plejdCloudSiteId  = integrations.config.plejd?.cloudSiteId;
  useEffect(() => {
    if (!hubConnected || !plejdCloudSession || !plejdCloudSiteId) return;
    hubCommand('plejd', 'setSession', {
      sessionToken: plejdCloudSession,
      siteId:       plejdCloudSiteId,
    });
  }, [hubConnected, plejdCloudSession, plejdCloudSiteId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Per-action undo stack (3-second window after each toggle).
  const [undoStack, setUndoStack] = useState([]);
  // Per-card command-send feedback (amber pulse while sending, red outline on failure).
  const [sendingIds, setSendingIds] = useState(new Set());
  const [failedIds, setFailedIds] = useState(new Set());
  const [failedCommands, setFailedCommands] = useState(new Map());
  // Expanded room cards showing individual device rows (Set of room ids).
  const [expandedRooms, setExpandedRooms] = useState(new Set());
  const toggleRoomExpand = useCallback((roomId) => {
    setExpandedRooms(s => {
      const n = new Set(s);
      n.has(roomId) ? n.delete(roomId) : n.add(roomId);
      return n;
    });
  }, []);

  // Tab-lifecycle primitives -- foundation of an "appliance" feel.
  // pageVisible is the gate for every polling effect: when nobody is looking
  // (tab hidden, switched to another app on the kitchen iPad, OS turned the
  // screen off), we stop talking to integrations. They re-poll the moment
  // the tab comes back into view.
  const pageVisible = usePageVisible();
  // Keep the screen on while this tab is foreground. Silent no-op on browsers
  // without Wake Lock support (Safari < 16.4, locked-down kiosks).
  useWakeLock(true);
  // Bridge MediaSession <-> Spotify Connect. Lockscreen art + hardware play
  // keys (AirPods, BT headsets, car BT) control whatever Connect target is
  // currently playing. Reads playback from the home store (which gets it
  // from /me/player/currently-playing every 8 s).
  const playbackForSession = useHomeStore(s => s.playback);
  useMediaSession(playbackForSession, useMemo(() => ({
    play: () => {
      if (!spotify.token) return;
      // Resume on the active device (no device_id -> Spotify's choice).
      spotify.api('/me/player/play', { method: 'PUT' }).catch(() => {});
    },
    pause: () => {
      if (!spotify.token) return;
      spotify.api('/me/player/pause', { method: 'PUT' }).catch(() => {});
    },
    next: () => {
      if (!spotify.token) return;
      spotify.api('/me/player/next', { method: 'POST' }).catch(() => {});
    },
    previous: () => {
      if (!spotify.token) return;
      spotify.api('/me/player/previous', { method: 'POST' }).catch(() => {});
    },
  }), [spotify.token, spotify.api]));

  const pushUndo = useCallback((label, revert) => {
    const uid = Date.now() + Math.random();
    setUndoStack(s => [...s, { uid, label, revert }]);
    setTimeout(() => setUndoStack(s => s.filter(x => x.uid !== uid)), 3000);
  }, []);

  const setCardSending = useCallback((cardId) => {
    setSendingIds(s => new Set([...s, cardId]));
    setTimeout(() => setSendingIds(s => { const n = new Set(s); n.delete(cardId); return n; }), 800);
  }, []);

  const setCardFailed = useCallback((cardId, retryFn) => {
    setSendingIds(s => { const n = new Set(s); n.delete(cardId); return n; });
    setFailedIds(s => new Set([...s, cardId]));
    if (retryFn) setFailedCommands(m => new Map([...m, [cardId, retryFn]]));
    setTimeout(() => {
      setFailedIds(s => { const n = new Set(s); n.delete(cardId); return n; });
      setFailedCommands(m => { const n = new Map(m); n.delete(cardId); return n; });
    }, 3000);
  }, []);

  const [plejdErr, setPlejdErr] = useState(null);
  const [sonosErr, setSonosErr] = useState(null);
  // Sonos Cloud payload from the hub: { authorized, players, groups, speakers }
  const [sonosCloud, setSonosCloud] = useState(null);

  // Seed Sonos Cloud state from the connect snapshot (device_update only
  // fires on changes after connect).
  useEffect(() => {
    if (hubConnected && hubStateRef.current.sonos_cloud) {
      setSonosCloud(hubStateRef.current.sonos_cloud);
    }
  }, [hubConnected]);

  // Sonos OAuth callback — Sonos redirects back with ?code&state=hdg-sonos-*.
  // Same two rules as the Spotify exchange: ref-guard against StrictMode
  // double-invoke, and strip the single-use code from the URL BEFORE the
  // exchange. Difference: the exchange happens on the HUB (client_secret
  // lives there), so we wait for hubConnected before handing the code over.
  const sonosExchangeStarted = useRef(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code  = params.get('code');
    const state = params.get('state') || '';
    if (!code || !state.startsWith('hdg-sonos')) return;
    if (!hubConnected) return; // keep code until the hub is reachable
    if (sonosExchangeStarted.current) return;
    sonosExchangeStarted.current = true;
    window.history.replaceState({}, '', window.location.origin + window.location.pathname + '#music');
    hubRest('sonos-cloud', 'exchangeCode', { code, state })
      .then(() => useHomeStore.getState().markOk('sonos', 'Sonos account connected'))
      .catch(e => useHomeStore.getState().markFailed('sonos', String(e.message || e)));
  }, [hubConnected]);

  // Nibe (myUplink) OAuth callback — same hub-side exchange pattern as Sonos.
  // Nibe redirects back with ?code&state=hdg-nibe-*; the hub holds the secret.
  const nibeExchangeStarted = useRef(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code  = params.get('code');
    const state = params.get('state') || '';
    if (!code || !state.startsWith('hdg-nibe')) return;
    if (!hubConnected) return;
    if (nibeExchangeStarted.current) return;
    nibeExchangeStarted.current = true;
    window.history.replaceState({}, '', window.location.origin + window.location.pathname + '#energy');
    hubRest('nibe', 'exchangeCode', { code, state })
      .then(() => useHomeStore.getState().markOk('nibe', 'Nibe account connected'))
      .catch(e => useHomeStore.getState().markFailed('nibe', String(e.message || e)));
  }, [hubConnected]);

  // Sonos Cloud speakers take over when authorized — unless a HEALTHY LAN
  // bridge is serving richer data (track titles). Priority:
  // healthy bridge > Sonos Cloud > Spotify Connect > UPnP.
  useEffect(() => {
    if (demoMode) return;
    if (integrations.config.sonos?.url && !sonosErr) return;
    if (!sonosCloud?.authorized || !sonosCloud.speakers?.length) return;
    setSpeakers(sonosCloud.speakers);
    useHomeStore.getState().markOk('sonos', `${sonosCloud.speakers.length} via Sonos Cloud`);
  }, [sonosCloud, sonosErr, demoMode]); // eslint-disable-line react-hooks/exhaustive-deps
  // newsTab state is managed locally in NewsPage
  // Weather is fetched live from open-meteo. `weatherData` holds the full
  // response (current/hourly/daily); `weather` is the derived bucket used by
  // the photo backdrop and the four-state UI.
  const [weatherData, setWeatherData] = useState(null);
  const [weatherErr, setWeatherErr] = useState(null);
  const weather = useMemo(() => wmoToBucket(weatherData?.current?.weather_code), [weatherData]);
  // Live Tibber prices when token is configured.
  const [tibberPrices, setTibberPrices] = useState(null);
  const [tibberErr, setTibberErr] = useState(null);

  // Hub state dispatch — updated every render so the hub callbacks always
  // have stable access to the latest state setters without stale closures.
  // Called by onDeviceUpdate when the server pushes an integration update.
  hubDispatchRef.current = (integration, payload) => {
    switch (integration) {
      case 'plejd_lights':
        if (!demoMode) { setRooms(payload); setHubHasPlejd(true); }
        break;
      case 'plejd_switches':
        if (!demoMode) setOutlets(prev => {
          const nonPlejd = prev.filter(o => !o._cloudDevice);
          return [...nonPlejd, ...payload];
        });
        break;
      case 'plejd_scenes':
        if (!demoMode) setPlejdScenes(payload);
        break;
      case 'sonos':
        if (!demoMode) setSpeakers(payload);
        break;
      case 'sonos_cloud':
        if (!demoMode) setSonosCloud(payload);
        break;
      case 'shelly':
        if (!demoMode) setOutlets(prev => {
          const nonShelly = prev.filter(o => !o.ip);
          return [...nonShelly, ...payload];
        });
        break;
      case 'tibber': {
        // Hub is the single Tibber owner. payload = { hasSubscription, currency,
        // current, today[], tomorrow[] }. Drive the local chart array AND the
        // store price slice + status dot from this one path.
        const today = payload?.today ?? [];
        setTibberPrices(today);
        const store = useHomeStore.getState();
        if (payload?.hasSubscription) {
          const nowMs = Date.now();
          const slot = today.find(row => {
            const t0 = new Date(row.startsAt).getTime();
            return nowMs >= t0 && nowMs < t0 + 3_600_000;
          });
          const current = payload.current?.total ?? slot?.total ?? today?.[0]?.total ?? null;
          const currency = payload.currency || 'SEK';
          store.setPrice({ current, today, tomorrow: payload.tomorrow ?? null, currency, hasSubscription: true, err: null });
          store.markOk('tibber', current != null ? `${current.toFixed(2)} ${currency}/kWh` : 'prices ok');
        } else {
          // No active price contract — honest, non-error state.
          store.setPrice({ current: null, today: null, tomorrow: null, hasSubscription: false, err: null });
          store.setStatus('tibber', { state: STATUS.DEGRADED, label: 'No price contract', detail: 'Live power works; spot prices need a Tibber electricity subscription' });
        }
        break;
      }
      case 'tibber_live': {
        // Real whole-home power from the Tibber Pulse. Independent of prices.
        const store = useHomeStore.getState();
        store.setLivePower({
          watts:    payload?.power ?? null,
          todayKwh: payload?.accumulatedConsumption ?? null,
          minW:     payload?.minPower ?? null,
          maxW:     payload?.maxPower ?? null,
          avgW:     payload?.averagePower ?? null,
          ts:       Date.now(),
        });
        break;
      }
      case 'heatpump': {
        // Nibe (myUplink) normalized climate payload — read-only in v1.
        const store = useHomeStore.getState();
        store.setHeatpump(payload);
        // Reflect connect state on the dot: offline/not-signed-in → quiet
        // "not connected"; online is asserted by the health_update path.
        if (payload && payload.online === false) {
          store.setStatus('nibe', { state: STATUS.EMPTY, label: 'Not connected', detail: null });
        }
        break;
      }
      default:
        break;
    }
  };

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

  // Pending .env.local credentials -- DETECTED but not yet applied. The user
  // explicitly asked: "ask before auto-connect integrations with the Google
  // credentials." So instead of silently seeding from import.meta.env, we
  // compute the list of {id, label, apply} entries on mount and render an
  // <EnvSeedPrompt> banner that lets the user pick which to connect. The
  // seeded flag only flips when the user has decided -- nothing is written
  // to localStorage or the integrations config until they say so.
  //
  // Why React state and not a closure: the prompt component needs to render
  // the list, and clicking "Connect" needs to remove that item from the list
  // for next render.
  const [pendingEnvCreds, setPendingEnvCreds] = useState(() => {
    if (localStorage.getItem('hdg-env-seeded-v1') === '1') return [];
    const env = import.meta.env || {};
    const out = [];
    if (env.VITE_GOOGLE_CLIENT_ID && !localStorage.getItem('hdg-g-clientid')) {
      out.push({ id: 'google', label: 'Google sign-in', detail: 'Connection ID for your Google Cloud project.' });
    }
    if (env.VITE_SPOTIFY_CLIENT_ID && !localStorage.getItem('hdg-sp-clientid')) {
      out.push({ id: 'spotify', label: 'Spotify', detail: 'Client ID for the music + Connect device control.' });
    }
    // We can't read integrations.config here yet (called inside useState
    // initializer, before useIntegrations runs). The component effect below
    // re-filters once integrations.config is available.
    if (env.VITE_HOME_ASSISTANT_URL) out.push({ id: 'plejd', label: 'Home Assistant (Plejd lights & plugs)', detail: 'Local URL and access token for your HA bridge.' });
    if (env.VITE_TIBBER_TOKEN) out.push({ id: 'tibber', label: 'Tibber energy', detail: 'Personal access token for live electricity prices.' });
    if (env.VITE_SONOS_URL) out.push({ id: 'sonos', label: 'Sonos bridge', detail: 'node-sonos-http-api URL for local speaker control.' });
    return out;
  });
  // Apply a single pending entry. The setter writes to whatever slot
  // matches; the corresponding entry then drops out of `pendingEnvCreds`.
  const applyPendingEnv = useCallback((id) => {
    const env = import.meta.env || {};
    switch (id) {
      case 'google':  if (env.VITE_GOOGLE_CLIENT_ID)  google.setClientId(env.VITE_GOOGLE_CLIENT_ID); break;
      case 'spotify': if (env.VITE_SPOTIFY_CLIENT_ID) spotify.setClientId(env.VITE_SPOTIFY_CLIENT_ID); break;
      case 'plejd':
        if (env.VITE_HOME_ASSISTANT_URL) {
          integrations.setIntegration('plejd', {
            url: env.VITE_HOME_ASSISTANT_URL,
            token: integrations.config.plejd?.token || '',
          });
        }
        break;
      case 'tibber':
        // VITE_TIBBER_TOKEN is deprecated — token baked into bundle is a security risk.
        // Set the token via Settings → Tibber instead.
        break;
      case 'sonos':
        if (env.VITE_SONOS_URL) integrations.setIntegration('sonos', { url: env.VITE_SONOS_URL });
        break;
    }
    logActivity('integration', `Connected ${id} from environment`);
    setPendingEnvCreds((curr) => {
      const next = curr.filter(c => c.id !== id);
      if (next.length === 0) localStorage.setItem('hdg-env-seeded-v1', '1');
      return next;
    });
  }, [google.setClientId, spotify.setClientId, integrations, logActivity]);
  // "Skip all" -- dismiss the whole prompt without applying anything.
  const skipAllPendingEnv = useCallback(() => {
    setPendingEnvCreds([]);
    localStorage.setItem('hdg-env-seeded-v1', '1');
    logActivity('integration', 'Skipped environment credentials');
  }, [logActivity]);
  // "Connect all" -- one-tap accept everything detected.
  const applyAllPendingEnv = useCallback(() => {
    pendingEnvCreds.forEach((c) => applyPendingEnv(c.id));
  }, [pendingEnvCreds, applyPendingEnv]);

  // Geolocation one-shot. The Contrarian's rule: ask ONCE at onboarding,
  // store the lat/lon as a config value, never call the API again. The user
  // can still re-prompt manually from Settings -> Local weather -> "Use my
  // location". This effect runs once per browser after the first session
  // is set up; a localStorage latch prevents re-prompting on every reload.
  useEffect(() => {
    if (localStorage.getItem('hdg-geo-prompted') === '1') return;
    if (!google.user) return; // wait until the user has signed in
    if (integrations.config.weather?.lat && integrations.config.weather?.lon) {
      localStorage.setItem('hdg-geo-prompted', '1');
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    localStorage.setItem('hdg-geo-prompted', '1');
    // The Contrarian: wifi-triangulation lands the wrong town often. We
    // request high-accuracy mode and a wide timeout so the device prefers
    // GPS where available, then quietly fall back to whatever it produces.
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(4);
        const lon = pos.coords.longitude.toFixed(4);
        const cfg = integrations.config.weather || {};
        integrations.setIntegration('weather', {
          lat: String(lat),
          lon: String(lon),
          city: cfg.city || '', // user can edit later in Settings
        });
      },
      () => {
        // Denied / failed: leave the existing defaults alone. The Settings
        // form is the manual fallback.
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  }, [google.user, integrations.config.weather?.lat, integrations.config.weather?.lon, integrations.setIntegration]);

  // Time + weather + solar phase → backdrop photo. Crossfade by swapping
  // background-image. Now driven by actual sunrise/sunset from the user's
  // lat/lon rather than arbitrary hour buckets (council Q2 ship list, item
  // 5). Falls back to the old hour heuristic when no location is saved yet.
  useEffect(() => {
    const lat = integrations.config.weather?.lat;
    const lon = integrations.config.weather?.lon;
    const url = pickBackdrop(now, weather, lat, lon);
    const el = document.querySelector('.bg-photo');
    if (el) el.style.backgroundImage = `url('${url}')`;
  }, [now, weather, integrations.config.weather?.lat, integrations.config.weather?.lon]);

  // Poll Spotify "currently playing" every 8 seconds while connected. Writes
  // straight into store.playback so NowPlaying, the header mini-player, and
  // any future widget all render from the same source of truth instead of a
  // hardcoded album the audit flagged as dead chrome. Pauses while tab is
  // hidden to spare API quota.
  useEffect(() => {
    if (!pageVisible) return;
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
          const nextPb = {
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
          };
          useHomeStore.getState().setPlayback(nextPb);
          // Persist track + position for cross-session resume. Written on every
          // poll so the saved position stays fresh. Only the track fields are
          // stored — device info is session-specific and not useful to persist.
          try {
            localStorage.setItem('hdg-last-playback', JSON.stringify({
              track: nextPb.track, artist: nextPb.artist, art: nextPb.art,
              uri: nextPb.uri, albumUri: nextPb.albumUri,
              progressMs: nextPb.progressMs, durationMs: nextPb.durationMs,
            }));
          } catch {}
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
  }, [pageVisible, spotify.token, spotify.api]);

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
  // Suspends entirely when the page is hidden (council Q2 ship list, item 2).
  useEffect(() => {
    if (!pageVisible) return;
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
  }, [pageVisible, integrations.config.weather?.lat, integrations.config.weather?.lon, integrations.config.weather?.city]);

  // Fetch live Plejd state (via Home Assistant) when configured. Poll 30s.
  // Errors surface in `plejdErr` AND in store.status.plejd so Settings can
  // show a connection problem AND the section eyebrow dot turns amber.
  useEffect(() => {
    if (demoMode) return; // demo fixtures take precedence over live bridges
    if (!pageVisible) return; // pause polling while tab is hidden
    const cfg = integrations.config.plejd;
    // Cloud session takes priority over HA bridge when both are present.
    // Cloud fetch gives the real device tree from Plejd's app; toggling is
    // attempted via the Hub-cloud path and gracefully degrades if there's
    // no Hub paired.
    if (cfg?.cloudSession && cfg?.cloudSiteId) {
      // Hub is supplying Plejd data — skip redundant direct-cloud poll.
      if (hubHasPlejd) { setPlejdErr(null); return; }
      let cancelled = false;
      let backoffMs = 30_000;   // doubles on consecutive errors, cap 5 min
      let timer;
      const schedule = () => { timer = setTimeout(load, backoffMs); };
      const load = () => plejdFetchDevices({ sessionToken: cfg.cloudSession, siteId: cfg.cloudSiteId })
        .then(({ devices, stateKnown }) => {
          if (cancelled) return;
          backoffMs = 30_000; // reset on success
          // Map Plejd cloud devices onto the dashboard's Room shape. The
          // `type` field from Plejd tells us whether a device is dimmable
          // (Light/Dimmer) or just on/off (Relay/Switch).
          const isPlug = (d) => /relay|outlet|plug|switch/i.test(d.type || '');
          // Group devices by their user-configured Plejd room name so the
          // dashboard shows "Kitchen", "Bedroom", etc. — exactly as the user
          // named them in the Plejd app — not individual device IDs or model
          // names. Devices with no room assignment appear as individual cards.
          const roomGroups = new Map();
          const ungrouped = [];
          devices.filter(d => !isPlug(d)).forEach(d => {
            if (d.room) {
              if (!roomGroups.has(d.room)) roomGroups.set(d.room, []);
              roomGroups.get(d.room).push(d);
            } else {
              ungrouped.push(d);
            }
          });
          const mkRoomCard = (roomName, devs) => {
            const litDevs = devs.filter(d => d.isOn);
            const avgBrightness = litDevs.length
              ? Math.round(litDevs.reduce((a, d) =>
                  a + (typeof d.dim === 'number' ? Math.round((d.dim / 255) * 100) : 100), 0) / litDevs.length)
              : 0;
            return {
              id: `plejd-room:${roomName}`,
              name: roomName,                 // user-set Plejd room name
              room: roomName,
              bulbs: devs.length,
              on: devs.some(d => d.isOn),
              brightness: avgBrightness,
              dimmable: devs.some(d => d.dimmable !== false),
              _cloudDevices: devs,            // all devices in this room
              _cloudDevice: devs[0],          // primary (for undo/hub compat)
            };
          };
          const lights = [
            ...Array.from(roomGroups.entries()).map(([name, devs]) => mkRoomCard(name, devs)),
            // ungrouped devices fall through as individual cards using their
            // user-set output name (out0.name → d.title)
            ...ungrouped.map(d => ({
              id: d.id,
              name: d.title,
              room: '',
              bulbs: 1,
              on: !!d.isOn,
              brightness: typeof d.dim === 'number' ? Math.round((d.dim / 255) * 100) : (d.isOn ? 100 : 0),
              dimmable: d.dimmable !== false,
              _cloudDevice: d,
            })),
          ];
          const plugs = devices.filter(isPlug).map(d => ({
            id: d.id,
            name: d.title,
            room: d.room || '',
            watts: 0,
            on: !!d.isOn,
            alwaysOn: false,
            icon: 'Plug',
            _cloudDevice: d,
          }));
          // Cloud API (getSiteById) never returns live device state — stateKnown
          // is false for Plejd. Preserve the existing on/brightness across polls
          // so user-toggled state isn't wiped every 8 seconds. New rooms (first
          // appearance) start as off until the user or the Hub sets them.
          setRooms(prevRooms => {
            if (stateKnown) return lights;
            const prevMap = new Map(prevRooms.map(r => [r.id, r]));
            return lights.map(r => {
              const prev = prevMap.get(r.id);
              if (!prev) return r;
              // Preserve room aggregate state (cloud never returns live on/dim)
              const merged = { ...r, on: prev.on, brightness: prev.brightness };
              // Also restore per-device isOn/dim so expanded device rows stay correct
              if (prev._cloudDevices && r._cloudDevices) {
                const prevDevMap = new Map(prev._cloudDevices.map(d => [d.id, d]));
                merged._cloudDevices = r._cloudDevices.map(d => {
                  const pd = prevDevMap.get(d.id);
                  return pd ? { ...d, isOn: pd.isOn, dim: pd.dim } : d;
                });
              }
              return merged;
            });
          });
          setOutlets((prev) => {
            const shellyOrHaOnly = (prev || []).filter(o => (o.ip || o._entity) && !o._cloudDevice);
            return [...shellyOrHaOnly, ...plugs];
          });
          const lightDeviceCount = devices.filter(d => !isPlug(d)).length;
          useHomeStore.getState().markOk('plejd', `${lights.length} rooms · ${lightDeviceCount} lights · ${plugs.length} plugs · ${cfg.cloudSiteTitle || 'Plejd cloud'}`);
          schedule();
        })
        .catch(e => {
          if (cancelled) return;
          const msg = String(e.message || e);
          setPlejdErr(msg);
          useHomeStore.getState().markFailed('plejd', msg);
          backoffMs = Math.min(backoffMs * 2, 5 * 60_000); // exp backoff, cap 5 min
          schedule();
        });
      load();
      return () => { cancelled = true; clearTimeout(timer); };
    }
    // No credentials configured; hub pushes plejd_lights when server has PLEJD_EMAIL/PASSWORD.
    setPlejdErr(null);
    useHomeStore.getState().setStatus('plejd', { state: STATUS.EMPTY, label: 'Not set up', detail: null });
  }, [pageVisible, integrations.config.plejd?.cloudSession, integrations.config.plejd?.cloudSiteId, demoMode, hubHasPlejd]);

  // Fetch live Sonos state when configured. Poll 15s — playback changes
  // faster than light state so the UI feels responsive.
  useEffect(() => {
    if (demoMode) return; // demo fixtures take precedence over live bridges
    if (!pageVisible) return; // pause polling while tab is hidden
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
  }, [pageVisible, integrations.config.sonos?.url, demoMode]);

  // When Spotify is connected AND there is no node-sonos-http-api bridge,
  // synthesize the speakers list from Spotify Connect devices. This is how
  // someone with a real Sonos on their LAN can control playback without any
  // bridge process -- Sonos shows up in /me/player/devices once it's linked
  // to their Spotify account. The shape mirrors what SoundSection expects.
  useEffect(() => {
    if (demoMode) return;
    // Bridge wins only while HEALTHY. A configured-but-dead bridge URL
    // (node-sonos-http-api process not running) used to disable this
    // fallback permanently -- speakers went stale with no path to control
    // them even though Spotify Connect could see every Sonos zone.
    if (integrations.config.sonos?.url && !sonosErr) return;
    if (sonosCloud?.authorized && sonosCloud.speakers?.length) return; // cloud outranks Connect
    if (!spotify.token) return;
    if (!spotify.devices?.length) return;
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
    useHomeStore.getState().markOk('sonos', `${mapped.length} via Spotify Connect`);
  }, [spotify.token, spotify.devices, integrations.config.sonos?.url, sonosErr, sonosCloud, demoMode]);

  // Poll discovered Sonos speakers directly via UPnP (no bridge configured).
  // Runs parallel to the Spotify Connect path; bridge URL wins when present.
  // Uses sonosUPnPState() which may be blocked by CORS on some firmware versions
  // — fails silently, optimistic local state remains.
  useEffect(() => {
    if (demoMode) return;
    if (!pageVisible) return;
    if (integrations.config.sonos?.url && !sonosErr) return; // healthy bridge handles polling
    const sonosDevs = (integrations.config.discovered?.devices || [])
      .filter(d => d.protocol === 'sonos' && d.ip && d.assignedTo === 'music');
    if (!sonosDevs.length) return;
    let cancelled = false;
    const load = async () => {
      const polled = await Promise.all(sonosDevs.map(async d => {
        try {
          const { playing, paused, volume } = await sonosUPnPState(d.ip);
          return {
            id: d.id, name: d.name, model: d.model || '',
            source: playing ? 'Playing' : paused ? 'Paused' : null,
            on: playing, paused, volume, primary: false,
            _ip: d.ip, _protocol: 'sonos',
          };
        } catch {
          return {
            id: d.id, name: d.name, on: false, paused: false,
            volume: 0, source: null, primary: false,
            _ip: d.ip, _protocol: 'sonos',
          };
        }
      }));
      if (cancelled) return;
      setSpeakers(prev => {
        const ids = polled.map(p => p.id);
        return [...prev.filter(s => !ids.includes(s.id)), ...polled];
      });
    };
    load();
    const t = setInterval(load, 15_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [demoMode, pageVisible, integrations.config.sonos?.url, sonosErr, integrations.config.discovered?.devices]);

  // Tibber (prices + live power) is owned entirely by the hub now — it holds
  // the token server-side and pushes 'tibber' / 'tibber_live' over the
  // WebSocket, handled in the dispatch switch above. When the hub is offline
  // there is no price/live data (the token is server-side by design), which
  // the tibber status dot reflects via the LAN watchdog. No browser fetch here.
  useEffect(() => {
    if (hubConnected) return;
    // Hub down: clear live power so a stale reading doesn't linger.
    useHomeStore.getState().setLivePower({ watts: null, ts: null });
  }, [hubConnected]);

  // Live clock — slow tick (30s) for the wall clock; fast tick (15s) only
  // while a scene timer is showing so the "Active 12m" stays fresh.
  useEffect(() => {
    const period = activeScene ? 15_000 : 30_000;
    const t = setInterval(() => setNow(new Date()), period);
    return () => clearInterval(t);
  }, [activeScene]);

  // DEMO-ONLY watt jitter. Real Shelly outlets report measured power (apower)
  // pushed from the hub; this simulation must never run against real devices or
  // it clobbers those readings with fake ~30W noise. Gated on demoMode (and
  // reduced-motion, which cancels the ticking counter regardless).
  useEffect(() => {
    if (reducedMotion || !demoMode) return;
    const t = setInterval(() => {
      setOutlets((os) => os.map(o => {
        if (!o.on) return { ...o, watts: 0 };
        const base = { tv: 142, router: 38, coffee: 920, desk: 96, fan: 45, speaker: 24 }[o.id] ?? 30;
        const jitter = (Math.random() - 0.5) * base * 0.06;
        return { ...o, watts: Math.max(2, Math.round(base + jitter)) };
      }));
    }, 1800);
    return () => clearInterval(t);
  }, [reducedMotion, demoMode]);

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

  // Speakers the user has hidden (ghost Connect devices, dead zones).
  // Persisted per-browser. Hiding is control-surface-only -- the device stays
  // available to Spotify/Sonos and can be restored with one tap.
  const [hiddenSpeakerIds, setHiddenSpeakerIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('hdg-hidden-speakers') || '[]')); }
    catch (e) { return new Set(); }
  });
  const hideSpeaker = useCallback((id) => {
    setHiddenSpeakerIds(prev => {
      const next = new Set(prev); next.add(id);
      try { localStorage.setItem('hdg-hidden-speakers', JSON.stringify([...next])); } catch (e) {}
      return next;
    });
  }, []);
  const unhideAllSpeakers = useCallback(() => {
    setHiddenSpeakerIds(new Set());
    try { localStorage.removeItem('hdg-hidden-speakers'); } catch (e) {}
  }, []);

  // Merge live speakers (Sonos bridge / Spotify Connect) with any discovered
  // speakers the user has assigned to the Music page. Discovered entries that
  // already appear in the live list (same id) are skipped to avoid duplicates.
  const effectiveSpeakers = useMemo(() => {
    const discovered = (integrations.config.discovered?.devices || [])
      .filter(d => d.assignedTo === 'music')
      .filter(d => !speakers.some(s =>
        s.id === d.id ||
        s.name?.toLowerCase().trim() === d.name?.toLowerCase().trim()
      ))
      .map(d => ({
        id: d.id,
        name: d.name,
        // Show last known playback state from HA, or fall back to protocol name.
        source: (d.state && d.state !== 'off' && d.state !== 'unavailable')
          ? d.state : (d.model || d.protocol || 'discovered'),
        on: d.state === 'playing' || d.state === 'on',
        paused: d.state === 'paused' || d.state === 'idle',
        volume: 0, primary: false,
        _discovered: true, _protocol: d.protocol,
        _entityId: d.entityId, _ip: d.ip,
      }));
    return [...speakers, ...discovered].filter(s => !hiddenSpeakerIds.has(s.id));
  }, [speakers, integrations.config.discovered?.devices, hiddenSpeakerIds]);

  // Header caption: which speaker is actually playing right now.
  const playingSpeakerName =
    effectiveSpeakers.find(s => s.on && s.primary)?.name
    ?? effectiveSpeakers.find(s => s.on)?.name
    ?? null;
  const estimatedW = Math.round(litWatts + outletWatts + speakerWatts);
  // Prefer REAL whole-home draw from the Tibber Pulse when it's streaming
  // (fresh within 30s); fall back to the estimated device sum otherwise.
  const livePower = useHomeStore(s => s.livePower);
  const liveFresh = livePower.watts != null && livePower.ts != null && (Date.now() - livePower.ts) < 30_000;
  const liveWatts = liveFresh ? Math.round(livePower.watts) : null;
  const totalW = liveWatts ?? estimatedW;

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

  const activatePlejdScene = useCallback((sceneId, title) => {
    setActiveScene(sceneId);
    setActiveSceneAt(new Date());
    if (hubConnected) hubCommand('plejd', 'activateScene', { sceneId });
    logActivity('scene', `Scene **${title}** activated`);
  }, [hubConnected, hubCommand, logActivity]);

  // Plejd session-expiry detector. Parse sessions die (code 209 "invalid
  // session token"); every command then fails instantly and the optimistic
  // toggle bounces straight back to off with a cryptic message. Detect it,
  // clear the dead session, and tell the user exactly what to do.
  const plejdAuthFail = (e) => {
    const msg = String(e?.message || e || '');
    if (!/209|invalid session|unauthorized|401/i.test(msg)) return false;
    integrations.setIntegration('plejd', {
      cloudSession: '', cloudUserId: '', cloudEmail: '', cloudSiteId: '', cloudSiteTitle: '',
    });
    useHomeStore.getState().markFailed('plejd', 'Plejd session expired — sign in again in Settings.');
    logActivity('light', '**Plejd session expired** — sign in again in Settings');
    return true;
  };

  // Light handlers — optimistic local update + real Plejd call when configured.
  // Hub path routes through the server (no CORS, all tabs see the update).
  // Falls back to direct Plejd cloud call when hub is offline.
  const toggleRoom = (id) => {
    breakScene();
    const r = rooms.find(rr => rr.id === id);
    if (!r) return;
    const next = !r.on;
    setRooms(rs => rs.map(rr => rr.id === id ? { ...rr, on: next } : rr));
    logActivity('light', `${r.name} lights turned **${next ? 'on' : 'off'}**`);
    pushUndo(`${r.name} ${next ? 'on' : 'off'}`, () => {
      setRooms(rs => rs.map(rr => rr.id === id ? { ...rr, on: !next } : rr));
      if (hubConnected) {
        if (r._cloudDevices) r._cloudDevices.forEach(d => hubCommand('plejd', 'toggle', { deviceId: d.id, on: !next }));
        else if (r._cloudDevice) hubCommand('plejd', 'toggle', { deviceId: r._cloudDevice.id, on: !next });
      }
    });
    const cfg = integrations.config.plejd;
    // Hub path: only for hub-sourced rooms (_platform === 'plejd'); server
    // holds the session token and can command the device.
    // Hub path: both hub-sourced rooms (_platform==='plejd') and browser-cloud rooms
    // (_cloudDevices/_cloudDevice) route via hub when it's connected — hub holds the
    // TCP connection and server-side session, so it's faster and doesn't require
    // GWY-01 cloud pairing. Fan out to individual objectIds for cloud-fetched rooms.
    if (hubConnected && (r._platform === 'plejd' || r._cloudDevices || r._cloudDevice)) {
      setCardSending(r.id);
      if (r._cloudDevices) {
        r._cloudDevices.forEach(d => hubCommand('plejd', 'toggle', { deviceId: d.id, on: next }));
      } else if (r._cloudDevice) {
        hubCommand('plejd', 'toggle', { deviceId: r._cloudDevice.id, on: next });
      }
      return;
    }
    // Direct cloud API fallback (hub offline): works only if a GWY-01 Hub is cloud-paired.
    if (cfg?.cloudSession && cfg?.cloudSiteId && (r._cloudDevices || r._cloudDevice)) {
      setCardSending(r.id);
      const devs = r._cloudDevices || [r._cloudDevice];
      Promise.all(devs.map(d => plejdSetDeviceState({ sessionToken: cfg.cloudSession, siteId: cfg.cloudSiteId, deviceId: d.id, on: next })))
        .catch(e => {
          setCardFailed(r.id, () => toggleRoom(id));
          setRooms(rs => rs.map(rr => rr.id === id ? { ...rr, on: !next } : rr));
          if (plejdAuthFail(e)) return; // expired session: clearer message + config reset
          logActivity('light', `**Needs Plejd Hub** — toggle reverted (${String(e.message || e).slice(0, 40)})`);
          useHomeStore.getState().setStatus('plejd', { detail: 'Cloud control needs a Plejd Hub. Discovery still works.' });
        });
      return;
    }
  };
  const setBrightness = (id, b) => {
    breakScene();
    setRooms(rs => rs.map(r => r.id === id ? { ...r, brightness: b, on: b > 0 ? true : r.on } : r));
    const r = rooms.find(rr => rr.id === id);
    const cfg = integrations.config.plejd;
    if (!r) return;
    // Hub path: both hub-sourced and browser-cloud rooms when hub is connected.
    if (hubConnected && (r._platform === 'plejd' || r._cloudDevices || r._cloudDevice)) {
      if (r._cloudDevices) {
        r._cloudDevices.forEach(d => hubCommand('plejd', 'dim', { deviceId: d.id, brightness: b }));
      } else if (r._cloudDevice) {
        hubCommand('plejd', 'dim', { deviceId: r._cloudDevice.id, brightness: b });
      }
      return;
    }
    // Direct cloud API fallback (hub offline).
    if (cfg?.cloudSession && cfg?.cloudSiteId && (r._cloudDevices || r._cloudDevice)) {
      const dim255 = Math.round((b / 100) * 255);
      const devs = r._cloudDevices || [r._cloudDevice];
      Promise.all(devs.map(d => plejdSetDeviceState({ sessionToken: cfg.cloudSession, siteId: cfg.cloudSiteId, deviceId: d.id, on: b > 0, dim: dim255 })))
        .catch(e => {
          setCardFailed(r.id);
          if (plejdAuthFail(e)) return;
          logActivity('light', `**Needs Plejd Hub** — dim reverted (${String(e.message || e).slice(0, 40)})`);
          useHomeStore.getState().setStatus('plejd', { detail: 'Cloud dim needs a Plejd Hub.' });
        });
    }
  };
  const setAllLights = (on) => {
    breakScene();
    const prevRooms = rooms;
    setRooms(rs => rs.map(r => ({ ...r, on })));
    logActivity('light', `All lights **${on ? 'on' : 'off'}**`);
    pushUndo(`All lights ${on ? 'on' : 'off'}`, () => {
      setRooms(prevRooms);
      if (hubConnected) {
        prevRooms.forEach(r => {
          if (r._cloudDevices) r._cloudDevices.forEach(d => hubCommand('plejd', 'toggle', { deviceId: d.id, on: r.on }));
          else if (r._cloudDevice) hubCommand('plejd', 'toggle', { deviceId: r._cloudDevice.id, on: r.on });
        });
      }
    });
    // Fan out through hub — cloud-fetched rooms use individual objectIds;
    // hub-sourced rooms use the 'room:' prefix for server-side fan-out.
    if (hubConnected) {
      rooms.forEach(r => {
        if (r._cloudDevices) r._cloudDevices.forEach(d => hubCommand('plejd', 'toggle', { deviceId: d.id, on }));
        else if (r._cloudDevice) hubCommand('plejd', 'toggle', { deviceId: r._cloudDevice.id, on });
      });
    }
  };

  // Per-device handlers — control a single Plejd device inside a room card.
  // The room aggregate state is recalculated from the updated _cloudDevices list
  // so the room-level toggle and brightness stay accurate without a full re-poll.
  const toggleDevice = (roomId, deviceId, on) => {
    setRooms(rs => rs.map(r => {
      if (r.id !== roomId || !r._cloudDevices) return r;
      const devs = r._cloudDevices.map(d => d.id === deviceId ? { ...d, isOn: on } : d);
      const onDevs = devs.filter(d => d.isOn);
      const roomOn = onDevs.length > 0;
      const roomBrightness = roomOn
        ? Math.round(onDevs.reduce((s, d) => s + (d.dim != null ? Math.round((d.dim / 255) * 100) : 100), 0) / onDevs.length)
        : r.brightness;
      return { ...r, _cloudDevices: devs, on: roomOn, brightness: roomBrightness };
    }));
    if (hubConnected) {
      hubCommand('plejd', 'toggle', { deviceId, on });
      return;
    }
    const cfg = integrations.config.plejd;
    if (cfg?.cloudSession && cfg?.cloudSiteId) {
      plejdSetDeviceState({ sessionToken: cfg.cloudSession, siteId: cfg.cloudSiteId, deviceId, on })
        .catch(e => logActivity('light', `Device command failed: ${String(e.message || e).slice(0, 40)}`));
    }
  };

  const setDeviceBrightness = (roomId, deviceId, b) => {
    setRooms(rs => rs.map(r => {
      if (r.id !== roomId || !r._cloudDevices) return r;
      const dim = Math.round((b / 100) * 255);
      const devs = r._cloudDevices.map(d => d.id === deviceId ? { ...d, isOn: b > 0, dim } : d);
      const onDevs = devs.filter(d => d.isOn);
      const roomOn = onDevs.length > 0;
      const roomBrightness = roomOn
        ? Math.round(onDevs.reduce((s, d) => s + (d.dim != null ? Math.round((d.dim / 255) * 100) : 100), 0) / onDevs.length)
        : r.brightness;
      return { ...r, _cloudDevices: devs, on: roomOn, brightness: roomBrightness };
    }));
    if (hubConnected) {
      hubCommand('plejd', 'dim', { deviceId, brightness: b });
      return;
    }
    const cfg = integrations.config.plejd;
    if (cfg?.cloudSession && cfg?.cloudSiteId) {
      const dim255 = Math.round((b / 100) * 255);
      plejdSetDeviceState({ sessionToken: cfg.cloudSession, siteId: cfg.cloudSiteId, deviceId, on: b > 0, dim: dim255 })
        .catch(e => logActivity('light', `Device dim failed: ${String(e.message || e).slice(0, 40)}`));
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
    pushUndo(`${o.name} ${next ? 'on' : 'off'}`, () => {
      setOutlets(os => os.map(oo => oo.id === id ? { ...oo, on: !next } : oo));
      if (hubConnected && o.ip) hubCommand('shelly', 'toggle', { ip: o.ip, on: !next });
    });
    if (demoMode) return;
    setCardSending(o.id);
    const revert = (err, statusId) => {
      setCardFailed(o.id, () => toggleOutlet(id));
      setOutlets(os => os.map(oo => oo.id === id ? { ...oo, on: !next } : oo));
      logActivity('outlet', `${o.name} **rollback** (${String(err.message || err).slice(0, 40)})`);
      useHomeStore.getState().markFailed(statusId, String(err.message || err));
    };
    // Plejd cloud plug — prefer hub routing when connected (local TCP, no GWY-01
    // cloud-pairing required). Falls back to direct cloud API when hub is offline.
    if (o._cloudDevice) {
      if (hubConnected) {
        hubCommand('plejd', 'toggle', { deviceId: o._cloudDevice.id, on: next });
        setSendingIds(s => { const n = new Set(s); n.delete(o.id); return n; });
        return;
      }
      const cfg = integrations.config.plejd;
      if (!cfg?.cloudSession || !cfg?.cloudSiteId) { setSendingIds(s => { const n = new Set(s); n.delete(o.id); return n; }); return; }
      plejdSetDeviceState({ sessionToken: cfg.cloudSession, siteId: cfg.cloudSiteId, deviceId: o._cloudDevice.id, on: next })
        .then(() => { setSendingIds(s => { const n = new Set(s); n.delete(o.id); return n; }); useHomeStore.getState().markOk('plejd', `cloud control ok`); })
        .catch(err => {
          revert(err, 'plejd');
          useHomeStore.getState().setStatus('plejd', { detail: 'Plug control needs a Plejd Hub.' });
        });
      return;
    }
    // Hub path for Shelly devices (no CORS, state updates reach all tabs).
    if (hubConnected && o.ip) {
      hubCommand('shelly', 'toggle', { ip: o.ip, on: next });
      return;
    }
    // Shelly direct HTTP path: try Gen2 RPC first, fall back to Gen1 relay.
    if (!o.ip) { setSendingIds(s => { const n = new Set(s); n.delete(o.id); return n; }); return; }
    const ip = o.ip;
    const tryGen2 = fetch(`http://${ip}/rpc/Switch.Set?id=0&on=${next}`, { method: 'GET' });
    const tryGen1 = (resp) => (resp && resp.ok) ? resp : fetch(`http://${ip}/relay/0?turn=${next ? 'on' : 'off'}`, { method: 'GET' });
    tryGen2
      .then(tryGen1, () => tryGen1(null))
      .then(r => {
        setSendingIds(s => { const n = new Set(s); n.delete(o.id); return n; });
        if (r && r.ok) {
          useHomeStore.getState().markOk('shelly', `${outlets.filter(x => x.ip).length} device(s)`);
        } else {
          throw new Error(`Shelly ${ip} responded ${r?.status || 'unreachable'}`);
        }
      })
      .catch(err => revert(err, 'shelly'));
  };

  // Speaker handlers -- three sources, dispatched in order of preference:
  // (1) Spotify Connect (`_spotify` flag on the speaker -- transferTo / pause /
  //     setDeviceVolume on Spotify's Web API). Works without any LAN bridge so
  //     long as the speaker is linked to the user's Spotify account.
  // (2) Sonos node-sonos-http-api bridge (`_room` cached field). Local LAN
  //     control with full track metadata.
  // (3) Demo / no-op (just updates local state).
  const toggleSpeaker = (id) => {
    // Look up in effectiveSpeakers, NOT the raw speakers state -- the UI
    // renders the merged list, and discovered speakers exist ONLY there.
    // Looking up the raw list made clicks on them silently do nothing.
    const s = effectiveSpeakers.find(ss => ss.id === id);
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
    // Sonos Cloud path — play/pause acts on the speaker's GROUP.
    if (s._sonosCloud && s._groupId && hubConnected) {
      hubCommand('sonos-cloud', next ? 'play' : 'pause', { groupId: s._groupId });
      return;
    }
    // Hub path for Sonos speakers (hub-sourced rooms have _room or _zone).
    if (hubConnected && s._room) {
      hubCommand('sonos', next ? 'play' : 'pause', { room: s._room });
      return;
    }
    const cfg = integrations.config.sonos;
    if (cfg?.url && s._room) {
      sonosCmd(cfg, s._room, next ? 'play' : 'pause')
        .catch(e => logActivity('speaker', `Sonos error: ${e.message || e}`));
      return;
    }
    // Direct Sonos UPnP path — discovered speaker with IP but no bridge configured.
    if (s._protocol === 'sonos' && s._ip) {
      sonosUPnPCmd(s._ip, next ? 'play' : 'pause').catch(() => {});
    }
  };
  const setVolume = (id, v) => {
    setSpeakers(sp => sp.map(s => s.id === id ? { ...s, volume: v, on: v > 0 ? true : s.on } : s));
    if (groupAll) setGroupAll(false);
    // Merged list, same reason as toggleSpeaker.
    const s = effectiveSpeakers.find(ss => ss.id === id);
    if (!s) return;
    if (s._spotify) {
      spotify.setDeviceVolume(id, v).catch(e => logActivity('speaker', `Spotify volume: ${e.message || e}`));
      return;
    }
    // Sonos Cloud path — per-player volume (grouping-aware).
    if (s._sonosCloud && hubConnected) {
      hubCommand('sonos-cloud', 'playerVolume', { playerId: id, volume: Math.round(v) });
      return;
    }
    // Hub path for Sonos volume.
    if (hubConnected && s._room) {
      hubCommand('sonos', 'volume', { room: s._room, value: Math.round(v) });
      return;
    }
    const cfg = integrations.config.sonos;
    if (cfg?.url && s._room) {
      sonosCmd(cfg, s._room, 'volume', String(Math.round(v)))
        .catch(e => logActivity('speaker', `Sonos error: ${e.message || e}`));
      return;
    }
    if (s._protocol === 'sonos' && s._ip) {
      sonosUPnPCmd(s._ip, 'volume', { volume: v }).catch(() => {});
    }
  };
  // Group all: ON groups every speaker to the lead room and turns them on;
  // OFF restores each speaker to standalone. When Sonos Cloud is authorized
  // this is REAL grouping via the Control API (createGroup/setGroupMembers on
  // the hub); otherwise it stays the optimistic local-state version.
  const setGroup = () => {
    const next = !groupAll;
    setGroupAll(next);
    setSpeakers(sp => sp.map(s => next
      ? { ...s, on: true, source: s.primary ? 'Now playing' : 'Living room' }
      : { ...s, source: s.primary ? 'Now playing' : 'Standalone' }
    ));
    if (sonosCloud?.authorized && hubConnected) {
      hubCommand('sonos-cloud', next ? 'groupAll' : 'ungroupAll', {});
      logActivity('speaker', next ? 'Sonos: **party mode** — all speakers grouped' : 'Sonos: speakers **ungrouped**');
      return;
    }
    logActivity('speaker', next ? 'Speakers **grouped** to lead room' : 'Speakers **ungrouped**');
  };

  // Keyboard shortcuts (Home page scenes):
  //   1–5  → apply Scenes in order
  //   0    → All off (last scene)
  //   Esc  → clear active scene (return to free-form)
  //   g    → go to Home (the global default)
  // We bail when focus is inside an input/textarea/contenteditable so the
  // shortcuts don't fight form input. (Handler registered after embed so
  // embed.togglePlay is in scope when the dependency array is evaluated.)

  // Per-page sub-headers share a thinner version of the welcome row from Home
  // — the photo + clock makes everything feel like one product.

  // Resolve the active music source → Spotify URI (e.g. spotify:album:xxx).
  // The iFrame API loads URIs, not full embed URLs. Custom (search/library/
  // favourite picks) wins over curated.
  const [musicType, musicId] = useMemo(() => {
    if (musicCustom) return [musicCustom.type, musicCustom.id];
    if (!musicSource) return [null, null];
    const s = MUSIC_SOURCES.find(s => s.id === musicSource) ?? MUSIC_SOURCES[0];
    return s.embed.split('/');
  }, [musicSource, musicCustom]);
  // null URI → embed stays blank; only loads when user explicitly picks something.
  const musicUri = musicType && musicId ? `spotify:${musicType}:${musicId}` : null;
  const musicNowLabel = musicCustom?.label ?? (musicSource ? (MUSIC_SOURCES.find(s => s.id === musicSource)?.name ?? 'Music') : 'Music');
  const musicNowSub   = musicCustom?.sub   ?? (musicSource ? (MUSIC_SOURCES.find(s => s.id === musicSource)?.sub  ?? '') : '');

  // When connected but no source is explicitly chosen, fall back to the
  // currently-playing album so the embed shows the user's own content rather
  // than the hardcoded Top Hits default. Explicit picks always win.
  const playbackAlbumUri = useHomeStore(s => s.playback.albumUri);
  const effectiveMusicUri = musicUri ?? (spotify.token ? (playbackAlbumUri || null) : null);

  // Wire the Spotify iFrame API + oEmbed metadata at App level so both the
  // header player and the Music page can read playback state and drive it.
  const embed = useSpotifyEmbed(effectiveMusicUri);
  const oembed = useSpotifyOEmbed(musicType, musicId);

  // Keyboard shortcuts — registered here so embed.togglePlay is available.
  const togglePlay = embed.togglePlay;
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tgt = e.target;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return;
      if (e.key === 'Escape' && activeScene) { breakScene(); e.preventDefault(); return; }
      if (e.key === 'g' || e.key === 'G') { navigate('home'); e.preventDefault(); return; }
      if (e.key === ' ' && route === 'music') { togglePlay(); e.preventDefault(); return; }
      if (route !== 'home') return;
      const idx = (e.key === '0') ? 4 : (parseInt(e.key, 10) - 1);
      if (plejdScenes.length > 0) {
        if (Number.isInteger(idx) && idx >= 0 && idx < plejdScenes.length) {
          activatePlejdScene(plejdScenes[idx].id, plejdScenes[idx].title);
          e.preventDefault();
        }
      } else if (Number.isInteger(idx) && idx >= 0 && idx < SCENES.length) {
        applyScene(SCENES[idx]);
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [applyScene, breakScene, activeScene, route, navigate, togglePlay]);

  // Gate: no signed-in user => render only the startup screen. Skips the
  // sidebar, persistent player, and main column entirely so the user can't
  // tab into them. As soon as google.user lands, this branch falls away and
  // the app boots normally. Once signed in, this branch is never reached
  // again until the user explicitly signs out -- which is the "do not show
  // that screen again" semantic the user asked for.
  if (!google.user) {
    return <StartupScreen google={google} />;
  }

  return (
    <div className="app">
      <Sidebar route={route} onNavigate={navigate} google={google} />
      <BottomNav route={route} onNavigate={navigate} />
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
            user={google.user}
            playingSpeaker={playingSpeakerName}
          />
          <EnvSeedPrompt
            items={pendingEnvCreds}
            onApply={applyPendingEnv}
            onApplyAll={applyAllPendingEnv}
            onSkipAll={skipAllPendingEnv}
          />
          <FirstRunBanner
            demoMode={demoMode}
            google={google}
            spotifyConnected={!!spotify.token}
            anyRealIntegration={
              !!(integrations.config.plejd?.url || integrations.config.sonos?.url || (integrations.config.shelly?.devices?.length))
            }
            onNavigate={navigate}
          />
          {route === 'home' && (
            <HomePage
              rooms={rooms} outlets={outlets} speakers={effectiveSpeakers}
              onCount={onCount} litWatts={litWatts} outletWatts={outletWatts} speakerWatts={speakerWatts} totalW={totalW}
              groupAll={groupAll} setGroup={setGroup}
              toggleRoom={toggleRoom} setBrightness={setBrightness} setAllLights={setAllLights}
              toggleDevice={toggleDevice} setDeviceBrightness={setDeviceBrightness}
              expandedRooms={expandedRooms} toggleRoomExpand={toggleRoomExpand}
              toggleOutlet={toggleOutlet}
              toggleSpeaker={toggleSpeaker} setVolume={setVolume}
              hideSpeaker={hideSpeaker} hiddenSpeakerCount={hiddenSpeakerIds.size} unhideAllSpeakers={unhideAllSpeakers}
              activeScene={activeScene} activeSceneAt={activeSceneAt} now={now}
              applyScene={applyScene} breakScene={breakScene}
              plejdScenes={plejdScenes} activatePlejdScene={activatePlejdScene}
              activity={activity}
              spotify={spotify}
              sendingIds={sendingIds} failedIds={failedIds} failedCommands={failedCommands}
            />
          )}
          {route === 'rooms' && (
            <RoomsPage
              rooms={rooms} toggleRoom={toggleRoom} setBrightness={setBrightness} setAllLights={setAllLights}
              toggleDevice={toggleDevice} setDeviceBrightness={setDeviceBrightness}
              expandedRooms={expandedRooms} toggleRoomExpand={toggleRoomExpand}
              applyScene={applyScene} activeScene={activeScene}
              plejdScenes={plejdScenes} activatePlejdScene={activatePlejdScene}
            />
          )}
          {route === 'music' && (
            <MusicPage
              speakers={effectiveSpeakers}
              toggleSpeaker={toggleSpeaker}
              setVolume={setVolume}
              hideSpeaker={hideSpeaker}
              musicSource={musicSource}
              pickCurated={pickCurated}
              musicCustom={musicCustom}
              playSpotify={playSpotify}
              spotify={spotify}
              favourites={musicFavs}
              addFav={addFav}
              removeFav={removeFav}
              musicNowLabel={musicNowLabel}
              navigate={navigate}
            />
          )}
          {route === 'energy' && (
            <>
              <HeatPumpSection />
              <EnergyPage rooms={rooms} outlets={outlets} speakers={speakers}
                totalW={totalW} litWatts={litWatts} outletWatts={outletWatts} speakerWatts={speakerWatts}
                tibberPrices={tibberPrices} tibberErr={tibberErr}
                tibberConfigured={integrations.status('tibber') === 'configured'}
                now={now} />
            </>
          )}
          {route === 'weather' && (
            <WeatherPage weather={weather} weatherData={weatherData} weatherErr={weatherErr} city={integrations.config.weather?.city || 'Stockholm'} now={now} />
          )}
          {route === 'news' && (
            <NewsPage />
          )}
          {route === 'settings' && (
            <SettingsPage
              rooms={rooms} outlets={outlets} speakers={effectiveSpeakers} activity={activity}
              spotify={spotify} google={google} integrations={integrations}
              demoMode={demoMode} onLoadDemo={loadDemoData} onClearDemo={clearDemoData}
              hubConnected={hubConnected}
            />
          )}

          <footer className="page-footer">
            <span>Home Domain Server · LAN-only · every device reached over Wi‑Fi, never via vendor cloud</span>
            <span className="mono">{now.toLocaleString('en-GB', { dateStyle: 'medium' })}</span>
          </footer>
        </div>
      </main>
      {undoStack.length > 0 && (
        <div key={undoStack[undoStack.length - 1].uid} className="undo-chip">
          <span className="undo-label">{undoStack[undoStack.length - 1].label}</span>
          <button className="undo-btn" onClick={() => {
            const item = undoStack[undoStack.length - 1];
            item.revert();
            setUndoStack(s => s.filter(x => x.uid !== item.uid));
          }}>Undo</button>
        </div>
      )}
      {route === 'home' && (
        <div className="key-hints">
          <span><kbd>1–5</kbd>scenes</span>
          <span><kbd>G</kbd>home</span>
          <span><kbd>Esc</kbd>clear scene</span>
        </div>
      )}
      {route === 'music' && (
        <div className="key-hints">
          <span><kbd>Space</kbd>play/pause</span>
        </div>
      )}
    </div>
  );
}

// HomePage — Music + Sound + Lights + Power + Scenes + Activity
// (extracted from App so each page can render independently)
// ─────────────────────────────────────────────────────────────────────────────
function HomePage({
  rooms, outlets, speakers,
  onCount, litWatts, outletWatts, speakerWatts, totalW,
  groupAll, setGroup,
  toggleRoom, setBrightness, setAllLights,
  toggleDevice, setDeviceBrightness,
  expandedRooms = new Set(), toggleRoomExpand,
  toggleOutlet,
  toggleSpeaker, setVolume,
  hideSpeaker, hiddenSpeakerCount = 0, unhideAllSpeakers,
  activeScene, activeSceneAt, now,
  applyScene, breakScene,
  plejdScenes = [], activatePlejdScene,
  activity,
  spotify,
  sendingIds, failedIds, failedCommands,
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
      {/* Hierarchy: Scenes and Lights master surface first — they are the
          5-second actions a family member runs on entering the house. Music,
          Sound, Power, Sensors, and Activity follow. The order here IS the
          dashboard's information hierarchy; do not rearrange without
          rechecking the 5-second test from CLAUDE.md. */}
      <Section
        title="Scenes"
        source="local"
        summary={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 0 }}>
            One tap. Affects <b style={{ margin: '0 4px' }}>{rooms.length}</b> rooms, <b style={{ margin: '0 4px' }}>{outlets.filter(o => !o.alwaysOn).length}</b> outlets, <b style={{ margin: '0 4px' }}>{speakers.length}</b> speakers.
            {activeScene && activeSceneAt && (
              <span className="scene-timer">
                <span className="mono">{SCENES.find(s => s.id === activeScene)?.label || plejdScenes.find(s => s.id === activeScene)?.title}</span>
                · Active <span className="mono">{fmtAgo(activeSceneAt, now)}</span>
                <button className="clear-btn" onClick={breakScene} title="Clear active scene" aria-label="Clear active scene">×</button>
              </span>
            )}
          </span>
        }
      >
        <div className="scenes">
          {plejdScenes.length > 0
            ? plejdScenes.map((sc, i) => (
                <button
                  key={sc.id}
                  className="scene"
                  data-active={activeScene === sc.id}
                  onClick={() => activatePlejdScene(sc.id, sc.title)}
                  title={sc.title}
                >
                  <span className="scene-key">{String(i + 1)}</span>
                  <span className="scene-icon"><I.Layers size={18} /></span>
                  <div>
                    <div className="scene-label">{sc.title}</div>
                  </div>
                </button>
              ))
            : SCENES.map((scene, i) => {
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
              })
          }
        </div>
      </Section>

      <Section
        title="Lights"
        statusId="plejd"
        source={rooms.length ? `${rooms.length} ${rooms.length === 1 ? 'room' : 'rooms'} · live` : 'no rooms yet'}
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
              <HoldToggle
                on={onCount > 0}
                onToggle={() => setAllLights(onCount === 0)}
                ariaLabel="Toggle all lights"
              />
            </div>
            <div className="lights-grid">
              {rooms.map(r => (
                <RoomCard
                  key={r.id}
                  room={r}
                  onToggle={() => toggleRoom(r.id)}
                  onBrightness={(b) => setBrightness(r.id, b)}
                  onToggleDevice={(devId, on) => toggleDevice(r.id, devId, on)}
                  onDeviceBrightness={(devId, b) => setDeviceBrightness(r.id, devId, b)}
                  expanded={expandedRooms.has(r.id)}
                  onExpandToggle={() => toggleRoomExpand(r.id)}
                  sending={sendingIds.has(r.id)}
                  failed={failedIds.has(r.id)}
                  retryFn={failedCommands.get(r.id)}
                />
              ))}
            </div>
          </div>
        ) : (
          <EmptyIntegration title="No rooms found" sub="Add a Home Assistant URL + token in Settings → Integrations to surface your Plejd lights." />
        )}
      </Section>

      <Section
        title="Music"
        statusId="spotify"
        source={null}
        summary={<>Streaming to <b>{speakers.filter(s => s.on).length}</b> of <b>{speakers.length}</b> rooms</>}
      >
        <NowPlaying speakers={speakers} onCastToggle={handleCastToggle} spotify={spotify} />
      </Section>

      <Section
        title="Sound"
        statusId="sonos"
        source={speakers.length ? `${speakers.length} ${speakers.length === 1 ? 'zone' : 'zones'} · live` : 'no speakers yet'}
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
              <SpeakerCard key={sp.id} speaker={sp} onToggle={() => toggleSpeaker(sp.id)} onVolume={(v) => setVolume(sp.id, v)} onHide={hideSpeaker ? () => hideSpeaker(sp.id) : undefined} />
            ))}
          </div>
        ) : (
          <EmptyIntegration title="No speakers found" sub="Sign in with Sonos in Settings — or connect Spotify and your Connect devices appear here." />
        )}
        {hiddenSpeakerCount > 0 && (
          <button className="group-toggle" style={{ marginTop: 8 }} onClick={unhideAllSpeakers}>
            {hiddenSpeakerCount} hidden speaker{hiddenSpeakerCount > 1 ? 's' : ''} — show
          </button>
        )}
      </Section>

      <Section
        title="Power"
        statusId="shelly"
        source={outlets.length ? `${outlets.length} ${outlets.length === 1 ? 'outlet' : 'outlets'} · live` : 'no outlets yet'}
        summary={outlets.length
          ? <>Live load <b className="mono">{outletWatts} W</b> across {outlets.filter(o=>o.on).length} outlets</>
          : <>No outlets configured</>}
      >
        {outlets.length ? (
          <div className="power-grid">
            <div className="outlets">
              {outlets.map(o => <OutletRow key={o.id} outlet={o} onToggle={() => toggleOutlet(o.id)} sending={sendingIds.has(o.id)} failed={failedIds.has(o.id)} retryFn={failedCommands.get(o.id)} />)}
            </div>
            <PowerLive outlets={outlets} totalW={totalW} litWatts={litWatts} outletWatts={outletWatts} speakerWatts={speakerWatts} />
          </div>
        ) : (
          <EmptyIntegration title="No outlets configured" sub="Add Shelly device IPs in Settings → Integrations." />
        )}
      </Section>

      <SensorsSection />

      <Section
        title="Activity"
        source="local"
        summary={<>Last <b>{activity.length}</b> {activity.length === 1 ? 'action' : 'actions'}</>}
      >
        <ActivityLog items={activity} now={now} />
      </Section>
    </>
  );
}

// SensorsSection -- generic Home Assistant entity tiles. The user lists
// entity IDs in Settings -> Integrations -> Plejd / HA sensors; the section
// hides entirely when nothing is pinned. Each tile shows label, current
// state, unit, and a "fresh / stale" tint based on lastChanged age. No
// vendor jargon ("HA", "entity_id") on the home page; that's Settings turf.
function SensorsSection() {
  // Read HA creds (reusing the plejd config block -- they're the same auth
  // pair) and the user's pinned entity list straight from localStorage.
  let entitiesCfg = [];
  let haCreds = null;
  try {
    const raw = localStorage.getItem('hdg-integrations');
    if (raw) {
      const cfg = JSON.parse(raw);
      haCreds = cfg.plejd; // reuse Plejd's HA URL + token
      entitiesCfg = cfg.ha?.entities || [];
    }
  } catch (e) {}
  const entityIds = useMemo(() => entitiesCfg.map(e => e.id), [JSON.stringify(entitiesCfg)]);
  const pageVisible = usePageVisible();
  const rows = useHaEntities(entityIds, haCreds, { pollMs: 20_000, pageVisible });

  if (!entitiesCfg.length) return null; // section disappears entirely

  return (
    <Section
      title="Sensors"
      statusId="plejd" /* same auth = same status dot */
      source={entitiesCfg.length ? `${entitiesCfg.length} pinned` : 'none pinned'}
      summary={<>Live state from the home network. Pin more in <b>Settings</b>.</>}
    >
      <div className="sensors-grid">
        {entitiesCfg.map((meta) => {
          const row  = rows.get(meta.id);
          const Ic   = I[meta.icon] ?? I.Home;
          const stale = row && !row.err && row.lastChanged
            ? (Date.now() - new Date(row.lastChanged).getTime()) > 6 * 60 * 60_000
            : false;
          return (
            <div key={meta.id} className="sensor-tile" data-stale={stale} data-err={!!row?.err}>
              <div className="sensor-tile-head">
                <span className="sensor-tile-icon"><Ic size={14} /></span>
                <div className="sensor-tile-label">{meta.label || meta.id}</div>
              </div>
              <div className="sensor-tile-value mono">
                {row?.err ? '—' : (row?.state ?? '…')}
                {meta.unit && row?.state != null && !row.err && <span className="sensor-tile-unit">{meta.unit}</span>}
              </div>
              {row?.err && <div className="sensor-tile-err">{row.err.slice(0, 50)}</div>}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pieces
// ─────────────────────────────────────────────────────────────────────────────
function PageHeader({ now, onCount, totalW, deviceCount, weather, weatherData, city, route, playback, togglePlay, seekRel, oembed, musicLabel, musicSub, onOpenMusic, user, playingSpeaker }) {
  const lanLost = useHomeStore(s => s.lanLost);
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
    rooms:    `Lights · ${onCount} on now`,
    music:    `Streaming to ${playingSpeaker || 'home'} · ${deviceCount} devices online`,
    energy:   `${totalW} W now · live`,
    weather:  `${condLabel} · ${city}`,
    news:     `Sveriges Radio · TT`,
    settings: `Devices, integrations, and about`,
  };
  return (
    <header className="page-header">
      <div className="welcome-row">
        <span className="welcome-text">{greeting}{user?.given_name || user?.name ? `, ${user.given_name || user.name.split(' ')[0]}` : ''}.</span>
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
            <span
              className="wifi-pill"
              data-lost={lanLost || undefined}
              onClick={lanLost ? () => window.location.reload() : undefined}
              title={lanLost ? 'Network lost — tap to retry' : undefined}
            >
              <span className="wifi-dot" />
              {lanLost
                ? 'Network lost'
                : <>{deviceCount} on Wi‑Fi<span className="wifi-sub mono">home.local</span></>}
            </span>
          </div>
          <div className="weather-hero">
            <a className="weather-hero-icon" href="#weather" title="Open Weather" aria-label="Open Weather">
              <span key={code ?? 'init'} className="weather-icon-mount"><WIcon size={44} /></span>
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

// MaskedSecret -- one component handles every "the value is set, don't make
// the user stare at it; let them change it when they want to" interaction.
// The default view shows ••••••••••<last 4 chars> in a read-only input. Click
// "Change" to swap to a real password input + Save / Cancel. Empty values
// start in edit mode (there's nothing to mask yet).
//
// Why not just <input type="password">? Browsers reveal the value on focus or
// via DevTools, the read-only "•••e9c" pattern is the idiot-proof default the
// user asked for. Tokens stop appearing in over-the-shoulder screenshots.
function MaskedSecret({ value, onSave, placeholder, type = 'password', autoComplete = 'off' }) {
  const [editing, setEditing] = useState(!value);
  const [draft, setDraft] = useState(value || '');
  useEffect(() => { setDraft(value || ''); setEditing(!value); }, [value]);
  const masked = value
    ? '••••••••' + String(value).slice(-4)
    : '';

  if (editing) {
    return (
      <div className="masked-secret">
        <input
          className="settings-input"
          type={type}
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoComplete={autoComplete}
          spellCheck="false"
        />
        <button
          className="group-toggle"
          data-active="true"
          onClick={() => { onSave(draft.trim()); setEditing(false); }}
          disabled={!draft.trim()}
        >Save</button>
        {value && (
          <button className="group-toggle" onClick={() => { setDraft(value); setEditing(false); }}>
            Cancel
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="masked-secret">
      <input className="settings-input" type="text" value={masked} readOnly aria-label="Stored value (masked)" />
      <button className="group-toggle" onClick={() => setEditing(true)}>Change</button>
    </div>
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

function DeviceIcon({ type }) {
  // Map Plejd device type codes to icons. Falls back to Light for unknowns.
  if (/relay|outlet|plug/i.test(type || '')) return <I.Plug size={14} />;
  if (/dim|light|lux|pendant|spot|strip/i.test(type || '')) return <I.Light size={14} />;
  if (/button|switch|wph/i.test(type || '')) return <I.Plug size={14} />;
  return <I.Light size={14} />;
}

function RoomCard({ room, onToggle, onBrightness, onToggleDevice, onDeviceBrightness, expanded, onExpandToggle, sending, failed, retryFn }) {
  const flick = useFlicker([room.on]);
  // CSS variable controls the warm glow opacity inside the card
  const glow = room.on ? 0.04 + (room.brightness / 100) * 0.18 : 0;
  // Only show expand button when there are multiple individual devices to control
  const hasDevices = Array.isArray(room._cloudDevices) && room._cloudDevices.length > 1;

  return (
    <div className="light-room" data-on={room.on} data-sending={sending ? 'true' : undefined} data-failed={failed ? 'true' : undefined} data-expanded={expanded ? 'true' : undefined} style={{ '--glow': glow }}>
      {flick > 0 && room.on && <div key={flick} className="flick" />}
      <div className="room-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <div style={{ minWidth: 0 }}>
            <div className="room-name">{room.name}</div>
            <span className="bulb-pill">
              <span className="dot-on" />
              {room.bulbs} {room.bulbs === 1 ? 'bulb' : 'bulbs'}
            </span>
          </div>
          {hasDevices && (
            <button
              className="expand-btn"
              data-expanded={expanded}
              onClick={onExpandToggle}
              aria-label={expanded ? 'Collapse device list' : 'Expand device list'}
              aria-expanded={expanded}
            >
              <I.ChevronRight size={14} style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 200ms var(--motion-ease-out-quart)' }} />
            </button>
          )}
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

      {expanded && hasDevices && (
        <div className="device-list">
          {room._cloudDevices.map(d => (
            <div key={d.id} className="device-row" data-on={d.isOn}>
              <span className="device-icon"><DeviceIcon type={d.type} /></span>
              <span className="device-name">{d.name}</span>
              {d.dimmable !== false && (
                <Slider
                  value={d.isOn ? (d.dim != null ? Math.round((d.dim / 255) * 100) : 100) : 0}
                  onChange={(b) => onDeviceBrightness?.(d.id, b)}
                  disabled={!d.isOn}
                  compact
                />
              )}
              <Toggle on={d.isOn} onToggle={() => onToggleDevice?.(d.id, !d.isOn)} ariaLabel={`Toggle ${d.name}`} />
            </div>
          ))}
        </div>
      )}

      {failed && retryFn && (
        <button className="card-retry" onClick={retryFn} aria-label="Retry command">Retry</button>
      )}
    </div>
  );
}

function OutletRow({ outlet, onToggle, sending, failed, retryFn }) {
  const Ic = I[outlet.icon] ?? I.Plug;
  return (
    <div className="outlet" data-on={outlet.on} data-sending={sending ? 'true' : undefined} data-failed={failed ? 'true' : undefined}>
      <div className="outlet-icon"><Ic size={16} /></div>
      <div>
        <div className="outlet-name">{outlet.name}</div>
        <div className="outlet-room">
          {outlet.room}
          {outlet.alwaysOn && <span style={{ marginLeft: 8, color: 'var(--primary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em' }}>Always on</span>}
        </div>
        {failed && retryFn && (
          <button className="card-retry" onClick={retryFn} aria-label="Retry command" style={{ marginTop: 4 }}>Retry</button>
        )}
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

  // Real whole-home power from the Tibber Pulse when streaming.
  const livePower = useHomeStore(s => s.livePower);
  const isLive = livePower.watts != null && livePower.ts != null && (Date.now() - livePower.ts) < 30_000;

  const cats = [
    { name: 'Lights',   val: Math.round(litWatts),    color: 'var(--chart-1)' },
    { name: 'Outlets',  val: Math.round(outletWatts), color: 'var(--chart-2)' },
    { name: 'Speakers', val: Math.round(speakerWatts),color: 'var(--chart-3)' },
  ];

  return (
    <div className="power-live">
      <div>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--muted-foreground)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          Live draw
          {isLive
            ? <span title="Real-time from Tibber Pulse" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--primary)', fontSize: 9 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)' }} />LIVE</span>
            : <span title="Estimated from device states — no live meter" style={{ opacity: 0.6, fontSize: 9 }}>EST</span>}
        </div>
        <div className="live-watts mono">
          {totalW}<span className="unit">W</span>
        </div>
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'flex-end', gap: 3, height: 36 }}>
          {history.map((v, i) => (
            <div key={i} style={{
              flex: 1,
              height: '100%',
              background: i === history.length - 1 ? 'var(--primary)' : 'color-mix(in oklch, var(--clay-50) 16%, transparent)',
              borderRadius: 1,
              transform: `scaleY(${Math.max(v / max, 0.056)})`,
              transformOrigin: 'bottom',
              transition: 'transform 600ms var(--motion-ease-out-quart)',
            }} />
          ))}
        </div>
      </div>

      <div className="live-legend">
        {/* When live, the sum is real but per-source split isn't measurable —
            keep the estimated breakdown but mark it with ~. */}
        {cats.map(c => (
          <div className="legend-row" key={c.name}>
            <span className="legend-swatch" style={{ background: c.color }} />
            <span className="legend-name">{c.name}</span>
            <span className="legend-val">{isLive ? '~' : ''}{c.val} W</span>
          </div>
        ))}
      </div>

      <div className="live-meta">
        <TibberPriceCell totalW={totalW} />
        {isLive && livePower.todayKwh != null
          ? <span title="Accumulated today from Tibber Pulse">Today <b className="mono">{livePower.todayKwh.toFixed(1)} kWh</b></span>
          : <span title="Projected from current draw">This hour <b className="mono">{(totalW * 0.001).toFixed(2)} kWh</b></span>}
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

// Small popover that appears when clicking the room name in the NowPlaying
// hero. Lists every Sonos zone with a mini-toggle so the user can choose
// which rooms to cast to without leaving the hero.
function SpeakerPicker({ speakers, onToggle, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey  = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [onClose]);
  return (
    <div className="np-picker" ref={ref} role="dialog" aria-modal="true" aria-label="Choose rooms">
      {speakers.length === 0 && (
        <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--muted-foreground)' }}>
          No speakers configured
        </div>
      )}
      {speakers.map(sp => (
        <button
          key={sp.id}
          className="np-picker-row"
          data-on={sp.on}
          data-paused={sp.paused}
          onClick={() => onToggle(sp)}
          aria-pressed={sp.on}
          aria-label={`${sp.on ? 'Turn off' : 'Turn on'} ${sp.name}`}
        >
          <span className="np-picker-dot" />
          <span className="np-picker-info">
            <span className="np-picker-name">{sp.name}</span>
            {(sp.source) && (
              <span className="np-picker-track">
                {sp.paused && !sp.on ? 'â¸ ' : ''}{sp.source}
              </span>
            )}
          </span>
          <span className="np-picker-toggle" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

function NowPlaying({ speakers, onCastToggle, spotify, hideNavActions }) {
  const playback     = useHomeStore(s => s.playback);
  const spotifyState = useHomeStore(s => s.status.spotify);
  const isConnected  = spotifyState.state === 'ok';
  const hasTrack     = !!playback.track;
  const onCount      = speakers.filter(s => s.on).length;
  const activeSpeaker = speakers.find(s => s.primary || s.on);

  // Speaker picker (room-selector) popover state
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerWrapRef = useRef(null);

  // Optimistic play/pause toggle so the button responds instantly.
  const [toggling, setToggling] = useState(false);
  const handlePlayPause = async () => {
    if (!spotify?.token || toggling) return;
    setToggling(true);
    try {
      if (playback.isPlaying) {
        await spotify.pausePlay(playback.deviceId);
        useHomeStore.getState().setPlayback({ ...useHomeStore.getState().playback, isPlaying: false });
      } else {
        await spotify.resumePlay(playback.deviceId);
        useHomeStore.getState().setPlayback({ ...useHomeStore.getState().playback, isPlaying: true });
      }
    } finally {
      setToggling(false);
    }
  };

  // Progress bar: interpolate locally between polls (Spotify polls every 8s).
  const [localMs, setLocalMs] = useState(playback.progressMs || 0);
  useEffect(() => { setLocalMs(playback.progressMs || 0); }, [playback.progressMs]);
  useEffect(() => {
    if (!playback.isPlaying || !playback.durationMs) return;
    const t = setInterval(() => setLocalMs(ms => Math.min(ms + 1000, playback.durationMs)), 1000);
    return () => clearInterval(t);
  }, [playback.isPlaying, playback.durationMs]);

  const progress = playback.durationMs ? (localMs / playback.durationMs) * 100 : 0;
  const fmtTime = (ms) => {
    const s = Math.floor((ms ?? 0) / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  // If Sonos has a paused (or active) track we can show a real mini-player
  // without requiring Spotify at all. Pick the best candidate: a playing
  // speaker first, then the most recently paused one with a known track.
  const sonosSpeaker = speakers.find(s => s.on && s.source)
                    || speakers.find(s => s.paused && s.source);

  // Show real player if connected + has a track.
  if (!isConnected || !hasTrack) {
    // If the Sonos bridge has something paused/playing, show a Sonos mini-
    // player instead of the generic embed — much more honest and actionable.
    if (sonosSpeaker) {
      return (
        <div className="music-hero music-hero--live">
          <div className="np-art-wrap">
            <div className="np-art np-art--placeholder"><BrandSonos size={36} /></div>
          </div>
          <div className="music-hero-side">
            <div className="np-meta">
              <div className="np-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {sonosSpeaker.on ? 'Now playing' : 'Paused'}
                <span style={{ color: 'var(--muted-foreground)', fontSize: 9 }}> · </span>
                <div className="np-picker-wrap" ref={pickerWrapRef}>
                  <button
                    className="np-room-btn"
                    data-open={pickerOpen}
                    onClick={() => setPickerOpen(v => !v)}
                    aria-expanded={pickerOpen}
                    aria-haspopup="dialog"
                  >
                    {sonosSpeaker.name}
                    <Icon size={10}><path d="m6 9 6 6 6-6"/></Icon>
                  </button>
                  {pickerOpen && (
                    <SpeakerPicker
                      speakers={speakers}
                      onToggle={(sp) => { onCastToggle(sp); }}
                      onClose={() => setPickerOpen(false)}
                    />
                  )}
                </div>
              </div>
              <div className="np-title-big">{sonosSpeaker.source}</div>
              {sonosSpeaker.artist && <div className="np-source mono">{sonosSpeaker.artist}</div>}
            </div>
            <div className="np-transport">
              <button
                className="np-ctrl np-ctrl--play"
                onClick={() => onCastToggle(sonosSpeaker)}
                aria-label={sonosSpeaker.on ? `Pause ${sonosSpeaker.name}` : `Resume ${sonosSpeaker.name}`}
              >
                {sonosSpeaker.on ? <I.Pause size={20} /> : <I.Play size={20} />}
              </button>
            </div>
            {!hideNavActions && (
              <div className="hero-actions">
                <button className="group-toggle" onClick={() => { window.location.hash = '#music'; }}>
                  <I.Music size={11} /> Open Music
                </button>
                {!isConnected && (
                  <button className="group-toggle" data-active="true" onClick={() => { window.location.hash = '#settings'; }}>
                    <BrandSpotify size={11} /> Connect Spotify
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }

    // Nothing playing — clean idle state, no demo iframe.
    return (
      <div className="music-hero music-hero--live">
        <div className="np-art-wrap">
          <div className="np-art np-art--placeholder">
            <BrandSpotify size={32} />
          </div>
        </div>
        <div className="music-hero-side">
          <div className="np-meta">
            <div className="np-label">Music</div>
            <div className="np-title-big" style={{ fontSize: 18 }}>
              {isConnected ? 'Nothing playing' : 'Connect Spotify'}
            </div>
            <div className="np-source mono">
              {isConnected ? 'Start something on any Spotify device' : 'Sign in via Settings → Spotify'}
            </div>
          </div>
          {!hideNavActions && !isConnected && (
            <div className="hero-actions">
              <button className="group-toggle" data-active="true" onClick={() => { window.location.hash = '#settings'; }}>
                <BrandSpotify size={11} /> Connect
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="music-hero music-hero--live">
      {/* Album art */}
      <div className="np-art-wrap">
        {playback.art
          ? <img src={playback.art} alt={playback.track} className="np-art" />
          : <div className="np-art np-art--placeholder"><BrandSpotify size={32} /></div>
        }
      </div>

      {/* Track info + controls */}
      <div className="music-hero-side">
        <div className="np-meta">
          <div className="np-label" style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            {playback.isPlaying ? 'Now playing' : 'Paused'}
            {(playback.deviceName || speakers.length > 0) && (
              <>
                <span style={{ color: 'var(--muted-foreground)', fontSize: 9 }}> · </span>
                <div className="np-picker-wrap">
                  <button
                    className="np-room-btn"
                    data-open={pickerOpen}
                    onClick={() => setPickerOpen(v => !v)}
                    aria-expanded={pickerOpen}
                    aria-haspopup="dialog"
                  >
                    {playback.deviceName || `${speakers.filter(s => s.on).length} rooms`}
                    <Icon size={10}><path d="m6 9 6 6 6-6"/></Icon>
                  </button>
                  {pickerOpen && (
                    <SpeakerPicker
                      speakers={speakers}
                      onToggle={(sp) => { onCastToggle(sp); }}
                      onClose={() => setPickerOpen(false)}
                    />
                  )}
                </div>
              </>
            )}
          </div>
          <div className="np-title-big">{playback.track}</div>
          <div className="np-source mono">{playback.artist}</div>
        </div>

        {/* Progress bar */}
        {playback.durationMs > 0 && (
          <div className="np-progress">
            <div className="np-progress-track">
              <div className="np-progress-fill" style={{ transform: `scaleX(${progress / 100})` }} />
            </div>
            <div className="np-progress-times">
              <span className="mono">{fmtTime(localMs)}</span>
              <span className="mono">{fmtTime(playback.durationMs)}</span>
            </div>
          </div>
        )}

        {/* Transport controls */}
        <div className="np-transport">
          <button
            className="np-ctrl"
            onClick={() => spotify.skipPrev()}
            title="Previous"
            aria-label="Previous track"
          >
            <I.Back size={16} />
          </button>
          <button
            className="np-ctrl np-ctrl--play"
            onClick={handlePlayPause}
            disabled={toggling}
            aria-label={playback.isPlaying ? 'Pause' : 'Play'}
          >
            {playback.isPlaying ? <I.Pause size={20} /> : <I.Play size={20} />}
          </button>
          <button
            className="np-ctrl"
            onClick={() => spotify.skipNext()}
            title="Next"
            aria-label="Next track"
          >
            <I.Skip size={16} />
          </button>
        </div>

        {/* Speaker rooms */}
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
                <span className="hero-room-name">No speakers</span>
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
          >
            <I.Speaker size={11} /> {activeSpeaker ? `${activeSpeaker.name}` : 'Cast to room'}
          </button>
          <button className="group-toggle" onClick={() => { window.location.hash = '#music'; }}>
            <I.Music size={11} /> Library
          </button>
        </div>
      </div>
    </div>
  );
}

function SpeakerCard({ speaker, onToggle, onVolume, onHide }) {
  return (
    <div className="speaker" data-on={speaker.on}>
      <div className="speaker-head">
        <div>
          <div className="speaker-name">{speaker.name}</div>
          <div className="speaker-source">
            {speaker.on ? (
              speaker.source || 'Playing'
            ) : speaker.paused && speaker.source ? (
              <><span style={{ opacity: 0.5, marginRight: 4 }}>⏸</span>{speaker.source}</>
            ) : (
              'Off'
            )}
            {speaker.primary && <span style={{ marginLeft: 8, color: 'var(--primary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em' }}>Lead</span>}
          </div>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {onHide && (
            <button
              className="music-source-rm"
              onClick={onHide}
              title={`Hide ${speaker.name} from this dashboard`}
              aria-label={`Hide ${speaker.name}`}
            >×</button>
          )}
          <Toggle on={speaker.on} onToggle={onToggle} ariaLabel={speaker.on ? `Turn off ${speaker.name}` : `Turn on ${speaker.name}`} />
        </span>
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

function RoomsPage({ rooms, toggleRoom, setBrightness, setAllLights, toggleDevice, setDeviceBrightness, expandedRooms = new Set(), toggleRoomExpand, applyScene, activeScene, plejdScenes = [], activatePlejdScene }) {
  const onCount    = rooms.filter(r => r.on).length;
  const totalBulbs = rooms.reduce((a, r) => a + r.bulbs, 0);
  const litBulbs   = rooms.reduce((a, r) => a + (r.on ? r.bulbs : 0), 0);

  // Room filter menu — unique group labels derived from live Plejd data.
  // For hub-pushed cards, r.name IS the room (no r.room set).
  // For direct-cloud devices, r.room is the Plejd room name.
  const [selectedRoom, setSelectedRoom] = useState(null); // null = All

  const roomGroups = useMemo(() => {
    const labels = new Set();
    rooms.forEach(r => { if (r.room || r.name) labels.add(r.room || r.name); });
    return Array.from(labels).sort();
  }, [rooms]);

  // Reset selection if the chosen room disappears (e.g. Plejd refresh).
  useEffect(() => {
    if (selectedRoom && !roomGroups.includes(selectedRoom)) setSelectedRoom(null);
  }, [roomGroups, selectedRoom]);

  const visibleRooms = selectedRoom
    ? rooms.filter(r => (r.room || r.name) === selectedRoom)
    : rooms;

  const visOnCount    = visibleRooms.filter(r => r.on).length;
  const visTotalBulbs = visibleRooms.reduce((a, r) => a + r.bulbs, 0);
  const visLitBulbs   = visibleRooms.reduce((a, r) => a + (r.on ? r.bulbs : 0), 0);

  // Toggle all lights in the active filter selection.
  const toggleAllVisible = useCallback(() => {
    const anyOn = visibleRooms.some(r => r.on);
    visibleRooms.forEach(r => { if (anyOn ? r.on : !r.on) toggleRoom(r.id); });
  }, [visibleRooms, toggleRoom]);

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
      <Section title="Rooms" summary={<>Add a Plejd bridge to surface your room setup.</>}>
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
        source="lights · live"
        summary={<>
          <b>{visOnCount}</b> of <b>{visibleRooms.length}</b> {selectedRoom ? `lights in ${selectedRoom}` : 'rooms'}
          {' · '}<b>{visLitBulbs}</b> of <b>{visTotalBulbs}</b> bulbs lit
        </>}
      >
        <div className="stack">
          {/* Room filter strip — pills derived from Plejd room configuration */}
          {roomGroups.length > 1 && (
            <div className="room-filter" role="toolbar" aria-label="Filter by room">
              <button
                className="room-filter-pill"
                data-active={selectedRoom === null}
                onClick={() => setSelectedRoom(null)}
              >
                All rooms
                <span className="room-filter-pill-count">{onCount}/{rooms.length}</span>
              </button>
              {roomGroups.map(group => {
                const groupRooms = rooms.filter(r => (r.room || r.name) === group);
                const groupOn    = groupRooms.filter(r => r.on).length;
                return (
                  <button
                    key={group}
                    className="room-filter-pill"
                    data-active={selectedRoom === group}
                    onClick={() => setSelectedRoom(g => g === group ? null : group)}
                  >
                    {group}
                    <span className="room-filter-pill-count">{groupOn}/{groupRooms.length}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="master">
            <div>
              <div className="master-title">{selectedRoom ?? 'All rooms'}</div>
              <div className="master-sub">
                {visLitBulbs} bulbs lit · {visOnCount} of {visibleRooms.length} on
              </div>
            </div>
            <div className="master-count mono">{visOnCount}/{visibleRooms.length}</div>
            <HoldToggle
              on={visOnCount > 0}
              onToggle={selectedRoom ? toggleAllVisible : () => setAllLights(visOnCount === 0)}
              ariaLabel={`Toggle ${selectedRoom ?? 'every room'}`}
            />
          </div>
          <div className="rooms-grid">
            {visibleRooms.map(r => {
              const hasDevices = Array.isArray(r._cloudDevices) && r._cloudDevices.length > 1;
              const isExpanded = expandedRooms.has(r.id);
              return (
                <div key={r.id} className="rooms-room" data-on={r.on} data-expanded={isExpanded ? 'true' : undefined}>
                  <div className="rooms-room-head">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <div style={{ minWidth: 0 }}>
                        <div className="rooms-room-name">{r.name}</div>
                        {!selectedRoom && r.room && (
                          <div className="rooms-room-group">{r.room}</div>
                        )}
                        <span className="bulb-pill">
                          <span className="dot-on" />
                          {r.bulbs} {r.bulbs === 1 ? 'bulb' : 'bulbs'}
                        </span>
                      </div>
                      {hasDevices && (
                        <button
                          className="expand-btn"
                          data-expanded={isExpanded}
                          onClick={() => toggleRoomExpand?.(r.id)}
                          aria-label={isExpanded ? 'Collapse device list' : 'Expand device list'}
                          aria-expanded={isExpanded}
                        >
                          <I.ChevronRight size={14} style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 200ms var(--motion-ease-out-quart)' }} />
                        </button>
                      )}
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

                  {isExpanded && hasDevices && (
                    <div className="device-list">
                      {r._cloudDevices.map(d => (
                        <div key={d.id} className="device-row" data-on={d.isOn}>
                          <span className="device-icon"><DeviceIcon type={d.type} /></span>
                          <span className="device-name">{d.name}</span>
                          {d.dimmable !== false && (
                            <Slider
                              value={d.isOn ? (d.dim != null ? Math.round((d.dim / 255) * 100) : 100) : 0}
                              onChange={(b) => setDeviceBrightness?.(r.id, d.id, b)}
                              disabled={!d.isOn}
                              compact
                            />
                          )}
                          <Toggle on={d.isOn} onToggle={() => toggleDevice?.(r.id, d.id, !d.isOn)} ariaLabel={`Toggle ${d.name}`} />
                        </div>
                      ))}
                    </div>
                  )}

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
              );
            })}
          </div>
        </div>
      </Section>

      <Section
        title="Global scenes"
        source="local"
        summary={<>Affect every room at once</>}
      >
        <div className="scenes">
          {plejdScenes.length > 0
            ? plejdScenes.map(sc => (
                <button
                  key={sc.id}
                  className="scene"
                  data-active={activeScene === sc.id}
                  onClick={() => activatePlejdScene(sc.id, sc.title)}
                >
                  <span className="scene-icon"><I.Layers size={18} /></span>
                  <div>
                    <div className="scene-label">{sc.title}</div>
                  </div>
                </button>
              ))
            : SCENES.map(scene => {
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
              })
          }
        </div>
      </Section>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ── PlayerStage ──────────────────────────────────────────────────────────────
// Replaces the Spotify embed red-branded iframe with a custom clay-theme player.
// When Spotify is connected the iframe is kept off-screen (audio continues),
// while this component renders track art, progress, transport, and upcoming queue.
// Falls back to the iframe anchor when Spotify is not connected.
// ─────────────────────────────────────────────────────────────────────────────
function PlayerStage({ spotify, recentlyPlayed, queue }) {
  const playback = useHomeStore(s => s.playback);
  const hasTrack = !!playback.track;
  const isPlaying = playback.isPlaying;

  // Interpolate progress locally between 8-second API polls.
  const [localMs, setLocalMs] = useState(playback.progressMs || 0);
  useEffect(() => { setLocalMs(playback.progressMs || 0); }, [playback.progressMs]);
  useEffect(() => {
    if (!isPlaying || !playback.durationMs) return;
    const t = setInterval(() => setLocalMs(ms => Math.min(ms + 1000, playback.durationMs)), 1000);
    return () => clearInterval(t);
  }, [isPlaying, playback.durationMs]);

  const progress = playback.durationMs ? (localMs / playback.durationMs) * 100 : 0;
  const fmt = (ms) => {
    const s = Math.floor((ms ?? 0) / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const handlePlayPause = () => {
    if (!spotify.token) return;
    const next = !isPlaying;
    useHomeStore.getState().setPlayback({ ...useHomeStore.getState().playback, isPlaying: next });
    if (next) spotify.resumePlay(playback.deviceId);
    else      spotify.pausePlay(playback.deviceId);
  };
  const handleNext = () => spotify.api('/me/player/next',     { method: 'POST' }).catch(() => {});
  const handlePrev = () => spotify.api('/me/player/previous', { method: 'POST' }).catch(() => {});
  const handleSeek = (e) => {
    if (!playback.durationMs) return;
    const r = e.currentTarget.getBoundingClientRect();
    const ms = Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * playback.durationMs);
    setLocalMs(ms);
    spotify.api('/me/player/seek?position_ms=' + ms, { method: 'PUT' }).catch(() => {});
  };

  // ── Cross-session resume ──────────────────────────────────────────────────
  // Read the last-played track from localStorage. The polling effect writes
  // it on every successful poll, so it always reflects the most recent track
  // and position. We only need it while idle, so skip the read while playing.
  const lastPlayback = useMemo(() => {
    if (hasTrack) return null;
    try { return JSON.parse(localStorage.getItem('hdg-last-playback') || 'null'); } catch { return null; }
  }, [hasTrack]); // recomputes when track state flips

  // -- Not connected: show iframe with hardcoded default
  if (!spotify.token) {
    return <div id="music-stage-anchor" className="music-page-frame music-page-frame-anchor" />;
  }

  // -- Connected: Spotify iFrame (account-linked) + our transport below
  // Always render the anchor so PersistentMusicPlayer overlays the Spotify
  // web player. Transport controls sit below the iframe in normal flow.
  const hasResume = !!(lastPlayback?.track && lastPlayback?.uri);
  return (
    <div className="player-stage player-stage--connected">
      {/* iFrame anchor -- PersistentMusicPlayer overlays Spotify web player here */}
      <div id="music-stage-anchor" className="player-embed-anchor" />

      {/* Transport strip -- shown below iframe when a track is active */}
      {hasTrack && (
        <div className="player-transport-strip">
          <div className="player-transport-art-wrap">
            {playback.art
              ? <img src={playback.art} alt="" className="player-transport-art" />
              : <div className="player-transport-art player-transport-art--empty"><I.Music size={14} /></div>
            }
          </div>
          <div className="player-transport-meta">
            <div className="player-transport-track">{playback.track}</div>
            <div className="player-transport-artist">{playback.artist}</div>
            <div
              className="player-stage-progress"
              onClick={handleSeek}
              role="slider" aria-label="Seek"
              aria-valuenow={localMs} aria-valuemin={0} aria-valuemax={playback.durationMs || 1}
              style={{ paddingBottom: 2 }}
            >
              <div className="player-stage-progress-bar">
                <div className="player-stage-progress-fill" style={{ width: `${progress}%` }} />
              </div>
            </div>
            <div className="player-stage-times">
              <span className="mono">{fmt(localMs)}</span>
              <span className="mono">{fmt(playback.durationMs)}</span>
            </div>
          </div>
          <div className="player-transport-controls">
            <button className="player-ctrl" onClick={handlePrev} aria-label="Previous track">
              <Icon size={15}><polygon points="19,20 9,12 19,4"/><line x1="5" y1="19" x2="5" y2="5"/></Icon>
            </button>
            <button className="player-ctrl player-ctrl--primary" onClick={handlePlayPause} aria-label={isPlaying ? 'Pause' : 'Play'}>
              {isPlaying
                ? <Icon size={20}><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></Icon>
                : <Icon size={20}><polygon points="5,3 19,12 5,21"/></Icon>
              }
            </button>
            <button className="player-ctrl" onClick={handleNext} aria-label="Next track">
              <Icon size={15}><polygon points="5,4 15,12 5,20"/><line x1="19" y1="5" x2="19" y2="19"/></Icon>
            </button>
          </div>
        </div>
      )}

      {/* Queue -- up next (compact, 2 rows) */}
      {hasTrack && queue?.length > 0 && (
        <div className="player-stage-queue player-stage-queue--inset">
          <span className="micro-label">Up next</span>
          {queue.slice(0, 2).map((t, i) => (
            <div key={`${t.id ?? i}`} className="player-stage-queue-row">
              {spImg(t)
                ? <img src={spImg(t)} alt="" width={28} height={28} style={{ borderRadius: 5, flexShrink: 0 }} />
                : <span className="src-icon" style={{ flexShrink: 0 }}><I.Music size={11} /></span>
              }
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="music-source-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
                <div className="music-source-sub">{t.artists?.[0]?.name ?? ''}</div>
              </div>
              <span className="mono" style={{ fontSize: 10, color: 'var(--muted-foreground)', flexShrink: 0 }}>{fmt(t.duration_ms)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Resume last session (when nothing is playing) */}
      {!hasTrack && hasResume && (
        <div className="player-resume-card player-resume-card--inset">
          <div className="player-resume-art-wrap">
            {lastPlayback.art
              ? <img src={lastPlayback.art} alt="" className="player-resume-art" />
              : <div className="player-resume-art player-resume-art--empty"><I.Music size={16} /></div>
            }
          </div>
          <div className="player-resume-info">
            <div className="player-resume-track">{lastPlayback.track}</div>
            <div className="player-resume-artist">{lastPlayback.artist}</div>
            {lastPlayback.progressMs > 5000 && lastPlayback.durationMs > 0 && (
              <div className="player-resume-pos">
                <span className="mono">{fmt(lastPlayback.progressMs)}</span>
                <span style={{ margin: '0 3px', opacity: 0.45 }}>/</span>
                <span className="mono">{fmt(lastPlayback.durationMs)}</span>
              </div>
            )}
          </div>
          <button
            className="player-resume-btn"
            onClick={() =>
              spotify.api('/me/player/play', {
                method: 'PUT',
                body: JSON.stringify({
                  uris: [lastPlayback.uri],
                  position_ms: lastPlayback.progressMs > 5000 ? lastPlayback.progressMs : 0,
                }),
              }).catch(() => {})
            }
          >
            <Icon size={11}><polygon points="5,3 19,12 5,21"/></Icon>
            {lastPlayback.progressMs > 5000 ? `Resume ${fmt(lastPlayback.progressMs)}` : 'Play'}
          </button>
        </div>
      )}
    </div>
  );
}

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
  speakers, toggleSpeaker, setVolume, hideSpeaker,
  musicSource, pickCurated, musicCustom, playSpotify,
  spotify, favourites, addFav, removeFav, musicNowLabel, navigate,
}) {
  const onCount = speakers.filter(s => s.on).length;
  const playback = useHomeStore(s => s.playback);

  // Queue — upcoming tracks. Re-fetch when the track changes.
  const [queue, setQueue] = useState(null);
  useEffect(() => {
    if (!spotify.token || !playback.track) { setQueue(null); return; }
    let cancelled = false;
    spotify.api('/me/player/queue')
      .then(r => { if (!cancelled) setQueue(r?.queue?.slice(0, 5) ?? []); })
      .catch(() => { if (!cancelled) setQueue([]); });
    return () => { cancelled = true; };
  }, [spotify.token, spotify.api, playback.track]);

  // Search + library state
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);   // { tracks, artists, playlists, albums }
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState(null);
  const [library, setLibrary] = useState(null);   // user's playlists
  const [libErr, setLibErr] = useState(null);
  const [recentlyPlayed, setRecentlyPlayed] = useState(null);  // recently played tracks
  const [likedSongs, setLikedSongs] = useState(null);          // saved tracks sample
  const [lastPlayedId, setLastPlayedId] = useState(null);      // playlist id from newest history context
  const [picker, setPicker] = useState(null);     // { trackUri, trackName } when user wants to "add to playlist"
  const [sideTab, setSideTab] = useState('browse'); // 'browse' | 'library' | 'recent'
  const [pickerMsg, setPickerMsg] = useState(null);

  // Load the user's playlists once when connected.
  useEffect(() => {
    if (!spotify.token) { setLibrary(null); setRecentlyPlayed(null); setLikedSongs(null); return; }
    // NO fields param here -- /me/playlists officially supports only
    // limit/offset. Sending a fields selector made the API return stripped
    // objects with tracks.total missing, which rendered "0 tracks" on every
    // playlist. Default response includes full tracks:{href,total}.
    spotify.api('/me/playlists?limit=50')
      .then(r => setLibrary(r?.items ?? []))
      .catch(e => setLibErr(String(e.message || e)));
    // Recently played (last 8 unique tracks). Fetch more than 8 so the
    // playlist-context scan below has real history to work with.
    spotify.api('/me/player/recently-played?limit=24')
      .then(r => {
        // Deduplicate by track ID — same song can appear many times in history.
        const seen = new Set();
        const items = (r?.items ?? []).filter(i => {
          if (!i?.track?.id || seen.has(i.track.id)) return false;
          seen.add(i.track.id);
          return true;
        });
        // History is newest-first; the first entry played FROM a playlist
        // tells us which playlist to float to the top of the library list.
        const ctx = (r?.items ?? []).find(i => i?.context?.type === 'playlist')?.context;
        setLastPlayedId(ctx?.uri ? ctx.uri.split(':').pop() : null);
        setRecentlyPlayed(items.slice(0, 8).map(i => i.track));
      })
      .catch(() => setRecentlyPlayed([]));
    // Liked songs — first 10 for display; play the whole collection by URI.
    spotify.api('/me/tracks?limit=10')
      .then(r => setLikedSongs({ total: r?.total ?? 0, items: (r?.items ?? []).map(i => i.track) }))
      .catch(() => setLikedSongs({ total: 0, items: [] }));
  }, [spotify.token, spotify.api]);

  // Library display order: the playlist you played most recently first,
  // Daily Mix 1 as the standing default under it, then the other Daily
  // Mixes, then everything else in Spotify's own order (sort is stable).
  const sortedLibrary = useMemo(() => {
    if (!library) return library;
    const rank = (p) => {
      if (lastPlayedId && p.id === lastPlayedId) return 0;
      const n = (p.name || '').toLowerCase();
      if (n === 'daily mix 1') return 1;
      if (n.startsWith('daily mix')) return 2;
      return 3;
    };
    return [...library].sort((a, b) => rank(a) - rank(b));
  }, [library, lastPlayedId]);

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
      setPickerMsg('Added to playlist âœ“');
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
            ) : spotify.clientId ? (
              <button className="group-toggle" data-active="true" onClick={spotify.connect}>
                Connect Spotify
              </button>
            ) : (
              <button
                className="group-toggle"
                data-active="true"
                onClick={() => navigate?.('settings')}
                title="Paste a Spotify Client ID in Settings before connecting"
              >
                Set up Spotify in Settings
              </button>
            )}
          </div>
          {spotify.error && (
            <p className="catalog-help" style={{ color: 'var(--destructive)', margin: '4px 0 0' }}>
              {spotify.error}
            </p>
          )}

          {/* Search results overlay, or the custom player stage */}
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
            <PlayerStage
              spotify={spotify}
              recentlyPlayed={recentlyPlayed}
              queue={queue}
            />
          )}
        </div>

        <div className="music-side">
          {/* Tab strip — Browse / Library / Recent — only shown when Spotify is connected */}
          {spotify.token && (
            <div className="music-side-tabs">
              {[
                { id: 'browse',  label: 'Browse' },
                { id: 'library', label: 'Library' },
                { id: 'recent',  label: 'Recent' },
              ].map(t => (
                <button
                  key={t.id}
                  className="music-side-tab"
                  data-active={sideTab === t.id}
                  onClick={() => setSideTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          {/* ── Browse tab — curated tiles + saved favourites ── */}
          {(!spotify.token || sideTab === 'browse') && (
            <div className="music-side-card">
              <div className="music-side-head">
                <div className="np-label">{spotify.token ? 'Curated' : 'Sources'}</div>
              </div>

              {/* 2-column visual tile grid */}
              <div className="music-src-grid">
                {MUSIC_SOURCES.map(s => {
                  const Ic = I[s.icon] ?? I.Music;
                  const active = !musicCustom && s.id === musicSource;
                  return (
                    <button
                      key={s.id}
                      className="music-src-tile"
                      data-active={active}
                      onClick={() => pickCurated(s.id)}
                      aria-pressed={active}
                    >
                      <span className="music-src-tile-icon"><Ic size={18} /></span>
                      <span className="music-src-tile-name">{s.name}</span>
                      <span className="music-src-tile-sub">{s.sub}</span>
                    </button>
                  );
                })}
              </div>

              {/* Saved favourites — compact list below tiles */}
              {favourites.length > 0 && (
                <>
                  <div className="music-src-section-head">
                    <span className="np-label">Saved</span>
                    <span className="mono" style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>{favourites.length}/50</span>
                  </div>
                  {favourites.slice(0, 5).map(f => (
                    <div key={f.id} className="music-source-row" data-active={false}>
                      <span className="src-icon"><I.Disc size={12} /></span>
                      <button className="music-source-text" onClick={() => playSpotify(f.type, f.id, f.name)}>
                        <div className="music-source-name">{f.name}</div>
                        <div className="music-source-sub">{f.sub}</div>
                      </button>
                      <button className="music-source-rm" onClick={() => removeFav(f.id)} aria-label="Remove">×</button>
                    </div>
                  ))}
                </>
              )}
              {favourites.length === 0 && (
                <div className="music-empty">★ from search results to save here.</div>
              )}
            </div>
          )}

          {/* ── Library tab — liked songs + playlists ── */}
          {spotify.token && sideTab === 'library' && (
            <div className="music-side-card">
              <div className="music-side-head">
                <div className="np-label">Liked songs</div>
                <span className="mono" style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>
                  {likedSongs ? likedSongs.total : '…'}
                </span>
              </div>

              {/* Play all liked songs — featured row */}
              <button
                className="music-source-row"
                onClick={() => playSpotify('collection', 'tracks', 'Liked songs')}
                data-active={musicCustom?.type === 'collection' && musicCustom.id === 'tracks'}
              >
                <span className="src-icon"><I.Heart size={12} /></span>
                <div>
                  <div className="music-source-name">Play all</div>
                  <div className="music-source-sub">{likedSongs ? `${likedSongs.total} tracks` : 'Loading…'}</div>
                </div>
                <span className="music-source-state">▶</span>
              </button>

              {/* Preview: first 3 liked tracks */}
              {likedSongs?.items?.slice(0, 3).map(t => (
                <button key={t.id} className="music-source-row" onClick={() => playTrack(t)}>
                  <span className="src-icon">
                    {spImg(t) ? <img src={spImg(t)} alt="" width={20} height={20} style={{ borderRadius: 4 }} /> : <I.Music size={12} />}
                  </span>
                  <div>
                    <div className="music-source-name">{t.name}</div>
                    <div className="music-source-sub">{t.artists?.[0]?.name ?? ''}</div>
                  </div>
                </button>
              ))}

              {/* Playlists section */}
              <div className="music-src-section-head">
                <span className="np-label">Playlists</span>
                <span className="mono" style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>{library?.length ?? '…'}</span>
              </div>
              {libErr && <div className="music-empty">{libErr}</div>}
              {library === null && !libErr && <div className="music-empty">Loading…</div>}
              {library?.length === 0 && <div className="music-empty">No playlists yet.</div>}
              {sortedLibrary?.slice(0, 20).map(p => (
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
                    {/* Count only when the API gave a real total -- "0 tracks"
                        on every row means stripped objects, not empty lists. */}
                    <div className="music-source-sub">
                      {p.tracks?.total > 0 ? `${p.tracks.total} tracks` : (p.owner?.display_name ?? 'Playlist')}
                    </div>
                  </div>
                  <span className="music-source-state">▶</span>
                </button>
              ))}
            </div>
          )}

          {/* ── Recent tab — recently played tracks ── */}
          {spotify.token && sideTab === 'recent' && (
            <div className="music-side-card">
              <div className="music-side-head">
                <div className="np-label">Recently played</div>
              </div>
              {!recentlyPlayed && <div className="music-empty">Loading…</div>}
              {recentlyPlayed?.length === 0 && <div className="music-empty">Nothing recent yet.</div>}
              {recentlyPlayed?.map(t => (
                <button key={t.id} className="music-source-row" onClick={() => playTrack(t)}>
                  <span className="src-icon">
                    {spImg(t) ? <img src={spImg(t)} alt="" width={20} height={20} style={{ borderRadius: 4 }} /> : <I.Clock size={12} />}
                  </span>
                  <div>
                    <div className="music-source-name">{t.name}</div>
                    <div className="music-source-sub">{t.artists?.[0]?.name ?? ''}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Speakers — full-width row spanning both columns */}
        <div className="music-speakers-row">
          <div className="music-side-head">
            <div className="np-label">Speakers</div>
            <span className="mono" style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>
              {onCount} of {speakers.length} on
            </span>
          </div>
          {speakers.length === 0 ? (
            <div className="music-empty">No speakers — sign in with Sonos in Settings, or connect Spotify.</div>
          ) : (
            <div className="speaker-grid" style={{ gap: 2 }}>
              {speakers.map(sp => (
                <SpeakerCard
                  key={sp.id}
                  speaker={sp}
                  onToggle={() => toggleSpeaker(sp.id)}
                  onVolume={(v) => setVolume(sp.id, v)}
                  onHide={hideSpeaker ? () => hideSpeaker(sp.id) : undefined}
                />
              ))}
            </div>
          )}
        </div>

        {/* Modal: pick a playlist to add the selected track to */}
        {picker && (
          <div className="music-picker" role="dialog" aria-modal="true" aria-label="Add to playlist">
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
                {sortedLibrary?.filter(p => p.owner?.id === spotify.me?.id).map(p => (
                  <button key={p.id} className="music-source-row" onClick={() => addToPlaylist(p.id, picker.trackUri)}>
                    <span className="src-icon"><I.Music size={12} /></span>
                    <div>
                      <div className="music-source-name">{p.name}</div>
                      <div className="music-source-sub">
                        {p.tracks?.total > 0 ? `${p.tracks.total} tracks` : 'Playlist'}
                      </div>
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
                <div className="music-source-sub">
                  {p.owner?.display_name ?? ''}{p.tracks?.total > 0 ? ` · ${p.tracks.total} tracks` : ''}
                </div>
              </div>
              <span style={{ display: 'inline-flex', gap: 6 }}>
                <button className="group-toggle" onClick={() => onPlay.playlist(p)}>Play</button>
                <button className="group-toggle" onClick={() => onAddFav({ id: p.id, type: 'playlist', name: p.name, sub: p.tracks?.total > 0 ? `${p.tracks.total} tracks` : 'Playlist' })} title="Save playlist">★</button>
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
// ─────────────────────────────────────────────────────────────────────────────
// PriceBarChart — 24-column bar chart of Tibber hourly prices.
// Current hour: amber fill + glow. Past hours: dimmed. Three cheapest
// upcoming hours: soft amber to signal good time to run high-draw appliances.
// ─────────────────────────────────────────────────────────────────────────────
function PriceBarChart({ prices, now }) {
  const nowT = now.getTime();
  const vals = prices.map(p => p.total);
  const maxP = Math.max(...vals, 0.001);
  const minP = Math.min(...vals);
  const range = maxP - minP || 0.001;
  const cIdx = Math.max(0, prices.findIndex(p => new Date(p.startsAt).getTime() + 3600_000 > nowT));
  const cheapSet = new Set(
    prices.map((p, i) => ({ i, v: p.total }))
      .filter(x => x.i > cIdx)
      .sort((a, b) => a.v - b.v)
      .slice(0, 3)
      .map(x => x.i)
  );

  return (
    <>
      <div className="price-bar-chart">
        {prices.map((p, i) => {
          const frac = (p.total - minP) / range;
          const isCurrent = i === cIdx;
          const isPast = i < cIdx;
          const isCheap = cheapSet.has(i);
          return (
            <div
              key={i}
              className="price-bar-col"
              data-current={isCurrent || undefined}
              data-past={isPast || undefined}
              data-cheap={isCheap || undefined}
              title={`${new Date(p.startsAt).getHours()}:00 — ${p.total.toFixed(3)} SEK/kWh`}
            >
              <div className="price-bar-inner" style={{ height: `${Math.max(frac * 72, 3)}px` }} />
            </div>
          );
        })}
      </div>
      <div className="price-bar-axis">
        <span>00</span><span>06</span><span>12</span><span>18</span><span>24</span>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EnergyPage — redesigned with KPI strip, 24h bar chart, source breakdown,
// price insights, and per-device power table.
// ─────────────────────────────────────────────────────────────────────────────
// Heat pump (Nibe via myUplink) — read-only climate card. Hidden entirely when
// the integration isn't configured (hub never pushes a payload). When
// configured but not signed in, shows a "Sign in with Nibe" prompt. When live,
// shows the model, current status, and a grid of temperatures + degree-minutes
// + compressor + power (only the readings the pump actually reports).
function HeatPumpSection() {
  const hp = useHomeStore(s => s.heatpump);
  if (!hp) return null; // not configured

  if (hp.online === false) {
    return (
      <Section title="Heat pump" statusId="nibe" source="Nibe · not connected"
        summary={<>Sign in with your Nibe account to see temperatures and status.</>}>
        <div style={{ padding: '4px 0 8px' }}>
          <button className="group-toggle" data-active="true" onClick={() => {
            hubRest('nibe', 'beginAuth', {})
              .then(r => { if (r?.url) window.location.href = r.url; })
              .catch(e => useHomeStore.getState().markFailed('nibe', `Nibe sign-in: ${String(e.message || e)} — is the hub running?`));
          }}>Sign in with Nibe</button>
        </div>
      </Section>
    );
  }

  const readings = hp.readings || [];
  const fmt = (v, unit) => {
    if (v == null) return '—';
    const n = Number.isInteger(v) ? v : Number(v).toFixed(1);
    return unit === '°C' ? `${n}°` : `${n}`;
  };

  return (
    <Section title="Heat pump" statusId="nibe"
      source={hp.model || 'Nibe'}
      summary={<>
        {hp.status ? <b>{hp.status}</b> : 'Idle'}
        {hp.compressor && <> · compressor <b>{hp.compressor}</b></>}
        {hp.outdoorTemp != null && <> · outdoor <b className="mono">{hp.outdoorTemp.toFixed(1)}°</b></>}
      </>}>
      {readings.length ? (
        <div className="sensors-grid">
          {readings.map(r => (
            <div key={r.label} className="sensor-tile">
              <div className="sensor-tile-head">
                <div className="sensor-tile-label">{r.label}</div>
              </div>
              <div className="sensor-tile-value mono">
                {fmt(r.value, r.unit)}
                {r.unit !== '°C' && <span className="sensor-tile-unit">{r.unit}</span>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="energy-empty">Connected — waiting for the first readings…</div>
      )}
    </Section>
  );
}

function EnergyPage({ rooms, outlets, speakers, totalW, litWatts, outletWatts, speakerWatts, tibberPrices, tibberErr, tibberConfigured, now }) {
  const price = useHomeStore(s => s.price);
  const livePower = useHomeStore(s => s.livePower);
  const isLive = livePower.watts != null && livePower.ts != null && (Date.now() - livePower.ts) < 30_000;
  // Distinguish "no active price contract" (honest, permanent until the user
  // gets a Tibber electricity subscription) from "loading" or "token missing".
  const noPriceContract = price.hasSubscription === false;
  const cur = price.currency || 'SEK';

  const currentPrice = useMemo(() => {
    if (!tibberPrices?.length) return null;
    const nowT = now.getTime();
    let idx = tibberPrices.findIndex(p => new Date(p.startsAt).getTime() + 3600_000 > nowT);
    if (idx < 0) idx = tibberPrices.length - 1;
    return tibberPrices[idx]?.total ?? null;
  }, [tibberPrices, now]);

  const costPerHour = currentPrice != null ? totalW * 0.001 * currentPrice : null;

  const priceStats = useMemo(() => {
    if (!tibberPrices?.length) return null;
    const vals = tibberPrices.map(p => p.total);
    const maxP = Math.max(...vals);
    const minP = Math.min(...vals);
    const avgP = vals.reduce((a, b) => a + b, 0) / vals.length;
    return { maxP, minP, avgP, estimatedDailyCost: totalW * 0.001 * 24 * avgP };
  }, [tibberPrices, totalW]);

  const cats = [
    { name: 'Lights',   val: Math.round(litWatts),    color: 'var(--chart-1)' },
    { name: 'Outlets',  val: Math.round(outletWatts),  color: 'var(--chart-2)' },
    { name: 'Speakers', val: Math.round(speakerWatts), color: 'var(--chart-3)' },
  ];
  const catMax = Math.max(...cats.map(c => c.val), 1);

  const roomPower = useMemo(() =>
    rooms.filter(r => r.on)
      .map(r => ({ name: r.name || 'Room', watts: Math.round(r.bulbs * 9 * (r.brightness / 100)) }))
      .sort((a, b) => b.watts - a.watts)
  , [rooms]);
  const roomPowerMax = Math.max(...roomPower.map(r => r.watts), 1);

  const outletPower = outlets.filter(o => o.watts > 0 || o.on);
  const outletPowerMax = Math.max(...outletPower.map(o => o.watts), 1);

  const litRooms = rooms.filter(r => r.on);
  const onOutlets = outlets.filter(o => o.on);

  return (
    <Section
      title="Energy"
      source={isLive ? 'Tibber Pulse · live power' : 'estimated draw'}
      summary={<>
        Live load <b className="mono">{totalW} W</b>
        {isLive && <> · <span style={{ color: 'var(--primary)' }}>live</span></>}
        {currentPrice != null && <> · spot <b className="mono">{currentPrice.toFixed(2)} {cur}/kWh</b></>}
      </>}
    >
      <div className="energy-page">

        {/* KPI strip */}
        <div className="energy-kpi-strip">
          <div className="energy-kpi">
            <span className="micro-label">Live draw {isLive ? '· live' : '· est'}</span>
            <div className="energy-kpi-val">{totalW}<span className="unit">W</span></div>
            <div className="energy-kpi-sub">
              {isLive && livePower.todayKwh != null
                ? <>{livePower.todayKwh.toFixed(1)} kWh today · {onOutlets.length} outlets on</>
                : <>{litRooms.length} rooms · {onOutlets.length} outlets active</>}
            </div>
          </div>
          <div className="energy-kpi">
            <span className="micro-label">Spot price</span>
            <div className="energy-kpi-val">
              {currentPrice != null ? currentPrice.toFixed(2) : '—'}<span className="unit">{cur}/kWh</span>
            </div>
            <div className="energy-kpi-sub">{noPriceContract ? 'no Tibber price contract' : currentPrice != null ? 'Tibber · live' : 'connecting…'}</div>
          </div>
          <div className="energy-kpi">
            <span className="micro-label">Cost this hour</span>
            <div className="energy-kpi-val">
              {costPerHour != null ? costPerHour.toFixed(2) : '—'}<span className="unit">{cur}</span>
            </div>
            <div className="energy-kpi-sub">at current load</div>
          </div>
        </div>

        {/* 24h price bar chart */}
        <div className="energy-card">
          <div className="energy-card-head">
            <span className="micro-label">Today's electricity prices</span>
            {currentPrice != null && (
              <span className="energy-card-val">
                {currentPrice.toFixed(2)}<span style={{ fontSize: 11, color: 'var(--muted-foreground)', marginLeft: 4 }}>SEK/kWh now</span>
              </span>
            )}
          </div>
          {tibberPrices?.length ? (
            <>
              <PriceBarChart prices={tibberPrices} now={now} />
              {priceStats && (
                <div className="price-bar-minmax">
                  <span>low {priceStats.minP.toFixed(2)}</span>
                  <span>avg {priceStats.avgP.toFixed(2)}</span>
                  <span>high {priceStats.maxP.toFixed(2)} SEK/kWh</span>
                </div>
              )}
            </>
          ) : (
            <div className="energy-empty">
              {noPriceContract
                ? 'No active Tibber price contract. Live power works; spot prices need a Tibber electricity subscription (tibber.com).'
                : tibberErr ? `Tibber error: ${tibberErr}`
                : 'Connecting to Tibber…'}
            </div>
          )}
        </div>

        {/* Source breakdown + price insights */}
        <div className="energy-charts">
          <div className="energy-card">
            <div className="energy-card-head">
              <span className="micro-label">By source</span>
              <span className="energy-card-val">{totalW}<span style={{ fontSize: 11, color: 'var(--muted-foreground)', marginLeft: 4 }}>W total</span></span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {cats.map(c => (
                <div key={c.name} className="energy-source-row">
                  <span className="energy-source-name">{c.name}</span>
                  <div className="energy-source-bar">
                    <div style={{ transform: `scaleX(${catMax > 0 ? c.val / catMax : 0})`, background: c.color }} />
                  </div>
                  <span className="energy-source-val">{c.val} W</span>
                </div>
              ))}
            </div>
          </div>

          <div className="energy-insight">
            <span className="micro-label">Price insights</span>
            {priceStats ? (
              <>
                <div className="energy-insight-row">
                  <span>Low today</span>
                  <b>{priceStats.minP.toFixed(2)} SEK</b>
                </div>
                <div className="energy-insight-row">
                  <span>High today</span>
                  <b>{priceStats.maxP.toFixed(2)} SEK</b>
                </div>
                <div className="energy-insight-row">
                  <span>Est. daily cost</span>
                  <b>{priceStats.estimatedDailyCost.toFixed(0)} SEK</b>
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted-foreground)', fontStyle: 'italic', marginTop: 4 }}>
                  at {totalW} W continuous · avg {priceStats.avgP.toFixed(2)} SEK/kWh
                </div>
              </>
            ) : (
              <div className="energy-empty" style={{ minHeight: 48 }}>
                {tibberConfigured ? 'Awaiting price data…' : 'Set up Tibber for insights.'}
              </div>
            )}
          </div>
        </div>

        {/* Per-device breakdown */}
        {(roomPower.length > 0 || outletPower.length > 0) && (
          <div className="energy-devices">
            {roomPower.length > 0 && (
              <div className="energy-device-col">
                <div className="micro-label" style={{ marginBottom: 2 }}>Rooms</div>
                {roomPower.map(r => (
                  <div key={r.name} className="energy-device-row">
                    <I.Light size={12} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                    <span style={{ color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                    <div className="energy-device-bar">
                      <div style={{ transform: `scaleX(${r.watts / roomPowerMax})` }} />
                    </div>
                    <span className="mono" style={{ textAlign: 'right', color: 'var(--foreground)' }}>{r.watts} W</span>
                  </div>
                ))}
              </div>
            )}
            {outletPower.length > 0 && (
              <div className="energy-device-col">
                <div className="micro-label" style={{ marginBottom: 2 }}>Outlets</div>
                {outletPower.map((o, idx) => (
                  <div key={o.id || idx} className="energy-device-row">
                    <I.Plug size={12} style={{ color: o.on ? 'var(--primary)' : 'var(--muted-foreground)', flexShrink: 0 }} />
                    <span style={{ color: o.on ? 'var(--foreground)' : 'var(--muted-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.name}</span>
                    <div className="energy-device-bar">
                      <div style={{ transform: `scaleX(${o.watts / outletPowerMax})` }} />
                    </div>
                    <span className="mono" style={{ textAlign: 'right', color: o.on ? 'var(--foreground)' : 'var(--muted-foreground)' }}>{o.watts} W</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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
          <div className="weather-current-icon"><span key={code ?? 'init'} className="weather-icon-mount"><WIcon size={132} /></span></div>
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
// NewsPage — Live Swedish nyhetsflashar from SR, SVT, Aftonbladet, DN.
//
// SR uses their public open API (api.sr.se/api/v2, no key, CORS-open).
// RSS sources try a direct fetch first; if CORS blocks it the request goes
// through allorigins.win (free, no-key proxy) which returns { contents }.
// Refresh every 5 minutes. All items are deduplicated and sorted newest-first.
// ─────────────────────────────────────────────────────────────────────────────

const SR_P1_STREAM = 'https://sverigesradio.se/topsy/direkt/srapi/132.mp3';

const NEWS_SOURCES_CFG = [
  { id: 'svt', label: 'SVT',       color: 'oklch(0.62 0.18 200)' },
  { id: 'ab',  label: 'AB',        color: 'oklch(0.58 0.22 28)'  },
  { id: 'dn',  label: 'DN',        color: 'oklch(0.62 0.04 240)' },
  { id: 'exp', label: 'Expressen', color: 'oklch(0.60 0.20 18)'  },
];

function newsTimeAgo(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return '';
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60)    return `${s}s`;
  if (s < 3600)  return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return date.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
}

function extractItemImage(item) {
  // 1. <enclosure> (AB / standard RSS)
  const enc = item.querySelector('enclosure');
  if (enc) {
    const url = enc.getAttribute('url') || '';
    const type = enc.getAttribute('type') || '';
    if (url && (type.startsWith('image') || /\.(jpe?g|png|webp)(\?|$)/i.test(url))) return url;
  }
  // 2. <media:content> / <media:thumbnail> (DN / Yahoo Media RSS)
  for (const el of item.querySelectorAll('*')) {
    const ln = el.localName;
    if (ln === 'content' || ln === 'thumbnail') {
      const url = el.getAttribute('url') || '';
      const medium = el.getAttribute('medium') || '';
      const type = el.getAttribute('type') || '';
      if (url && (medium === 'image' || type.startsWith('image') || /\.(jpe?g|png|webp)(\?|$)/i.test(url))) return url;
    }
  }
  // 3. <img> embedded in description HTML (Expressen)
  const rawDesc = item.querySelector('description')?.textContent || '';
  const m = rawDesc.match(/<img\s[^>]*\bsrc=['"]([^'"]+)['"]/i);
  if (m?.[1]) return m[1];
  return null;
}

function parseRSSXML(xml, sourceId) {
  try {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror')) return [];
    return Array.from(doc.querySelectorAll('item')).slice(0, 20).map((item, i) => {
      const title = (item.querySelector('title')?.textContent || '')
        .replace(/<!\[CDATA\[|\]\]>/g, '').trim();
      const link = (item.querySelector('link')?.textContent?.trim() ||
                    item.querySelector('guid')?.textContent?.trim() || '');
      const pub = item.querySelector('pubDate')?.textContent;
      const rawDesc = (item.querySelector('description')?.textContent || '')
        .replace(/<!\[CDATA\[|\]\]>/g, '')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
        .trim();
      const description = rawDesc.length > 0 && rawDesc !== title ? rawDesc : '';
      const image = extractItemImage(item);
      return { id: link || `${sourceId}-${i}`, title, description, image, url: link, pubDate: new Date(pub || Date.now()), source: sourceId };
    }).filter(x => x.title.length > 0);
  } catch { return []; }
}

async function fetchRSSWithFallback(url, sourceId) {
  // 1. Direct fetch (works on same-origin, instant CORS fail otherwise)
  const direct = new AbortController();
  const dt = setTimeout(() => direct.abort(), 4000);
  try {
    const r = await fetch(url, { signal: direct.signal });
    clearTimeout(dt);
    if (r.ok) return parseRSSXML(await r.text(), sourceId);
  } catch { clearTimeout(dt); }

  // 2. corsproxy.io — returns raw text, more reliable under concurrent load
  const cp = new AbortController();
  const ct = setTimeout(() => cp.abort(), 8000);
  try {
    const r = await fetch(
      `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
      { signal: cp.signal }
    );
    clearTimeout(ct);
    if (r.ok) {
      const items = parseRSSXML(await r.text(), sourceId);
      if (items.length > 0) return items;
    }
  } catch { clearTimeout(ct); }

  // 3. allorigins.win — JSON wrapper fallback
  const proxy = new AbortController();
  const pt = setTimeout(() => proxy.abort(), 9000);
  try {
    const r = await fetch(
      `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
      { signal: proxy.signal }
    );
    clearTimeout(pt);
    if (!r.ok) return [];
    const j = await r.json();
    return j.contents ? parseRSSXML(j.contents, sourceId) : [];
  } catch { clearTimeout(pt); return []; }
}

async function fetchAllNewsItems() {
  const [svtResult, abResult, dnResult, expResult] = await Promise.allSettled([
    fetchRSSWithFallback('https://www.svt.se/nyheter/rss.xml',                               'svt'),
    fetchRSSWithFallback('https://rss.aftonbladet.se/rss2/small/pages/sections/senastenytt/', 'ab'),
    fetchRSSWithFallback('https://www.dn.se/rss/',                                            'dn'),
    fetchRSSWithFallback('https://feeds.expressen.se/nyheter/',                               'exp'),
  ]);
  const all = [
    ...(svtResult.status === 'fulfilled' ? svtResult.value : []),
    ...(abResult.status  === 'fulfilled' ? abResult.value  : []),
    ...(dnResult.status  === 'fulfilled' ? dnResult.value  : []),
    ...(expResult.status === 'fulfilled' ? expResult.value : []),
  ];
  const seen = new Set();
  return all
    .filter(x => { if (!x.title || seen.has(x.title)) return false; seen.add(x.title); return true; })
    .sort((a, b) => b.pubDate - a.pubDate);
}

function NewsPage() {
  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState(null);
  const [filter, setFilter]     = useState('all');
  const [lastFetch, setLastFetch] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const result = await fetchAllNewsItems();
      setItems(result);
      setLastFetch(new Date());
    } catch (e) { setErr(String(e.message || e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  const filtered = filter === 'all' ? items : items.filter(x => x.source === filter);
  const counts = useMemo(() => {
    const c = { all: items.length };
    NEWS_SOURCES_CFG.forEach(s => { c[s.id] = items.filter(x => x.source === s.id).length; });
    return c;
  }, [items]);

  const freshLabel = lastFetch
    ? `Uppdaterad ${newsTimeAgo(lastFetch)} sedan`
    : loading ? 'Hämtar nyheter…' : 'SVT · Aftonbladet · DN · Expressen';

  return (
    <Section
      title="Nyheter"
      source="SR · SVT · AB · DN"
      summary={<>{freshLabel}{items.length > 0 ? <> · <b>{items.length}</b> nyhetsflashar</> : null}</>}
    >
      <div className="news-page">
        <div className="news-feed">

          {/* SR P1 live radio */}
          <div className="news-audio">
            <div className="news-audio-meta">
              <span className="micro-label">SR P1 Live · nyheter &amp; samhälle</span>
            </div>
            <audio controls preload="none" src={SR_P1_STREAM}>
              Din webbläsare stöder inte ljuduppspelning.
            </audio>
          </div>

          {/* Source filter tabs */}
          <div className="news-tabs">
            <button className="news-tab" data-active={filter === 'all'} onClick={() => setFilter('all')}>
              Alla{counts.all > 0 ? <span className="news-tab-count">{counts.all}</span> : null}
            </button>
            {NEWS_SOURCES_CFG.map(s => counts[s.id] > 0 ? (
              <button key={s.id} className="news-tab" data-active={filter === s.id} onClick={() => setFilter(s.id)}>
                {s.label}<span className="news-tab-count">{counts[s.id]}</span>
              </button>
            ) : null)}
            <button
              className="news-tab"
              onClick={load}
              disabled={loading}
              style={{ marginLeft: 'auto' }}
              aria-label="Uppdatera nyheter"
            >
              {loading ? '…' : '↻'}
            </button>
          </div>

          {err && (
            <p style={{ padding: '12px 16px', color: 'var(--destructive)', fontSize: 13 }}>{err}</p>
          )}

          {/* Loading skeletons */}
          {loading && items.length === 0 && (
            <div className="news-list">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="news-item news-item-skeleton" />
              ))}
            </div>
          )}

          {/* Live feed */}
          <div className="news-list">
            {filtered.map(item => {
              const src = NEWS_SOURCES_CFG.find(s => s.id === item.source);
              return (
                <a
                  key={item.id}
                  className="news-item"
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="news-item-source" style={{ color: src?.color }}>
                    {src?.label ?? item.source.toUpperCase()}
                  </span>
                  <span className="news-item-body">
                    <span className="news-item-title">{item.title}</span>
                    {item.description && (
                      <span className="news-item-desc">{item.description}</span>
                    )}
                    <span className="news-item-meta">{newsTimeAgo(item.pubDate)}</span>
                  </span>
                  {item.image
                    ? <img className="news-item-thumb" src={item.image} alt="" loading="lazy" decoding="async" />
                    : <span className="news-item-thumb news-item-thumb--empty" />
                  }
                </a>
              );
            })}
            {!loading && filtered.length === 0 && items.length > 0 && (
              <p style={{ padding: '16px', color: 'var(--muted-foreground)', fontSize: 13 }}>
                Inga nyheter för det filtret.
              </p>
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Brand SVG marks — inline, currentColor, so they inherit glass-card foreground.
// Kept small (20×20 viewBox / ≤5 paths) for crisp rendering at 18–22px.
// ─────────────────────────────────────────────────────────────────────────────
function BrandSpotify({ size = 18 }) {
  // Spotify canonical logo: filled circle + 3 horizontal arcs.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.622.622 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.622.622 0 01-.277-1.215c3.809-.87 7.076-.496 9.712 1.115a.623.623 0 01.207.857zm1.223-2.722a.78.78 0 01-1.072.257c-2.687-1.652-6.786-2.131-9.965-1.166a.779.779 0 01-.968-.519.781.781 0 01.519-.968c3.632-1.102 8.147-.568 11.228 1.324a.78.78 0 01.258 1.072zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71a.937.937 0 11-.543-1.79c3.533-1.072 9.404-.866 13.115 1.337a.937.937 0 01-.954 1.61z" />
    </svg>
  );
}
function BrandPlejd({ size = 18 }) {
  // Plejd: rounded rectangle housing a P letterform (matches their app icon shape).
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" opacity="0.18" />
      <path d="M8 5.5h4.8C15.13 5.5 17 7.37 17 9.7s-1.87 4.2-4.2 4.2H10.2V19H8V5.5zm2.2 2v5.4h2.4c1.22 0 2.2-.98 2.2-2.2v-1c0-1.22-.98-2.2-2.2-2.2h-2.4z" />
    </svg>
  );
}
function BrandSonos({ size = 18 }) {
  // Sonos: WiFi-style arcs radiating from a dot — multi-room audio metaphor.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="5" cy="19" r="2" fill="currentColor" />
      <path d="M5 14a5 5 0 015 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M5 9a10 10 0 0110 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M5 4a15 15 0 0115 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}
function BrandShelly({ size = 18 }) {
  // Shelly: plug body + lightning bolt — smart outlet with live wattage.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="2" width="12" height="14" rx="3" opacity="0.2" />
      <rect x="6" y="2" width="12" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <line x1="9" y1="2" x2="9" y2="5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="15" y1="2" x2="15" y2="5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M13 8l-3 5h4l-3 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
function BrandTibber({ size = 18 }) {
  // Tibber: circle + lightning bolt — energy price brand.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="12" r="10" opacity="0.18" />
      <path d="M13.5 4l-5 8h4.5l-3 8 7-10H13L15.5 4z" />
    </svg>
  );
}
function BrandHomeAssistant({ size = 18 }) {
  // Home Assistant: house silhouette with a connectivity dot (the HA icon).
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3L3 8.5V21h6v-5h6v5h6V8.5L12 3zm0 2.6l6 3.5V19h-2v-5H8v5H6V9.1l6-3.5z" />
      <circle cx="12" cy="12" r="1.5" />
    </svg>
  );
}
function BrandWeather({ size = 18 }) {
  // Open-Meteo / weather: sun with rays (clearly distinct from all other marks).
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4" fill="currentColor" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5.64 5.64l2.12 2.12M16.24 16.24l2.12 2.12M5.64 18.36l2.12-2.12M16.24 7.76l2.12-2.12"
        stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

// Map catalog id → brand logo component (falls back to Lucide via icon field).
const BRAND_LOGOS = {
  plejd:       BrandPlejd,
  sonos:       BrandSonos,
  shelly:      BrandShelly,
  spotify:     BrandSpotify,
  tibber:      BrandTibber,
  weather:     BrandWeather,
  'ha-sensors': BrandHomeAssistant,
};

// ─────────────────────────────────────────────────────────────────────────────
// Integration catalog -- shape per entry:
//   { id, name, icon, kind, tagline, keywords, status(integrations, spotify) }
// "kind" is used in the badge ("Cloud OAuth" / "LAN bridge" / "Cloud token" / "LAN devices")
// `keywords` are searched in addition to name and tagline.
// ─────────────────────────────────────────────────────────────────────────────
const INTEGRATION_CATALOG = [
  {
    id: 'plejd', name: 'Plejd lights', icon: 'Light', kind: 'Sign in required',
    tagline: 'Wireless lights and dimmers, made in Sweden.',
    keywords: ['plejd', 'lights', 'bulbs', 'lighting', 'sign in', 'account'],
    status: (i) => (i.config.plejd?.cloudSession || (i.config.plejd?.url && i.config.plejd?.token)) ? 'configured' : 'not-configured',
  },
  {
    id: 'sonos', name: 'Sonos speakers', icon: 'Speaker', kind: 'Local network',
    tagline: 'Multi-room speakers, all zones in sync.',
    keywords: ['sonos', 'speakers', 'audio', 'multi-room', 'sound'],
    status: (i) => i.config.sonos?.url ? 'configured' : 'not-configured',
  },
  {
    id: 'shelly', name: 'Shelly outlets', icon: 'Plug', kind: 'Local network',
    tagline: 'Smart plugs with live power readings.',
    keywords: ['shelly', 'outlets', 'plugs', 'power', 'switches'],
    status: (i) => (i.config.shelly?.devices?.length ?? 0) > 0 ? 'configured' : 'not-configured',
  },
  {
    id: 'spotify', name: 'Spotify', icon: 'Music', kind: 'Personal sign-in',
    tagline: 'Music streaming for every household member.',
    keywords: ['spotify', 'music', 'playback', 'streaming'],
    status: (i, sp) => sp?.token ? 'configured' : (sp?.clientId ? 'partial' : 'not-configured'),
  },
  {
    id: 'tibber', name: 'Tibber energy', icon: 'Zap', kind: 'API token',
    tagline: 'Live electricity prices, Nordic power grid.',
    keywords: ['tibber', 'energy', 'price', 'electricity', 'nordic'],
    status: (i) => i.config.tibber?.token ? 'configured' : 'not-configured',
  },
  {
    id: 'weather', name: 'Local weather', icon: 'Cloud', kind: 'No account needed',
    tagline: 'Local forecast, no account needed.',
    keywords: ['weather', 'forecast', 'open-meteo', 'temperature', 'rain'],
    status: (i) => i.config.weather?.lat && i.config.weather?.lon ? 'configured' : 'default',
  },
  {
    id: 'ha-sensors', name: 'Home Assistant sensors', icon: 'Home', kind: 'Home Assistant',
    tagline: 'Dashboard tiles from any Home Assistant entity.',
    keywords: ['sensors', 'home assistant', 'ha', 'temperature', 'motion', 'door', 'entities', 'plejd', 'hass'],
    status: (i) => (i.config.ha?.entities?.length ?? 0) > 0 ? 'configured' : 'not-configured',
  },
];

const STATUS_LABEL = { configured: 'Connected', partial: 'Partial', 'not-configured': 'Not set up', default: 'Using defaults' };

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

// ─────────────────────────────────────────────────────────────────────────────
// Network Device Discovery
// Multi-protocol LAN sweep + Home Assistant entity discovery.
// Browser constraints: only CORS-open endpoints can have their bodies read
// (Shelly ships CORS headers; others may not). For non-CORS hosts we still
// get a connection signal from the fetch rejection type. HA and Sonos bridge
// are queried via their existing credentials so full metadata is available.
// ─────────────────────────────────────────────────────────────────────────────

// Detect the local /24 via WebRTC ICE gathering. Returns e.g. "192.168.1".
async function getLocalSubnet() {
  return new Promise(resolve => {
    try {
      const pc = new RTCPeerConnection({ iceServers: [] });
      pc.createDataChannel('');
      pc.createOffer().then(o => pc.setLocalDescription(o));
      pc.addEventListener('icecandidate', ({ candidate }) => {
        if (!candidate?.candidate) return;
        const m = candidate.candidate.match(/(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d+/);
        if (m) { try { pc.close(); } catch {} resolve(m[1]); }
      });
      setTimeout(() => { try { pc.close(); } catch {} resolve('192.168.1'); }, 4000);
    } catch { resolve('192.168.1'); }
  });
}

const PROBE_MS   = 1400; // initial probe timeout
const STATUS_MS  = 1200; // follow-up status calls (device already confirmed)

// Room heuristics — infer room from device name (EN + SV)
const ROOM_PATTERNS_BROWSER = [
  [/\b(kitchen|kök|köket)\b/i,                                       'Kitchen'],
  [/\b(living.?room|vardagsrum|vardags|lounge|salon)\b/i,            'Living Room'],
  [/\b(master.?bed(room)?|master)\b/i,                               'Master Bedroom'],
  [/\b(bedroom|sovrum|bed\.?room)\b/i,                               'Bedroom'],
  [/\b(kids?|barn(rum)?|child(ren)?|nursery)\b/i,                   'Kids Room'],
  [/\b(bathroom|badrum|bath(room)?|toilet|wc)\b/i,                  'Bathroom'],
  [/\b(hall(way)?|entrance|foyer|entr[eé]|korridor)\b/i,            'Hallway'],
  [/\b(office|kontor|arbetsrum|study|workroom)\b/i,                  'Office'],
  [/\b(dining.?(room)?|matsal|matrum)\b/i,                          'Dining Room'],
  [/\b(garage|carport)\b/i,                                         'Garage'],
  [/\b(laundry|tvättstuga|utility)\b/i,                             'Laundry'],
  [/\b(outdoor|utomhus|garden|trädgård|balcony|balkong|patio|terrace)\b/i, 'Outdoor'],
  [/\b(guest(room)?|gästrum|spare)\b/i,                             'Guest Room'],
];
function inferRoomFromName(name) {
  if (!name) return null;
  for (const [re, room] of ROOM_PATTERNS_BROWSER) if (re.test(name)) return room;
  return null;
}

async function probeSonosLAN(ip) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), PROBE_MS);
    const r = await fetch(`http://${ip}:1400/xml/device_description.xml`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const text = await r.text();
    if (!text.toLowerCase().includes('sonos') && !text.includes('rincon')) return null;
    const name  = text.match(/<friendlyName>(.*?)<\/friendlyName>/i)?.[1] || 'Sonos';
    const model = text.match(/<modelName>(.*?)<\/modelName>/i)?.[1]       || '';
    const uuid  = text.match(/<UDN>uuid:(.*?)<\/UDN>/i)?.[1]              || ip;
    return {
      id: `sonos-${uuid}`, ip, name, type: 'speaker', protocol: 'sonos',
      model, assignedTo: 'music',
      on: null, watts: null, room: inferRoomFromName(name), mac: null,
    };
  } catch { return null; }
}

// Direct Sonos UPnP control — no bridge process required.
// Sends AVTransport (play/pause) or RenderingControl (volume) SOAP commands
// straight to port 1400. Works when Sonos firmware allows cross-origin POST
// (modern Sonos does). Fails silently if CORS blocks it; hub path bypasses CORS.
function sonosUPnPEnvelope(urn, action, inner = '') {
  return `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:${action} xmlns:u="${urn}"><InstanceID>0</InstanceID>${inner}</u:${action}></s:Body></s:Envelope>`;
}
async function sonosUPnPCmd(ip, action, { volume } = {}) {
  const avt = 'urn:schemas-upnp-org:service:AVTransport:1';
  const rc  = 'urn:schemas-upnp-org:service:RenderingControl:1';
  const routes = {
    play:   [avt, 'MediaRenderer/AVTransport/Control',      'Play',      '<Speed>1</Speed>'],
    pause:  [avt, 'MediaRenderer/AVTransport/Control',      'Pause',     ''],
    volume: [rc,  'MediaRenderer/RenderingControl/Control', 'SetVolume', `<Channel>Master</Channel><DesiredVolume>${Math.round(volume ?? 0)}</DesiredVolume>`],
  };
  const [urn, path, act, inner] = routes[action] || [];
  if (!urn) return;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 1800);
  try {
    await fetch(`http://${ip}:1400/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset="utf-8"', SOAPACTION: `"${urn}#${act}"` },
      body: sonosUPnPEnvelope(urn, act, inner),
    });
  } finally { clearTimeout(t); }
}
async function sonosUPnPState(ip) {
  const avt = 'urn:schemas-upnp-org:service:AVTransport:1';
  const rc  = 'urn:schemas-upnp-org:service:RenderingControl:1';
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 1800);
  const [tr, vr] = await Promise.allSettled([
    fetch(`http://${ip}:1400/MediaRenderer/AVTransport/Control`, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'text/xml; charset="utf-8"', SOAPACTION: `"${avt}#GetTransportInfo"` },
      body: sonosUPnPEnvelope(avt, 'GetTransportInfo'),
    }).then(r => r.text()),
    fetch(`http://${ip}:1400/MediaRenderer/RenderingControl/Control`, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'text/xml; charset="utf-8"', SOAPACTION: `"${rc}#GetVolume"` },
      body: sonosUPnPEnvelope(rc, 'GetVolume', '<Channel>Master</Channel>'),
    }).then(r => r.text()),
  ]);
  clearTimeout(t);
  const ts  = tr.status === 'fulfilled' ? tr.value : '';
  const vs  = vr.status === 'fulfilled' ? vr.value : '';
  const state = ts.match(/<CurrentTransportState>(.*?)<\/CurrentTransportState>/)?.[1] || 'STOPPED';
  const vol   = parseInt(vs.match(/<CurrentVolume>(.*?)<\/CurrentVolume>/)?.[1] || '0', 10);
  return { playing: state === 'PLAYING', paused: state === 'PAUSED_PLAYBACK', volume: isNaN(vol) ? 0 : vol };
}

async function probeChromecast(ip) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), PROBE_MS);
    const r = await fetch(`http://${ip}:8008/setup/eureka_info?options=detail`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const d = await r.json().catch(() => null);
    if (!d) return null;
    const name    = d.name || d.device_info?.friendly_name || 'Google device';
    const mac     = d.device_info?.mac_address || null;
    const isAudio = d.build_info?.cast_type === 2 ||
                    d.build_info?.board_name?.toLowerCase().includes('audio');
    return {
      id: `cast-${(mac?.replace(/:/g, '') || ip)}`,
      ip, name, type: isAudio ? 'speaker' : 'tv',
      protocol: 'chromecast', model: d.build_info?.model_name || '',
      assignedTo: isAudio ? 'music' : 'tv',
      on: null, watts: null, room: inferRoomFromName(name), mac,
    };
  } catch { return null; }
}

async function probeHueBridge(ip) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), PROBE_MS);
    const r = await fetch(`http://${ip}/description.xml`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const text = await r.text();
    if (!text.includes('Philips') && !text.toLowerCase().includes('hue')) return null;
    const name = text.match(/<friendlyName>(.*?)<\/friendlyName>/i)?.[1] || 'Philips Hue';
    return {
      id: `hue-${ip}`, ip, name: `${name} bridge`, type: 'lights',
      protocol: 'hue', model: 'Hue Bridge', assignedTo: 'lights',
      on: null, watts: null, room: null, mac: null,
    };
  } catch { return null; }
}

async function probeSamsungTV(ip) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), PROBE_MS);
    const r = await fetch(`http://${ip}:8001/api/v2/`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const d = await r.json().catch(() => null);
    if (!d?.device) return null;
    const mac = d.device?.wifiMac || null;
    return {
      id: `samsung-${(mac?.replace(/:/g, '') || ip)}`,
      ip, name: d.device?.name || 'Samsung TV', type: 'tv',
      protocol: 'samsung', model: d.device?.modelName || '',
      assignedTo: 'tv',
      on: null, watts: null, room: inferRoomFromName(d.device?.name || ''), mac,
    };
  } catch { return null; }
}

// Probe one IP against all known LAN protocols simultaneously.
async function probeIP(ip) {
  const results = await Promise.allSettled([
    // ── Shelly (CORS-open — Gen2 with config + status, Gen1 fallback) ──
    (async () => {
      // Gen2
      const ctrl2 = new AbortController();
      const t2 = setTimeout(() => ctrl2.abort(), PROBE_MS);
      const infoR = await fetch(`http://${ip}/rpc/Shelly.GetDeviceInfo`, { signal: ctrl2.signal }).catch(() => null);
      clearTimeout(t2);
      if (infoR?.ok) {
        const j = await infoR.json().catch(() => null);
        if (j && (j.id || j.mac)) {
          const [configR, statusR] = await Promise.all([
            fetch(`http://${ip}/rpc/Shelly.GetConfig`).catch(() => null),
            fetch(`http://${ip}/rpc/Switch.GetStatus?id=0`).catch(() => null),
          ]);
          const config = configR?.ok ? await configR.json().catch(() => null) : null;
          const status = statusR?.ok ? await statusR.json().catch(() => null) : null;
          const name  = config?.sys?.device?.name || j.name || j.id || ip;
          const on    = typeof status?.output === 'boolean' ? status.output : null;
          const watts = typeof status?.apower === 'number'  ? status.apower : null;
          return {
            id: `shelly-${(j.mac || j.id || ip).replace(/[^a-zA-Z0-9]/g, '')}`,
            ip, name, type: 'outlet', protocol: 'shelly',
            model: j.model || j.app || 'Shelly',
            gen: j.gen || 2, assignedTo: 'outlets',
            on, watts, room: inferRoomFromName(name), mac: j.mac || null,
          };
        }
      }
      // Gen1 fallback
      const ctrl1 = new AbortController();
      const t1 = setTimeout(() => ctrl1.abort(), PROBE_MS);
      const g1R = await fetch(`http://${ip}/shelly`, { signal: ctrl1.signal }).catch(() => null);
      clearTimeout(t1);
      if (!g1R?.ok) return null;
      const j = await g1R.json().catch(() => null);
      if (!j || (!j.mac && !j.type)) return null;
      const [settingsR, relayR] = await Promise.all([
        fetch(`http://${ip}/settings`).catch(() => null),
        fetch(`http://${ip}/relay/0`).catch(() => null),
      ]);
      const settings = settingsR?.ok ? await settingsR.json().catch(() => null) : null;
      const relay    = relayR?.ok    ? await relayR.json().catch(() => null)    : null;
      const name  = settings?.name || settings?.relays?.[0]?.name || j.hostname || j.type || ip;
      const on    = typeof relay?.ison  === 'boolean' ? relay.ison  : null;
      const watts = typeof relay?.power === 'number'  ? relay.power : null;
      return {
        id: `shelly-${(j.mac || ip).replace(/[^a-zA-Z0-9]/g, '')}`,
        ip, name, type: 'outlet', protocol: 'shelly',
        model: j.type || 'Shelly', gen: 1, assignedTo: 'outlets',
        on, watts, room: inferRoomFromName(name), mac: j.mac || null,
      };
    })(),
    probeSonosLAN(ip),
    probeChromecast(ip),
    probeHueBridge(ip),
    probeSamsungTV(ip),
  ]);
  return results
    .filter(r => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value);
}

// Full /24 LAN sweep. onProgress(done, total) and onDevice(device) fire
// progressively so the UI can stream results in real time.
async function scanLAN(subnet, { onProgress, onDevice } = {}) {
  const ips = Array.from({ length: 254 }, (_, i) => `${subnet}.${i + 1}`);
  const CONCURRENCY = 16;
  let cursor = 0, done = 0;
  const worker = async () => {
    while (cursor < ips.length) {
      const ip = ips[cursor++];
      const devices = await probeIP(ip).catch(() => []);
      devices.forEach(d => onDevice?.(d));
      done++;
      onProgress?.(done, ips.length);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}

// Map HA entity domains to device types used by this dashboard.
const HA_DOMAIN_MAP = {
  light:                { type: 'lights',  assignedTo: 'lights'    },
  media_player:         { type: 'speaker', assignedTo: 'music'     },
  switch:               { type: 'outlet',  assignedTo: 'outlets'   },
  input_boolean:        { type: 'outlet',  assignedTo: 'outlets'   },
  alarm_control_panel:  { type: 'alarm',   assignedTo: 'security'  },
};

async function discoverFromHA(haUrl, haToken) {
  const base = haUrl.replace(/\/$/, '');
  const r = await fetch(`${base}/api/states`, { headers: { Authorization: `Bearer ${haToken}` } });
  if (!r.ok) throw new Error(`HA ${r.status}`);
  const states = await r.json();
  return states
    .filter(s => s.entity_id.split('.')[0] in HA_DOMAIN_MAP)
    .map(s => {
      const domain = s.entity_id.split('.')[0];
      const { type, assignedTo } = HA_DOMAIN_MAP[domain];
      return {
        id: `ha-${s.entity_id}`,
        entityId: s.entity_id,
        name: s.attributes?.friendly_name || s.entity_id,
        type, protocol: 'home-assistant',
        model: s.attributes?.device_class || domain,
        state: s.state,
        assignedTo,
      };
    });
}

async function discoverFromSonosBridge(url) {
  const base = url.replace(/\/$/, '');
  const r = await fetch(`${base}/zones`);
  if (!r.ok) throw new Error(`Sonos bridge ${r.status}`);
  const zones = await r.json();
  const devices = [];
  zones.forEach(zone => {
    (zone.members || [zone]).forEach(m => {
      devices.push({
        id: `sonos-${m.uuid || m.roomName}`,
        name: m.roomName || zone.roomName || 'Sonos',
        type: 'speaker', protocol: 'sonos', model: 'Sonos',
        assignedTo: 'music', state: zone.state?.playbackState || '',
      });
    });
  });
  return devices;
}

// ─── Discovery Modal ─────────────────────────────────────────────────────────

const DEVICE_TYPE_META = {
  speaker: { label: 'Speakers', Icon: I.Speaker, assign: ['music', 'ignore'] },
  lights:  { label: 'Lights',   Icon: I.Light,   assign: ['lights', 'ignore'] },
  outlet:  { label: 'Outlets',  Icon: I.Plug,    assign: ['outlets', 'ignore'] },
  tv:      { label: 'TVs',      Icon: I.TV,      assign: ['tv', 'ignore'] },
  alarm:   { label: 'Security', Icon: I.Bell,    assign: ['security', 'ignore'] },
};
const ASSIGN_LABEL = {
  music: 'Music page', lights: 'Lights page', outlets: 'Outlets page',
  tv: 'TV page', security: 'Security', ignore: 'Skip',
};
const PROTOCOL_LABEL = {
  'shelly': 'Shelly', 'sonos': 'Sonos', 'chromecast': 'Cast', 'hue': 'Hue',
  'samsung': 'Samsung', 'home-assistant': 'HA', 'lg-webos': 'LG',
  'tasmota': 'Tasmota', 'plejd': 'Plejd', 'gateway': 'Gateway',
};

function DeviceTypeIcon({ type }) {
  const icons = { speaker: I.Speaker, lights: I.Light, outlet: I.Plug, tv: I.TV, alarm: I.Bell };
  const Ic = icons[type] || I.Router;
  return <span className="disc-type-icon"><Ic size={13} /></span>;
}

function DiscoveryModal({ integrations, onClose }) {
  const [phase, setPhase]     = useState('idle');
  const [progress, setProgress] = useState(0);
  const [label, setLabel]     = useState('');
  const [found, setFound]     = useState([]);
  const [assigns, setAssigns] = useState({});
  const [err, setErr]         = useState(null);
  const haUrl   = integrations.config.plejd?.url;
  const haToken = integrations.config.plejd?.token;
  const sonosUrl = integrations.config.sonos?.url;

  const addDevice = useCallback(d => {
    setFound(prev => {
      if (prev.some(x => x.id === d.id)) return prev;
      return [...prev, d];
    });
    setAssigns(prev => prev[d.id] !== undefined ? prev : { ...prev, [d.id]: d.assignedTo ?? 'ignore' });
  }, []);

  const scan = useCallback(async () => {
    setPhase('scanning'); setFound([]); setAssigns([]); setErr(null); setProgress(0);

    // 1. Home Assistant
    if (haUrl && haToken) {
      setLabel('Querying Home Assistant…');
      try { (await discoverFromHA(haUrl, haToken)).forEach(addDevice); } catch {}
    }
    setProgress(0.08);

    // 2. Sonos bridge
    if (sonosUrl) {
      setLabel('Querying Sonos bridge…');
      try { (await discoverFromSonosBridge(sonosUrl)).forEach(addDevice); } catch {}
    }
    setProgress(0.14);

    // 3. LAN sweep
    setLabel('Detecting subnet…');
    const subnet = await getLocalSubnet().catch(() => '192.168.1');
    setLabel(`Scanning ${subnet}.0/24…`);
    try {
      await scanLAN(subnet, {
        onProgress: (done, total) => {
          setProgress(0.14 + (done / total) * 0.86);
          setLabel(`${done} / ${total} addresses…`);
        },
        onDevice: addDevice,
      });
    } catch (e) { setErr(String(e.message || e)); }

    setPhase('done'); setLabel('');
  }, [haUrl, haToken, sonosUrl, addDevice]);

  const save = () => {
    const toSave = found
      .map(d => ({ ...d, assignedTo: assigns[d.id] ?? d.assignedTo ?? 'ignore' }))
      .filter(d => d.assignedTo !== 'ignore');
    const existing = integrations.config.discovered?.devices || [];
    const merged = [...existing.filter(e => !toSave.some(n => n.id === e.id)), ...toSave];
    integrations.setIntegration('discovered', { devices: merged, lastScan: new Date().toISOString() });
    onClose();
  };

  const activeAssigns = Object.values(assigns).filter(a => a !== 'ignore').length;
  const types = Object.keys(DEVICE_TYPE_META).filter(t => found.some(d => d.type === t));

  // Close on Escape
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div className="disc-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="disc-modal" role="dialog" aria-modal="true" aria-label="Scan for devices">

        {/* Header */}
        <div className="disc-hdr">
          <span className="disc-hdr-title"><I.Wifi size={14} /> Scan for devices</span>
          <button className="disc-close" onClick={onClose} aria-label="Close"><I.X size={15} /></button>
        </div>

        {/* Idle */}
        {phase === 'idle' && (
          <div className="disc-idle">
            <p className="disc-desc">
              Finds speakers, lights, outlets, TVs, and more across your local network and connected services.
              Speakers are added to the Music page automatically — you choose where everything else goes.
            </p>
            <div className="disc-sources">
              {haUrl && haToken && <span className="disc-source-pill"><I.Home size={10} /> Home Assistant</span>}
              {sonosUrl        && <span className="disc-source-pill"><I.Speaker size={10} /> Sonos bridge</span>}
              <span className="disc-source-pill"><I.Wifi size={10} /> LAN scan</span>
            </div>
            <button className="disc-scan-btn" onClick={scan}><I.Search size={13} /> Scan now</button>
          </div>
        )}

        {/* Scanning */}
        {phase === 'scanning' && (
          <div className="disc-scanning">
            <div className="disc-progress-bar"><div className="disc-progress-fill" style={{ transform: `scaleX(${progress})` }} /></div>
            <div className="disc-progress-label mono">{label || 'Scanning…'}</div>
            {found.length > 0 && (
              <div className="disc-live-list">
                {found.map(d => (
                  <div key={d.id} className="disc-live-row">
                    <DeviceTypeIcon type={d.type} />
                    <span className="disc-live-name">{d.name}</span>
                    <span className="disc-proto-pill">{PROTOCOL_LABEL[d.protocol] || d.protocol}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Done — no results */}
        {phase === 'done' && found.length === 0 && (
          <div className="disc-empty">
            <I.Wifi size={28} style={{ opacity: 0.2, display: 'block', margin: '0 auto 12px' }} />
            <p>No devices found.</p>
            <p style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 4 }}>
              Check that devices are powered on and on the same network.
            </p>
            {err && <p style={{ color: 'var(--destructive)', fontSize: 11, marginTop: 8 }}>{err}</p>}
            <button className="disc-scan-btn" style={{ marginTop: 16 }} onClick={scan}>Try again</button>
          </div>
        )}

        {/* Done — with results */}
        {phase === 'done' && found.length > 0 && (
          <>
            <div className="disc-results">
              {types.map(type => {
                const meta = DEVICE_TYPE_META[type];
                const group = found.filter(d => d.type === type);
                return (
                  <div key={type} className="disc-group">
                    <div className="disc-group-hdr">
                      <meta.Icon size={11} />
                      <span>{meta.label}</span>
                      <span className="disc-group-count">{group.length}</span>
                    </div>
                    {group.map(d => (
                      <div key={d.id} className="disc-device-card">
                        <div className="disc-device-info">
                          <DeviceTypeIcon type={d.type} />
                          <div className="disc-device-text">
                            <div className="disc-device-name">
                              {d.on !== null && (
                                <span className="disc-status-dot" data-on={String(d.on)} title={d.on ? 'On' : 'Off'} />
                              )}
                              {d.name}
                            </div>
                            <div className="disc-device-sub">
                              {d.room  && <span className="disc-room-tag">{d.room}</span>}
                              {d.entityId
                                ? <span className="mono">{d.entityId}</span>
                                : d.ip ? <span className="mono">{d.ip}</span> : null}
                              {d.model ? <span> · {d.model}</span> : null}
                              {d.watts != null && d.watts > 0 && (
                                <span className="disc-watts"> · {d.watts.toFixed(1)} W</span>
                              )}
                            </div>
                          </div>
                          <span className="disc-proto-pill">{PROTOCOL_LABEL[d.protocol] || d.protocol}</span>
                        </div>
                        <select
                          className="disc-assign-select"
                          value={assigns[d.id] ?? d.assignedTo ?? 'ignore'}
                          onChange={e => setAssigns(prev => ({ ...prev, [d.id]: e.target.value }))}
                          aria-label={`Add ${d.name} to`}
                        >
                          {meta.assign.map(v => (
                            <option key={v} value={v}>{ASSIGN_LABEL[v]}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
            <div className="disc-footer">
              <button className="group-toggle" onClick={scan}>Scan again</button>
              <button
                className="group-toggle"
                data-active={activeAssigns > 0 || undefined}
                onClick={save}
              >
                {activeAssigns > 0
                  ? `Add ${activeAssigns} ${activeAssigns === 1 ? 'device' : 'devices'}`
                  : 'Nothing selected'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Per-integration inline action: what one-tap button shows on the catalog
// row header so the user can sign in / sign out without expanding details.
// Returns { label, onClick, primary?, title? } or null if the integration
// has no meaningful one-tap action (e.g. weather just needs lat/lon -- no
// connection to sign out of). Primary=true makes the button amber.
function inlineActionFor(it, status, integrations, spotify) {
  switch (it.id) {
    case 'spotify': {
      if (spotify.token) {
        return { label: 'Disconnect', destructive: true, onClick: spotify.disconnect, title: 'Sign out of Spotify' };
      }
      if (spotify.clientId) {
        return { label: 'Connect', onClick: spotify.connect, primary: true, title: 'Sign in to Spotify' };
      }
      // No Client ID yet -- the expand-and-paste flow is the only path.
      return null;
    }
    case 'plejd':
      if (integrations.config.plejd?.url || integrations.config.plejd?.token) {
        return {
          label: 'Disconnect',
          destructive: true,
          onClick: () => integrations.setIntegration('plejd', { url: '', token: '' }),
          title: 'Forget the Home Assistant URL + token',
        };
      }
      return null;
    case 'sonos':
      if (integrations.config.sonos?.url) {
        return {
          label: 'Disconnect',
          destructive: true,
          onClick: () => integrations.setIntegration('sonos', { url: '' }),
          title: 'Forget the Sonos bridge URL',
        };
      }
      return null;
    case 'shelly':
      if ((integrations.config.shelly?.devices?.length ?? 0) > 0) {
        return {
          label: 'Forget all',
          destructive: true,
          onClick: () => integrations.setIntegration('shelly', { devices: [] }),
          title: 'Forget every saved Shelly device IP',
        };
      }
      return null;
    case 'tibber':
      if (integrations.config.tibber?.token) {
        return {
          label: 'Disconnect',
          destructive: true,
          onClick: () => integrations.setIntegration('tibber', { token: '' }),
          title: 'Forget the Tibber token',
        };
      }
      return null;
    case 'ha-sensors':
      if ((integrations.config.ha?.entities?.length ?? 0) > 0) {
        return {
          label: 'Unpin all',
          destructive: true,
          onClick: () => integrations.setIntegration('ha', { entities: [] }),
          title: 'Unpin every Home Assistant sensor',
        };
      }
      return null;
    case 'weather':
      // Weather is always-on with defaults; no sign-out action.
      return null;
    default:
      return null;
  }
}

// CatalogItem -- one integration row. Extracted into its own component so each
// row owns its per-row armed state for the Disconnect confirm pattern
// (arm → "Confirm | Cancel", auto-disarm after 3 s). Non-destructive actions
// (Spotify "Connect") skip the arm step and fire directly.
function CatalogItem({ it, integrations, spotify, isOpen, onToggle }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);

  const Ic = BRAND_LOGOS[it.id] ?? I[it.icon] ?? I.Plug;
  const status = it.status(integrations, spotify);
  const action = inlineActionFor(it, status, integrations, spotify);

  return (
    <div className="catalog-item" data-status={status} data-open={isOpen}>
      <div className="catalog-head-wrap">
        <button
          type="button"
          className="catalog-head"
          onClick={onToggle}
          aria-expanded={isOpen}
        >
          <span className="settings-row-icon"><Ic size={14} /></span>
          <div className="catalog-head-meta">
            <div className="catalog-head-name">{it.name}</div>
            <div className="catalog-head-sub">{it.tagline}</div>
          </div>
          <span className="catalog-kind">{it.kind}</span>
          <span className="catalog-status" data-status={status}>
            <span className="catalog-status-dot" aria-hidden="true" />
            {STATUS_LABEL[status]}
          </span>
        </button>
        {/* Inline action: non-destructive fires directly; destructive arms first. */}
        {action && (
          armed
            ? <>
                <button type="button" className="catalog-head-action group-toggle"
                  style={{ color: 'var(--destructive)' }}
                  onClick={() => { action.onClick(); setArmed(false); }}>
                  Confirm
                </button>
                <button type="button" className="catalog-head-action group-toggle"
                  onClick={() => setArmed(false)}>
                  Cancel
                </button>
              </>
            : <button
                type="button"
                className="catalog-head-action group-toggle"
                data-active={action.primary || undefined}
                onClick={action.destructive ? () => setArmed(true) : action.onClick}
                title={action.title || action.label}
              >
                {action.label}
              </button>
        )}
        <button
          type="button"
          className="catalog-chev-btn"
          onClick={onToggle}
          aria-label={isOpen ? 'Collapse details' : 'Expand details'}
        >
          <I.ChevronDown size={14} />
        </button>
      </div>
      {isOpen && (
        <div className="catalog-body">
          <IntegrationConfig id={it.id} integrations={integrations} spotify={spotify} />
        </div>
      )}
    </div>
  );
}

function IntegrationCatalog({ integrations, spotify }) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [showDiscovery, setShowDiscovery] = useState(false);
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return INTEGRATION_CATALOG;
    return INTEGRATION_CATALOG.filter(it =>
      it.name.toLowerCase().includes(q) ||
      it.tagline.toLowerCase().includes(q) ||
      it.keywords.some(k => k.includes(q))
    );
  }, [query]);

  const discoveredCount = (integrations.config.discovered?.devices || []).length;

  return (
    <div className="settings-page">
      {/* Scan action — prominent above search so first-time users see it */}
      <div className="catalog-scan-bar">
        <button className="catalog-scan-trigger" onClick={() => setShowDiscovery(true)}>
          <I.Wifi size={13} />
          Scan for devices
          {discoveredCount > 0 && <span className="catalog-scan-badge">{discoveredCount} found</span>}
        </button>
        <span className="catalog-scan-hint">
          Discovers speakers, lights, outlets, and TVs on your network.
          Speakers go to Music automatically.
        </span>
      </div>
      {showDiscovery && (
        <DiscoveryModal integrations={integrations} onClose={() => setShowDiscovery(false)} />
      )}
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
        {query && (
          <button
            type="button"
            className="catalog-search-clear"
            onClick={() => setQuery('')}
            aria-label="Clear search"
          >
            <I.X size={12} />
          </button>
        )}
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
        {items.map(it => (
          <CatalogItem
            key={it.id}
            it={it}
            integrations={integrations}
            spotify={spotify}
            isOpen={expanded === it.id}
            onToggle={() => setExpanded(expanded === it.id ? null : it.id)}
          />
        ))}
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
  if (id === 'ha-sensors') return <HaSensorsConfig integrations={integrations} />;
  return null;
}

function PlejdConfig({ integrations }) {
  const cfg = integrations.config.plejd || {};
  const cloudConnected = !!cfg.cloudSession;
  const haConnected    = !!cfg.url && !!cfg.token;

  // Local state for the email/password form -- never persisted.
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  // Multi-site picker state (most homes have 1 site, occasionally 2+).
  const [sites, setSites] = useState(null);
  const [pendingSession, setPendingSession] = useState(null);
  // HA connection test
  const [haTesting, setHaTesting] = useState(false);
  const [haTestResult, setHaTestResult] = useState(null);
  // Plejd cloud session test (verify stored token is still valid)
  const [sessionTesting, setSessionTesting] = useState(false);
  const [sessionTestResult, setSessionTestResult] = useState(null);

  const testPlejdSession = async () => {
    if (!cfg.cloudSession) return;
    setSessionTesting(true); setSessionTestResult(null);
    try {
      const sites = await plejdFetchSites(cfg.cloudSession);
      const siteNames = sites.map(s => s.title).join(', ') || cfg.cloudSiteTitle || 'site';
      setSessionTestResult({ ok: true, msg: `Session valid · ${siteNames}` });
    } catch (e) {
      const msg = String(e.message || e);
      const isExpired = /unauthorized|session|expired/i.test(msg);
      const isProxyErr = /proxy error/i.test(msg);
      const is5xx = /HTTP 5\d\d/.test(msg);
      setSessionTestResult({
        ok: false,
        msg: isExpired  ? 'Session expired — sign out and sign in again'
           : isProxyErr ? 'Cannot reach Plejd cloud — check network connection'
           : is5xx      ? 'Plejd server error — sign out and sign in again to refresh your session'
           : msg.slice(0, 80),
      });
    } finally {
      setSessionTesting(false);
    }
  };

  const testHaConnection = async () => {
    const base = (cfg.url || '').trim().replace(/\/$/, '');
    const tok = (cfg.token || '').trim();
    if (!base || !tok) return;
    setHaTesting(true); setHaTestResult(null);
    try {
      const res = await fetch(`${base}/api/`, {
        headers: { Authorization: `Bearer ${tok}` },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json().catch(() => ({}));
      setHaTestResult({ ok: true, msg: j.message || `Home Assistant ${j.version || 'reachable'}` });
    } catch (e) {
      setHaTestResult({ ok: false, msg: e.message || 'Could not reach Home Assistant' });
    } finally {
      setHaTesting(false);
    }
  };

  const doLogin = async () => {
    setErr(null); setLoading(true);
    try {
      const { sessionToken, userId, email: e } = await plejdLogin(email.trim(), password);
      const fetched = await plejdFetchSites(sessionToken);
      if (fetched.length === 0) throw new Error('No Plejd sites found on this account');
      if (fetched.length === 1) {
        integrations.setIntegration('plejd', {
          cloudSession: sessionToken,
          cloudUserId: userId,
          cloudEmail: e || email.trim(),
          cloudSiteId: fetched[0].objectId,
          cloudSiteTitle: fetched[0].title,
        });
        setPassword('');
      } else {
        setSites(fetched);
        setPendingSession({ sessionToken, userId, email: e || email.trim() });
      }
    } catch (e2) {
      setErr(String(e2.message || e2));
    } finally {
      setLoading(false);
    }
  };
  const pickSite = (s) => {
    if (!pendingSession) return;
    integrations.setIntegration('plejd', {
      cloudSession: pendingSession.sessionToken,
      cloudUserId: pendingSession.userId,
      cloudEmail: pendingSession.email,
      cloudSiteId: s.objectId,
      cloudSiteTitle: s.title,
    });
    setSites(null); setPendingSession(null);
    setEmail(''); setPassword('');
  };
  const disconnectCloud = () => {
    integrations.setIntegration('plejd', {
      cloudSession: '', cloudUserId: '', cloudEmail: '', cloudSiteId: '', cloudSiteTitle: '',
    });
  };

  if (cloudConnected) {
    return (
      <div className="catalog-form">
        <p className="catalog-help">
          Signed in to Plejd as <b>{cfg.cloudEmail}</b> — site <b>{cfg.cloudSiteTitle || cfg.cloudSiteId}</b>.
          Your real rooms, devices, and names appear on the home page automatically.
        </p>
        <p className="catalog-help" style={{ color: 'var(--muted-foreground)', fontSize: 11 }}>
          Cloud sign-in gives the dashboard your real room names, device names, and state. When the home hub is running, toggle control works immediately over your local network. Without the hub, control requires a <a href="https://www.plejd.com/products/gwy-01" target="_blank" rel="noreferrer">Plejd GWY-01 gateway</a> paired to your installation.
        </p>
        <div className="catalog-actions" style={{ marginTop: 12 }}>
          <button className="group-toggle" onClick={testPlejdSession} disabled={sessionTesting}>
            {sessionTesting ? 'Testing…' : 'Test connection'}
          </button>
          {sessionTestResult && (
            <span style={{ fontSize: 12, color: sessionTestResult.ok ? 'var(--primary)' : 'var(--destructive)' }}>
              {sessionTestResult.ok ? `âœ“ ${sessionTestResult.msg}` : `âœ— ${sessionTestResult.msg}`}
            </span>
          )}
          <button className="group-toggle" onClick={disconnectCloud}>Sign out of Plejd</button>
        </div>
      </div>
    );
  }

  if (sites) {
    return (
      <div className="catalog-form">
        <p className="catalog-help">Pick which Plejd installation you want this dashboard to show.</p>
        <div className="catalog-list">
          {sites.map(s => (
            <div key={s.objectId} className="catalog-list-row">
              <span><b>{s.title}</b></span>
              <button className="group-toggle" data-active="true" onClick={() => pickSite(s)}>Use this one</button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="catalog-form">
      <p className="catalog-help">
        Sign in with your Plejd account (same credentials as the Plejd mobile app) to see your rooms and device names. Toggle control also requires a <b>GWY-01</b> gateway on the same installation — the dashboard will try and indicate if it succeeds.
      </p>
      <label className="catalog-label">Plejd email</label>
      <input className="settings-input" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
      <label className="catalog-label" style={{ marginTop: 10 }}>Password</label>
      <input className="settings-input" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
      {err && (
        <div style={{ marginTop: 8 }}>
          <div className="catalog-help" style={{ color: 'var(--destructive)' }}>{err}</div>
          {/unauthorized/i.test(err) && (
            <div className="catalog-help" style={{ color: 'var(--muted-foreground)', marginTop: 4, fontSize: 11 }}>
              If you signed up for Plejd via Google, you need a password set on your account — go to <b>Settings → Account</b> in the Plejd app and set one first.
            </div>
          )}
        </div>
      )}
      <div className="catalog-actions" style={{ marginTop: 12 }}>
        <button className="group-toggle" data-active="true" onClick={doLogin} disabled={loading || !email.trim() || !password}>
          {loading ? 'Signing in…' : 'Sign in to Plejd'}
        </button>
      </div>
      <p className="catalog-help" style={{ fontSize: 11, marginTop: 10 }}>
        Your credentials go straight to Plejd's API; the dashboard only keeps the resulting session token. The password is never stored.
      </p>

      <details className="settings-advanced">
        <summary>Advanced — Home Assistant instead</summary>
        <p className="catalog-help">
          If you already run Home Assistant with the <span className="mono">hassio-plejd</span> add-on, point the dashboard at HA directly instead. HA's <span className="mono">configuration.yaml</span> must include <span className="mono">{window.location.origin}</span> under <span className="mono">http.cors_allowed_origins</span>.
        </p>
        <label className="catalog-label">Home Assistant address</label>
        <MaskedSecret
          value={cfg.url || ''}
          onSave={(v) => integrations.setIntegration('plejd', { url: v, token: cfg.token || '' })}
          placeholder="http://homeassistant.local:8123"
          type="text"
          autoComplete="url"
        />
        <label className="catalog-label" style={{ marginTop: 10 }}>Access token</label>
        <MaskedSecret
          value={cfg.token || ''}
          onSave={(v) => integrations.setIntegration('plejd', { url: cfg.url || '', token: v })}
          placeholder="eyJhbGciOi..."
        />
        {haConnected && (
          <div className="catalog-actions" style={{ marginTop: 12 }}>
            <button className="group-toggle" onClick={testHaConnection} disabled={haTesting}>
              {haTesting ? 'Testing…' : 'Test connection'}
            </button>
            {haTestResult && (
              <span style={{ fontSize: 12, color: haTestResult.ok ? 'var(--primary)' : 'var(--destructive)' }}>
                {haTestResult.ok ? `âœ“ ${haTestResult.msg}` : `âœ— ${haTestResult.msg}`}
              </span>
            )}
            <button className="group-toggle" onClick={() => { integrations.setIntegration('plejd', { url: '', token: '' }); setHaTestResult(null); }}>Disconnect Home Assistant</button>
          </div>
        )}
      </details>
    </div>
  );
}

function SonosConfig({ integrations }) {
  const cfg = integrations.config.sonos || { url: '' };
  const [url, setUrl] = useState(cfg.url);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => { setUrl(cfg.url); }, [cfg.url]);

  async function testConnection() {
    const base = url.trim().replace(/\/$/, '');
    if (!base) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${base}/zones`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const zones = await res.json();
      const rooms = zones
        .map(z => z.coordinator?.roomName || z.zoneName || '')
        .filter(Boolean);
      setTestResult({ ok: true, rooms });
    } catch (err) {
      setTestResult({ ok: false, error: err.message || 'Connection failed' });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="catalog-form">
      <p className="catalog-help">
        Run <a href="https://github.com/jishi/node-sonos-http-api" target="_blank" rel="noreferrer">node-sonos-http-api</a> on any LAN machine (Raspberry Pi, NAS, Docker). It auto-discovers your Sonos zones over UPnP — no configuration required.
      </p>
      <pre className="catalog-code">{`npm install -g node-sonos-http-api\nnode-sonos-http-api`}</pre>
      <div>
        <label className="catalog-label">Bridge URL</label>
        <div className="catalog-search">
          <input
            className="settings-input"
            type="url"
            placeholder="http://192.168.1.x:5005"
            value={url}
            onChange={(e) => { setUrl(e.target.value); setTestResult(null); }}
            autoComplete="off"
          />
          <button
            className="group-toggle"
            onClick={testConnection}
            disabled={testing || !url.trim()}
          >
            {testing ? 'Testing…' : 'Test'}
          </button>
        </div>
      </div>
      {testResult && !testResult.ok && (
        <p className="catalog-help" style={{ color: 'var(--destructive)' }}>
          {testResult.error}
        </p>
      )}
      {testResult?.ok && (
        <div>
          <label className="catalog-label">
            Discovered rooms ({testResult.rooms.length})
          </label>
          <ul className="catalog-list">
            {testResult.rooms.map(r => (
              <li key={r} className="catalog-list-row">{r}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="catalog-actions">
        <button
          className="group-toggle"
          data-active="true"
          onClick={() => integrations.setIntegration('sonos', { url: url.trim() })}
        >
          Save
        </button>
        {cfg.url && (
          <button
            className="group-toggle"
            onClick={() => { integrations.setIntegration('sonos', { url: '' }); setTestResult(null); }}
          >
            Disconnect
          </button>
        )}
      </div>

      {/* Official Sonos account (hub OAuth) — real grouping, no LAN bridge */}
      <div>
        <label className="catalog-label">Sonos account (grouping)</label>
        <p className="catalog-help">
          Sign in with your Sonos account for real speaker grouping and
          per-speaker volume. The sign-in completes on the hub — this browser
          never sees the app secret. No bridge process needed.
        </p>
        <button
          className="group-toggle"
          data-active="true"
          onClick={() => {
            hubRest('sonos-cloud', 'beginAuth', {})
              .then(r => { if (r?.url) window.location.href = r.url; })
              .catch(e => setTestResult({ ok: false, error: `Sonos sign-in: ${String(e.message || e)} — is the hub running?` }));
          }}
        >
          Sign in with Sonos
        </button>
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
  // Per-device test state: { [ip]: { testing: bool, ok: bool|null, msg: string } }
  const [deviceTests, setDeviceTests] = useState({});

  const testDevice = async (deviceIp) => {
    setDeviceTests(t => ({ ...t, [deviceIp]: { testing: true, ok: null, msg: '' } }));
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3000);
      let r = await fetch(`http://${deviceIp}/rpc/Shelly.GetDeviceInfo`, { signal: ctrl.signal }).catch(() => null);
      if (!r?.ok) r = await fetch(`http://${deviceIp}/shelly`, { signal: ctrl.signal }).catch(() => null);
      clearTimeout(timer);
      if (r?.ok) {
        const j = await r.json().catch(() => null);
        const model = j?.model || j?.type || 'Shelly';
        setDeviceTests(t => ({ ...t, [deviceIp]: { testing: false, ok: true, msg: model } }));
      } else {
        setDeviceTests(t => ({ ...t, [deviceIp]: { testing: false, ok: false, msg: 'Not reachable' } }));
      }
    } catch {
      setDeviceTests(t => ({ ...t, [deviceIp]: { testing: false, ok: false, msg: 'Not reachable' } }));
    }
  };

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
          {(cfg.devices || []).map((d, i) => {
            const t = deviceTests[d.ip];
            return (
              <div key={i} className="catalog-list-row">
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b>{d.name}</b>{' '}
                  <span className="mono" style={{ color: 'var(--muted-foreground)' }}>{d.ip}</span>
                  {d.room && <> · {d.room}</>}
                  {t && !t.testing && (
                    <span style={{ marginLeft: 8, fontSize: 11, color: t.ok ? 'var(--primary)' : 'var(--destructive)' }}>
                      {t.ok ? `âœ“ ${t.msg}` : `âœ— ${t.msg}`}
                    </span>
                  )}
                </span>
                <button className="group-toggle" onClick={() => testDevice(d.ip)} disabled={t?.testing}>
                  {t?.testing ? '…' : 'Test'}
                </button>
                <button className="group-toggle" onClick={() => removeDevice(i)}>Remove</button>
              </div>
            );
          })}
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
  const onLocalhost = window.location.hostname === 'localhost';
  const suggested127 = `http://127.0.0.1${window.location.port ? ':' + window.location.port : ''}${window.location.pathname}`;
  const isSetUp = !!spotify.clientId;
  const isSignedIn = !!spotify.token;

  return (
    <div className="catalog-form">
      {/* ── Step 1: Admin one-time setup ───────────────────────────────── */}
      <details className="settings-advanced" open={!isSetUp}>
        <summary>Admin setup (one time per household)</summary>
        <div>
          <p className="catalog-help" style={{ marginBottom: 10 }}>
            Register one Spotify app at <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">developer.spotify.com</a>. Every person in the household then signs in with <b>their own</b> Spotify account — no separate app per person.
          </p>
          <ol className="catalog-help" style={{ paddingLeft: 18, margin: '0 0 10px', lineHeight: 2 }}>
            <li>Create an app at developer.spotify.com → "Create app"</li>
            <li>Add redirect URI: <span className="mono">{spRedirectUri()}</span></li>
            <li>Copy the <b>Client ID</b> (32-char hex) and paste it below</li>
            <li>Add each household member's Spotify email to the app's "Users" allowlist</li>
          </ol>
          {onLocalhost && (
            <p className="catalog-help catalog-notice" style={{ marginBottom: 10 }}>
              <b>Note:</b> Spotify rejects <span className="mono">localhost</span> redirect URIs. Register <span className="mono">{suggested127}</span> and access this page at <a href={suggested127}>{suggested127}</a>, or deploy to an HTTPS host.
            </p>
          )}
          <label className="catalog-label">Client ID</label>
          <MaskedSecret
            value={spotify.clientId || ''}
            onSave={(v) => spotify.setClientId(v)}
            placeholder="32-char hex from developer.spotify.com"
            type="text"
          />
        </div>
      </details>

      {/* ── Step 2: Any household member signs in ──────────────────────── */}
      {isSetUp && !isSignedIn && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
          <p className="catalog-help">
            Sign in with your personal Spotify account. Your token stays in this browser only.
          </p>
          <button
            className="spotify-signin-btn"
            onClick={spotify.connect}
          >
            <BrandSpotify size={16} />
            Sign in with Spotify
          </button>
        </div>
      )}

      {isSignedIn && (
        <div className="spotify-signed-in">
          {spotify.me?.images?.[0]?.url && (
            <img
              src={spotify.me.images[0].url}
              alt=""
              className="spotify-avatar"
            />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 500, fontSize: 13 }}>{spotify.me?.display_name || 'Spotify user'}</div>
            {spotify.me?.email && <div className="catalog-help">{spotify.me.email}</div>}
          </div>
          <button className="group-toggle" onClick={spotify.disconnect}>Sign out</button>
        </div>
      )}

      {spotify.error && (
        <p className="catalog-help" style={{ color: 'var(--destructive)' }}>{spotify.error}</p>
      )}
    </div>
  );
}

function TibberConfig({ integrations }) {
  const cfg = integrations.config.tibber || { token: '' };
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(!cfg.token);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => { setEditing(!cfg.token); setDraft(''); setTestResult(null); }, [cfg.token]);

  const testToken = async (tok) => {
    if (!tok?.trim()) return;
    setTesting(true); setTestResult(null);
    try {
      const res = await fetch('https://api.tibber.com/v1-beta/gql', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok.trim()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ viewer { name homes { address { address1 } } } }' }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      if (j.errors?.length) throw new Error(j.errors[0].message || 'Invalid token');
      const name = j.data?.viewer?.name || 'Tibber account';
      const homes = (j.data?.viewer?.homes || []).map(h => h.address?.address1).filter(Boolean);
      setTestResult({ ok: true, name, homes });
    } catch (e) {
      setTestResult({ ok: false, error: e.message || 'Connection failed' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="catalog-form">
      <p className="catalog-help">
        {cfg.token
          ? <>Connected. Live electricity prices flow into the Power tile.</>
          : <>Get a personal access token at <a href="https://developer.tibber.com" target="_blank" rel="noreferrer">developer.tibber.com</a> — it stays in this browser.</>}
      </p>
      <label className="catalog-label">Access token</label>
      {editing ? (
        <div className="catalog-search">
          <input
            className="settings-input"
            type="password"
            placeholder="Bearer ..."
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setTestResult(null); }}
            autoComplete="off"
            spellCheck="false"
          />
          <button className="group-toggle" onClick={() => testToken(draft)} disabled={testing || !draft.trim()}>
            {testing ? 'Testing…' : 'Test'}
          </button>
          <button className="group-toggle" data-active="true" onClick={() => integrations.setIntegration('tibber', { token: draft.trim() })} disabled={!draft.trim()}>
            Save
          </button>
          {cfg.token && <button className="group-toggle" onClick={() => { setEditing(false); setDraft(''); setTestResult(null); }}>Cancel</button>}
        </div>
      ) : (
        <div className="catalog-search">
          <input className="settings-input" type="text" value={'••••••••' + String(cfg.token).slice(-4)} readOnly aria-label="Stored token (masked)" />
          <button className="group-toggle" onClick={() => testToken(cfg.token)} disabled={testing}>
            {testing ? 'Testing…' : 'Test'}
          </button>
          <button className="group-toggle" onClick={() => { setEditing(true); setTestResult(null); }}>Change</button>
        </div>
      )}
      {testResult && !testResult.ok && (
        <p className="catalog-help" style={{ color: 'var(--destructive)', marginTop: 8 }}>
          {testResult.error}
        </p>
      )}
      {testResult?.ok && (
        <p className="catalog-help" style={{ color: 'var(--primary)', marginTop: 8 }}>
          Connected as {testResult.name}{testResult.homes.length ? ` · ${testResult.homes.join(', ')}` : ''}
        </p>
      )}
      {cfg.token && !editing && (
        <div className="catalog-actions" style={{ marginTop: 12 }}>
          <button className="group-toggle" onClick={() => integrations.setIntegration('tibber', { token: '' })}>Disconnect</button>
        </div>
      )}
    </div>
  );
}

function WeatherConfig({ integrations }) {
  const cfg = integrations.config.weather || { lat: '', lon: '', city: '' };
  const [lat, setLat] = useState(cfg.lat);
  const [lon, setLon] = useState(cfg.lon);
  const [city, setCity] = useState(cfg.city);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  useEffect(() => { setLat(cfg.lat); setLon(cfg.lon); setCity(cfg.city); setTestResult(null); }, [cfg.lat, cfg.lon, cfg.city]);

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      setLat(pos.coords.latitude.toFixed(4));
      setLon(pos.coords.longitude.toFixed(4));
      setTestResult(null);
    });
  };

  const testCoords = async () => {
    const la = String(lat).trim();
    const lo = String(lon).trim();
    if (!la || !lo) return;
    setTesting(true); setTestResult(null);
    try {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&current=temperature_2m,weather_code`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      const temp = j.current?.temperature_2m;
      const tz = j.timezone_abbreviation || j.timezone || '';
      setTestResult({ ok: true, temp, tz });
    } catch (e) {
      setTestResult({ ok: false, error: e.message || 'Invalid coordinates or network error' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="catalog-form">
      <p className="catalog-help">
        Weather comes from <a href="https://open-meteo.com" target="_blank" rel="noreferrer">open-meteo.com</a> — free, no API key, CORS-open. Set your latitude / longitude (or click "Use my location") and the city label that shows in the header.
      </p>
      <div className="catalog-add-grid">
        <input className="settings-input" placeholder="Latitude (59.3293)" value={lat} onChange={e => { setLat(e.target.value); setTestResult(null); }} autoComplete="off" />
        <input className="settings-input" placeholder="Longitude (18.0686)" value={lon} onChange={e => { setLon(e.target.value); setTestResult(null); }} autoComplete="off" />
        <input className="settings-input" placeholder="City (Stockholm)" value={city} onChange={e => setCity(e.target.value)} autoComplete="off" />
        <button className="group-toggle" onClick={useMyLocation}>Use my location</button>
      </div>
      <div className="catalog-actions">
        <button className="group-toggle" onClick={testCoords} disabled={testing || !String(lat).trim() || !String(lon).trim()}>
          {testing ? 'Testing…' : 'Test'}
        </button>
        <button className="group-toggle" data-active="true" onClick={() => integrations.setIntegration('weather', { lat: String(lat).trim(), lon: String(lon).trim(), city: String(city).trim() })}>Save</button>
      </div>
      {testResult && !testResult.ok && (
        <p className="catalog-help" style={{ color: 'var(--destructive)', marginTop: 8 }}>{testResult.error}</p>
      )}
      {testResult?.ok && (
        <p className="catalog-help" style={{ color: 'var(--primary)', marginTop: 8 }}>
          âœ“ Open-Meteo responded{testResult.temp != null ? ` — current temp ${testResult.temp}°C` : ''}{testResult.tz ? ` · ${testResult.tz}` : ''}
        </p>
      )}
    </div>
  );
}

// HaSensorsConfig -- per-entity pin list. Reuses the Plejd HA URL+token (a
// home only has one HA bridge in practice). Each entity gets a label + unit
// + icon so the home-page tile reads as an appliance ("Kitchen 21.4°C"), not
// as an HA entity ID ("sensor.kitchen_temperature 21.4").
//
// Icon names come from the global I icon set; we offer a small curated
// shortlist via a dropdown rather than free-form to avoid typos. Unit is
// free-form ("°C", "%", "kWh", "lx", or empty for binary states).
const HA_ICON_CHOICES = ['Sun', 'Moon', 'Cloud', 'Home', 'Light', 'Plug', 'Speaker', 'Disc', 'Zap', 'Router', 'Coffee', 'TV', 'Lamp', 'Bulb', 'Fan'];

function HaSensorsConfig({ integrations }) {
  const plejdCfg = integrations.config.plejd || {};
  const cfg = integrations.config.ha || { entities: [] };
  const entities = cfg.entities || [];
  // Local draft state for the "add a new entity" row.
  const [id, setId] = useState('');
  const [label, setLabel] = useState('');
  const [unit, setUnit] = useState('');
  const [icon, setIcon] = useState('Home');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const canAdd = id.trim().includes('.') && label.trim();
  const haCredsSet = !!(plejdCfg.url && plejdCfg.token);

  const testHaConnection = async () => {
    const base = (plejdCfg.url || '').trim().replace(/\/$/, '');
    const tok = (plejdCfg.token || '').trim();
    if (!base || !tok) return;
    setTesting(true); setTestResult(null);
    try {
      const res = await fetch(`${base}/api/`, {
        headers: { Authorization: `Bearer ${tok}` },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json().catch(() => ({}));
      setTestResult({ ok: true, msg: j.message || `Home Assistant ${j.version || 'reachable'}` });
    } catch (e) {
      setTestResult({ ok: false, msg: e.message || 'Could not reach Home Assistant' });
    } finally {
      setTesting(false);
    }
  };

  const add = () => {
    if (!canAdd) return;
    const next = [...entities, { id: id.trim(), label: label.trim(), unit: unit.trim(), icon }];
    integrations.setIntegration('ha', { entities: next });
    setId(''); setLabel(''); setUnit(''); setIcon('Home');
  };
  const remove = (entityId) => {
    integrations.setIntegration('ha', { entities: entities.filter(e => e.id !== entityId) });
  };

  return (
    <div className="catalog-form">
      <p className="catalog-help">
        Pin any Home Assistant entity onto the dashboard. Reuses the URL + token from the Plejd integration -- one HA bridge, two consumers. To find an entity ID in HA: <span className="mono">Developer Tools → States</span>. Common examples: <span className="mono">sensor.kitchen_temperature</span>, <span className="mono">binary_sensor.front_door</span>, <span className="mono">sensor.vacuum_battery</span>.
      </p>
      {!haCredsSet && (
        <p className="catalog-help catalog-notice">
          <b>Heads up:</b> set up Plejd first (URL + Home Assistant token) — the sensors share those credentials.
        </p>
      )}
      {haCredsSet && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <button className="group-toggle" onClick={testHaConnection} disabled={testing}>
            {testing ? 'Testing…' : 'Test HA connection'}
          </button>
          {testResult && (
            <span style={{ fontSize: 12, color: testResult.ok ? 'var(--primary)' : 'var(--destructive)' }}>
              {testResult.ok ? `âœ“ ${testResult.msg}` : `âœ— ${testResult.msg}`}
            </span>
          )}
        </div>
      )}
      {entities.length > 0 && (
        <div className="catalog-list">
          {entities.map((e) => {
            const Ic = I[e.icon] ?? I.Home;
            return (
              <div key={e.id} className="catalog-list-row">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                  <Ic size={14} />
                  <b>{e.label}</b> <span className="mono" style={{ color: 'var(--muted-foreground)' }}>{e.id}</span>{e.unit ? <> · {e.unit}</> : null}
                </span>
                <button className="group-toggle" onClick={() => remove(e.id)}>Remove</button>
              </div>
            );
          })}
        </div>
      )}
      <label className="catalog-label" style={{ marginTop: 12 }}>Add an entity</label>
      <div className="catalog-add-grid" style={{ gridTemplateColumns: '2fr 1fr 80px auto auto' }}>
        <input className="settings-input" placeholder="sensor.kitchen_temperature" value={id} onChange={e => setId(e.target.value)} autoComplete="off" spellCheck="false" />
        <input className="settings-input" placeholder="Label (Kitchen)" value={label} onChange={e => setLabel(e.target.value)} autoComplete="off" />
        <input className="settings-input" placeholder="°C" value={unit} onChange={e => setUnit(e.target.value)} autoComplete="off" />
        <select className="settings-input" value={icon} onChange={e => setIcon(e.target.value)} style={{ minWidth: 90 }}>
          {HA_ICON_CHOICES.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <button className="group-toggle" data-active="true" onClick={add} disabled={!canAdd || !haCredsSet}>Add</button>
      </div>
    </div>
  );
}

// List + management UI for devices found via the network scan.
// Shows each discovered device with its assigned destination, a reassign
// dropdown, and a remove button. Groups by type for scannability.
function DiscoveredDevicesList({ integrations }) {
  const devices = integrations.config.discovered?.devices || [];
  const lastScan = integrations.config.discovered?.lastScan;
  if (devices.length === 0) return null;

  const removeDevice = (id) => {
    const next = devices.filter(d => d.id !== id);
    integrations.setIntegration('discovered', { devices: next, lastScan });
  };

  const reassign = (id, to) => {
    const next = devices.map(d => d.id === id ? { ...d, assignedTo: to } : d);
    integrations.setIntegration('discovered', { devices: next, lastScan });
  };

  const types = Object.keys(DEVICE_TYPE_META).filter(t => devices.some(d => d.type === t));
  const scanDate = lastScan ? new Date(lastScan).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <div style={{ marginTop: 12 }}>
      <div className="micro-label" style={{ padding: '0 0 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Discovered devices</span>
        {scanDate && <span style={{ opacity: 0.5, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>Last scan: {scanDate}</span>}
      </div>
      {types.map(type => {
        const meta = DEVICE_TYPE_META[type];
        const group = devices.filter(d => d.type === type);
        return (
          <div key={type} style={{ marginBottom: 8 }}>
            <div className="settings-section">
              {group.map(d => {
                const options = meta.assign;
                return (
                  <div key={d.id} className="settings-row">
                    <span className="settings-row-icon"><meta.Icon size={14} /></span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="settings-row-name">{d.name}</div>
                      <div className="settings-row-sub">
                        {d.ip && <span className="mono">{d.ip}</span>}
                        {d.entityId && <span className="mono">{d.entityId}</span>}
                        {d.model ? ` · ${d.model}` : ''}
                        {' '}· <span className="disc-proto-pill" style={{ display: 'inline' }}>{PROTOCOL_LABEL[d.protocol] || d.protocol}</span>
                      </div>
                    </div>
                    <select
                      className="disc-assign-select"
                      value={d.assignedTo || 'ignore'}
                      onChange={e => reassign(d.id, e.target.value)}
                      aria-label={`Assign ${d.name}`}
                    >
                      {options.map(v => <option key={v} value={v}>{ASSIGN_LABEL[v]}</option>)}
                      <option value="ignore">Skip</option>
                    </select>
                    <button
                      className="group-toggle"
                      style={{ marginLeft: 6, flexShrink: 0 }}
                      onClick={() => removeDevice(d.id)}
                      title={`Remove ${d.name}`}
                    >
                      <I.X size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SettingsPage({ rooms, outlets, speakers, activity, spotify, google, integrations, demoMode, onLoadDemo, onClearDemo, hubConnected }) {
  const deviceTotal = rooms.length + outlets.length + speakers.length;
  // MaskedSecret handles its own draft/save for both Spotify and Google Client
  // IDs — no top-level draft state needed here.
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

  // Two-step destructive confirmations. First click arms; second click commits.
  // Auto-disarms after 3 s so an accidental tap doesn't leave the button in
  // a charged state the user doesn't notice.
  const [signOutArmed, setSignOutArmed] = useState(false);
  const [clearDemoArmed, setClearDemoArmed] = useState(false);
  useEffect(() => {
    if (!signOutArmed) return;
    const t = setTimeout(() => setSignOutArmed(false), 3000);
    return () => clearTimeout(t);
  }, [signOutArmed]);
  useEffect(() => {
    if (!clearDemoArmed) return;
    const t = setTimeout(() => setClearDemoArmed(false), 3000);
    return () => clearTimeout(t);
  }, [clearDemoArmed]);

  // Derive honest device-tier status. In demo mode all three report active;
  // otherwise status follows whether the integration is configured.
  const plejdActive  = demoMode || !!(integrations.config.plejd?.cloudSession || (integrations.config.plejd?.url && integrations.config.plejd?.token));
  const sonosActive  = demoMode || !!integrations.config.sonos?.url;
  const shellyActive = demoMode || (integrations.config.shelly?.devices?.length ?? 0) > 0;

  return (
    <div className="settings-route">
      <Section
        title="Your account"
        source={google?.user ? 'Signed in' : 'Not signed in'}
        summary={google?.user
          ? <>Identity verified · stored only in this browser</>
          : <>Sign in to make this dashboard yours</>}
      >
        <div className="settings-page">
          <div className="settings-section">
            {google?.error && (
              <div className="settings-row" style={{ color: 'var(--destructive)' }}>
                <span className="settings-row-icon"><I.PowerOff size={14} /></span>
                <div>
                  <div className="settings-row-name">Sign-in error</div>
                  <div className="settings-row-sub">{google.error}</div>
                </div>
              </div>
            )}
            <div className="settings-row" data-on={!!google?.user}>
              <span className="settings-row-icon">
                {google?.user?.picture
                  ? <img src={google.user.picture} alt="" referrerPolicy="no-referrer" style={{ width: 22, height: 22, borderRadius: 999, objectFit: 'cover' }} />
                  : <I.Home size={14} />}
              </span>
              <div style={{ width: '100%' }}>
                <div className="settings-row-name">{google?.user?.name || 'Not signed in'}</div>
                <div className="settings-row-sub">
                  {google?.user
                    ? google.user.email || 'Local profile'
                    : google?.clientId
                      ? 'Tap the Google button below to sign in.'
                      : 'Add a Google connection (Advanced ▾) or sign up with email.'}
                </div>
                {!google?.user && google?.clientId && (
                  <div ref={gsiBtnRef} style={{ marginTop: 8, minHeight: 40 }} />
                )}
              </div>
              {google?.user ? (
                signOutArmed
                  ? <>
                      <button className="group-toggle" style={{ color: 'var(--destructive)' }} onClick={google.signOut}>Confirm sign out</button>
                      <button className="group-toggle" onClick={() => setSignOutArmed(false)} style={{ marginLeft: 6 }}>Cancel</button>
                    </>
                  : <button className="group-toggle" onClick={() => setSignOutArmed(true)}>Sign out</button>
              ) : null}
            </div>
            {!google?.user && (
              <div className="settings-row">
                <span className="settings-row-icon"><I.Home size={14} /></span>
                <div style={{ width: '100%' }}>
                  <div className="settings-row-name">Or use email instead</div>
                  <div className="settings-row-sub">
                    Local profile in this browser. No password, no sync. Good enough for guests.
                  </div>
                  <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8 }}>
                    <input className="settings-input" type="text" autoComplete="off" placeholder="Your name" value={signupName} onChange={(e) => setSignupName(e.target.value)} />
                    <input className="settings-input" type="email" autoComplete="off" placeholder="you@example.com" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} />
                    <button className="group-toggle" onClick={submitSignup} disabled={!signupName.trim() || !signupEmail.trim()}>Create</button>
                  </div>
                </div>
              </div>
            )}
            {/* Google OAuth Client ID is now hidden behind an "Advanced" expander
                so the typical signed-in user never sees the technical scaffolding.
                One-time setup, change-only-when-you-need-to. */}
            <details className="settings-advanced">
              <summary>Advanced — Google connection</summary>
              <p className="catalog-help" style={{ marginBottom: 6 }}>
                The dashboard signs you in through a Google Cloud project you own.
                {' '}<a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Create a Client ID</a>
                {' '}(APIs &amp; Services → Credentials → OAuth Client ID, Web type), and add{' '}
                <span className="mono">{window.location.origin}</span> under "Authorized JavaScript origins".
              </p>
              <MaskedSecret
                value={google?.clientId || ''}
                onSave={(v) => google?.setClientId?.(v)}
                placeholder="123456789-abc.apps.googleusercontent.com"
                type="text"
              />
            </details>
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
        <div className="settings-page" style={{ marginTop: 0 }}>
          <div className="settings-section">
            <div className="settings-row" data-on={hubConnected || undefined}>
              <span className="settings-row-icon"><I.Wifi size={14} /></span>
              <div>
                <div className="settings-row-name">Real-time hub</div>
                <div className="settings-row-sub">
                  {hubConnected
                    ? 'Connected — device updates stream live to all tabs'
                    : <>Offline · run <span className="mono">npm run hub</span> to enable live updates</>}
                </div>
              </div>
              <span className="settings-row-state">{hubConnected ? 'Live' : 'Offline'}</span>
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="Devices"
        source="local inventory"
        summary={<><b>{deviceTotal}</b> devices · <b>{rooms.length}</b> rooms · <b>{outlets.length}</b> outlets · <b>{speakers.length}</b> speakers</>}
      >
        <div className="settings-page">
          <div className="settings-section">
            <div className="settings-row" data-on={plejdActive || undefined}>
              <span className="settings-row-icon"><I.Light size={14} /></span>
              <div>
                <div className="settings-row-name">Plejd bulbs</div>
                <div className="settings-row-sub">{rooms.reduce((a,r) => a + r.bulbs, 0)} bulbs across {rooms.length} rooms</div>
              </div>
              <span className="settings-row-state">{plejdActive ? 'Online' : 'Not set up'}</span>
            </div>
            <div className="settings-row" data-on={shellyActive || undefined}>
              <span className="settings-row-icon"><I.Plug size={14} /></span>
              <div>
                <div className="settings-row-name">Shelly outlets</div>
                <div className="settings-row-sub">{outlets.length} outlets · {outlets.filter(o => o.alwaysOn).length} always-on</div>
              </div>
              <span className="settings-row-state">{shellyActive ? 'Online' : 'Not set up'}</span>
            </div>
            <div className="settings-row" data-on={sonosActive || undefined}>
              <span className="settings-row-icon"><I.Speaker size={14} /></span>
              <div>
                <div className="settings-row-name">Sonos speakers</div>
                <div className="settings-row-sub">{speakers.length} speakers · lead room: {speakers.find(s => s.primary)?.name ?? '—'}</div>
              </div>
              <span className="settings-row-state">{sonosActive ? 'Online' : 'Not set up'}</span>
            </div>
          </div>
          {/* Discovered devices — populated by the network scan */}
          <DiscoveredDevicesList integrations={integrations} />
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
            <span>Any credentials you add stay in your browser only. No data is sent to our servers.</span>
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
                ? (clearDemoArmed
                    ? <>
                        <button className="group-toggle" style={{ color: 'var(--destructive)' }} onClick={() => { onClearDemo(); setClearDemoArmed(false); }}>Confirm clear</button>
                        <button className="group-toggle" onClick={() => setClearDemoArmed(false)} style={{ marginLeft: 6 }}>Cancel</button>
                      </>
                    : <button className="group-toggle" onClick={() => setClearDemoArmed(true)}>Clear</button>)
                : <button className="group-toggle" data-active="true" onClick={onLoadDemo}>Load demo data</button>}
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}

// Mount logic moved to `src/main.jsx`. Export the root component instead.
export default App;
