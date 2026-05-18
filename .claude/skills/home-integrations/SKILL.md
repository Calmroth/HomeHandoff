# Home Integrations — Plejd, Sonos, Spotify

Reference for the three vendor integrations that required the most debugging.
Read this before touching any of these files to avoid re-learning painful lessons.

---

## Plejd

### Architecture

Two paths exist depending on whether the Node hub has credentials:

| Condition | Who fetches | How commands go |
|---|---|---|
| Hub has `PLEJD_EMAIL` + `PLEJD_PASSWORD` | `server/lib/integrations/plejd.js` | Hub → TCP GWY-01 gateway (port 9001) → BLE mesh |
| Hub lacks credentials (browser login only) | `src/lib/plejdCloud.js` | Browser → `sendStateToDevice` cloud function → GWY-01 via MQTT |

The user logs in via Settings UI → session token stored in IndexedDB (secureStore). Hub credentials are separate and optional. Hub path gives real-time TCP state; browser-only path polls every 8 seconds.

### API structure — `getSiteById`

`getSiteById` returns **two device arrays**. Only one has user-visible names:

```
detail.devices      ← USER LAYER — names, rooms, types. USE THIS.
detail.plejdDevices ← HARDWARE LAYER — MAC addresses, firmware. NO user names.
detail.outputSettings ← ELECTRICAL CONFIG — dimmer curves, boot state. NO names.
detail.rooms        ← FULL room objects with titles (60 rooms typical)
```

**`detail.devices[i]` fields that matter:**
```json
{
  "objectId":  "NFYAC83rpZ",          // Parse ID — use as deviceId for commands
  "deviceId":  "F053FD8615F6",        // Hardware MAC (links to plejdDevices)
  "title":     "Matsal tavelbelysning",// USER-GIVEN NAME ✓
  "roomId":    "764ebc7e-...",         // UUID — matches r.roomId on rooms objects
  "traits":    "DIM01"                 // Hardware type (DIM01/WPH-01/etc.)
  // NOTE: "state" and "dim" are ABSENT — cloud does not return live state
}
```

**`detail.plejdDevices[i]` — what it does NOT have:**
No `title`, no `name`, no `room`. Using this array for user-visible devices was the root bug.

### Room resolution

`d.roomId` is a UUID string (e.g., `"764ebc7e-dd39-4225-91f2-28c8b4d4c18c"`).
Room objects have both `r.objectId` (10-char Parse ID) and `r.roomId` (UUID).
The roomMap must index BOTH:
```js
if (r.objectId) roomMap[r.objectId] = title;
if (r.roomId && r.roomId !== r.objectId) roomMap[r.roomId] = title;
```
Then `roomMap[d.roomId]` resolves the room name correctly.

### Live state

**The cloud API never returns real-time device state.** `state` and `dim` are absent from `detail.devices` items. The fix is a `stateKnown` flag returned from `plejdFetchDevices`:

```js
const stateKnown = userDevices.some(d => 'state' in d);
```

In App.jsx, when `!stateKnown`, preserve existing on/brightness across polls so user-toggled state isn't reset every 8 seconds:

```js
setRooms(prevRooms => {
  if (stateKnown) return lights;
  const prevMap = new Map(prevRooms.map(r => [r.id, r]));
  return lights.map(r => {
    const prev = prevMap.get(r.id);
    return prev ? { ...r, on: prev.on, brightness: prev.brightness } : r;
  });
});
```

For real-time state, the hub must run with credentials — the TCP GWY-01 connection pushes live `plejd_lights` WebSocket events. Without the hub, state is optimistic only.

### Control (cloud path)

`plejdSetDeviceState` sends `deviceId: d.objectId` (from `detail.devices`) to the Parse cloud function `sendStateToDevice`. This works if a GWY-01 is cloud-paired. Without a physical gateway, the command reaches the cloud but doesn't reach the mesh.

### Hub command routing

The hub's `deviceMap` is keyed by `plejdDevices[j].objectId`. Room-grouped cards use `_cloudDevice.id = 'room:<roomId>'` which the hub fans out via `roomDeviceMap`. This path works correctly when the hub is running with credentials.

### Relevant files

| File | Role |
|---|---|
| `src/lib/plejdCloud.js` | Browser-side fetch + command (cloud path) |
| `server/lib/integrations/plejd.js` | Hub-side fetch + TCP gateway + command handler |
| `server/lib/plejd-gateway.js` | TCP:9001 driver — BLE mesh encryption/decryption |
| `server/scripts/plejd-probe.mjs` | One-shot diagnostic — needs `PLEJD_EMAIL`/`PLEJD_PASSWORD` in `.env.local` |

---

## Sonos

### Setup requirements

Sonos control goes through [node-sonos-http-api](https://github.com/jishi/node-sonos-http-api), a separate bridge process.

**Start sequence:**
```bash
npm run dev:full   # starts Vite (5183) + hub (3001) + Sonos bridge (5005)
```

The bridge runs on port **5005** and must be reachable from the browser. In Settings, set the Sonos URL to `http://sonos.localhost:5005` (uses Vite dev proxy rewrite to avoid CORS).

**In production / LAN HTTPS:** The bridge URL must be served over HTTPS or proxied — direct `http://` fetches from an HTTPS page are blocked. Route through the hub WebSocket path instead.

### API calls in the codebase

```js
sonosFetchSpeakers()   // GET /zones — returns speaker list with state
sonosCmd(cmd, speaker) // POST /<speaker-name>/<cmd> — transport commands
```

Both live in `src/App.jsx`. The speaker name must match the Sonos room name exactly (case-sensitive, spaces encoded).

### Common failures

- **ERR_CONNECTION_TIMED_OUT on `/zones`**: Bridge not running. Run `npm run dev:full` or start the bridge separately.
- **Speakers show but commands fail**: Speaker name mismatch. Use the exact name from the `/zones` response.
- **CORS errors in production**: Bridge not proxied. Route through hub WebSocket or set up an HTTPS reverse proxy.

---

## Spotify

### Auth flow

PKCE OAuth — no server-side secret required. Flow:
1. User clicks "Connect Spotify" in Settings
2. App redirects to Spotify authorize endpoint with `code_challenge`
3. Spotify redirects back to `redirect_uri` with `?code=...`
4. App exchanges code for access + refresh tokens
5. Tokens stored encrypted in IndexedDB via `secureStore.js`

### Critical: redirect URI must be `127.0.0.1`, not `localhost`

Spotify rejects `localhost` in redirect URIs. The Spotify Developer Dashboard app registration must use `http://127.0.0.1:5183/` (or whatever port Vite runs on). The browser must also be accessing the app via `127.0.0.1`, not `localhost`. Vite must bind to `127.0.0.1`.

If the redirect URI doesn't exactly match the registered URI (including protocol, host, port, and trailing slash), Spotify returns `INVALID_CLIENT: Invalid redirect URI`.

### Token storage

Tokens are stored in IndexedDB under `spotify.token` via `secureStore.js` — NOT in localStorage. The key `hdg-sp-token` in localStorage is legacy (migrated on first run). Never read directly from localStorage for Spotify state.

### Embed vs. Connect

Two Spotify modes coexist:
- **Spotify Embed** (`useSpotifyEmbed`): iFrame player, controls the in-app playback, works without Connect
- **Spotify Connect** (`useSpotify`): full Connect device list, controls external speakers/devices, requires auth

### Relevant files

| File / Location | Role |
|---|---|
| `src/App.jsx` — `useSpotify()` hook | PKCE flow, token management, Connect device list |
| `src/App.jsx` — `useSpotifyEmbed()` hook | iFrame API wrapper |
| `src/lib/secureStore.js` | Token vault (AES-GCM, IndexedDB) |
| `vite.config.js` | `server.proxy` for Spotify API calls |

### Common failures

- **"INVALID_CLIENT: Invalid redirect URI"**: Redirect URI mismatch. Check Dashboard matches `http://127.0.0.1:<port>/` exactly, and browser URL uses `127.0.0.1`.
- **Tokens expire / refresh fails**: `refresh_token` flow is in `useSpotify`. Check `VITE_SPOTIFY_CLIENT_ID` is set in `.env.local`.
- **Embed shows but Connect has no devices**: Connect requires a Spotify Premium account and an active device.
