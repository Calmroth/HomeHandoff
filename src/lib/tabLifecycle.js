// Tab-lifecycle primitives -- the council's "appliance substrate" answer.
//
// Two effects every premium wall-tablet dashboard needs:
//
//   1. Wake Lock -- keep the screen on while the dashboard is foreground.
//      Browsers automatically release the lock when the tab becomes hidden
//      (and reject re-acquire from a non-visible tab), so we listen for
//      visibility changes and re-request on every return-to-foreground.
//
//   2. Page Visibility -- expose a reactive boolean so polling effects can
//      pause when nobody's looking. The kitchen tablet stops hammering APIs
//      while in the background; comes right back when the tab is visible
//      again.
//
// Both are guarded with the feature detectors from ./secureContext.js so
// they degrade gracefully on browsers (or kiosk modes) that don't support
// them.

import { useEffect, useSyncExternalStore } from 'react';
import { featureSupported } from './secureContext.js';

// -- Page Visibility hook --
// Returns true when the tab is currently visible (or unknown).
// Uses useSyncExternalStore so concurrent React doesn't tear when several
// components read this in the same paint frame.

function subscribeVisibility(cb) {
  if (!featureSupported.pageVisibility()) return () => {};
  const handler = () => cb();
  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}

function readVisibility() {
  if (typeof document === 'undefined') return true;
  return document.visibilityState !== 'hidden';
}

export function usePageVisible() {
  return useSyncExternalStore(subscribeVisibility, readVisibility, () => true);
}

// -- Wake Lock --
// Wires `navigator.wakeLock.request('screen')` on mount and reacquires on
// every visibilitychange (the lock is auto-released when the tab loses
// visibility, so silent re-request is the only way to keep the screen on
// across user navigation away/back to this tab).
//
// Returns nothing -- the lock is a side effect held in a closure.

export function useWakeLock(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    if (!featureSupported.wakeLock()) return;
    let sentinel = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled) return;
      if (document.visibilityState === 'hidden') return;
      try {
        sentinel = await navigator.wakeLock.request('screen');
        // Lock the dashboard releases automatically on tab hidden -- we'll
        // re-acquire on the next visibilitychange listener tick.
        sentinel.addEventListener('release', () => { sentinel = null; });
      } catch (err) {
        // Common reasons: tab is hidden, battery saver, OS denied. Don't
        // surface this -- the audit-trail "amber dot" would be wrong here,
        // it's not an integration failure.
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !sentinel) {
        acquire();
      }
    };

    acquire();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (sentinel) { try { sentinel.release(); } catch (e) {} sentinel = null; }
    };
  }, [enabled]);
}
