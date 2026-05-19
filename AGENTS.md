# Agent Instructions

## Package Manager
Use **npm**: `npm install`, `npm run dev`, `npm run build`

Two `package.json` files — root (frontend) and `server/` (hub). Install separately when adding server deps.

## Commands
| Task | Command |
|------|---------|
| Dev (local) | `npm run dev` — Vite on `127.0.0.1:5183` |
| Dev (LAN HTTPS) | `npm run dev:lan` — Vite + mkcert on `0.0.0.0:5183` |
| Dev (full stack) | `npm run dev:full` — Vite + hub + Sonos bridge |
| Hub only | `npm run hub:dev` — Node hub with `--watch` |
| Build | `npm run build` |

## Commit Attribution
AI commits MUST include:
```
Co-Authored-By: Claude Code <noreply@anthropic.com>
```
Never use a specific model version string.

## Architecture Constraints

- **No component files** — entire frontend lives in `src/App.jsx` (monolithic by design, do not split)
- **Design tokens only** — all colors, spacing, motion in `src/tokens.css`; never hardcode hex/oklch values inline
- **No direct LAN fetches from browser** — all `http://` device calls go through the hub WebSocket (`server/lib/wss.js`)
- **iOS Safari <16.4** — add static fallbacks alongside every `color-mix()` usage (iPad 6th gen / A10)
- **No test runner** — manual verification only; build must compile clean (`npm run build`)

## Key Files
| File | Role |
|------|------|
| `src/App.jsx` | All components, hooks, pages, integration clients |
| `src/tokens.css` | Design system — all CSS custom properties |
| `src/store/useHomeStore.js` | Zustand global store |
| `server/lib/wss.js` | WebSocket hub — command routing, broadcast |
| `server/lib/integrations/plejd.js` | Plejd TCP+cloud hybrid |
| `.env.local` | All secrets — **gitignored, never commit** |

## Security Rules
- `.env.local` is gitignored — never commit it
- Never log or print token values; mask as `••••<last4>` in UI
- Plejd password never persisted — only the resulting session token
- API tokens go in request headers, never in URLs

## Conventions
- Single quotes, semicolons, trailing commas in multi-line literals
- `async/await` throughout (no `.then()` chains)
- CSS tokens: `--clay-*`, `--amber-*`, `--motion-*`, `--page-*` prefixes
- localStorage keys: `hdg-` namespace prefix
- Store setters: `set` + PascalNoun; patch updaters: `patch` + Noun
- See `CLAUDE.md` for full naming and state pattern reference
