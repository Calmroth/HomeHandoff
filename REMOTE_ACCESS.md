# Remote Access Setup

Lets the Vercel-hosted dashboard reach the home hub from anywhere.

---

## Overview

```
Browser (Vercel) ──HTTPS──► DDNS hostname ──► Router NAT ──► Caddy ──► hub :3001
                                                          (TLS termination)
```

The hub speaks plain HTTP/WS. Caddy sits in front, terminates TLS, and reverse-proxies to `localhost:3001`.

---

## Required env vars

Add these to `server/.env.local` (or real env on the machine running the hub):

```
HUB_SECRET=<random 32+ char string>     # shared secret — frontend sends this in WS ?secret= param
CORS_ORIGINS=https://your-app.vercel.app,https://your-ddns-hostname.duckdns.org
```

Add to the **Vercel project's** environment variables (or `.env.local` for local prod build):

```
VITE_HUB_URL=wss://your-ddns-hostname.duckdns.org
VITE_HUB_SECRET=<same value as HUB_SECRET above>
```

> `VITE_HUB_URL` is already read by `useWebSocketHub` — no code changes needed.

---

## 1. Router: port-forward 443 → hub machine

In your router's NAT/port-forwarding table, forward external TCP port 443 to the LAN IP of the machine running the hub on port 443 (where Caddy will listen). Port 3001 stays LAN-only.

---

## 2. DDNS

Use any free DDNS provider. DuckDNS is zero-config:

1. Sign in at [duckdns.org](https://www.duckdns.org) → claim `your-name.duckdns.org`
2. Add a cron on the hub machine to update the IP every 5 minutes:

```cron
*/5 * * * * curl -s "https://www.duckdns.org/update?domains=your-name&token=YOUR_TOKEN&ip=" > /dev/null
```

---

## 3. Caddy (TLS + reverse proxy)

Caddy auto-provisions a Let's Encrypt cert for your DDNS hostname.

**Install** (Ubuntu/Debian):
```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy
```

**Caddyfile** (`/etc/caddy/Caddyfile`):
```
your-name.duckdns.org {
    reverse_proxy localhost:3001 {
        header_up Host {http.request.host}
    }
}
```

```bash
sudo systemctl enable --now caddy
sudo systemctl reload caddy
```

Caddy handles cert renewal automatically. After ~30 seconds `https://your-name.duckdns.org/health` should return `{"ok":true,...}`.

---

## 4. Hub as a system service

So the hub survives reboots:

```ini
# /etc/systemd/system/home-hub.service
[Unit]
Description=Home Domain Hub
After=network.target

[Service]
Type=simple
WorkingDirectory=/path/to/design_handoff_home_control
ExecStart=/usr/bin/node server/index.js
Restart=on-failure
RestartSec=5
EnvironmentFile=/path/to/design_handoff_home_control/.env.local

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now home-hub
sudo journalctl -u home-hub -f   # tail logs
```

---

## 5. Verify

```bash
# Health (should return JSON with ok:true)
curl https://your-name.duckdns.org/health

# WebSocket (wscat must be installed: npm i -g wscat)
wscat -c "wss://your-name.duckdns.org?secret=YOUR_HUB_SECRET"
# Expect: {"type":"snapshot","state":{...}}
```

---

## Security checklist

- [ ] `HUB_SECRET` set and ≥32 chars
- [ ] `CORS_ORIGINS` set to exact Vercel origin (no trailing slash)
- [ ] Router only forwards port 443 (not 3001)
- [ ] Caddy cert is valid (`curl -I https://your-name.duckdns.org`)
- [ ] `/api/plejd` proxy does not require auth (intentional — Settings login needs it unauthenticated)

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `curl` returns `502` | Hub not running or wrong port in Caddyfile |
| Browser WS `4001 Unauthorized` | `VITE_HUB_SECRET` doesn't match `HUB_SECRET` |
| Cert errors | Port 443 not forwarded to Caddy, or DDNS IP stale |
| `CORS_ORIGINS` error in browser | Origin not in `CORS_ORIGINS` (check exact match) |
| Hub not restarting after crash | `Restart=on-failure` in systemd unit — check `journalctl -u home-hub` |
