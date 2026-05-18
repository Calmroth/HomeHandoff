# Tech Stack
*Last mapped: 2026-05-18*

## Runtime

**Frontend:** Browser (ES modules, Vite dev server at port 5183)
**Backend hub:** Node.js (ESM, `"type": "module"`) — no explicit version pinned, uses native `fetch`, `net`, and `fs/promises` (Node 18+)

---

## Frameworks

| Layer | Framework | Role |
|-------|-----------|------|
| UI | **React 18.3** | Component tree, hooks, all rendering |
| State | **Zustand 4.5** (`subscribeWithSelector` middleware) | Global store — auth, rooms, outlets, speakers, energy, hub status |
| Build | **Vite 5.4** | Dev server, HMR, proxy, production bundler |
| Hub HTTP | **Express 4.19** | REST endpoints on the Node hub (`/health`, `/command`, `/scan`) |
| Hub WS | **ws 8.18** | WebSocket server attached to the same Express HTTP server |

---

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

---

## Build & Dev Tooling

**Dev (default):** `npm run dev` — Vite at `http://127.0.0.1:5183` (HTTP, secure context)
**Dev (LAN):** `npm run dev:lan` — Vite at `https://0.0.0.0:5183` with mkcert TLS
**Full stack dev:** `npm run dev:full` — concurrently runs Vite + Node hub (`--watch`) + external `node-sonos-http-api`
**Hub only:** `npm run hub:dev` — `node --watch server/index.js`
**Production build:** `npm run build` → `dist/` with sourcemaps

**Vite proxy (dev only):** `/api/plejd/*` → `https://cloud.plejd.com` (CORS workaround for Plejd Parse API)

**Build output:** `dist/` directory, sourcemaps enabled

---

## Configuration Files

| File | Purpose |
|------|---------|
| `vite.config.js` | Vite plugins, dev server host/port/proxy, build output |
| `package.json` | Root dependencies, npm scripts |
| `server/package.json` | Hub server dependencies |
| `.env.local` | All secrets and runtime config (VITE_* prefix = browser-exposed) |

**Notable `.env.local` variables:**
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

---

## Package Manager

**npm** — lock file: `package-lock.json` (root and `server/package-lock.json`)
