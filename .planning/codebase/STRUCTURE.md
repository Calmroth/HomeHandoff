# Directory Structure
*Last mapped: 2026-05-18*

## Layout

```
design_handoff_home_control/
├── src/                        Frontend React app (Vite entry)
│   ├── main.jsx                App entry point; mounts React, installs sync + watchdog
│   ├── App.jsx                 Monolithic SPA: all pages, components, hooks, integrations (~3000+ lines)
│   ├── tokens.css              CSS custom properties (design tokens: colours, spacing, typography)
│   ├── store/                  Zustand state management
│   │   ├── useHomeStore.js     Single observable store for all domain state
│   │   ├── sync.js             Cross-tab BroadcastChannel sync
│   │   └── lanWatchdog.js      Periodic LAN health check; sets store.lanLost
│   └── lib/                    Thin, focused utility modules
│       ├── useWebSocketHub.js  React hook for hub WebSocket connection
│       ├── haEntities.js       Home Assistant entity poller (useHaEntities hook)
│       ├── plejdCloud.js       Plejd cloud REST client (login, sites, devices, commands)
│       ├── secureStore.js      AES-GCM encrypted IndexedDB token vault + localStorage migration
│       ├── secureContext.js    Feature-detection guards (wakeLock, pageVisibility, etc.)
│       ├── sunPhase.js         Solar-phase backdrop selector using suncalc
│       ├── mediaSession.js     Media Session API wiring (OS lock-screen player controls)
│       └── tabLifecycle.js     usePageVisible + useWakeLock hooks
│
├── server/                     Optional Node.js WebSocket relay hub
│   ├── package.json            Server-only dependencies (ws, express, cors)
│   └── lib/
│       ├── wss.js              WssHub class: WebSocket server, heartbeat, command routing
│       ├── state.js            HubState class: in-memory integration state cache
│       └── discovery/
│           └── lan-scan.js     LAN subnet scanner (lazy-loaded on scan request)
│
├── public/                     Static assets served by Vite
│   └── assets/                 Backdrop AVIF images (night, sunrise, day, sunset, rain, winter, cabin)
│
├── dist/                       Vite production build output (gitignored in practice)
│
├── vite.config.js              Vite config: React plugin, mkcert (HTTPS mode), Plejd CORS proxy
├── package.json                Frontend dependencies + npm scripts
├── index.html                  Vite HTML template (root mount point, loads Google/Spotify scripts)
│
├── .planning/                  Project planning and codebase docs
│   └── codebase/               Architecture and structure maps
│       ├── ARCHITECTURE.md
│       └── STRUCTURE.md
│
├── .env.local                  Local secrets (VITE_HA_URL, VITE_TIBBER_TOKEN, etc.) — gitignored
├── DESIGN_SYSTEM_EXTRACT.md    Design token and component spec reference
├── CURRENT_STATE_GAP_REPORT.md Gap analysis between design intent and implementation
├── README.md                   Setup and run instructions
└── DEPLOY.md                   Deployment guidance (Vercel/Netlify + LAN scenarios)
```

## Key Locations

- **Source root:** [`src/`]
- **Entry point:** [`src/main.jsx`]
- **Main component / all pages:** [`src/App.jsx`]
- **Design tokens (CSS vars):** [`src/tokens.css`]
- **Global store:** [`src/store/useHomeStore.js`]
- **Cross-tab sync:** [`src/store/sync.js`]
- **LAN watchdog:** [`src/store/lanWatchdog.js`]
- **WebSocket hub hook:** [`src/lib/useWebSocketHub.js`]
- **HA entity bridge:** [`src/lib/haEntities.js`]
- **Plejd cloud client:** [`src/lib/plejdCloud.js`]
- **Secure token vault:** [`src/lib/secureStore.js`]
- **Backdrop logic:** [`src/lib/sunPhase.js`]
- **Tab lifecycle hooks:** [`src/lib/tabLifecycle.js`]
- **Server hub:** [`server/lib/wss.js`]
- **Server state cache:** [`server/lib/state.js`]
- **LAN discovery:** [`server/lib/discovery/lan-scan.js`]
- **Static backdrops:** [`public/assets/backdrop-*.avif`]
- **Vite config:** [`vite.config.js`]

## Naming Conventions

### Files
- `camelCase.js` / `camelCase.jsx` for all source files.
- Hooks are named with `use` prefix and live either in `src/lib/` (generic utilities) or inline in `src/App.jsx` (integration-specific).
- Store files are in `src/store/` and use `use` prefix for the hook export (`useHomeStore`), plain verbs for standalone installers (`installCrossTabSync`, `installLanWatchdog`).
- Class-based server modules use `PascalCase` for the class (`WssHub`, `HubState`) in `camelCase` files (`wss.js`, `state.js`).
- CSS uses plain `kebab-case` class names matching the design system spec (e.g. `.nav-row`, `.power-toggle`, `.slider-fill`).

### Components
- All React components are `PascalCase` function declarations defined in `App.jsx`.
- Primitive UI components: `Slider`, `Toggle`, `Icon` (base), `BottomNav`, `Sidebar`.
- Page-level components follow the pattern `<RouteName>Page` (e.g. `HomePage`, `RoomsPage`, `SettingsPage`).
- Banner / overlay components are descriptively named: `LanLostBanner`, `FirstRunBanner`, `EnvSeedPrompt`, `StartupScreen`.
- The persistent Spotify player wrapper is `PersistentMusicPlayer`; its compact header version is `HeaderMusic`.

### Constants
- `SCREAMING_SNAKE_CASE` for module-level constants (`ROUTES`, `NAV_ITEMS`, `DEMO_ROOMS`, `SP_SCOPES`, `STATUS`).
- `localStorage` keys are namespaced `hdg-*` (e.g. `hdg-integrations`, `hdg-sp-token`, `hdg-last-route`).
- IndexedDB database name: `hdg-secure-v1`; BroadcastChannel name: `hdg-home-store-v1`.

### Integration identifiers
- Short lowercase string IDs matching the store's `status` keys: `plejd`, `sonos`, `shelly`, `tibber`, `spotify`, `weather`, `google`.
- These IDs are used consistently as map keys across the store, `useIntegrations`, `LAN_INTEGRATIONS` list, and WebSocket message `integration` field.

### Assets
- Backdrop images: `backdrop-<phase>.avif` where phase is one of `night`, `sunrise`, `day`, `sunset`, `rain`, `winter`, `cabin`.
