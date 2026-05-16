# Cert setup — making the dashboard a secure context

This project's dev server serves HTTPS via [`vite-plugin-mkcert`](https://github.com/liuweiGL/vite-plugin-mkcert). That matters because the v1.1 features (Wake Lock, MediaSession, Geolocation, Service Workers, future Notifications) silently fail on a non-HTTPS origin, and `http://192.168.x.x` does **not** count as a secure context even though it's on your LAN.

This guide walks you through three deployment shapes:

1. **Just your laptop** — already done, no action needed
2. **Wall-mounted iPad / phone on the same LAN** — install the local CA on each device, ~5 min total
3. **Cloud-deployed (Netlify / Vercel / Cloudflare Pages)** — HTTPS comes free; mixed-content with LAN integrations needs a Tailscale Funnel or similar

---

## 1. Just your laptop

`https://127.0.0.1:5183` and `https://localhost:5183` are both [special-cased by browsers](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts) as secure even without HTTPS. The first time you run `npm run dev`, the plugin will:

1. Download the `mkcert` binary for your OS (~5 MB)
2. Generate a local root CA and per-host cert
3. Install the root CA into your OS trust store (one admin / sudo prompt)
4. Configure Vite to serve HTTPS on the cert

After that, `https://127.0.0.1:5183` loads with a fully trusted padlock — no "Not Secure" badge.

Verify:

```powershell
# Open the page in the browser, then in DevTools console:
window.isSecureContext   # should print: true
```

If `isSecureContext` is `true`, every v1.1 API in this app is available. You're done.

---

## 2. Wall-mounted iPad / phone on the same LAN

Two parts: (a) make the dev server bindable from other devices on the LAN, and (b) make those devices trust the mkcert root CA so the same HTTPS cert is accepted everywhere.

### a. Bind to all interfaces

```powershell
$env:VITE_HOST = "0.0.0.0"
npm run dev
```

Vite will print a "Network" line with your laptop's LAN IP (e.g. `https://192.168.1.42:5183`). Open that URL on the iPad's Safari — you'll see a "Not Secure" warning the first time because the iPad doesn't trust your laptop's local CA yet. Continue to step (b).

### b. Trust the local CA on each kiosk device

Find the CA root on the laptop where mkcert ran:

```powershell
# Find the path that holds rootCA.pem
mkcert -CAROOT
# Example output: C:\Users\you\AppData\Local\mkcert
```

In that folder you'll find `rootCA.pem`. Get it onto each kiosk device:

**iPad / iPhone**
1. AirDrop or email `rootCA.pem` to the device
2. Open it → Profile installer appears → install
3. **Important** Settings → General → About → Certificate Trust Settings → toggle the mkcert CA to **Enabled**
4. Reload the dashboard — the padlock should be green

**Android**
1. Copy `rootCA.pem` to the device
2. Settings → Security → Encryption & credentials → Install a certificate → CA certificate → accept the warning → pick the file
3. Reload the dashboard

**Another Windows / Mac / Linux machine**
1. Copy `rootCA.pem` to that machine
2. On Windows: double-click → Install Certificate → Local Machine → "Place all certificates in the following store" → Trusted Root Certification Authorities → Finish
3. On macOS: open Keychain Access → drag `rootCA.pem` into System → set "Always Trust"
4. On Linux: copy to `/usr/local/share/ca-certificates/` and `sudo update-ca-certificates`

Reload the dashboard on each device. `window.isSecureContext === true` confirms it worked.

### Optional: stable hostname instead of an IP

Edit each kiosk device's hosts file (or your router's DNS) to map `homedomain.local` → your dev laptop's LAN IP. Then everyone bookmarks `https://homedomain.local:5183/`. The mkcert config in `vite.config.js` already lists `homedomain.local` as a SAN, so the cert is valid for that hostname out of the box.

---

## 3. Cloud-deployed (Netlify / Vercel / Cloudflare Pages)

Cloud hosts give you HTTPS automatically — no mkcert needed. But the dashboard talks to LAN integrations (Plejd via Home Assistant at `http://homeassistant.local:8123`, Shelly devices at `http://<ip>/`, etc.) and a browser at `https://homedomain.netlify.app` will **block** plain-HTTP fetches to those IPs as mixed content.

Three options, easiest first:

### Option A — Tailscale Funnel (recommended)

[Tailscale](https://tailscale.com) is a free-tier mesh VPN. Funnel is its feature that exposes a service on your LAN over a public HTTPS URL via Tailscale's network. Five-minute setup:

1. Install Tailscale on the Pi / NAS that runs Home Assistant
2. `sudo tailscale funnel 8123` → you get a URL like `https://homeassistant.tailXXXX.ts.net`
3. Use that HTTPS URL as your Plejd config in the dashboard
4. Repeat for Sonos, Shelly proxy if you bridge them

Now the dashboard at `https://homedomain.netlify.app` talks to Home Assistant over HTTPS via Tailscale, no mixed content.

### Option B — Cloudflare Tunnel

[`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) does the same thing — install on your Pi, expose internal services on a public HTTPS hostname. Free for personal use.

### Option C — Keep cloud + LAN separate

Don't deploy to the cloud. Keep the dashboard at `https://homedomain.local:5183` and bookmark that on every kiosk. LAN integrations work directly because everything is on the same network. The trade-off: no remote access from outside the house.

---

## Sanity-check after each setup

In the dashboard's DevTools console:

```js
window.isSecureContext  // true => good
'wakeLock' in navigator // true => Wake Lock available
'mediaSession' in navigator // true => MediaSession available
'geolocation' in navigator  // true => Geolocation available
```

If `isSecureContext` is `false`, look at `window.location.protocol` and `window.location.host`. Anything that isn't `https:` or `http://localhost`/`http://127.0.0.1` won't work for v1.1 features. Go back to step 1 or 2.

---

## Why not just use Let's Encrypt on the LAN?

Let's Encrypt issues certs for public DNS names with an HTTP-01 / DNS-01 challenge. For a LAN-only `homedomain.local`, you'd need DNS-01 + a public domain you own, which is more setup than `mkcert` plus most households don't have a domain. `mkcert` is the simplest 100%-local-trust path for LAN use; Tailscale Funnel is the simplest if you want one HTTPS URL that works both at home and on cellular.
