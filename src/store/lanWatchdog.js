// LAN watchdog. Council Reviewer 4 framed it: "the dashboard IS the LAN" --
// router reboots, BLE bridge crashes, iPad Safari purges memory overnight.
// If a wall tablet sits in the kitchen all day, we need a heartbeat that
// flips the dashboard into "I lost the LAN" mode within a few minutes of
// every integration going dark, then auto-recovers when the LAN comes back.
//
// How it works:
//   - Every 60 s, look at store.status across all integrations.
//   - "Reachable" = status.state === 'ok' OR lastOkAt is within the last
//     WINDOW_MS milliseconds (a brief degraded blip doesn't trip alarms).
//   - If the user has configured at least one LAN integration but none has
//     been reachable inside the window, set store.lanLost = true. UI surfaces
//     that as a full-bleed amber strip telling the kitchen tablet to retry.
//   - When ANY integration goes ok again, clear it.
//
// "Configured at least one LAN integration" = the only Reachable check that
// matters. We don't trip the LAN-lost banner just because the user hasn't
// set up Plejd; we trip it only when a previously-working setup has gone
// silent.

import { useHomeStore } from './useHomeStore.js';

const WINDOW_MS = 5 * 60_000;            // 5 minutes -- shorter than the council's "10 min" so an alert is visible before a frustrated guest tries again
const TICK_MS   = 60_000;                // check every minute
const LAN_INTEGRATIONS = ['plejd', 'sonos', 'shelly']; // tibber + weather are cloud, not LAN

function snapshotLanState(store) {
  const cfgTouched = LAN_INTEGRATIONS.some(id => store.status[id]?.state !== 'empty');
  if (!cfgTouched) return { configured: false, lanLost: false };
  const now = Date.now();
  const someRecent = LAN_INTEGRATIONS.some(id => {
    const row = store.status[id];
    if (!row || row.state === 'empty') return false;
    if (row.state === 'ok') return true;
    return row.lastOkAt && (now - row.lastOkAt) < WINDOW_MS;
  });
  return { configured: true, lanLost: !someRecent };
}

export function installLanWatchdog() {
  const tick = () => {
    const s = useHomeStore.getState();
    const { configured, lanLost } = snapshotLanState(s);
    if (!configured) {
      if (s.lanLost) useHomeStore.setState({ lanLost: false });
      return;
    }
    if (s.lanLost !== lanLost) {
      useHomeStore.setState({ lanLost });
    }
  };
  const id = setInterval(tick, TICK_MS);
  // First check after a short delay so the initial integration pollers have
  // a chance to write status rows on boot.
  const firstTick = setTimeout(tick, 6_000);
  return () => { clearInterval(id); clearTimeout(firstTick); };
}
