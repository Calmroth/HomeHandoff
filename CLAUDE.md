<!-- GSD:project-start source:PROJECT.md -->
## Project

**Home Control Dashboard**

A React single-page application that replaces six separate vendor apps with one dashboard for the whole family. Hosted on Vercel/VPS and accessible from anywhere, it proxies commands to a Node.js hub running at home via DDNS — controlling Plejd lights, Shelly outlets, Sonos speakers, Spotify, Tibber energy, Home Assistant sensors, climate (TBD brand), and weather. Primary surface is a wall-mounted kitchen iPad; secondary surfaces are family phones and away-access via the hosted URL.

**Core Value:** The wall iPad is always-on and always-accurate — a family member who didn't set it up can pick it up and control the house in under 5 seconds.

### Constraints

- **Tech stack**: React 18 + Vite + vanilla CSS (no Tailwind, no component library) — existing; do not introduce new frameworks
- **Single bundle**: App ships as a static SPA; no SSR — keep secrets server-side in hub, not in Vite env vars
- **LAN architecture**: All LAN device calls must go through the Node.js hub — no direct `http://` browser fetches in the HTTPS-hosted app
- **iOS compatibility**: Primary device is an iPad; `color-mix()` fallbacks required for Safari <16.4 (iPad 6th gen / A10)
- **No automated tests**: Manual verification only for now; critical crypto code (`secureStore.js`) is highest priority for future test coverage
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Runtime
## Frameworks
| Layer | Framework | Role |
|-------|-----------|------|
| UI | **React 18.3** | Component tree, hooks, all rendering |
| State | **Zustand 4.5** (`subscribeWithSelector` middleware) | Global store — auth, rooms, outlets, speakers, energy, hub status |
| Build | **Vite 5.4** | Dev server, HMR, proxy, production bundler |
| Hub HTTP | **Express 4.19** | REST endpoints on the Node hub (`/health`, `/command`, `/scan`) |
| Hub WS | **ws 8.18** | WebSocket server attached to the same Express HTTP server |
## Key Dependencies
### Root (`package.json`)
| Package | Purpose |
|---------|---------|
| `react` / `react-dom` ^18.3 | UI framework |
| `zustand` ^4.5 | Client-side global state |
| `vite` ^5.4 | Dev server + bundler |
| `@vitejs/plugin-react` ^4.3 | Vite React JSX transform |
| `vite-plugin-mkcert` ^2.0 | Local TLS cert for LAN (HTTPS) mode |
| `concurrently` ^9.2 | Run Vite + hub + Sonos bridge in parallel (`npm run dev:full`) |
| `cross-env` ^10.1 | Cross-platform `VITE_HTTPS=1` env injection |
| `suncalc` ^1.9 | Solar-phase calculations for backdrop selection (in `devDependencies` but imported at runtime in `src/lib/sunPhase.js`) |
### Server (`server/package.json`)
| Package | Purpose |
|---------|---------|
| `express` ^4.19 | HTTP server (health, command relay, scan trigger) |
| `cors` ^2.8 | CORS middleware for the hub |
| `ws` ^8.18 | WebSocket server (`WssHub`) |
## Build & Dev Tooling
## Configuration Files
| File | Purpose |
|------|---------|
| `vite.config.js` | Vite plugins, dev server host/port/proxy, build output |
| `package.json` | Root dependencies, npm scripts |
| `server/package.json` | Hub server dependencies |
| `.env.local` | All secrets and runtime config (VITE_* prefix = browser-exposed) |
- `VITE_GOOGLE_CLIENT_ID` — Google OAuth client ID (browser-visible)
- `VITE_SPOTIFY_CLIENT_ID` / `VITE_SPOTIFY_REDIRECT_URI`
- `VITE_HOME_ASSISTANT_URL`
- `VITE_TIBBER_TOKEN`
- `VITE_SONOS_URL`
- `PLEJD_EMAIL` / `PLEJD_PASSWORD` / `PLEJD_SITE_ID` / `PLEJD_GATEWAY_IP` (server-only)
- `TIBBER_TOKEN` (server-only)
- `SONOS_URL` (server-only)
- `HUB_PORT` (server-only, default 3001)
- `VITE_HUB_URL` (frontend → hub WebSocket URL, default `ws://localhost:3001`)
## Package Manager
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Code Style
- **No linter or formatter config** found at the project root (no `.eslintrc`, `.prettierrc`, or `eslint.config.*`). Code style is enforced by convention only.
- Semicolons: used consistently throughout.
- Single quotes for string literals in JS/JSX (e.g., `'hdg-integrations'`, `'not-configured'`).
- Arrow functions are preferred for callbacks and hook bodies.
- Trailing commas in multi-line object/array literals.
- `async/await` for all async logic (no `.then()` chains except in `useEffect` bodies where chaining a `.catch` inline is idiomatic).
- Comments are verbose and explanatory — each logical section has a header comment (separated by `// ──────────`-style dividers) explaining *why*, not just *what*.
- Line length is long: inline JSX icon definitions frequently exceed 120 chars; no hard wrap rule is enforced.
## Naming
- **React hooks**: `use` prefix, camelCase — e.g., `useIntegrations`, `useGoogleAuth`, `useSpotify`, `useWebSocketHub`, `useHaEntities`, `useHomeStore`.
- **Async fetch helpers**: verb + noun, no prefix — e.g., `fetchWeather`, `fetchTibberPrices`, `sonosFetchSpeakers`, `sonosCmd`, `plejdLogin`, `plejdFetchSites`.
- **localStorage keys**: `hdg-` namespace prefix with kebab-case — e.g., `hdg-integrations`, `hdg-g-user`, `hdg-sp-token`, `hdg-sp-clientid`.
- **Zustand store setters**: `set` + PascalNoun — e.g., `setRooms`, `setOutlets`, `setSpeakers`, `setPlayback`; patch-style updaters use `patch` + Noun — e.g., `patchRoom`, `patchOutlet`, `patchSpeaker`.
- **Status constants**: `STATUS.EMPTY / OK / DEGRADED / DOWN` — screaming snake case on the enum, lowercase string values.
- **CSS token variables**: `--kebab-case` — prefixed by domain (`--clay-*`, `--amber-*`, `--chart-*`, `--motion-*`, `--page-*`).
- **Icon map**: single uppercase letter shorthand `I` holding PascalCase keys — e.g., `I.Light`, `I.Speaker`, `I.Thermometer`.
- **File names**: lowercase with camelCase for lib/store modules — `useHomeStore.js`, `haEntities.js`, `secureStore.js`, `tabLifecycle.js`, `sunPhase.js`; main app file is `App.jsx`.
## Component Patterns
- The entire application lives in a single `src/App.jsx` file (several thousand lines). There is no component-per-file decomposition at present — page components, hooks, utility functions, and integration clients all co-exist in one module.
- **Custom hooks encapsulate integration state**: each integration (Google auth, Spotify, Sonos, integrations config) is wrapped in a `use*()` hook that owns `useState`, `useEffect`, and `useCallback`. These hooks are defined at module scope alongside the components that consume them.
- **Icon component pattern**: a single `Icon` base component accepts SVG path data; a named map `I` holds pre-built icon components as arrow functions wrapping `Icon`.
- Components are functional, never class-based.
- JSX uses conditional rendering with `&&` and ternary `?:` rather than early-return guards inside component bodies.
- `useRef` + `useEffect` pattern is used to keep callback dependencies stable (avoids re-running effects on every render when an inline function changes).
## CSS / Styling
- Design tokens live in `src/tokens.css` imported globally — all colors, spacing, and motion values are CSS custom properties, never hardcoded hex/rgb values in component styles.
- **Two-layer token system**:
- Color space: `oklch()` throughout (perceptually uniform, modern). Color mixing uses `color-mix(in oklch, ...)`.
- Motion tokens: `--motion-duration-fast: 150ms`, `--motion-duration-base: 300ms`, `--motion-ease-out-quart`.
- Layout rhythm tokens: `--page-pad-x`, `--page-pad-y`, `--section-gap`, `--group-gap`, `--row-gap` — all use `clamp()` for fluid scaling.
- Typography: `--font-sans` / `--font-heading` = Albert Sans; `--font-mono` = Geist Mono.
- Single theme ("clay" — warm dark). Multi-theme support was removed; comments note where removed theme blocks were.
- No CSS-in-JS or Tailwind — plain CSS custom properties applied via `style={}` props or a stylesheet import.
## Error Handling
- Async errors are caught at call sites with `try/catch`; errors are stored in local `useState` error state (e.g., `const [error, setError] = useState(null)`) and surfaced to the UI as inline messages.
- Silent failure for low-risk storage operations: `try { localStorage.setItem(...) } catch (e) {}` — empty catch bodies are used deliberately when storage failure is non-fatal.
- Network errors throw `new Error(message)` with the HTTP status included (e.g., `throw new Error(\`open-meteo ${r.status}\`)`).
- `decryptJSON` returns `null` on decryption failure rather than throwing, with a comment explaining the rationale.
- `migrateFromLocalStorage` catches all errors and returns a structured `{ migrated: false, error }` object — callers can fall back gracefully.
- No global error boundary in the current codebase (no `ErrorBoundary` component found).
## State Patterns
- **Zustand** (`useHomeStore`) is the global store for all domain data (rooms, outlets, speakers, playback, weather, price, status, HA entities). It uses `subscribeWithSelector` middleware for fine-grained subscriptions.
- **Local `useState`** is used for integration config, auth state, and UI-local state (errors, loading flags, modal visibility) inside hooks defined in `App.jsx`.
- **`useCallback` wrapping everything**: all setter and handler functions returned from hooks are wrapped in `useCallback` to stabilize references across re-renders.
- **`useRef` for handler stability**: event callbacks passed to third-party APIs (Google GIS `initialize`, WebSocket message handlers) are stored in refs so they can be updated without triggering re-connections.
- **Lazy `useState` initializers**: initial state derived from `localStorage` always uses the lazy-initializer form `useState(() => { ... })` to avoid re-parsing on every render.
- **`useEffect` cleanup**: effects that set timers or intervals always return a cleanup function that calls `clearInterval` / `clearTimeout`.
## Security Patterns
- **Sensitive tokens** (Spotify OAuth tokens, Google JWT credential, integration config containing Plejd/Tibber tokens) are stored encrypted via `src/lib/secureStore.js`.
- Encryption: AES-GCM 256-bit, key stored as JWK in IndexedDB (not in localStorage or JS memory). The key is non-extractable after import.
- **One-shot migration**: `migrateFromLocalStorage` moves legacy plaintext tokens from `localStorage` to the encrypted IndexedDB store on first run.
- **Acknowledged threat model**: comments in `App.jsx` and `secureStore.js` explicitly document that the security is designed against casual local inspection, not malware running as the same origin. JWT signatures are not verified client-side.
- API tokens (`Authorization: Bearer ${token}`) are passed in request headers at call sites; they are never embedded in URLs or logged.
- `VITE_GOOGLE_CLIENT_ID`, `VITE_HUB_URL` are read from `import.meta.env` — build-time env vars, not runtime secrets stored in source.
- No backend auth layer — this is a purely client-side, LAN-use household app.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern
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
### Real-time update from hub
### Cross-tab sync
### Weather / backdrop
## State Management
- Components subscribe with selectors: `useHomeStore(s => s.rooms)` — only re-renders when `rooms` reference changes.
- Setters are co-located with slices inside the `create()` call.
- Cross-tab hydration via BroadcastChannel (`src/store/sync.js`).
- `useIntegrations` — integration config (URLs, tokens, discovered devices) backed by `localStorage`. Not in the Zustand store because it is per-browser config, not shared state.
- `useGoogleAuth` — Google identity / local profile. `useState` + `localStorage`.
- `useSpotify` — Spotify OAuth tokens, Connect device list. `useState` + `localStorage`.
## Routing
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
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
