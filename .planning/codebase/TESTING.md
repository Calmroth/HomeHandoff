# Testing
*Last mapped: 2026-05-18*

## Framework

None. No test framework is installed or configured. `package.json` lists no `jest`, `vitest`, `@testing-library/*`, `mocha`, or similar test dependency. There is no `test` script in `package.json`.

The only test file in the repository tree (`node_modules/gensync/test/index.test.js`) belongs to a transitive dependency, not the project itself.

## Test Files

No project-owned test files exist. Globs for `**/*.test.*`, `**/*.spec.*`, and `**/__tests__/**` returned only files inside `node_modules`.

## Coverage

Zero. No production code in `src/` is covered by automated tests.

Key areas with no test coverage:
- `src/App.jsx` — all hooks (`useIntegrations`, `useGoogleAuth`, `useSpotify`), all async fetch helpers (`fetchWeather`, `fetchTibberPrices`, `sonosFetchSpeakers`, PKCE helpers), all React components.
- `src/store/useHomeStore.js` — Zustand store slices and setters.
- `src/lib/secureStore.js` — AES-GCM encrypt/decrypt logic, IDB key management, `migrateFromLocalStorage`.
- `src/lib/haEntities.js` — `useHaEntities` polling hook.
- `src/lib/useWebSocketHub.js` — WebSocket reconnect / backoff logic.
- `src/lib/sunPhase.js`, `src/lib/tabLifecycle.js`, `src/lib/mediaSession.js`, `src/lib/plejdCloud.js`.

## CI

None. No `.github/workflows/` directory exists in the repository. No CI pipeline of any kind (GitHub Actions, CircleCI, Travis, etc.) is configured.

## Manual Testing

Based on `package.json` scripts, manual testing is done by running the development server:

- `npm run dev` — starts Vite dev server (HTTP, localhost).
- `npm run dev:lan` — starts Vite with HTTPS via `vite-plugin-mkcert` (for LAN access from tablets/phones where some Web APIs require a secure context).
- `npm run dev:full` — starts Vite + the WebSocket hub server (`server/index.js`) + the `node-sonos-http-api` bridge concurrently, providing the full integration stack locally.
- `npm run preview` — serves the production build on port 5183 for final manual verification before deploy.

There is no documented manual test plan or checklist. Verification appears to be entirely ad-hoc, running the app in a browser and exercising flows by hand.
