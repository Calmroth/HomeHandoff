# Roadmap: Home Control Dashboard

**Created:** 2026-05-18
**Structure:** Horizontal Layers — complete each technical layer before moving to the next
**Granularity:** Coarse (5 phases)
**Mode:** Standard

---

## Phase 1: Security Hardening

**Goal:** Secure all credentials and API endpoints before deploying publicly or adding new integrations.

**Requirements:** SEC-01, SEC-02, SEC-03, SEC-04

**Why first:** Every subsequent phase assumes the security foundation is in place. Adding the climate integration or production deployment to a system with open hub endpoints and plaintext tokens is actively harmful.

**Success Criteria:**
1. `POST /command` and `POST /scan` return 401 for any request without a valid shared secret or JWT — verified with `curl` from outside the app
2. After the secureStore migration, `localStorage` contains no integration tokens in plaintext — verified with DevTools → Application → Local Storage
3. A production Vite build (`npm run build`) makes Plejd cloud calls successfully — no "proxy not found" or CORS errors at runtime
4. No `VITE_*` variable in the built bundle contains a secret that could be extracted by a user viewing the source

**Plans:**
- 1-1: Hub authentication (shared secret header on all command endpoints)
- 1-2: Token migration (complete secureStore adoption, remove localStorage originals)
- 1-3: Plejd production proxy + env var audit

---

## Phase 2: Reliability & Architecture

**Goal:** The app never crashes silently, and the codebase can be edited without reading 6000 lines.

**Requirements:** REL-01, REL-02, ARC-01, ARC-02

**Why second:** Decomposing App.jsx is a prerequisite for efficient work on climate, deployment, and onboarding. Error boundaries protect the wall iPad from permanent blank screens.

**Success Criteria:**
1. Throwing an uncaught error inside any route section (Home, Rooms, Music, Energy, Settings) shows a section-level fallback with a "Reload" affordance — not a blank screen
2. `src/App.jsx` is under 500 lines; domain logic lives in named files (`src/lights.jsx`, `src/energy.jsx`, etc.)
3. All integration config (HA token, Tibber key, Plejd session, hub URL) is read from and written to the Zustand store — no component accesses `localStorage` directly for integration state
4. Disconnecting and reconnecting WiFi on the wall iPad restores live data within 30 seconds without a manual reload

**Plans:**
- 2-1: React Error Boundary (per-route fallbacks + global catch)
- 2-2: App.jsx decomposition (extract domain modules, ≤500 lines each)
- 2-3: Zustand config unification (migrate integration state from useState/localStorage to store)

---

## Phase 3: Climate Control

**Goal:** Family can see and control home temperature from the dashboard.

**Requirements:** CLI-01, CLI-02, CLI-03

**Why third:** New feature that depends on the Zustand store unification from Phase 2 (new integration config lives in the store from day one).

**Success Criteria:**
1. Climate card displays current indoor temperature and current HVAC mode (heat / cool / auto / off), updated within 5 seconds of a physical thermostat change
2. Tapping the up or down setpoint button on the climate card sends a command that changes the thermostat setpoint — confirmed via the thermostat display or HA entity state
3. Climate integration config appears in Settings with a "Test connection" button that returns ✓ Connected or ✗ error inline

**Plans:**
- 3-1: Climate UI (card component, setpoint controls, mode display)
- 3-2: HA climate entity integration (poll state, dispatch set_temperature / set_hvac_mode)

---

## Phase 4: Production Deployment

**Goal:** The dashboard is accessible from anywhere; LAN devices work correctly on HTTPS.

**Requirements:** DEP-01, DEP-02, DEP-03

**Why fourth:** Deployment depends on the architecture being clean (Phase 2) and all security hardening done (Phase 1).

**Success Criteria:**
1. The hosted URL loads the dashboard and shows live device state when accessed from a mobile network (not home WiFi)
2. Typing the DDNS hub URL into first-run setup and tapping "Connect" establishes a live WebSocket connection — hub status dot turns green
3. Toggling a Shelly outlet from the hosted URL (outside LAN) successfully changes outlet state — confirmed by physical observation or Shelly app
4. No mixed-content browser warnings appear in the DevTools console on the hosted HTTPS URL

**Plans:**
- 4-1: Hub DDNS configuration + first-run hub URL entry
- 4-2: LAN traffic routing through hub (eliminate direct `http://` browser fetches)
- 4-3: Vercel/VPS deployment (build config, env vars, CI)

---

## Phase 5: Fast Onboarding

**Goal:** Any family member can configure the dashboard on a new device without help.

**Requirements:** OB-01, OB-02

**Why last:** Onboarding polish is only meaningful once the underlying system (security, architecture, deployment) is production-ready.

**Success Criteria:**
1. Following the first-run flow on a factory-reset iPad with no prior knowledge sets up hub URL, Google sign-in, and Plejd lights in a single session — no external documentation needed
2. Time from factory reset to a working lights + energy dashboard is under 5 minutes (measured)
3. The first-run flow shows clear, jargon-free labels for each integration ("Your home hub" not "Hub URL", "Wireless lights" not "Plejd credentials")

**Plans:**
- 5-1: First-run flow redesign (sequential hub → auth → integration steps with progress indicator)
- 5-2: Setup time optimization (pre-fill known values, skip optional integrations gracefully)

---

## Summary

| Phase | Name | Requirements | Success Criteria |
|-------|------|--------------|-----------------|
| 1 | Security Hardening | SEC-01–04 | 4 |
| 2 | Reliability & Architecture | REL-01–02, ARC-01–02 | 4 |
| 3 | Climate Control | CLI-01–03 | 3 |
| 4 | Production Deployment | DEP-01–03 | 4 |
| 5 | Fast Onboarding | OB-01–02 | 3 |

**Total:** 5 phases · 16 requirements · 18 success criteria · All v1 requirements covered ✓

---
*Roadmap created: 2026-05-18*
*Last updated: 2026-05-18 after initial creation*
