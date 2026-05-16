// Single observable store for the whole household. One slice per domain.
// Components write through setters and read through selectors; cross-tab sync
// (see ./sync.js) keeps every browser tab on the same LAN in agreement.
//
// Design rules:
//   - Slices are flat data. No functions stored in slice payloads -- those
//     wouldn't survive BroadcastChannel serialization.
//   - Each integration owns a `status` row in `status[<id>]`. The UI dot
//     reads from there; the integration's own poller writes there.
//   - Setters live alongside slices (Zustand idiom). The cross-tab snapshot
//     picks only data slices, never setters.
//
// Why Zustand and not Context: re-render granularity. With Context, every
// consumer re-renders on every state change; with Zustand subscribers you
// pick exact selectors and only re-render on slice changes.

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

// Integration health states. Components map these to dot color:
//   empty    -> grey (not configured yet)
//   ok       -> green (last call succeeded)
//   degraded -> amber (last call failed, retry pending)
//   down     -> red (multiple consecutive failures)
export const STATUS = Object.freeze({
  EMPTY: 'empty',
  OK: 'ok',
  DEGRADED: 'degraded',
  DOWN: 'down',
});

const initialStatusRow = (label) => ({ state: STATUS.EMPTY, label, detail: null, lastOkAt: null, consecutiveFailures: 0 });

export const useHomeStore = create(subscribeWithSelector((set, get) => ({
  // -------- Auth --------
  // The "household account" is whichever provider signed in last. Local-email
  // signups produce a user object with provider:'local' and an empty picture.
  auth: { user: null, provider: null, spotifyToken: null, spotifyMe: null, error: null },
  setAuthUser:     (user, provider)   => set(s => ({ auth: { ...s.auth, user, provider } })),
  setSpotifyToken: (token)             => set(s => ({ auth: { ...s.auth, spotifyToken: token } })),
  setSpotifyMe:    (me)                => set(s => ({ auth: { ...s.auth, spotifyMe: me } })),
  signOut:         ()                  => set({ auth: { user: null, provider: null, spotifyToken: null, spotifyMe: null, error: null } }),

  // -------- Rooms (Plejd lights) --------
  rooms: [],
  setRooms:   (rooms)        => set({ rooms }),
  patchRoom:  (id, patch)    => set(s => ({ rooms: s.rooms.map(r => r.id === id ? { ...r, ...patch } : r) })),

  // -------- Outlets (Shelly) --------
  outlets: [],
  setOutlets:  (outlets)     => set({ outlets }),
  patchOutlet: (id, patch)   => set(s => ({ outlets: s.outlets.map(o => o.id === id ? { ...o, ...patch } : o) })),

  // -------- Speakers (Spotify Connect devices OR Sonos bridge) --------
  // The shape is whichever source is active. `_spotify: true` flags Spotify
  // Connect devices so the toggle/volume handlers route to /me/player/*.
  speakers: [],
  setSpeakers:   (speakers)    => set({ speakers }),
  patchSpeaker:  (id, patch)   => set(s => ({ speakers: s.speakers.map(sp => sp.id === id ? { ...sp, ...patch } : sp) })),

  // -------- Playback (current Spotify track on the active device) --------
  playback: { track: null, artist: null, art: null, uri: null, deviceId: null, isPlaying: false },
  setPlayback: (patch) => set(s => ({ playback: { ...s.playback, ...patch } })),

  // -------- Weather (open-meteo) --------
  // condition is the four-bucket value used by the photo backdrop.
  weather: { data: null, condition: 'clear', err: null },
  setWeather: (patch) => set(s => ({ weather: { ...s.weather, ...patch } })),

  // -------- Price (Tibber) --------
  // `current` is the active SEK/kWh. Null = not configured or unfetched (the
  // Power tile shows "—" with an amber dot, not a hardcoded value).
  price: { current: null, today: null, currency: 'SEK', err: null },
  setPrice: (patch) => set(s => ({ price: { ...s.price, ...patch } })),

  // -------- Integration status --------
  status: {
    plejd:   initialStatusRow('Not set up'),
    sonos:   initialStatusRow('Not set up'),
    shelly:  initialStatusRow('Not set up'),
    spotify: initialStatusRow('Not connected'),
    tibber:  initialStatusRow('Not set up'),
    weather: initialStatusRow('Using defaults'),
    google:  initialStatusRow('Not signed in'),
  },
  setStatus: (id, patch) => set(s => ({ status: { ...s.status, [id]: { ...s.status[id], ...patch } } })),
  // Convenience: mark an integration healthy after a successful API call.
  markOk:       (id, label)         => set(s => ({ status: { ...s.status, [id]: { ...s.status[id], state: STATUS.OK, label: label || s.status[id].label, detail: null, lastOkAt: Date.now(), consecutiveFailures: 0 } } })),
  // Mark degraded -- first failure -- and bump the consecutive counter.
  markFailed:   (id, detail)        => set(s => {
    const prev = s.status[id];
    const fails = (prev.consecutiveFailures || 0) + 1;
    const state = fails >= 3 ? STATUS.DOWN : STATUS.DEGRADED;
    return { status: { ...s.status, [id]: { ...prev, state, detail, consecutiveFailures: fails } } };
  }),

  // -------- Demo mode --------
  demoMode: false,
  setDemoMode: (v) => set({ demoMode: !!v }),
})));
