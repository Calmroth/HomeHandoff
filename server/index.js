/**
 * Home Domain Hub — WebSocket real-time event hub
 *
 * Architecture:
 *   HTTP  on  PORT (default 3001): health check + REST command relay
 *   WS    on  PORT              : bi-directional state stream
 *
 * Environment variables (all optional, inherit from .env.local at project root):
 *   HUB_PORT   Port to listen on (default: 3001)
 *   CORS_ORIGINS  Comma-separated allowed origins (default: *)
 *
 * Starting:
 *   cd server && node index.js          # production
 *   cd server && node --watch index.js  # development (auto-restart on changes)
 *
 * Or from project root:
 *   npm run hub          # starts server/index.js via the root package.json script
 *   npm run dev:full     # starts Vite + hub concurrently (if concurrently is installed)
 */

import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import { HubState } from './lib/state.js';
import { WssHub } from './lib/wss.js';

// ── Env ───────────────────────────────────────────────────────────────────

// Load .env.local from the project root (one level up from server/).
// Only needed in development; production should inject env vars directly.
try {
  const { createReadStream } = await import('fs');
  const { resolve, join } = await import('path');
  const { fileURLToPath } = await import('url');
  const dir = join(fileURLToPath(import.meta.url), '..', '..');
  const env = await import('fs/promises').then(m => m.readFile(join(dir, '.env.local'), 'utf8')).catch(() => '');
  for (const line of env.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = val; // don't override real env
  }
} catch { /* .env.local is optional */ }

const PORT         = Number(process.env.HUB_PORT || 3001);
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

// ── Express app ───────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use(cors({
  origin: CORS_ORIGINS.length
    ? (origin, cb) => cb(null, !origin || CORS_ORIGINS.includes(origin))
    : true, // open in dev if no origins configured
}));

// ── Shared state + WebSocket hub ─────────────────────────────────────────

const state = new HubState();
const server = createServer(app);
const hub    = new WssHub(server, state);

// ── HTTP routes ───────────────────────────────────────────────────────────

/** Health check — used by the frontend to detect hub availability. */
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    clients: hub.clientCount,
    integrations: state.keys,
    uptime: Math.round(process.uptime()),
  });
});

/**
 * REST command relay — alternative to WebSocket for simple one-shot commands
 * (e.g. from curl during debugging).
 *
 * POST /command  { integration, action, params }
 */
app.post('/command', async (req, res) => {
  const { integration, action, params } = req.body || {};
  if (!integration || !action) {
    return res.status(400).json({ ok: false, error: 'integration and action are required' });
  }
  try {
    // Delegate to WssHub which knows all registered handlers
    const result = await hub._handleCommand(
      { readyState: -1, send: () => {} }, // dummy ws — result goes via HTTP instead
      { integration, action, params },
    ).catch(e => { throw e; });
    res.json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** Trigger a LAN scan and return results as JSON (for debugging/testing). */
app.post('/scan', async (req, res) => {
  const { subnet = '192.168.1' } = req.body || {};
  const { scanLAN } = await import('./lib/discovery/lan-scan.js');
  const found = [];
  await scanLAN(subnet, { onDevice: (d) => found.push(d) }).catch(() => {});
  res.json({ ok: true, count: found.length, devices: found });
});

// ── Integration registration (Phase 2 — add here when ready) ─────────────
//
// Example:
//   import { startPlejdPoller } from './lib/integrations/ha.js';
//   startPlejdPoller(hub, { url: process.env.HOME_ASSISTANT_URL, token: process.env.HOME_ASSISTANT_TOKEN });
//
// Each integration calls hub.pushUpdate(name, payload) whenever state changes
// and hub.onCommand(name, handler) to handle command messages from clients.
//
// Integrations to add in Phase 2:
//   lib/integrations/ha.js      — HA WebSocket (real-time state_changed events)
//   lib/integrations/sonos.js   — Sonos bridge poller
//   lib/integrations/shelly.js  — Shelly per-device poller
//   lib/integrations/tibber.js  — Tibber price fetch (hourly)
// ─────────────────────────────────────────────────────────────────────────

// ── Start ─────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`[hub] HTTP  http://localhost:${PORT}/health`);
  console.log(`[hub] WS    ws://localhost:${PORT}`);
  if (CORS_ORIGINS.length) {
    console.log(`[hub] CORS  ${CORS_ORIGINS.join(', ')}`);
  } else {
    console.log('[hub] CORS  open (no CORS_ORIGINS set)');
  }
});

server.on('error', (err) => {
  console.error('[hub] Server error:', err.message);
  process.exit(1);
});

export { hub, state };
