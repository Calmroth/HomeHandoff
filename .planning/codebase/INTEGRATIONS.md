# External Integrations
*Last mapped: 2026-05-18*

---

## Plejd (Smart Lighting)

- **Type:** Hybrid — cloud REST (Parse Server) for auth + device discovery; local TCP socket (port 9001) for real-time control
- **Purpose:** Discovers and controls Plejd smart lights and relay switches. Groups devices by room for display. Supports scenes.
- **Auth:** Email/password login against `https://cloud.plejd.com/parse/login` → session token (`X-Parse-Session-Token`). App ID (`X-Parse-Application-Id`) is a static constant from Plejd's mobile app.
- **Control path:** Preferred = persistent TCP connection to GWY-01 gateway on LAN (port 9001, BLE-encrypted). Fallback = cloud REST `sendStateToDevice` when TCP is unavailable.
- **State delivery:** Real-time state events from TCP socket; 30 s cloud fallback polling when TCP is down.
- **Key files:**
  - [`src/lib/plejdCloud.js`] — browser-side cloud auth, site/device fetch, state commands (via Vite proxy)
  - [`server/lib/integrations/plejd.js`] — server-side hub poller (TCP + cloud fallback, room/scene mapping)
  - [`server/lib/plejd-gateway.js`] — PlejdGateway TCP client (BLE crypto)
  - `vite.config.js` — `/api/plejd/*` proxy → `https://cloud.plejd.com`
- **Notes:** In production, a reverse proxy (Netlify function / Cloudflare Worker / nginx) must replicate the Vite proxy. The GWY-01 auto-discovered via LAN TCP probe across common subnets; override with `PLEJD_GATEWAY_IP` env var. HA integration file (`server/lib/integrations/ha.js`) is a stub — user does not use HA.

---

## Sonos

- **Type:** Local HTTP REST bridge (third-party `node-sonos-http-api` process)
- **Purpose:** Reads playback state and sends transport commands (play, pause, next, previous, volume) for Sonos zones/speakers.
- **Auth:** None — node-sonos-http-api runs unauthenticated on the local network.
- **State delivery:** Server hub polls `{SONOS_URL}/zones` every 5 seconds; broadcasts changes via WebSocket.
- **Key files:**
  - [`server/lib/integrations/sonos.js`] — hub poller + command handler
- **Notes:** Requires a separately running `node-sonos-http-api` process. Launch via `npm run sonos` (points to `../node-sonos-http-api/server.js`). URL configured via `SONOS_URL` env var (default `http://localhost:5005`). `VITE_SONOS_URL` makes it browser-accessible if needed.

---

## Shelly (Smart Outlets)

- **Type:** Local HTTP REST — direct device HTTP API (no cloud)
- **Purpose:** Polls each registered Shelly smart plug/relay for on/off state and live wattage. Sends toggle commands.
- **Auth:** None — Shelly devices expose unauthenticated HTTP on the LAN.
- **State delivery:** Server hub polls each device IP every 12 seconds. Device list is managed in the frontend Settings UI and mirrored to hub state on WebSocket connect.
- **Key files:**
  - [`server/lib/integrations/shelly.js`] — hub poller + command handler
- **Notes:** Supports both Gen1 (`/relay/0`) and Gen2 (`/rpc/Switch.GetStatus?id=0` / `/rpc/Switch.Set`) device APIs. Device list stored in browser `localStorage` (`hdg-integrations` key) and sent to hub as part of the initial WebSocket handshake.

---

## Tibber (Electricity Pricing)

- **Type:** GraphQL REST API (`https://api.tibber.com/v1-beta/gql`)
- **Purpose:** Fetches hourly electricity spot prices (today + tomorrow) for energy cost display.
- **Auth:** Bearer token in `Authorization` header. Token obtained from `https://developer.tibber.com/settings/access-token`.
- **State delivery:** Server hub polls once per hour. Pushes `{ today: PricePoint[], tomorrow: PricePoint[], fetchedAt }` via WebSocket.
- **Key files:**
  - [`server/lib/integrations/tibber.js`] — hub poller
- **Notes:** Tomorrow's prices appear around 13:00 CET; hourly polling catches that update. Token configured via `TIBBER_TOKEN` env var. `VITE_TIBBER_TOKEN` also present for potential browser-direct access.

---

## Open-Meteo (Weather)

- **Type:** REST API (`https://api.open-meteo.com/v1/forecast`)
- **Purpose:** Fetches current conditions plus 7-day hourly/daily forecast. WMO weather codes are mapped to four buckets (clear/cloudy/rain/snow) that drive the full-screen photo backdrop.
- **Auth:** None — free, no API key, CORS-open.
- **State delivery:** Browser-direct fetch from the React frontend. Not routed through the hub.
- **Key files:**
  - [`src/App.jsx`] — `fetchWeather()` function + `wmoToBucket()` / `wmoLabel()` helpers
- **Notes:** User-configurable lat/lon in Settings (defaults to Stockholm 59.3293/18.0686). Solar-phase backdrop logic in [`src/lib/sunPhase.js`] uses `suncalc` to pick backdrop based on actual sunrise/sunset times at the configured coordinates.

---

## Google Sign-In (Identity)

- **Type:** Google Identity Services (GIS) — client-side JavaScript SDK, One Tap + button
- **Purpose:** Optional sign-in for a household "profile" (name, avatar). No backend verification — JWT payload is decoded client-side. Also supports a local (non-Google) email/name signup with no backend at all.
- **Auth:** OAuth 2.0 implicit flow via GIS SDK. Returns a signed JWT; payload decoded locally. User object stored in `localStorage` (`hdg-g-user`).
- **Key files:**
  - [`src/App.jsx`] — `useGoogleAuth()` hook, `decodeJwtPayload()`, `signUpLocal()`
- **Notes:** Google Client ID configured via `VITE_GOOGLE_CLIENT_ID` env var or overridden in Settings UI. The threat model explicitly accepts that JWT signatures are not verified locally ("my flatmate, not the NSA"). GIS script loaded externally (`accounts.google.com/gsi/client`).

---

## Spotify

- **Type:** OAuth 2.0 + REST API (`https://api.spotify.com/v1`)
- **Purpose:** Playback control and "Now Playing" display.
- **Auth:** OAuth PKCE flow. Redirect URI must use `127.0.0.1` (not `localhost`) per Spotify's requirements. Tokens stored in `localStorage`.
- **Key files:**
  - [`src/store/useHomeStore.js`] — `spotifyToken` / `spotifyMe` in auth slice
  - `.env.local` — `VITE_SPOTIFY_CLIENT_ID`, `VITE_SPOTIFY_REDIRECT_URI`
- **Notes:** Redirect URI issue documented in project memory: Spotify rejects `localhost`, must use `127.0.0.1`. Browser-direct integration (no server-side component in the current hub).

---

## Hub WebSocket (Internal — frontend ↔ server)

- **Type:** WebSocket (`ws://localhost:3001` by default)
- **Purpose:** Real-time bidirectional channel between the React frontend and the Node hub. The hub aggregates all device-integration state and pushes updates; the frontend sends commands.
- **Auth:** None — same-host, LAN only.
- **Protocol:** JSON messages. Server→client: `snapshot`, `device_update`, `scan_result`, `scan_progress`, `scan_done`, `error`, `pong`. Client→server: `ping`, `command`, `scan`.
- **Key files:**
  - [`src/lib/useWebSocketHub.js`] — React hook (auto-reconnect, exponential backoff, ping/pong)
  - [`server/lib/wss.js`] — `WssHub` class (WebSocketServer, heartbeat, broadcast)
  - [`server/index.js`] — hub entrypoint, integration registration
- **Notes:** Hub URL configurable via `VITE_HUB_URL`. Hook reconnects silently with exponential backoff (max 30 s). Frontend falls back to direct polling if hub is unavailable.

---

## LAN Discovery Scanner (Internal)

- **Type:** Server-side TCP/HTTP probe (no external service)
- **Purpose:** Scans the local network subnet to discover smart home devices (Shelly, Sonos, Chromecast, Hue, Samsung TV, LG WebOS, Tasmota).
- **Auth:** N/A
- **Key files:**
  - [`server/lib/discovery/lan-scan.js`] — HTTP/TCP probes per device type
  - [`server/index.js`] — `POST /scan` HTTP endpoint + `scan` WebSocket message handler in `WssHub`
- **Notes:** Concurrency limited to 16 IPs at a time to avoid ARP table overflow. Triggered from frontend via `triggerScan()` in `useWebSocketHub`. Results streamed back as `scan_result` WebSocket messages.
