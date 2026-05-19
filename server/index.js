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
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import { HubState } from './lib/state.js';
import { WssHub } from './lib/wss.js';
import { requireSecret } from './lib/auth.js';

const SERVER_DIR    = join(fileURLToPath(import.meta.url), '..');
const STATE_FILE    = join(SERVER_DIR, 'hub-state.json');

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

// ── State persistence ─────────────────────────────────────────────────────
// Restore last-known integration state from disk so the first WebSocket
// snapshot the browser receives is populated even before the pollers have
// run their first cycle. This prevents the "blank dashboard on hub restart"
// problem that shows up after a power cycle or OS update.

async function restoreState() {
  try {
    const raw = await readFile(STATE_FILE, 'utf8');
    state.restore(JSON.parse(raw));
    console.log(`[hub] State restored from ${STATE_FILE}`);
  } catch {
    // First boot or corrupted file — start fresh, pollers will populate.
  }
}

async function persistState() {
  try {
    await writeFile(STATE_FILE, JSON.stringify(state.getSnapshot(), null, 2));
  } catch (e) {
    console.error('[hub] Failed to persist state:', e.message);
  }
}

// Persist on graceful shutdown. On SIGKILL (force-kill) we lose state but
// that's acceptable — the pollers will repopulate on the next startup.
async function shutdown(signal) {
  console.log(`[hub] ${signal} received — persisting state and exiting`);
  await persistState();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// Also persist every 5 minutes so a crash mid-cycle still has fresh state.
setInterval(persistState, 5 * 60_000).unref();

// ── HTTP routes ───────────────────────────────────────────────────────────

/** Health check — used by the frontend to detect hub availability. */
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    clients: hub.clientCount,
    integrations: state.keys,
    health: state.getHealthSnapshot(),
    uptime: Math.round(process.uptime()),
  });
});

/**
 * Plejd cloud API proxy — forwards browser requests to cloud.plejd.com.
 * Required for production builds (no Vite dev proxy) and for the Settings UI
 * to reach Plejd login/device endpoints without CORS errors.
 * Must be before any auth middleware so the Settings page can log in.
 */
app.use('/api/plejd', async (req, res) => {
  const upstream = `https://cloud.plejd.com${req.path}`;
  try {
    const { host, connection, 'transfer-encoding': _te, ...forwardHeaders } = req.headers;
    const upRes = await fetch(upstream, {
      method:  req.method,
      headers: { ...forwardHeaders, host: 'cloud.plejd.com' },
      body:    ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body),
    });
    res.status(upRes.status);
    upRes.headers.forEach((v, k) => {
      if (!['transfer-encoding', 'connection', 'keep-alive'].includes(k.toLowerCase())) {
        res.setHeader(k, v);
      }
    });
    res.send(await upRes.text());
  } catch (e) {
    res.status(502).json({ ok: false, error: `Plejd proxy: ${e.message}` });
  }
});

/**
 * REST command relay — alternative to WebSocket for simple one-shot commands
 * (e.g. from curl during debugging).
 *
 * POST /command  { integration, action, params }
 */
app.post('/command', requireSecret(), async (req, res) => {
  const { integration, action, params } = req.body || {};
  if (!integration || !action) {
    return res.status(400).json({ ok: false, error: 'integration and action are required' });
  }
  try {
    const result = await hub.dispatch(integration, action, params);
    res.json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** Trigger a LAN scan and return results as JSON (for debugging/testing). */
app.post('/scan', requireSecret(), async (req, res) => {
  const { subnet = '192.168.1' } = req.body || {};
  const { scanLAN } = await import('./lib/discovery/lan-scan.js');
  const found = [];
  await scanLAN(subnet, { onDevice: (d) => found.push(d) }).catch(() => {});
  res.json({ ok: true, count: found.length, devices: found });
});

// ── Integration registration ──────────────────────────────────────────────
//
// Each integration polls its data source, calls hub.pushUpdate(name, payload)
// when state changes, and registers hub.onCommand(name, handler) for commands.
//
// Required .env.local vars (all optional — integrations skip gracefully if absent):
//   PLEJD_EMAIL       Plejd account email
//   PLEJD_PASSWORD    Plejd account password
//   PLEJD_SITE_ID     (optional) Plejd site ID; auto-discovered if absent
//   PLEJD_GATEWAY_IP  (optional) GWY-01 LAN IP; auto-discovered if absent
//   SONOS_URL      http://localhost:5005  (node-sonos-http-api)
//   TIBBER_TOKEN   Tibber personal access token

import { startPlejdPoller }  from './lib/integrations/plejd.js';
import { startSonosPoller }  from './lib/integrations/sonos.js';
import { startShellyPoller } from './lib/integrations/shelly.js';
import { startTibberPoller } from './lib/integrations/tibber.js';

// Restore persisted state before integrations start so the first snapshot
// sent to connecting browsers is already populated.
await restoreState();

// Start after server is listening so any startup errors are easier to trace.
server.once('listening', () => {
  startPlejdPoller(hub, {
    email:      process.env.PLEJD_EMAIL,
    password:   process.env.PLEJD_PASSWORD,
    siteId:     process.env.PLEJD_SITE_ID,
    gatewayIp:  process.env.PLEJD_GATEWAY_IP,
  });

  startSonosPoller(hub, {
    url: process.env.SONOS_URL,
  });

  // Shelly device list comes from the frontend (Settings UI) via hub state cache.
  startShellyPoller(hub, { state });

  startTibberPoller(hub, {
    token: process.env.TIBBER_TOKEN,
  });
});
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
