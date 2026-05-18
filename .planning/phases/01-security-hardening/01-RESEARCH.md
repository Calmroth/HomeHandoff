# Phase 1 Research: Security Hardening

**Phase:** 1 — Security Hardening
**Requirements:** SEC-01, SEC-02, SEC-03, SEC-04
**Research date:** 2026-05-18

---

## SEC-01 — Hub API Authentication

### Affected surfaces

**REST endpoints** (`server/index.js` lines 86–110):
```
POST /command  — dispatches any command to any registered integration handler
POST /scan     — triggers full LAN port-scan, returns found devices as JSON
```
Both have zero authentication. Any process on the network that knows the hub IP and port can:
- Toggle all lights, mute all speakers, or run any integration action
- Trigger a full subnet scan (CPU + network-intensive)

**WebSocket** (`server/lib/wss.js` lines 103–144):
The `_onConnection` handler accepts every WebSocket client unconditionally. Clients can send `command` and `scan` messages through the socket with the same power as the REST endpoints.

### Recommended approach: shared secret

A shared secret is the right primitive for this LAN-service threat model. The app and hub are co-deployed in the same household; a JWT issuer adds no security value when both sides are the same person. A 32-byte random hex secret stored in `.env.local` (server-side, never exposed via VITE_*) is the correct level of complexity.

**Pattern for REST (Express middleware):**
```js
// server/lib/auth.js
import { timingSafeEqual } from 'crypto';
export function requireSecret(secret) {
  const secretBuf = Buffer.from(secret);
  return (req, res, next) => {
    const provided = req.headers['x-hub-secret'] || '';
    let valid = false;
    try {
      valid = provided.length === secret.length &&
              timingSafeEqual(Buffer.from(provided), secretBuf);
    } catch {}
    if (!valid) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    next();
  };
}
```

Apply only to the two mutable endpoints: `POST /command` and `POST /scan`.
Do NOT apply to `GET /health` — that endpoint is used by monitoring scripts and should remain open.

**Pattern for WebSocket:**
Check the secret on the first message from each client (a mandatory `auth` message type), then move the socket to an authenticated state. Unauthenticated clients receive an error and are closed. Alternatively, the WS connection URL can carry the secret as a query param (`ws://hub.local:3001?secret=…`) — simpler to implement on the client side since `useWebSocketHub.js` constructs the URL from `VITE_HUB_URL`.

Query-param approach chosen: simpler, matches how CORS origin is already configured, no new message type needed on the WS protocol.

**New environment variables:**
- `HUB_SECRET` — server-side only (not VITE_*), 32+ hex chars, set in server `.env.local`
- `VITE_HUB_SECRET` — browser-side, same value; baked into bundle; acceptable for LAN-only household app (not a user credential, not a cloud service token)

**Files to change:**
- `server/lib/auth.js` — new file, shared-secret middleware + WS auth check
- `server/index.js` — import + apply `requireSecret` middleware to POST routes; add secret to WS URL check
- `src/lib/useWebSocketHub.js` — append `?secret=…` to hub WS URL
- `src/App.jsx` — add `X-Hub-Secret` header to hub fetch calls (if any direct hub REST calls exist)
- `.env.local` — add `HUB_SECRET=<random>` and `VITE_HUB_SECRET=<same>`

**Verification:**
```bash
# Should return 401:
curl -X POST http://localhost:3001/command -H "Content-Type: application/json" -d '{"integration":"plejd","action":"toggle","params":{}}'

# Should return 200:
curl -X POST http://localhost:3001/command \
  -H "Content-Type: application/json" \
  -H "X-Hub-Secret: <secret>" \
  -d '{"integration":"plejd","action":"toggle","params":{}}'
```

---

## SEC-02 — Token Migration

### Current state (`src/lib/secureStore.js`)

`migrateFromLocalStorage()` copies three keys from plain localStorage into AES-GCM encrypted IndexedDB, then **deliberately leaves the localStorage originals**:

```js
// src/lib/secureStore.js (migration block)
// We deliberately keep the legacy localStorage entries in place for
// one release cycle so an interrupted migration is recoverable.
```

This defeats the purpose of migration. After migration completes successfully, `localStorage.hdg-integrations` still contains the Plejd cloud session token, HA Bearer token, Tibber API key, and Spotify refresh token in plaintext.

### Migration keys

| localStorage key | secureStore key | Contains |
|---|---|---|
| `hdg-sp-token` | `spotify.token` | Spotify OAuth tokens (access + refresh) |
| `hdg-g-credential` | `google.credential` | Google ID token (JWT) |
| `hdg-integrations` | `integrations.config` | Plejd cloudSession, HA token, Tibber key, Sonos URL |

### Fix

After each key is successfully written to secureStore, call `localStorage.removeItem(srcKey)`. The "one release cycle" window has passed — this is a fresh deployment.

```js
// After: const result = await setSecret(destKey, value);
localStorage.removeItem(srcKey);
```

Add a migration version marker to localStorage (`hdg-secure-migrated: '2'`) so that a partially-migrated state on an older browser is detected and re-run rather than silently skipped.

### New Plejd session storage path

The `doLogin` function in `App.jsx` calls `integrations.setIntegration('plejd', {...})` which routes through `useIntegrations` → `localStorage.setItem('hdg-integrations', ...)`. This path does NOT go through secureStore directly — it only gets migrated when `migrateFromLocalStorage` runs.

The `setIntegration` function should call `setSecret('integrations.config', ...)` directly rather than staging in localStorage first. This is a broader refactor tracked under ARC-02 (Zustand config unification); for Phase 1, ensuring the migration cleanup runs is sufficient.

### Files to change

- `src/lib/secureStore.js` — remove the intentional preservation, add `localStorage.removeItem(srcKey)` after each successful migration; bump migration version marker

---

## SEC-03 — Plejd Production Proxy

### Problem

`vite.config.js` defines a dev-server proxy:
```js
proxy: {
  '/api/plejd': {
    target: 'https://cloud.plejd.com',
    changeOrigin: true,
    secure: true,
    rewrite: (path) => path.replace(/^\/api\/plejd/, ''),
  },
}
```

`server.proxy` is a Vite dev server feature only. A production `npm run build` produces a static bundle with no proxy. In production:
- `plejdLogin()` → `fetch('/api/plejd/parse/login')` → **404 or CORS block**
- `plejdFetchSites()` → `fetch('/api/plejd/parse/functions/getSiteList')` → **404 or CORS block**
- `plejdFetchDevices()` → same

The CORS issue: Plejd's `cloud.plejd.com` does not send `Access-Control-Allow-Origin` headers, so a direct browser fetch from a different origin (Vercel-hosted app) fails with a CORS error even if the URL is correct.

### Fix

Add a `/api/plejd/*` catch-all route to `server/index.js` that proxies requests to `cloud.plejd.com` using Node's built-in `fetch`. The hub is already a Node process; this adds one route and no new dependencies.

```js
// server/index.js — add after /health endpoint
app.use('/api/plejd', async (req, res) => {
  const upstreamUrl = `https://cloud.plejd.com${req.path}`;
  try {
    const upstream = await fetch(upstreamUrl, {
      method: req.method,
      headers: {
        ...req.headers,
        host: 'cloud.plejd.com',
      },
      body: ['POST', 'PUT', 'PATCH'].includes(req.method)
        ? JSON.stringify(req.body)
        : undefined,
    });
    const body = await upstream.text();
    res.status(upstream.status);
    upstream.headers.forEach((v, k) => {
      if (!['transfer-encoding', 'connection'].includes(k)) res.setHeader(k, v);
    });
    res.send(body);
  } catch (e) {
    res.status(502).json({ ok: false, error: `Plejd proxy: ${e.message}` });
  }
});
```

This route must be added WITHOUT the `requireSecret` middleware (Plejd cloud calls originate from the browser, which always passes the CORS preflight through the hub — blocking them with the hub secret would break the Settings login flow that calls `plejdLogin` directly).

The route must also be added BEFORE the `requireSecret` middleware is applied to `/command` and `/scan`.

### Verification

In a production build (after `npm run build && npx serve dist`):
- Open Settings → Plejd → enter credentials → "Connect" should successfully authenticate
- DevTools → Network: no CORS errors on `plejd` requests; requests go to `localhost:3001/api/plejd/…`

---

## SEC-04 — Environment Variable Audit

### Current VITE_* variables in .env.local

| Variable | Safe to bake in bundle? | Reason |
|---|---|---|
| `VITE_GOOGLE_CLIENT_ID` | ✓ Yes | OAuth 2.0 client ID — not a secret; Google validates the authorized redirect URI separately |
| `VITE_SPOTIFY_CLIENT_ID` | ✓ Yes | Spotify app ID — not a secret; scoped to OAuth PKCE flow |
| `VITE_SPOTIFY_REDIRECT_URI` | ✓ Yes | Redirect callback URL — public |
| `VITE_HUB_URL` | ✓ Yes | WebSocket URL for LAN hub — LAN IP, acceptable for household app |
| `VITE_HOME_ASSISTANT_URL` | ✓ Yes | LAN URL — not a credential |
| `VITE_SONOS_URL` | ✓ Yes | LAN URL — not a credential |
| `VITE_TIBBER_TOKEN` | ✗ **SECRET** | Tibber personal access token — grants read access to household energy data and billing |
| `VITE_HOME_ASSISTANT_TOKEN` | ✗ **SECRET** | Bearer token for all HA REST API access — could expose sensors, automations, and history |

### Why VITE_TIBBER_TOKEN is low-risk to remove

Tibber data (current price, consumption) is already delivered to the frontend via the hub WebSocket: `startTibberPoller` runs on the server and pushes updates via `hub.pushUpdate('tibber', payload)`. The frontend's `VITE_TIBBER_TOKEN`-seeded path in `App.jsx` (line 1680) stores the token in `integrations.config.tibber.token` which is then used by… the frontend Tibber direct-fetch path. But if the hub is running, that frontend path is redundant.

Fix: remove the `VITE_TIBBER_TOKEN` seeding block from `App.jsx`. The Tibber integration in Settings should be configured via the Settings UI (token stored in secureStore), not seeded from a baked-in env var.

### Why VITE_HOME_ASSISTANT_TOKEN is the harder case

The HA entity polling (`src/lib/haEntities.js`) runs entirely in the browser — it's not proxied through the hub. The HA token stored in `integrations.config.plejd.token` (mis-keyed under `plejd` for historical reasons) is passed to `useHaEntities`. Removing the `VITE_HOME_ASSISTANT_TOKEN` seeding path is safe: the token only needs to be set once via Settings UI and then lives in secureStore.

Fix: remove `VITE_HOME_ASSISTANT_TOKEN` seeding block from `App.jsx` (lines 1672–1676). The Settings HA config form already has an explicit token field + "Test connection" button.

### Files to change

- `src/App.jsx` — remove `VITE_TIBBER_TOKEN` and `VITE_HOME_ASSISTANT_TOKEN` seeding blocks from the `seedFromEnv` effect (lines ~1650–1683); leave `VITE_GOOGLE_CLIENT_ID`, `VITE_SPOTIFY_CLIENT_ID`, `VITE_HOME_ASSISTANT_URL`, `VITE_SONOS_URL` seeding in place
- `.env.local` — add comments flagging `VITE_TIBBER_TOKEN` and `VITE_HOME_ASSISTANT_TOKEN` as removed; move their values to `TIBBER_TOKEN` and `HA_TOKEN` (server-only) if not already set

---

## Cross-cutting concerns

### Secret generation

The new `HUB_SECRET` needs to be generated and added to `.env.local` as part of plan 1-1. Recommended: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Document in README or SETUP_CERT.md.

### Migration window for existing installs

The localStorage cleanup in SEC-02 must NOT run until `migrateFromLocalStorage` has confirmed the data is in secureStore. The current code writes to secureStore before the `removeItem` calls — this ordering is already correct; just need to stop suppressing the removals.

### Deployment order dependency

SEC-03 (Plejd proxy in hub) must ship BEFORE removing the Vite dev proxy from `vite.config.js`. The Vite proxy can stay in place indefinitely (it's harmless in dev); removing it is optional cleanup.

---

*Research completed: 2026-05-18*
