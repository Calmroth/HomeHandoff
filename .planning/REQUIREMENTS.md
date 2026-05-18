# Requirements: Home Control Dashboard

**Defined:** 2026-05-18
**Core Value:** The wall iPad is always-on and always-accurate — a family member who didn't set it up can pick it up and control the house in under 5 seconds.

## v1 Requirements

### Security

- [ ] **SEC-01**: Hub API requires authentication (shared secret / JWT) on `POST /command` and `POST /scan`; unauthenticated requests receive 401
- [ ] **SEC-02**: All integration tokens (HA token, Tibber key, Plejd session) stored in AES-GCM encrypted IndexedDB via secureStore; plain-localStorage originals deleted after migration
- [ ] **SEC-03**: Plejd cloud API calls succeed in a production Vite build (server-side proxy replaces the Vite dev-only `/api/plejd` proxy)
- [ ] **SEC-04**: VITE_* environment variables audited; secrets not safe in the browser bundle moved to server-side or runtime config

### Reliability

- [ ] **REL-01**: React Error Boundary wraps all route sections; a render crash shows a section-level fallback UI, not a blank screen
- [ ] **REL-02**: App reconnects to integrations after a network interruption without requiring a full page reload

### Climate

- [ ] **CLI-01**: Climate card shows current indoor temperature and current HVAC mode (heat / cool / auto / off)
- [ ] **CLI-02**: User can adjust target temperature setpoint from the climate card (±0.5 °C or ±1 °F steps)
- [ ] **CLI-03**: Climate wires to a Home Assistant climate entity by default; direct thermostat API path is configurable as an alternative

### Deployment

- [ ] **DEP-01**: App is accessible from outside the home network via a stable hosted URL (Vercel or VPS)
- [ ] **DEP-02**: Hub is reachable from the hosted app via a DDNS hostname; hub URL is entered during first-run setup
- [ ] **DEP-03**: All LAN device calls (Shelly outlets, Sonos UPnP) route through the hub — no HTTPS mixed-content errors

### Onboarding

- [ ] **OB-01**: First-run flow guides a new user through hub URL entry, Google sign-in, and at least one integration credential in sequence
- [ ] **OB-02**: A factory-reset iPad reaches a working dashboard with at least lights and energy in under 5 minutes

### Architecture

- [ ] **ARC-01**: `src/App.jsx` is decomposed into per-domain component files; no single file exceeds 500 lines
- [ ] **ARC-02**: All integration config state is unified in the Zustand store; no component reads integration credentials directly from localStorage

## v2 Requirements

### Testing

- **TEST-01**: secureStore.js crypto logic has automated unit tests (AES-GCM encrypt/decrypt round-trip)
- **TEST-02**: Hub command dispatch has integration tests against a mock Plejd/Shelly endpoint

### Notifications

- **NOTF-01**: Push notification when a smoke/CO sensor triggers (via HA webhook)
- **NOTF-02**: Low-battery alert badge on sensor tiles

### Presence

- **PRES-01**: Geofencing scene trigger — "Leaving home" fires when last family member departs
- **PRES-02**: Dashboard shows which family members are home (derived from phone location or HA device_tracker)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Cameras / doorbells | RTSP streaming requires significant backend complexity; not requested |
| Philips Hue / Zigbee direct | Not in this home; covered via Home Assistant entities if needed |
| Smart locks / alarm panels | Not requested |
| Voice control | No hardware in scope; HA automations can be added externally |
| React Native / Expo app | Web app works on phones via browser; native app is a separate project |
| Zigbee / Z-Wave coordinator | Managed through Home Assistant, not this app |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SEC-01 | Phase 1 | Pending |
| SEC-02 | Phase 1 | Pending |
| SEC-03 | Phase 1 | Pending |
| SEC-04 | Phase 1 | Pending |
| REL-01 | Phase 2 | Pending |
| REL-02 | Phase 2 | Pending |
| ARC-01 | Phase 2 | Pending |
| ARC-02 | Phase 2 | Pending |
| CLI-01 | Phase 3 | Pending |
| CLI-02 | Phase 3 | Pending |
| CLI-03 | Phase 3 | Pending |
| DEP-01 | Phase 4 | Pending |
| DEP-02 | Phase 4 | Pending |
| DEP-03 | Phase 4 | Pending |
| OB-01 | Phase 5 | Pending |
| OB-02 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-18*
*Last updated: 2026-05-18 after initial definition*
