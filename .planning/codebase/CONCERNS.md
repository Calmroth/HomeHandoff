# Technical Concerns
*Last mapped: 2026-05-18*

---

## Critical Issues

### No React Error Boundary anywhere
`src/App.jsx` has no `ErrorBoundary` class component wrapping any route or section. A single uncaught render error (e.g., a null-ref in any of the large page components) will blank the entire app with no recovery path. React StrictMode in `src/main.jsx` doubles effects in dev but provides no production protection.

### Google JWT stored in plain `localStorage` before migration runs
`src/App.jsx:207` writes `localStorage.setItem('hdg-g-credential', resp.credential)` — a raw signed JWT — synchronously on every sign-in. `src/lib/secureStore.js:migrateFromLocalStorage` (called fire-and-forget from `src/main.jsx:29`) moves this to encrypted IndexedDB asynchronously, but there is a window every session (before the async migration completes) where the raw JWT sits in plain `localStorage`. The raw credential is also left in place "for one release cycle" (`secureStore.js:188`), meaning it may persist there indefinitely in practice.

### Integration config blob still lives in plain `localStorage`
`src/App.jsx:90-103` (`useIntegrations`) reads and writes the entire integration config — including Tibber API token, Plejd cloud session token, and Home Assistant long-lived token — to `localStorage` under `hdg-integrations`. `secureStore.js` defines a migration target (`integrations.config`) but the live `useIntegrations` hook never calls `getSecret` / `setSecret`. All sensitive tokens remain in plain text until (and unless) the migration fully lands.

### Plejd cloud password stored in session state; sign-in unprotected
`src/App.jsx:1879` reads `cfg.cloudSession` which is a Plejd parse-server session token stored in `localStorage`. The Plejd login form in Settings collects `email` + `password` from the user, calls `plejdLogin()` in `src/lib/plejdCloud.js`, and persists the resulting `sessionToken` via `setIntegration`. There is no logout / token-refresh path — if the session expires the user must re-enter their password.

### Proxy is dev-only; Plejd cloud API breaks in production builds
`vite.config.js:65-70` proxies `/api/plejd` to `cloud.plejd.com`. `src/lib/plejdCloud.js:36` hardcodes `BASE = '/api/plejd'`. A production build served from Netlify, Vercel, or any static host has no equivalent proxy, so all Plejd cloud calls (login, device fetch, toggle) will hit CORS walls and fail silently. `DEPLOY.md` mentions a workaround but the code contains no guard or clear error message.

---

## Technical Debt

### `src/App.jsx` is a 6000+ line monolith
The entire application — icons, hooks, pages, utility functions, inline SVG, SOAP XML construction, Spotify OAuth, Google GIS — lives in a single file (`src/App.jsx`). The file exceeds the 256 KB read limit of tooling. This makes targeted refactoring, testing, and code review expensive, and any change risks accidental scope creep into unrelated sections.

### Integration config uses local React state, not the Zustand store
`src/App.jsx:87-121` (`useIntegrations`) manages integration config in plain `useState` + `localStorage`. The Zustand store in `src/store/useHomeStore.js` has `status` rows per integration but no config slice. Config and status are therefore split across two separate state systems with no shared abstraction, requiring callers to pass `integrations` as a prop through every layer.

### Legacy `localStorage` entries not cleaned up post-migration
`src/lib/secureStore.js:187-189` explicitly leaves legacy `localStorage` keys (`hdg-sp-token`, `hdg-g-credential`, `hdg-integrations`) in place after migration, citing a "one release cycle" grace period. There is no mechanism to perform the second-phase cleanup; these entries will persist indefinitely unless a future release adds explicit deletion.

### Sonos UPnP direct path is unreliable and silently discarded
`src/App.jsx:5240-5283` (`sonosUPnPCmd`, `sonosUPnPState`) sends SOAP to Sonos speakers on port 1400. The code notes CORS may block this on some firmware. On HTTPS-served pages, all `http://` LAN calls (Shelly, Sonos UPnP, direct device IPs) are mixed-content and will be blocked by browsers without any error surfaced to the user. The fallback is `.catch(() => {})` — silent no-op.

### Simulated watt jitter for demo outlets runs unconditionally
`src/App.jsx:2128-2138` runs a `setInterval` every 1800 ms to add random jitter to outlet wattage. This runs any time `reducedMotion` is false, including on real device data. For real Shelly devices, displayed wattage will randomly fluctuate ±3% even when actual consumption is stable.

### 143 inline styles in JSX
Grep counts 143 `style={{...}}` occurrences in `src/App.jsx`. These bypass the CSS token system, cannot be themed, and are untestable without rendering.

---

## Performance Concerns

### Multiple concurrent polling intervals at different rates
Several overlapping `setInterval` effects run in parallel, each waking the JS thread:
- Spotify currently-playing: 8 s (`src/App.jsx:1800`)
- Spotify device list: 12 s (`src/App.jsx:566`)
- Sonos bridge: 15 s (`src/App.jsx:2015` area)
- Sonos UPnP discovered speakers: 15 s (`src/App.jsx:2068`)
- Plejd cloud: 30 s with backoff
- Weather: 30 min
- Tibber: 60 min
- Outlet watt jitter: 1.8 s
- Clock tick: 15–30 s
- LAN watchdog: 60 s

All of these run in the same main-thread event loop. There is no request deduplication, no priority queue, and no backpressure when the hub is connected (the hub's push updates should supersede most polling, but do not cancel all intervals).

### BroadcastChannel fires on every store mutation
`src/store/sync.js:31-39` subscribes to `useHomeStore` and posts a full `SYNCED_KEYS` snapshot on every state change. With the outlet watt jitter firing every 1.8 s, this means BroadcastChannel messages are sent approximately 33 times per minute, serializing the entire auth/rooms/outlets/speakers/playback/weather/price/status slices each time.

### `tokens.css` is ~42,000 tokens
The CSS file is very large (over the 25k token read limit). It contains all styles for every page inline. There is no code-splitting of CSS per route. Every page load downloads the entire stylesheet regardless of which routes are used.

### MutationObserver on `document.body` in `PersistentMusicPlayer`
`src/App.jsx:1116` attaches a `MutationObserver` to `document.body` with `{ childList: true, subtree: true }` while the music route is active. This fires a position-recalculation callback on every DOM mutation in the entire document, which includes the outlet watt jitter re-renders.

### `oembedCache` is a module-level `Map` — unbounded
`src/App.jsx:1072` defines `const oembedCache = new Map()` at module scope. It is populated on every `useSpotifyOEmbed` call and never evicted. In a long-running kiosk session with heavy search use, this will grow unbounded.

---

## Security Concerns

### Google JWT not signature-verified client-side
`src/App.jsx:162-173` (`decodeJwtPayload`) base64-decodes the JWT payload but never verifies the signature. The comment at line 165-167 explicitly acknowledges this: "any malicious actor with dev tools can forge a local user object." On a shared household tablet this may be acceptable per the stated threat model, but any code that uses `google.user` for access control decisions (e.g., whether to show Settings, whether to auto-connect integrations) can be trivially bypassed.

### Server WebSocket and REST endpoints have no authentication
`server/index.js:56-60` opens CORS to `*` when `CORS_ORIGINS` is not configured (the default). `server/index.js:86-101` exposes `POST /command` with no auth middleware — any process that can reach the hub on port 3001 can issue arbitrary device commands (toggle lights, pause music, etc.). `server/index.js:103-110` exposes `POST /scan` (LAN subnet scan) similarly unauthenticated.

### Tibber token sent from browser directly
`src/App.jsx:350-358` sends the Tibber bearer token directly from the browser to `api.tibber.com`. The token lives in `localStorage` (plain text, per the above). Any XSS attack could exfiltrate it. The Tibber personal access token has full account scope.

### Home Assistant long-lived token sent from browser
`src/lib/haEntities.js:24-31` sends `Authorization: Bearer <token>` directly from browser code. The HA token grants full home automation control (not limited to this dashboard). It is stored in `localStorage` in the `hdg-integrations` blob.

### Plejd app ID hardcoded in client source
`src/lib/plejdCloud.js:26` hardcodes `PLEJD_APP_ID = 'zHtVqXt8k4yFyk2QGmgp48D9xZr2G94xWYnF4dak'`. The comment notes this is a public constant from the mobile app binary, so it is not a secret — but it means the client impersonates the official Plejd mobile app's identity with Plejd's parse server.

### VITE_ env vars baked into the production bundle
`src/App.jsx:181` reads `import.meta.env.VITE_GOOGLE_CLIENT_ID`. All `VITE_*` variables are inlined by Vite at build time into the JS bundle, which is publicly downloadable from any deployment. Tokens or secrets set via `VITE_*` env vars will be readable by anyone who views source. This is noted in `.env.local` comments but is an easy mistake to make when adding new integrations.

---

## Fragile Areas

### Hub dispatch closure pattern is racey
`src/App.jsx:1568-1597` assigns `hubDispatchRef.current` on every render. The WebSocket `onDeviceUpdate` callback reads `hubDispatchRef.current?.()`. Between renders there is a window where the ref holds an old closure with stale state setters. If a hub push arrives during a React commit phase, the dispatch may execute against stale state.

### `effectiveSpeakers` fallback logic couples two independent systems
`src/App.jsx` (around line 2140-2160 area) computes `effectiveSpeakers` by preferring Spotify Connect devices over Sonos, which in turn override UPnP-discovered speakers. The priority chain is implemented as nested conditional assignments spread across several effects. Adding a fourth speaker source would require threading changes through this entire priority chain.

### Plejd "room grouping" relies on string-matching device type names
`src/App.jsx:1893` uses `/relay|outlet|plug|switch/i.test(d.type)` to distinguish Plejd plugs from lights. Plejd's cloud API can return arbitrary type strings from user configuration. A misnamed device type will silently be rendered as a light card.

### Scene "Sleep" targets `r.id === 'bed'` but demo data uses `'bedroom'`
`src/App.jsx:937` (`SCENES.sleep.apply`) filters `r.id === 'bed'`, but `DEMO_ROOMS` at line 892 defines the bedroom as `{ id: 'bedroom', ... }`. The Sleep scene never turns on the bedroom light in demo mode. This will also be wrong for any real user whose Plejd room is not named exactly `'bed'`.

### `useGoogleAuth` initialization retries indefinitely via `setInterval`
`src/App.jsx:233` starts a 300 ms interval to retry `window.google.accounts.id` initialization. It clears only when `init()` returns true. If the GIS script fails to load (ad-blocker, network error), the interval runs forever for the lifetime of the tab.

### `StartupScreen` GIS button render retries up to 12 times but logs nothing on failure
`src/App.jsx:1328-1336`: if `google.renderButton` never renders the iframe after 12 × 250 ms = 3 s, the function gives up silently. The user sees a blank button area with no error.

### LAN `retry` on `LanLostBanner` does a full page reload
`src/App.jsx:1238`: `const retry = () => { window.location.reload(); }`. This is a blunt recovery — all integrations, Spotify auth, and Zustand state are discarded and rebuilt from scratch. There is no targeted reconnection.

### Vite proxy rewrite only covers development
`vite.config.js:65-70`: the `/api/plejd` proxy exists only under `vite dev`. `npm run build` + any static hosting will have broken Plejd paths with no warning at build time.

---

## Scale / Architecture Limits

### Single-file architecture does not support code splitting
Because all pages are defined inside `src/App.jsx`, Vite cannot tree-shake unused page code or apply route-based code splitting. The entire 300+ KB JS file is parsed and compiled on every initial load, regardless of which page the user navigates to.

### BroadcastChannel sync is same-origin / same-machine only
`src/store/sync.js:6` notes that multi-device sync (kitchen iPad to bedroom phone) requires a WebSocket relay, which is out of scope. The current cross-tab sync only works between tabs in the same browser on the same machine. In a household with multiple devices, each device maintains its own independent state.

### Zustand store is not persisted across hard reloads
The in-memory Zustand store (`src/store/useHomeStore.js`) is rebuilt from scratch on every page load. The initial data comes from polling integrations; there is no hydration from a cache. On a slow LAN, the first 5–30 s of every load shows empty/demo states rather than the last-known device state.

### `discovered.devices` config grows without eviction
`src/App.jsx:84`: `integrations.config.discovered.devices` is appended to during LAN scans and persisted to `localStorage`. There is no deduplication beyond device ID matching, and no eviction of stale entries. A user who repeatedly scans (or whose LAN IP assignments change) can accumulate orphan device records indefinitely.

### Activity log capped at 8 entries in memory only
`src/App.jsx:1602`: `setActivity(a => [...].slice(0, 8))`. The activity log is not persisted. There is no history surface beyond the current session's last 8 events, despite the comment "the rest live in History (future surface)".

---

## TODOs and FIXMEs

No `TODO`, `FIXME`, `HACK`, or `XXX` comments found in `src/` via grep. The codebase uses detailed inline prose comments instead.

### Implicit future work cited in comments

- `src/store/sync.js:6`: "for genuine LAN-wide sync across devices a tiny WebSocket relay would be next, out of scope for this phase"
- `src/App.jsx:1602`: "the rest live in History (future surface)"
- `src/lib/secureStore.js:187-189`: "A later release can delete them outright" (referring to legacy `localStorage` entries after migration)
- `src/App.jsx:1055`: `// The iFrame API has no track-skip; we approximate with a +/-15s seek. Web Playback SDK has real next/prev but requires a Premium token.`
- `CURRENT_STATE_GAP_REPORT.md`: extensive list of gaps documented at project level, including hardcoded outlet wattage, no loading states for Plejd/Sonos, Settings not surfacing `plejdErr`/`sonosErr`, and the Home page NowPlaying hero being decoupled from the Music page's actual playback state
