# Changelog

All notable changes to Home Domain are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/).

## [Unreleased]

### Added
- **Plejd Bluetooth control** (`server/lib/plejd-ble.js`): the hub now talks BLE straight to the Plejd mesh, exactly like the phone app. This is the control path that works on modern GWY-01 firmware, which closed the local TCP socket (verified: all 65535 ports shut) after Plejd also removed the `sendStateToDevice` cloud function. The hub connects to the strongest mesh node with the site crypto key, authenticates, and writes encrypted commands the mesh relays internally. One BLE connection controls every light. Transport priority is now BLE > legacy TCP (GWY-01) > cloud (state only). Requires the hub machine to have Bluetooth LE within range of a Plejd device; uses `@stoprocent/noble` (N-API prebuild, no driver replacement on Windows)
- Sonos Cloud integration (official Control API, OAuth on the hub): real speaker grouping — "Group all" is party mode via `setGroupMembers`, per-player volume, play/pause per group. Sign in from Settings → Sonos; the client secret never reaches the browser. Tokens persist in gitignored `server/sonos-tokens.json`
- Speaker source priority: healthy LAN bridge > Sonos Cloud > Spotify Connect > UPnP — a dead bridge no longer blocks the fallbacks
- Hide speakers: × on any speaker card removes ghost devices (old phones, TVs) from the dashboard; per-browser, restorable via "N hidden — show"
- Header on Music page shows WHICH speaker is playing ("Streaming to Living room")
- Plejd toggle bounce-back is now diagnosable: failed hub commands surface on the integration dot (command_result was silently dropped), and an expired Plejd session (Parse 209) clears itself with "sign in again in Settings" instead of reverting every toggle with a cryptic message
- Music widget: playback-error chip with dismiss button — surfaces `play()` rejections (autoplay policy, unsupported codec, 404) instead of failing silently
- Music widget: empty state when `tracks` is empty, instead of crashing on `tracks[0]`
- Music widget: `prefers-reduced-motion` support — disc parks, scales mixer freezes, reactive to OS setting changes mid-session
- Music widget: keyboard accessibility for the disc (focus ring, Enter/Space zoom toggle, `aria-pressed` on shuffle/loop toggles)
- Music page: "Set up Spotify in Settings" fallback button when no Client ID is configured, plus inline Spotify error surface
- `mobile-web-app-capable` meta tag alongside the legacy Apple variant (silences Chrome warning)

### Fixed
- Spotify: dead-token polling loops — 401 after refresh and non-feature-lock 403 (Dev-Mode allowlist, revoked app) now hard-disconnect with a clear re-auth message instead of hammering the API forever
- Spotify: token refresh race — concurrent API calls at the expiry boundary now share a single refresh request; previously the second caller consumed an already-rotated refresh token, got `invalid_grant`, and spuriously logged the user out
- Spotify: plain-text error bodies (e.g. Dev-Mode 403) no longer crash JSON parsing and bypass error handling
- Google sign-in: "initialize() called multiple times" — GIS now initializes once per client_id, surviving StrictMode double-invoke and HMR remounts
- Layout: sidebar grid `minmax(0, 1fr)` stops wide descendants (21-pill room filter) from blowing out the main column into a page-level horizontal scrollbar
- Music widget: broken cover art falls back to a gradient panel that survives track-change crossfades (state-tracked, not DOM-mutated)
- Music widget: global keyboard shortcuts no longer double-fire on focused buttons/role="button" elements
- Music page: repaired reintroduced UTF-8 mojibake (`★`, `×`, `≤` rendered as `â˜…`, `Ã—`, `â‰¤`)

### Changed
- Wi-Fi pill: quiet chrome by default (10px muted, no surface); becomes a loud destructive alarm chip only on network loss
- Section headers: title/summary hierarchy inverted — live data ("3 of 4 rooms · 142 W") now carries foreground weight, label recedes
- Room filter: pills wrap into rows instead of hiding behind a scrollbar-less horizontal scroll (touch-friendly for 21 rooms)
- Music widget: play button enlarged 48→56px with shadow; control gap 12→14px; time row 10→11px
- Weather hero: icon and temperature downsized (88→56px icon, temp clamp lowered) to sit better in the column
- Settings: section dividers and 2px active-row indicator stripe

### Repo
- `server/hub-state.json` untracked (runtime cache the hub persists itself); added to `.gitignore`
