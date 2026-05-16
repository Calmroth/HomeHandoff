// Secure-context detection and the runtime guards every v1.1 API check uses.
//
// Why this matters: most of the "premium" browser APIs the council approved
// (Wake Lock, MediaSession, Geolocation, Service Workers' more powerful
// features) silently fail or refuse to respond on a non-HTTPS origin. They
// don't throw, they don't warn -- they just don't work. The reviewers
// unanimously named this as the council's collective blind spot. This module
// is the single place we check.
//
// Browser special-cases that DO count as secure:
//   - `https://*`
//   - `http://localhost`, `http://127.0.0.1`, `http://[::1]`
//   - `http://*.localhost`
//
// Everything else, including `http://192.168.x.x` and `http://10.0.0.x`, is
// NOT a secure context, even though those addresses are loopback-adjacent
// for a household. That's why the project ships with vite-plugin-mkcert and
// SETUP_CERT.md -- to get an HTTPS-served LAN URL on a trusted local CA.

// Cheap synchronous read. Use this in render paths.
export function isSecure() {
  if (typeof window === 'undefined') return false;
  return !!window.isSecureContext;
}

// Returns a human-readable reason describing why something won't work.
// Used by the IntegrationStatusDot detail-on-hover line so the user gets a
// "why is this amber?" answer that's actually actionable.
export function secureContextReason() {
  if (typeof window === 'undefined') return 'not in browser';
  if (window.isSecureContext) return null;
  const host = window.location.host;
  return `This origin (${host}) isn't a secure context. The dashboard needs HTTPS for Wake Lock, MediaSession, Geolocation, and other power-user APIs. See SETUP_CERT.md for the 5-minute fix.`;
}

// Feature-detect each API individually. The presence of the namespace is the
// only honest signal -- old Safari versions and locked-down Chromes can have
// `window.isSecureContext` true but still lack the API itself.
export const featureSupported = {
  wakeLock:        () => isSecure() && 'wakeLock' in navigator,
  mediaSession:    () => 'mediaSession' in navigator,
  geolocation:     () => isSecure() && 'geolocation' in navigator,
  vibration:       () => 'vibrate' in navigator,
  battery:         () => 'getBattery' in navigator,
  idleDetection:   () => isSecure() && 'IdleDetector' in window,
  networkInfo:     () => 'connection' in navigator,
  serviceWorker:   () => isSecure() && 'serviceWorker' in navigator,
  pageVisibility:  () => 'visibilityState' in document,
};
