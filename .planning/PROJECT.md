# Home Control Dashboard

## What This Is

A React single-page application that replaces six separate vendor apps with one dashboard for the whole family. Hosted on Vercel/VPS and accessible from anywhere, it proxies commands to a Node.js hub running at home via DDNS — controlling Plejd lights, Shelly outlets, Sonos speakers, Spotify, Tibber energy, Home Assistant sensors, climate (TBD brand), and weather. Primary surface is a wall-mounted kitchen iPad; secondary surfaces are family phones and away-access via the hosted URL.

## Core Value

The wall iPad is always-on and always-accurate — a family member who didn't set it up can pick it up and control the house in under 5 seconds.

## Requirements

### Validated

- ✓ Plejd light control (toggle, brightness, by room) — existing
- ✓ Shelly outlet control (toggle) — existing
- ✓ Sonos playback control (play/pause, volume, now playing) — existing
- ✓ Spotify integration (OAuth, playback state) — existing
- ✓ Tibber energy dashboard (current price, consumption) — existing
- ✓ Home Assistant sensor display — existing
- ✓ Weather display (geolocation-based, day-phase photo backdrop) — existing
- ✓ Scenes (one-tap automations, amber accent) — existing
- ✓ Settings with integration test buttons — existing
- ✓ Mobile bottom nav (≤720px, iOS safe-area) — existing
- ✓ Undo chip on toggle actions (3-second floor strip) — existing
- ✓ Command feedback (amber pulse during 600 ms send window) — existing
- ✓ Integration descriptions in Settings (10-word plain-language labels) — existing

### Active

- [ ] Hub API authentication — POST /command and POST /scan need JWT/shared secret; currently open to anyone on the network
- [ ] Tokens out of localStorage — migrate HA token, Tibber key, Plejd session from plain localStorage to AES-GCM encrypted IndexedDB (secureStore migration completes fully)
- [ ] Plejd proxy in production — Vite /api/plejd proxy is dev-only; production needs a real server-side equivalent
- [ ] Environment variables audit — review which VITE_* vars are safe baked into the bundle vs. must stay server-side
- [ ] React Error Boundary — a single render crash blanks the entire app; add boundary with auto-recovery and per-section fallbacks
- [ ] Climate/thermostat integration — generic UI for temperature, mode (heat/cool/auto/off), target setpoint; brand TBD (Nest, Ecobee, Sensibo); wire to HA entity or direct API
- [ ] Production deployment — Vercel/VPS for the hosted app; DDNS + port-forward for hub reachability from outside the home network; LAN http:// calls route through hub (not directly from browser) for HTTPS compatibility
- [ ] App.jsx decomposition — split 6000-line monolith into per-domain component files to unblock code splitting, tooling, and parallel editing
- [ ] Fast onboarding — a fresh iPad (factory reset) reaches a working dashboard in under 5 minutes; first-run flow covers hub URL, Google sign-in, and integration credentials

### Out of Scope

- Cameras / doorbells — not requested; RTSP streaming adds significant backend complexity
- Philips Hue / Zigbee direct — not in this home; existing HA integration covers Zigbee if needed via HA entities
- Smart locks / alarm panels — not requested
- Voice control — no hardware in scope; can be added later via HA automations
- React Native / Expo mobile app — the web app works on phones via the browser; a native app is a separate project
- Zigbee/Z-Wave coordinator — managed through Home Assistant, not this app directly

## Context

**Existing codebase:** React 18 + Vite SPA, ~6900-line `src/App.jsx` monolith, `src/tokens.css` design token system (oklch, amber accent, clay wash). Node.js hub in `server/` handles Plejd TCP, Shelly polling, and Sonos UPnP — exposes `POST /command`, `GET /state`, `POST /scan`, WebSocket hub sync.

**Design system:** Amber-on-clay palette, photo backdrop with day-phase crossfade, 2px mortared-tile card grid, 44px minimum hit targets, iOS safe-area support. Impeccable critique score 28.5/40 — P1 and P2 issues already addressed; P3 layout-transition fixes already applied.

**Architecture constraint:** The hosted app cannot make direct `http://` calls to LAN devices (Shelly, Sonos UPnP) from an HTTPS context — mixed-content policy blocks them. All LAN traffic must route through the hub.

**Deployment target:** Hub lives on a home server (Raspberry Pi or NAS), exposed via home router port-forward + DDNS hostname (e.g. `hub.home.example.com`). App hosted on Vercel or a VPS. Hub URL is a runtime setting (entered during first-run).

**Security baseline:** No CI pipeline, no automated tests. Security hardening is done manually. Key risks identified: open hub endpoints, tokens in plain localStorage, dev-only Plejd proxy.

## Constraints

- **Tech stack**: React 18 + Vite + vanilla CSS (no Tailwind, no component library) — existing; do not introduce new frameworks
- **Single bundle**: App ships as a static SPA; no SSR — keep secrets server-side in hub, not in Vite env vars
- **LAN architecture**: All LAN device calls must go through the Node.js hub — no direct `http://` browser fetches in the HTTPS-hosted app
- **iOS compatibility**: Primary device is an iPad; `color-mix()` fallbacks required for Safari <16.4 (iPad 6th gen / A10)
- **No automated tests**: Manual verification only for now; critical crypto code (`secureStore.js`) is highest priority for future test coverage

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Hub at home, app hosted | LAN devices (Shelly, Sonos) require local network access; hosting only the UI on Vercel keeps latency low and LAN calls possible | — Pending |
| DDNS + port-forward for hub | Cloudflare Tunnel would be zero-config but adds a dependency and latency hop; port-forward is self-contained | — Pending |
| Generic thermostat UI first | Thermostat brand not yet decided; build the UI and HA-entity path first, wire vendor API when hardware is chosen | — Pending |
| App.jsx decomposition before new features | 6000+ lines exceeds tooling read limits; new integrations added to the monolith will be unmaintainable | — Pending |
| Tokens to secureStore first | Security hardening before new features — adding more credentials to a leaky store makes cleanup harder later | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-18 after initialization*
