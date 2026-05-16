# Home Domain — Current State vs Premium Target

A code-grounded gap report. All citations are `app.jsx` unless otherwise noted. The product spec is `README.md`; the design system audit is `DESIGN_SYSTEM_EXTRACT.md`; deployment posture is `DEPLOY.md`.

Scope of the audit: integration wiring, onboarding, error/status UX, persistence, multi-user model, architecture risks, and a prioritised gap list.

---

## 1. Integration matrix

Eight rows: six device/data integrations plus two identity providers.

### 1.1 Plejd (lights via Home Assistant)

| Aspect | Status | Evidence |
|---|---|---|
| Setup form | Yes | `PlejdConfig` at `app.jsx:3127–3147`. URL + long-lived token, "Save" / "Disconnect". |
| Runtime fetch wired | Yes | `plejdFetchRooms` (`261–283`), `plejdCallService` (`284–293`). Polled every 30 s in `App` (`1207–1218`). |
| UI consumes data | Yes | `rooms` state replaced on each poll (`1213`). `RoomCard` shows live names, brightness, on-state. |
| Toggle/brightness write-through | Yes | `toggleRoom` (`1332–1344`), `setBrightness` (`1345–1355`), `setAllLights` (`1356–1366`) all POST to `light/turn_on\|off` when `cfg.url && cfg.token && r._entity`. |
| Error state in UI | **No** | `plejdErr` is stored (`1133`, `1214`) but never rendered. The only user-visible error is a one-line entry in the Activity Log (`1342`). Settings does **not** surface "HA token rejected (401)" anywhere — the user sees "Connected" until they notice rooms vanished. |
| Loading state | **No** | Between auth and first poll, the Lights section shows the "No rooms found" empty state. No skeleton, no spinner. |
| Empty state | Yes | `EmptyIntegration` at `1642`. |
| Config persisted | Yes | `hdg-integrations.plejd.{url,token}` (`62–69`). |

### 1.2 Sonos (multi-room audio via node-sonos-http-api)

| Aspect | Status | Evidence |
|---|---|---|
| Setup form | Yes | `SonosConfig` at `3149–3166`. Base URL only. |
| Runtime fetch wired | Yes | `sonosFetchSpeakers` (`300–322`), `sonosCmd` (`323–329`). Polled every 15 s in `App` (`1222–1233`). |
| UI consumes data | Yes | `speakers` state replaced on each poll (`1228`); `SpeakerCard` renders them. |
| Toggle/volume write-through | Yes | `toggleSpeaker` (`1384–1404`), `setVolume` (`1405–1419`) dispatch to `sonosCmd` when `cfg.url && s._room`. |
| Error state in UI | **No** | Same as Plejd — `sonosErr` is captured (`1134`, `1229`) but never rendered. Per-action errors go to the Activity Log (`1402`, `1417`). |
| Loading state | **No** | Empty section until poll returns. |
| Empty state | Yes | `EmptyIntegration` at `1612`. |
| Config persisted | Yes | `hdg-integrations.sonos.url`. |
| **Tripwire** | The Sonos URL is used in plain `fetch()` against an HTTP base from an HTTPS-served page. Browsers block mixed content — the connection will fail silently in any deployment on Netlify/Vercel. Only works on `http://127.0.0.1:…` dev. Not documented anywhere in the form copy. |

### 1.3 Shelly (smart outlets)

| Aspect | Status | Evidence |
|---|---|---|
| Setup form | Yes | `ShellyConfig` at `3168–3250`. Manual add (IP + name + room) plus a subnet scanner using `scanShellySubnet` (`3005–3042`). |
| Runtime fetch wired | **No** | Nothing in the app calls `http://<device-ip>/relay/0` or `/rpc/Switch.Set` after config. The Shelly devices array sits in `hdg-integrations.shelly.devices` and is **never consumed at runtime** by any read or write. |
| UI consumes data | **No, structurally** | `INITIAL_OUTLETS = []` (`787`). The Power section reads `outlets` state, which is populated only by the demo button (`1108`) — *never* from `integrations.config.shelly.devices`. A user who scans + adds 4 Shellys still sees the "No outlets configured" empty state. |
| Toggle write-through | **No** | `toggleOutlet` (`1369–1375`) updates local state only — no HTTP call. The comment at `1368` admits: "No Shelly direct integration wired yet". |
| Error state in UI | **N/A** | No fetch path exists. |
| Loading state | **N/A** | — |
| Empty state | Yes | `EmptyIntegration` at `1661`. |
| Config persisted | Yes (config only) | `hdg-integrations.shelly.devices`. |
| **Tripwire** | The Shelly LAN scanner appears to work and finds devices, but on HTTPS-deployed sites the browser will block the scan (mixed content `http://192.168.x.x/...`). The scanner will report 0 hits with no feedback explaining why. |

### 1.4 Spotify (music + optional Connect for speakers)

| Aspect | Status | Evidence |
|---|---|---|
| Setup form | Yes | `SpotifyConfig` at `3252–3281`. Client ID input + Connect/Disconnect; includes a localhost warning for the `127.0.0.1` redirect-URI quirk. |
| Runtime auth wired | Yes | `useSpotify` (`444–603`) implements PKCE: `spBeginAuth` (`388`), `spExchangeCode` (`402`), `spRefresh` (`425`). Auto-refresh on every API call (`481–486`). |
| Web API consumed | Yes — but inconsistently | `/me` (`505`), `/me/playlists` (`2208`), `/search` (`2232`), `/me/player/devices` (`531`) poll every 12 s (`550`). `/me/player` for transfer (`560`), `/me/player/pause` (`579`), `/me/player/volume` (`593`). |
| Sound section uses Connect devices | Yes | Hydration block at `1240–1259` maps `spotify.devices` → `speakers` shape when no Sonos bridge URL is set, flagging each with `_spotify: true`. |
| Music section uses authenticated data | Partially | Search and library use real API. **The Home-page hero (`NowPlaying`) does not.** The iframe is hardcoded to `embed/album/1DFixLWuPkv3KT3TnV35m3` (`1921`) — the **E•MO•TION** album. The hero card's title is hardcoded `"Living room is leading"` (`1931`). The "Cast to room" and "Switch source" buttons have no onClick (`1954–1957`). |
| Error state in UI | Mixed | `spotify.error` is set on every failure path but only rendered inside the Settings form (`3267`). On the Music page, only `searchErr`/`libErr` show, and only as in-card text. Premium-only messages ("Spotify Connect requires Premium") are stuffed into the same `error` state, blurring the UX (`540`). |
| Loading state | Partial | `searching` shows "…" in the search input (`2292`). Library shows "Loading…" (`2358`). Header player has no loading indicator while the iFrame API initialises. |
| Empty state | Yes | Favourites "Nothing saved yet" (`2331`); library "No playlists" (`2359`). |
| Config persisted | Yes | `hdg-sp-clientid`, `hdg-sp-token` (incl. refresh + expiry), transient `hdg-sp-verifier` / `hdg-sp-return`. |
| **Tripwire** | The header player + the persistent embed are driven by `musicUri` derived from `MUSIC_SOURCES` / `musicCustom`, but the *Home page* embed is a separate iframe with a hardcoded album. A signed-in user playing their library via the Music page will hear that, but on Home they'll see the wrong album art (E•MO•TION) regardless. |

### 1.5 Tibber (energy spot prices)

| Aspect | Status | Evidence |
|---|---|---|
| Setup form | Yes | `TibberConfig` at `3283–3300`. Token only. |
| Runtime fetch wired | Yes | `fetchTibberPrices` (`332–343`). Polled hourly (`1262–1274`). |
| UI consumes data | Yes (Energy page only) | `EnergyPage` shows spot curve via `MiniLineChart` (`2672`) + current-hour price (`2614–2621`). |
| **Home page consumes data?** | **No** | `PowerLive` hardcodes `"Tibber · 0.84 SEK/kWh"` (`1905`) regardless of the live Tibber price. Even after connecting, the Home Power section lies. |
| Error state in UI | Partial | `tibberErr` is rendered on the Energy page (`2658`) but not in Settings or the Home Power section. |
| Loading state | Yes (Energy) | "Loading prices…" inside `energy-chart-empty` (`2675`). |
| Empty state | Yes (Energy) | "Add a Tibber token in Settings." Home Power has no equivalent. |
| Config persisted | Yes | `hdg-integrations.tibber.token`. |

### 1.6 Weather (open-meteo)

| Aspect | Status | Evidence |
|---|---|---|
| Setup form | Yes | `WeatherConfig` at `3302–3331`. lat / lon / city + "Use my location" via `navigator.geolocation` (`3308`). |
| Runtime fetch wired | Yes | `fetchWeather` (`111–120`). Re-fetches every 30 min (`1191–1203`). Defaults to Stockholm if no config (`53`). |
| UI consumes data | Yes | Backdrop chooser (`1183–1187`), header weather hero (`1729–1788`), `WeatherPage` full forecast (`2715–2836`). |
| Error state in UI | Partial | `WeatherPage` has a dedicated error state (`2716–2725`). Header shows raw `—` for temp on failure (`1731`) — no indication of why. |
| Loading state | Yes (WeatherPage only) | "Fetching live forecast…" (`2730`). Header shows raw `—`. |
| Empty state | N/A | Always has Stockholm fallback. |
| Config persisted | Yes | `hdg-integrations.weather.{lat,lon,city}`. |
| **Tripwire** | The README/old code mentioned a "click weather to cycle" interaction (`1394`). This interaction does **not exist** anymore — `.weather-hero-icon` is now a plain `<a href="#weather">` (`1777`). Devs reading the README will look for a non-existent feature. |

### 1.7 Google identity

| Aspect | Status | Evidence |
|---|---|---|
| Setup form | Yes | OAuth Client ID input + Google-rendered Sign-in button in `SettingsPage` Account section (`3361–3460`). |
| Runtime wired | Yes | `useGoogleAuth` (`140–252`). Loads GIS script in `index.html:17`. `google.accounts.id.initialize` + `renderButton` (`195–204`). |
| UI consumes user | Yes | Sidebar avatar/name (`682–702`); Settings header source line (`3365`). |
| Error state in UI | Yes | `google.error` is rendered in Account section (`3372–3381`). |
| Loading state | Partial | "Google sign-in is still loading…" if `window.google` not yet present (`188`). No spinner on the button itself. |
| Empty state | Yes | "Add a Google OAuth Client ID below, then sign in." (`3395`). |
| Config persisted | Yes | `hdg-g-clientid`, `hdg-g-user`, `hdg-g-credential`. |
| **Tripwire** | The code stores `hdg-g-credential` (the raw JWT) but never verifies its signature — comment at `129–131` acknowledges this is a "household, not NSA" threat model. Fine for the prototype; a security reviewer will flag it for any non-trivial deployment. |

### 1.8 Local email signup

| Aspect | Status | Evidence |
|---|---|---|
| Setup form | Yes | Inline name + email form in Account section (`3405–3434`). |
| Runtime "auth" wired | Yes (trivial) | `signUpLocal` (`228–249`) — creates a `{sub: 'local-…', name, email}` object, stores in same `hdg-g-user` key. No password, no recovery. |
| UI consumes user | Yes | Same paths as Google. |
| Error state | Partial | Validation error ("Enter a name and a valid email address.") goes through the shared `google.error` channel. |
| Loading state | N/A | Synchronous. |
| Empty state | N/A | |
| Config persisted | Yes | `hdg-g-user` (no `provider:'local'` flag is checked anywhere after creation, but it is stored — `242`). |
| **Tripwire** | Local signup and Google sign-in write the *same* localStorage key. If the user creates a local account, then signs in with Google, the local account is silently overwritten with no migration path. Reverse order causes the same data loss. No "merge" or "switch profile" affordance. |

---

## 2. Onboarding flow (first run, empty localStorage)

What the user sees on first paint, with an empty `localStorage`:

1. **Sidebar**: "Sign in / Set up your account in Settings" under a generic gear-icon avatar (`693–700`).
2. **Header**: clock + date, "0 rooms lit · 0 W now" subtitle (`subByRoute.home` at `1737`), Wi-Fi pill reads "0 on Wi‑Fi · home.local" (`1772–1774`).
3. **Music section**: the hardcoded E•MO•TION embed loads with "Now playing / Living room is leading / Streaming to 0 of 0 rooms" — the live `speakers` array is empty so the room list inside the hero is blank but the static copy still suggests a real signal. Title is misleading.
4. **Sound section** → `EmptyIntegration`: *"No speakers found · Add a Sonos bridge URL in Settings → Integrations. Open Settings ↗"* (`1612`).
5. **Lights section** → `EmptyIntegration`: *"No rooms found · Add a Home Assistant URL + token in Settings → Integrations to surface your Plejd lights. Open Settings ↗"* (`1642`).
6. **Power section** → `EmptyIntegration`: *"No outlets configured · Add Shelly device IPs in Settings → Integrations. Open Settings ↗"* (`1661`).
7. **Scenes section**: 5 chips render. Applying one runs `scene.apply({rooms:[], outlets:[], speakers:[]})` which returns three empty arrays — the scene "applies" successfully and logs to Activity, but visually nothing changes.
8. **Activity log**: "No actions yet — toggle a light or apply a scene." (`2008`).
9. **Footer**: "Home Domain Server · LAN-only · every device reached over Wi‑Fi, never via vendor cloud · {date}" (`1557`).

**There is no first-run wizard, no welcome modal, no progressive disclosure, no "5 minutes to set up" CTA.** A user with no smart-home hardware will see four "Open Settings" links and a static Spotify embed. The closest thing to a guided path is the "Load demo data" button buried in Settings → About → Demo data (`3522–3535`), and the user has no way to discover it from the Home page.

Compounding the issue:
- Scenes work on empty arrays silently — applying "Morning" reports "Scene Morning applied" in the activity log but does nothing visible. The user might assume the app is broken.
- "Sign in" copy in the sidebar links to Settings, but Settings is alphabetised after the device sections — the user sees three empty-state boxes before reaching the place that fixes them.
- No suggestion that they could connect Spotify first (the lowest-friction integration) before tackling LAN bridges.

---

## 3. Error / status UX

### What's captured but not surfaced

| Error state | Captured at | Rendered? |
|---|---|---|
| `plejdErr` (HA 401, network) | `1133`, `1214` | **No UI** — only an Activity Log entry on action failures (`1342`). |
| `sonosErr` (bridge unreachable) | `1134`, `1229` | **No UI** — Activity Log only (`1402`, `1417`). |
| `weatherErr` | `1140`, `1198` | Yes (full WeatherPage), but header silently shows `—`. |
| `tibberErr` | `1144`, `1269` | Yes on Energy page (`2658`). Home Power section unaware. |
| `spotify.error` | `450`, multiple set sites | Yes in `SpotifyConfig` (`3267`); not in Music page header. |
| `google.error` | `145`, multiple set sites | Yes in Account section (`3372–3381`). |
| `libErr` (Spotify library) | `2201`, `2210` | Yes inline (`2357`). |
| `searchErr` | `2199`, `2242` | Yes inline (`2465`). |
| `pickerMsg` (add-to-playlist) | `2203`, `2258` | Yes inline (`2431`). |
| Per-action HA / Sonos failures | catch blocks | Only the Activity Log entry, which evaporates after 8 newer events (`1149`). |

### Recoverability

- The setup forms include "Save" / "Disconnect" but no "Test connection" button. A user with the wrong HA token has to toggle a light to discover it's wrong, and the failure is only visible as one of 8 ephemeral activity rows.
- The Spotify form does include a Premium-tier warning inline; the user can re-paste a Client ID and retry. PKCE flow is resilient (auto-refresh; refresh failure surfaces a thrown error).
- There is **no global error toast / banner system**. Errors are scattered across the page where they happen, and several (Plejd, Sonos) have no rendering site at all.

### Status indicators

- `IntegrationCatalog` shows `STATUS_LABEL` per integration (`3099`): "Connected / Half set up / Not set up / Using defaults". But "Connected" is determined purely by *presence of config*, not by a successful round-trip. A Plejd row reads "Connected" even when the token is wrong and every fetch returns 401.

---

## 4. Persistence model

### Every localStorage key the app reads or writes

| Key | Stores | Written when | Cleared when | Notes |
|---|---|---|---|---|
| `hdg-integrations` | Blob of `{weather, plejd, sonos, shelly, tibber}` configs | `setIntegration` on Save/Disconnect (`69`) | Never wiped wholesale; individual sub-fields cleared via Disconnect | Schema versionless — additions to `DEFAULT_INTEGRATIONS` get merged in via the `…raw` spread (`64`), but field renames would silently lose data. |
| `hdg-sp-clientid` | Spotify app Client ID | `setClientId(v)` Save (`510`) | `setClientId('')` (`511`) | Per-browser; users in the same household must share or each enter it. |
| `hdg-sp-token` | `{access_token, refresh_token, expires_at}` | After PKCE exchange (`466`), every refresh (`483`) | `disconnect()` (`519`) | Auto-refreshes on demand. If both refresh + access are invalid (e.g. user revoked from Spotify), the next API call throws and `spotify.error` is set. |
| `hdg-sp-verifier` | PKCE verifier | `spBeginAuth` (`390`) | After successful exchange (`418`) | Transient. If the OAuth flow is abandoned and resumed days later, this still validates — long-lived. Low risk. |
| `hdg-sp-return` | Hash to navigate to post-OAuth | `spBeginAuth` (`391`) | After exchange (`469`) | |
| `hdg-g-clientid` | Google OAuth Client ID | `setClientId` Save (`218`) | `setClientId('')` (`219`) | |
| `hdg-g-user` | `{sub, email, name, picture, …}` | After Google JWT decode (`161`) **or** local signup (`245`) | `signOut()` (`211`) | **Shared between Google and local accounts** — see §1.8 tripwire. |
| `hdg-g-credential` | Raw Google JWT | After successful Google sign-in (`162`) | `signOut()` (`212`) | Stored but never re-read — dead-ish data. |
| `hdg-demo-mode` | "1" if demo data is loaded | "Load demo data" (`1110`) | "Clear" (`1115`) | Reloads honour this — demo state survives refresh. |
| `hdg-music-favs` | Array of `{id, type, name, sub, embed}` | Whenever `musicFavs` changes (`1159`) | "× Remove" on a favourite (no full wipe affordance) | Capped at 50 (`1164`). |

### What is NOT persisted but should be

- **Active scene** (`activeScene`/`activeSceneAt`) — reload drops it. Note the open question in `README.md:497` ("Scene state persistence — should `activeScene` survive page reload? Currently no.") Per the "premium" goal this should survive.
- **`musicSource` / `musicCustom`** — the currently playing source dies on reload. Header player will revert to E•MO•TION default. This is jarring for a daily-use surface.
- **`groupAll`** — speaker grouping state drops on reload.
- **`newsTab`** — last news tab dropped on reload.
- **`activity` log** — entirely in-memory, capped at 8, evaporates on reload. For a "what happened in my house today" view this should at minimum survive the session.
- **`weather` legacy key** — `DEPLOY.md:111` documents an `hdg-weather` key that is no longer used in code (only `hdg-integrations.weather` is). The doc is stale.
- **Per-room manual overrides** — when Plejd polls back, any optimistic write is reconciled against the bridge's value. There is no concept of "user wanted this brighter than the bridge reports right now" — the polling loop just overwrites.

### Storage hygiene

- All keys share the `hdg-` prefix — good.
- No schema version on `hdg-integrations`. Field renames will break silently.
- No total-storage cap. The 50-favourite cap is the only bound; everything else can grow unbounded (activity is in-memory only, so this is mostly fine).
- No "Export / Import settings" or "Reset everything" affordance. To switch households, the user must open DevTools and delete localStorage manually (per `DEPLOY.md:113`).

---

## 5. Multi-user model

**There is no multi-user model.** Despite the README's framing ("multi-vendor smart home for a non-technical household member"), the code treats each browser as a single user, and the relationship between a Google identity and the data on the page is **purely cosmetic**.

Evidence:

- The sidebar avatar reads from `google.user` (`682–690`) and the welcome row greets "Mira" — **hardcoded** (`app.jsx:1748`). The greeting does **not** use `google.user.given_name`. Signing in as Sven still shows "Good afternoon, Mira."
- Every integration's config is stored under a single key (`hdg-integrations`) without scoping by user. The next person to sign in gets the previous user's Plejd token, Spotify Client ID, and Shelly device list.
- Spotify tokens are likewise unscoped (`hdg-sp-token`). A second household member who signs into Google on the same browser inherits the first user's Spotify session.
- Activity, favourites, demo-mode flag — all global to the browser.
- The Google sign-in itself doesn't gate anything. Removing the sign-in does **not** lock the user out of the dashboard — the Home page renders identically with or without `google.user`. Sign-in is purely a display affordance for the sidebar.

What changes when a different user signs in: **the avatar and the email under it**. That is the entire impact.

The README and `DEPLOY.md` both describe a "per-browser per-user" model in passing, implying users on different devices keep their own data — which is true at the device level. But the document also says "different family members get their own Spotify library on their own device" (`DEPLOY.md:47`) without acknowledging that *two people sharing a browser* share everything.

Premium "household with multiple identities" support is a sizeable amount of new work: per-user keys for all `hdg-*`, an account-switcher UI, profile pictures in the header beyond the sidebar, per-user activity log, per-user scenes. None of this currently exists.

---

## 6. Architecture risks for "premium" scope

### Single-file Babel-in-browser approach

**Pros**:
- Zero build step. `python -m http.server` and you're live.
- Easy for designers/PMs to deploy via Netlify Drop / Vercel CLI.
- Three files, total — trivial to host.

**Cons**:
- **Babel-standalone is a ~700 KB script** (`index.html:26`). It compiles `app.jsx` at runtime on every page load. The Spotify iFrame API, React+ReactDOM, Google Identity Services, plus Babel — first-paint is heavy. On a slow connection this is noticeably worse than a built bundle.
- React/Babel are loaded from **unpkg CDN** (`index.html:24–26`). Any unpkg outage blanks the page. Subresource integrity hashes are present (good), but the dependency on a third-party CDN is unsuitable for a "production-grade" deployment.
- No code-splitting; every page (Music, Energy, Weather, News, Settings) ships in the initial bundle. App.jsx is ~3000 lines.
- No TypeScript — every prop bag is implicit. `useSpotify` returns 13 fields by destructure (`602`); a typo anywhere is silent.
- No tree-shaking. The hand-rolled icon set ships every icon whether used or not.
- No CSP / strict source policies because Babel-in-browser needs `unsafe-eval`.

### Performance concerns

| Concern | Where | Impact |
|---|---|---|
| 1.8s `setInterval` on every render unless `prefers-reduced-motion` | `1287–1298` | Outlets simulate live wattage. Wakes the app every 1.8s. Re-renders `Power` section. Negligible for current state size but multiplies with re-renders. |
| 12s poll of Spotify devices | `550` | Five concurrent polls (12s, 15s Sonos, 30s Plejd, 30min weather, 60min Tibber) — no deduplication, no `Page Visibility API` check (continues polling when tab is hidden). |
| Persistent player MutationObserver on `document.body, subtree:true` | `1026–1027` | Subscribes to every DOM change on the page while on Music. Fires update on each. Expensive at the surface level — could use a ResizeObserver on the anchor instead. |
| Spotify iFrame API attached at App level | `1476` | Even when not on `/music`, the embed lives in the DOM (positioned off-screen). It's invisible but still loaded. Good for audio continuity, bad for memory. |
| No memoisation of `SCENES.map`, `INTEGRATION_CATALOG.map`, etc. | many | Section re-renders re-compute everything. Acceptable at current scale; will matter if a user has 30+ rooms. |
| Activity log re-creates on every change | `1149` | New array each entry, capped at 8; fine. |
| Every device toggle triggers `breakScene` → `setActiveScene(null)` → re-render | `1314–1317` | Could be optimised to only flip when there was an active scene. Negligible practical impact. |

### Accessibility gaps not covered by the earlier extract

The DESIGN_SYSTEM_EXTRACT covers visual a11y (contrast, hit targets, motion). Additional issues I found in this audit:

- **Live-region announcements**: `activity` is the canonical place for "X happened" but the `<div class="activity-log">` has no `aria-live="polite"`. Screen reader users won't hear "kitchen lights turned on" when they tap the toggle.
- **Error announcements**: same — `plejdErr`/`sonosErr`/`tibberErr` aren't even *visible* let alone announced.
- **Focus management on route change**: hash navigation (`621`) updates the route but doesn't move focus to the new page heading. Keyboard users have to tab from the sidebar each navigation.
- **Modal accessibility**: the "Add to playlist" modal (`2421`) is a `<div role="dialog">` with no `aria-modal="true"`, no focus trap, no `aria-labelledby`, no Esc handler. The close button is a `<button>` with `aria-label="Close"` only.
- **Iframe a11y**: the Spotify embed has `title="Spotify Web Player"` (`1922`) — OK. The News iframes have titles (`2913`). The persistent player div has no title because Spotify replaces it; not a high concern.
- **Keyboard discoverability**: the `1–5 / 0 / Esc / g` shortcuts are documented in the Activity summary line and About section, but there is no global `?` help affordance. New users won't find them.
- **Color-only state in Activity rows**: `data-kind="light|outlet|speaker|scene|music"` colours the dot per kind. The text already contains the kind ("kitchen lights", "Coffee maker", etc.) so this is fine, but worth verifying for color-blind users that the dot colours have at least L\* > 30 separation.

---

## 7. Top 10 gaps to address for "premium and easy to set up"

Ordered by user impact, descending.

1. **Add a first-run setup wizard.** On empty `localStorage`, the user hits four empty boxes and a static Spotify embed with no orientation. A modal/wizard with "Welcome to Home Domain → sign in with Google → optionally connect Spotify → optionally configure Plejd/Sonos/Shelly/Tibber → skip and load demo data" would convert a wall-of-empty-states into a guided 5-minute onboarding. The catalog already exists; this just sequences it.

2. **Wire the Home Music hero to the actual Spotify state.** `NowPlaying` (`1912–1962`) is dead chrome: the iframe is hardcoded, the title is hardcoded, "Cast to room" and "Switch source" do nothing. Either drive it from `musicUri`/`oembed` (already at the App level) or remove the buttons. Right now this is the largest visual section on Home and it lies to the user.

3. **Wire Shelly write/read at runtime.** The Shelly setup form exists and the device list persists, but `toggleOutlet` (`1369–1375`) is a no-op write to local state, and outlets never poll the configured devices. A user who completes the entire Shelly setup including a successful subnet scan still sees "No outlets configured". This is the integration with the most visible "setup happened" affordance and the least actual function.

4. **Surface `plejdErr` / `sonosErr` / `tibberErr` in the UI.** Right now an HA 401 is invisible — the Lights section just shows empty. A small inline error pill in the section head (next to the source label, e.g. "plejd · live" → "plejd · token rejected") would make failures recoverable. Bonus: add a "Test connection" button in each setup form.

5. **Stop the Home Power section from lying about the Tibber price.** `PowerLive` (`1905`) hardcodes `"Tibber · 0.84 SEK/kWh"`. After connecting Tibber, the Energy page has live prices but the Home page still says 0.84. Pipe the live price through to `PowerLive` (it already lives in App state).

6. **Persist runtime UX state across reloads.** `activeScene`, `musicSource`/`musicCustom`, `groupAll`, last-route — all evaporate on F5. For a daily-use control surface, the user opening the dashboard at 7 PM should see whatever they had going at 5 PM. Three small `useEffect` blocks reading/writing `hdg-runtime-state`.

7. **Scope `hdg-*` keys by user once Google sign-in is wired.** Right now switching Google identities does nothing — the new user inherits the old one's Spotify token, Plejd config, favourites, and demo flag. Either (a) prefix every key with the Google `sub` after sign-in, or (b) gate writes/reads behind a profile. Pick one before the multi-user story is plausible.

8. **Use the signed-in user's name in the greeting.** "Good afternoon, Mira." is hardcoded (`1748`). Sub `google.user.given_name` here when present; show "Welcome" otherwise. A tiny fix with a disproportionate "the product knows me" effect.

9. **Document the HTTPS mixed-content trap, or solve it.** Any deployment on Netlify/Vercel will silently break Plejd, Sonos, Shelly, and Tibber if their endpoints are HTTP. The setup forms don't warn about this. Either add a warning in each form when `window.location.protocol === 'https:'` and the URL is `http://`, or document the LAN-deployment requirement prominently (it's currently buried in `DEPLOY.md:14–17`).

10. **Make scenes meaningful on an empty house.** Applying a scene with `rooms=[], outlets=[], speakers=[]` logs to Activity but does nothing visible (`1319–1327`). Either gray out the scene chips when there's nothing to apply ("Connect Plejd to use scenes") or show a transient toast ("No devices connected — applied to demo state"). Right now it looks like a bug.

---

*End of report. All file:line citations are against `app.jsx` at HEAD on 2026-05-16.*
