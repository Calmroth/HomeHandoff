/**
 * WssHub — WebSocket server with client registry, heartbeat, and broadcast.
 *
 * Responsibilities:
 *  - Accept incoming WebSocket connections and register them
 *  - Send a full state snapshot to each new client immediately
 *  - Route inbound messages (ping, command, scan)
 *  - Broadcast outbound updates to every live client
 *  - Heartbeat: ping every 30 s and evict unresponsive connections
 *
 * Message protocol (server → client):
 *   { type: "snapshot",       state: { integrations: {}, lastUpdated: {} } }
 *   { type: "device_update",  integration: string, payload: unknown }
 *   { type: "scan_start",     subnet: string }
 *   { type: "scan_progress",  done: number, total: number }
 *   { type: "scan_result",    device: DeviceRecord }
 *   { type: "scan_done",      count: number }
 *   { type: "command_result", integration: string, action: string, ok: boolean, result?: unknown }
 *   { type: "error",          integration?: string, message: string }
 *   { type: "pong",           ts: number }
 *
 * Message protocol (client → server):
 *   { type: "ping",    ts: number }
 *   { type: "command", integration: string, action: string, params?: unknown }
 *   { type: "scan",    subnet?: string }
 */

import { WebSocketServer } from 'ws';
import { isValidSecret } from './auth.js';

const HEARTBEAT_INTERVAL = 30_000;

export class WssHub {
  /**
   * @param {import('http').Server} httpServer
   * @param {import('./state.js').HubState} state
   */
  constructor(httpServer, state) {
    this._state = state;
    /** @type {Set<import('ws').WebSocket>} */
    this._clients = new Set();
    /** @type {Map<string, (action: string, params: unknown) => Promise<unknown>>} */
    this._commandHandlers = new Map();

    this._wss = new WebSocketServer({ server: httpServer });
    this._wss.on('connection', (ws, req) => this._onConnection(ws, req));
    this._startHeartbeat();

    console.log('[hub:wss] WebSocket server attached');
  }

  // ── Public API for integrations ──────────────────────────────────────────

  /**
   * Register a command handler for one integration.
   * The handler receives (action, params) and returns a Promise<result>.
   * @param {string} integration
   * @param {(action: string, params: unknown) => Promise<unknown>} handler
   */
  onCommand(integration, handler) {
    this._commandHandlers.set(integration, handler);
  }

  /**
   * Push a state update: saves to the cache and broadcasts to all clients.
   * Call this from integration pollers whenever state changes.
   * @param {string} integration
   * @param {unknown} payload
   */
  pushUpdate(integration, payload) {
    this._state.set(integration, payload);
    this.broadcast({ type: 'device_update', integration, payload });
  }

  /**
   * Broadcast an error event to all clients.
   * @param {string} integration
   * @param {string} message
   */
  pushError(integration, message) {
    console.error(`[hub:${integration}] ${message}`);
    this.broadcast({ type: 'error', integration, message });
  }

  /** Send a raw message object to every live client. */
  broadcast(msg) {
    const json = JSON.stringify(msg);
    let sent = 0;
    for (const ws of this._clients) {
      if (ws.readyState === 1 /* OPEN */) {
        ws.send(json);
        sent++;
      }
    }
    return sent;
  }

  get clientCount() {
    return this._clients.size;
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  _onConnection(ws, req) {
    const url = new URL(req.url, 'ws://localhost');
    if (!isValidSecret(url.searchParams.get('secret') || '')) {
      ws.close(4001, 'Unauthorized');
      console.warn('[hub:wss] rejected unauthenticated connection');
      return;
    }
    ws.isAlive = true;
    this._clients.add(ws);
    console.log(`[hub:wss] client connected (total: ${this._clients.size})`);

    // Send snapshot of current state immediately
    this._send(ws, { type: 'snapshot', state: this._state.getSnapshot() });

    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', (data) => this._onMessage(ws, data));
    ws.on('close', () => {
      this._clients.delete(ws);
      console.log(`[hub:wss] client disconnected (total: ${this._clients.size})`);
    });
    ws.on('error', (err) => {
      console.error('[hub:wss] client error:', err.message);
      this._clients.delete(ws);
    });
  }

  _onMessage(ws, data) {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    switch (msg.type) {
      case 'ping':
        this._send(ws, { type: 'pong', ts: msg.ts ?? Date.now() });
        break;
      case 'command':
        this._handleCommand(ws, msg).catch((e) => {
          this._send(ws, { type: 'error', message: e.message });
        });
        break;
      case 'scan':
        this._handleScan(ws, msg).catch((e) => {
          this._send(ws, { type: 'error', message: e.message });
        });
        break;
      default:
        // Unknown message type — silently ignore.
        break;
    }
  }

  async _handleCommand(ws, { integration, action, params }) {
    const handler = this._commandHandlers.get(integration);
    if (!handler) {
      this._send(ws, {
        type: 'command_result', integration, action,
        ok: false, error: `No handler registered for integration "${integration}"`,
      });
      return;
    }
    try {
      const result = await handler(action, params);
      this._send(ws, { type: 'command_result', integration, action, ok: true, result });
      // Re-broadcast updated state so all tabs see the change
      const updated = this._state.get(integration);
      if (updated !== undefined) {
        this.broadcast({ type: 'device_update', integration, payload: updated });
      }
    } catch (e) {
      this._send(ws, {
        type: 'command_result', integration, action,
        ok: false, error: e.message,
      });
    }
  }

  async _handleScan(ws, { subnet = '192.168.1' }) {
    // Lazy-load the LAN scanner so it only runs when requested.
    const { scanLAN } = await import('./discovery/lan-scan.js');
    this._send(ws, { type: 'scan_start', subnet });
    let count = 0;
    await scanLAN(subnet, {
      onDevice: (device) => {
        count++;
        this._send(ws, { type: 'scan_result', device });
      },
      onProgress: (done, total) => {
        this._send(ws, { type: 'scan_progress', done, total });
      },
    });
    this._send(ws, { type: 'scan_done', count });
    console.log(`[hub:scan] ${subnet}.0/24 → ${count} devices found`);
  }

  _send(ws, msg) {
    if (ws.readyState === 1) ws.send(JSON.stringify(msg));
  }

  _startHeartbeat() {
    const interval = setInterval(() => {
      for (const ws of this._clients) {
        if (!ws.isAlive) {
          ws.terminate();
          this._clients.delete(ws);
          continue;
        }
        ws.isAlive = false;
        ws.ping();
      }
    }, HEARTBEAT_INTERVAL);

    this._wss.on('close', () => clearInterval(interval));
  }
}
