# Conventions
*Last mapped: 2026-05-18*

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
  - Layer 1 — *primitives*: `--clay-50` through `--clay-950`, `--amber-300` through `--amber-600`, `--red-500`, `--green-500`, `--chart-1/2/3`.
  - Layer 2 — *semantic*: `--background`, `--foreground`, `--primary`, `--muted`, `--border`, `--ring`, etc. These map to Layer 1 values and match the shadcn-ui token surface for future portability.
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
