# Deploying Home Domain — multi-user, no backend

This prototype is a static 3-file site (`index.html`, `app.jsx`, `tokens.css`) that runs entirely in the browser. Multi-user works because each user connects their own Spotify account via PKCE OAuth — there is no central server, no shared database, and no API keys baked into the code.

## 1. Host the static files

Drop the project folder onto any static host.

| Host | Steps |
|---|---|
| **Netlify Drop** | https://app.netlify.com/drop → drag the project folder → Netlify gives you `https://<random>.netlify.app/` |
| **Vercel** | `npx vercel --prod` from the project folder → pick a project name → done |
| **GitHub Pages** | Push the folder to a repo, enable Pages on `main / root`, your site is at `https://<user>.github.io/<repo>/` |
| **Cloudflare Pages** | Connect your repo, build command empty, output dir `.` |
| **Your own server** | Any HTTPS-serving static host (nginx, caddy, S3+CloudFront) works. Spotify OAuth requires HTTPS or `http://localhost`. |

The site is served from the project root as `index.html`, so the deployed URL is just the host (e.g. `https://your-site.netlify.app/`) — no filename needed. This matters for Spotify: their dashboard rejects redirect URIs containing literal spaces, and only accepts `127.0.0.1` (not `localhost`) for non-HTTPS dev hosts.

After deploy, note the **root URL of your site** — you'll need it as the Spotify Redirect URI in step 2.

## 2. Spotify — each user gets their own dev app

Spotify's terms require every developer to register their own app. Each household running Home Domain creates one app once, then everyone in the home shares its Client ID via Settings.

1. Go to <https://developer.spotify.com/dashboard> and log in.
2. **Create app**:
   - **App name**: e.g. *Home Domain — Lindqvist*
   - **App description**: *Personal home dashboard*
   - **Redirect URI**: paste the **exact** root URL of your deployed site (e.g. `https://your-site.netlify.app/` or `http://127.0.0.1:5183/`). Spotify is strict about exact match — and rejects `localhost` as well as URIs containing spaces. Use `127.0.0.1` for local dev.
   - **APIs**: tick *Web API*.
   - Accept the terms, save.
3. Copy the **Client ID** (32-char hex).
4. Open the deployed app → **Settings** → **Spotify** → paste the Client ID → **Save** → **Connect**.
5. Spotify's consent screen opens. Approve. You're redirected back to the app with the token stored locally in your browser.

After that:
- Your display name appears in the Music page header.
- Search hits the real Spotify Web API (tracks, artists, playlists, albums).
- "Your library" lists your real Spotify playlists.
- ★ saves to local favourites; "+" adds tracks to a real Spotify playlist.
- "Radio" on an artist plays the artist embed (Spotify's embed includes a Radio button).

Tokens auto-refresh in the browser. **Disconnect** clears the local token; sign in again any time.

### Multi-user in one home

Each user signs in on their own browser/device. The Client ID is shared (one Spotify dev app per home is enough — Spotify's quota is per-app, not per-user). Tokens are stored in `localStorage` per browser, so different family members get their own Spotify library on their own device without seeing each other's.

### Spotify quotas — "Development mode" vs "Extended mode"

A fresh Spotify dev app is in **Development mode** which:
- Works only for **up to 25 named users** that you add in the dashboard under *Users and Access*.
- After 25 users you must apply for *Extended Quota Mode* (free; ~2 weeks review).

For a single household this is fine. For a real product with many homes, request Extended Quota.

## 3. Plejd — the only piece you actually need on your network

There's no public Plejd Web API. The prototype simulates Plejd state locally so the UI works without a real bridge. To control real Plejd lights you need a small **agent process inside your home network** that exposes Plejd's BLE protocol over HTTP. Options:

- **Home Assistant** with the [`plejd`](https://github.com/klaas1979/hassio-plejd) add-on. The add-on speaks Plejd's BLE protocol from a Raspberry Pi or any Linux box in your house. Then point Home Domain at HA's REST API (`http://homeassistant.local:8123/api/`).
- **Standalone Plejd MQTT bridge** ([`ha-plejd`](https://github.com/icanos/hassio-plejd) and forks). MQTT messages → Plejd commands.
- **Your own**: Plejd's BLE protocol is reverse-engineered and documented in those repos.

Once you have an agent, replace the simulated handlers in `app.jsx` (`toggleRoom`, `setBrightness`, `setAllLights`) to POST to the agent's endpoint instead of just mutating local state.

**Why this can't be browser-only**: Plejd uses Bluetooth Low Energy, which a webpage can't speak to lamps directly. A LAN process must bridge.

## 4. Other integrations — same pattern

| Integration | Same-network agent | Cloud option |
|---|---|---|
| Sonos | [`node-sonos-http-api`](https://github.com/jishi/node-sonos-http-api) on any LAN box | Sonos cloud needs OAuth + a developer agreement |
| Shelly | Each Shelly device has a built-in HTTP API (`http://<device-ip>/relay/0`); poll directly from the browser if they're on the same network and CORS is enabled | Shelly Cloud API |
| Tibber | [Tibber GraphQL API](https://developer.tibber.com) — bearer-token from your Tibber account; can be called from the browser |
| Weather | [open-meteo.com](https://open-meteo.com) — free, no key, CORS-friendly. Swap the local model in `WeatherPage` for a real fetch.

For a true browser-only deployment, the cleanest mix is:
- **Plejd** → Home Assistant on a Pi, exposed at `http://ha.local:8123/api/`
- **Sonos** → `node-sonos-http-api` on the same Pi
- **Shelly** → direct browser→device fetches (each Shelly serves its own HTTP API)
- **Spotify** → already done (PKCE in the browser, no backend)
- **Tibber** → direct browser→Tibber GraphQL with a personal token (stored in Settings, same way as Spotify Client ID)
- **Weather** → direct browser→Open-Meteo fetch
- **News** → already done (iframe + audio stream)

Result: no servers, no Docker, one Raspberry Pi for the Plejd/Sonos bridges, every user signs in with their own personal tokens on their own browser. The dashboard URL works from any device on the LAN or anywhere on the public web.

## 5. Local development

```sh
# any static file server works
python -m http.server 5183     # then open http://127.0.0.1:5183/
# or
npx serve
```

For Spotify OAuth to work in development, register `http://127.0.0.1:5183/` as an extra Redirect URI in your Spotify dev app (the dashboard supports multiple). Spotify no longer accepts `localhost` as a redirect-URI host — use the loopback IP.

## 6. What lives in localStorage

Nothing is sent anywhere except to Spotify directly. The browser stores:

| Key | What |
|---|---|
| `hdg-sp-clientid` | Your Spotify app Client ID |
| `hdg-sp-token` | Your Spotify access token + refresh token + expiry |
| `hdg-sp-verifier` | Transient PKCE verifier (deleted right after token exchange) |
| `hdg-sp-return` | Where to land after OAuth redirect (deleted after) |
| `hdg-music-favs` | Your local favourites list |
| `hdg-weather` | Current weather state (for the simulated backdrop) |

To fully sign out: open DevTools → Application → Local Storage → delete all `hdg-*` keys, or click **Disconnect** in Settings.
