// Cross-tab sync for the home store via BroadcastChannel.
// Two tabs on the same origin (kitchen iPad + bedroom phone, etc.) need to
// agree on auth, playback, room state. Without a backend, BroadcastChannel
// is the lightest way to keep them in lockstep on the same machine; for
// genuine LAN-wide sync across devices a tiny WebSocket relay would be next,
// out of scope for this phase.
//
// Wire-up: called once from main.jsx. Returns a teardown function for HMR.

import { useHomeStore } from './useHomeStore.js';

const CHANNEL = 'hdg-home-store-v1';

// Slices that should sync across tabs. Setters and demoMode metadata stay
// local (each tab may want its own demo state).
const SYNCED_KEYS = ['auth', 'rooms', 'outlets', 'speakers', 'playback', 'weather', 'price', 'status'];

function snapshot(state) {
  const out = {};
  for (const k of SYNCED_KEYS) out[k] = state[k];
  return out;
}

export function installCrossTabSync() {
  if (typeof BroadcastChannel === 'undefined') return () => {};

  const channel = new BroadcastChannel(CHANNEL);
  let suppress = false; // true while we're hydrating from a peer, to avoid echo

  // OUTGOING -- post snapshot on every store change.
  const unsub = useHomeStore.subscribe((state) => {
    if (suppress) return;
    try {
      channel.postMessage({ type: 'hdg:state', snapshot: snapshot(state), t: Date.now() });
    } catch (e) {
      // Some state objects could be unserializable (rare). Don't crash the
      // tab over it; the other tab will just be slightly stale.
      console.warn('[hdg-sync] postMessage failed', e);
    }
  });

  // On boot, ask any older tabs for their current state. Whichever responds
  // first wins; the suppression flag prevents an echo loop.
  channel.postMessage({ type: 'hdg:hello', t: Date.now() });

  // INCOMING -- hydrate.
  channel.onmessage = (e) => {
    const msg = e?.data;
    if (!msg) return;
    if (msg.type === 'hdg:state') {
      suppress = true;
      try {
        // setState with a partial object merges at the top level, so setters
        // and demoMode stay intact while data slices update.
        useHomeStore.setState(msg.snapshot);
      } finally {
        suppress = false;
      }
    } else if (msg.type === 'hdg:hello') {
      // Reply with our snapshot so the new tab catches up immediately.
      try {
        channel.postMessage({ type: 'hdg:state', snapshot: snapshot(useHomeStore.getState()), t: Date.now() });
      } catch (e) {}
    }
  };

  return () => {
    try { channel.close(); } catch (e) {}
    unsub();
  };
}
