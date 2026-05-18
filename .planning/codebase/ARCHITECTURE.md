# Architecture
*Last mapped: 2026-05-18*

## Pattern
Single-Page Application (SPA) with an optional companion Node.js relay server. The frontend is a Vite + React app that runs entirely in the browser. The backend (`server/`) is an opt-in WebSocket hub used for LAN device commands and discovery; the app degrades gracefully (direct polling) when the hub is not running.

## Layers

### Frontend (`src/`)
- **UI layer** — All pages, components, icons, and layout live in `src/App.jsx` (monolithic by design; no component sub-directory yet). Inline SVG icon set (`I.*`), primitive components (`Slider`, `Toggle`), and all page views are defined here.
- **Store layer** — `src/store/useHomeStore.js` is the single Zustand observable store. Slices: `auth`, `rooms`, `outlets`, `speakers`, `playback`, `weather`, `price`, `status`, `demoMode`, `lanLost`. No derived state is stored; components compute it from raw slices.
- **Integration hooks** — `src/App.jsx` contains the custom hooks `useIntegrations`, `useGoogleAuth`, `useSpotify`, and the Spotify embed helpers. These hold their own `useState` and communicate to the store via the store's setters.
- **Library utilities** — `src/lib/` holds thin, focused modules: secure secret vault, HA entity poller, tab visibility/wake-lock, solar-phase backdrop selector, cross-tab media session, Plejd cloud client, WebSocket hub hook.
- **Boot-time concerns** — `src/store/sync.js` (cross-tab BroadcastChannel sync) and `src/store/lanWatchdog.js` (offline detection) are installed once from `src/main.jsx` and return HMR-safe teardown functions.

### Backend (`server/`)
- **WebSocket hub** — `server/lib/wss.js` (`WssHub` class) manages client connections, heartbeat, and message routing. Integration adapters register command handlers via `onCommand()`; the hub broadcasts `device_update` events to all connected browser tabs.
- **State cache** — `server/lib/state.js` (`HubState` class) holds the last-known payload per integration. New WebSocket clients receive a full `snapshot` on connect.
- **LAN discovery** — `server/lib/discovery/lan-scan.js` is lazy-loaded on demand; triggered by a `scan` WebSocket message.

## Data Flow

### User action → lights change
1. User taps a toggle in a Room card (`App.jsx`).
2. Component calls an optimistic `patchRoom(id, patch)` on `useHomeStore` for instant UI feedback.
3. Component fires an API call (Plejd REST via HA, or WebSocket `sendCommand` via hub).
4. On success/failure, the integration poller's next tick reconciles truth back into the store via `setRooms` / `markOk` / `markFailed`.

### Real-time update from hub
1. Browser's `useWebSocketHub` (`src/lib/useWebSocketHub.js`) receives a `device_update` message.
2. `onDeviceUpdate(integration, payload)` callback fires in `App.jsx`.
3. Callback calls the appropriate store setter (`setRooms`, `setSpeakers`, etc.).
4. Zustand notifies subscribers; components that selected the changed slice re-render.

### Cross-tab sync
1. Tab A writes to `useHomeStore` (any cause).
2. `sync.js` subscriber serializes the data slices and posts to `BroadcastChannel 'hdg-home-store-v1'`.
3. Tab B receives the message and calls `useHomeStore.setState(snapshot)`.

### Weather / backdrop
1. `fetchWeather(lat, lon)` polls open-meteo (no key required).
2. `wmoToBucket(code)` maps the WMO weather code to one of four buckets (`clear`, `cloudy`, `rain`, `snow`).
3. `pickBackdrop(now, weather, lat, lon)` in `src/lib/sunPhase.js` uses `suncalc` to determine solar phase (night/sunrise/day/sunset) and selects the correct `.avif` backdrop image.

## State Management

**Primary store:** Zustand (`zustand` + `subscribeWithSelector` middleware) in `src/store/useHomeStore.js`.
- Components subscribe with selectors: `useHomeStore(s => s.rooms)` — only re-renders when `rooms` reference changes.
- Setters are co-located with slices inside the `create()` call.
- Cross-tab hydration via BroadcastChannel (`src/store/sync.js`).

**Secondary local state (in `App.jsx` hooks):**
- `useIntegrations` — integration config (URLs, tokens, discovered devices) backed by `localStorage`. Not in the Zustand store because it is per-browser config, not shared state.
- `useGoogleAuth` — Google identity / local profile. `useState` + `localStorage`.
- `useSpotify` — Spotify OAuth tokens, Connect device list. `useState` + `localStorage`.

**Secret vault:** `src/lib/secureStore.js` — AES-GCM encrypted IndexedDB (replaces plain `localStorage` for sensitive tokens). One-shot migration from legacy localStorage runs at boot.

## Routing

Hash-based, no router library. `useRoute()` in `App.jsx`:
- Reads `window.location.hash` on mount and on `hashchange` events.
- Navigates by setting `window.location.hash = '#' + id`.
- Valid routes: `home`, `rooms`, `music`, `energy`, `weather`, `news`, `settings`.
- Persists last non-Settings route to `localStorage` (`hdg-last-route`) for per-device bookmark behaviour (kitchen iPad returns to whatever view it last used).

## Entry Points

- **Frontend:** `src/main.jsx` — Vite/React entry. Mounts `<App />`, imports `tokens.css`, installs cross-tab sync and LAN watchdog.
- **Backend (optional):** `server/` — started separately (e.g. `node server/index.js`). Communicates with the frontend via WebSocket on `ws://localhost:3001` (or `VITE_HUB_URL`).

## Key Abstractions

### Hooks (all in `src/App.jsx` unless noted)
| Hook | Purpose |
|---|---|
| `useRoute()` | Hash router — current route + navigate function |
| `useIntegrations()` | Per-browser integration config persisted to localStorage |
| `useGoogleAuth()` | Google Identity Services sign-in + local profile fallback |
| `useSpotify()` | Spotify PKCE OAuth, Connect devices, transport controls |
| `useSpotifyEmbed(uri)` | Spotify iFrame API wrapper; stable controller across URI changes |
| `useSpotifyOEmbed(type, id)` | Fetch album art + title from public oEmbed endpoint |
| `useFlicker(deps)` | Pulse-counter hook for CSS acknowledgement animations |
| `usePrefersReducedMotion()` | Live `prefers-reduced-motion` media query |

### Library hooks (in `src/lib/`)
| Hook / Utility | File | Purpose |
|---|---|---|
| `useWebSocketHub(opts)` | `useWebSocketHub.js` | Persistent WS to hub, exponential-backoff reconnect, typed message dispatch |
| `useHaEntities(ids, creds)` | `haEntities.js` | Poll arbitrary Home Assistant entity IDs; returns a `Map` keyed by entity ID |
| `usePageVisible()` | `tabLifecycle.js` | `useSyncExternalStore` wrapper for `document.visibilityState` |
| `useWakeLock(enabled)` | `tabLifecycle.js` | Screen Wake Lock API with auto-reacquire on tab visibility change |
| `pickBackdrop(now, weather, lat, lon)` | `sunPhase.js` | Solar-phase + weather → backdrop `.avif` path |
| `nextTransition(now, lat, lon)` | `sunPhase.js` | Minutes until next sunrise/sunset/night milestone |
| `setSecret / getSecret / deleteSecret` | `secureStore.js` | AES-GCM encrypted IndexedDB token vault |
| `migrateFromLocalStorage()` | `secureStore.js` | One-shot migration of legacy plaintext localStorage tokens |
| `installCrossTabSync()` | `store/sync.js` | BroadcastChannel sync for Zustand store slices |
| `installLanWatchdog()` | `store/lanWatchdog.js` | Detects total LAN loss and sets `store.lanLost` |

### Store
| Export | File | Purpose |
|---|---|---|
| `useHomeStore` | `store/useHomeStore.js` | Zustand store; all domain state |
| `STATUS` | `store/useHomeStore.js` | Frozen enum: `EMPTY`, `OK`, `DEGRADED`, `DOWN` for integration health dots |

### External integrations (direct fetch, no adapter files)
- **Weather:** open-meteo REST (no key) — `fetchWeather()` in `App.jsx`
- **Tibber:** GraphQL at `api.tibber.com` — `fetchTibberPrices()` in `App.jsx`
- **Sonos:** node-sonos-http-api bridge — `sonosFetchSpeakers()` / `sonosCmd()` in `App.jsx`
- **Plejd:** cloud.plejd.com Parse API — `src/lib/plejdCloud.js`, proxied via Vite dev server
- **Home Assistant:** REST `/api/states/<entity_id>` — `src/lib/haEntities.js`
