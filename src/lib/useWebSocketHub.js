/**
 * useWebSocketHub — React hook for the Home Domain real-time hub.
 *
 * Connects to the WebSocket server (server/index.js), receives state
 * snapshots and device updates, and exposes a send API for commands and scans.
 *
 * Usage:
 *   const { connected, sendCommand, triggerScan, lastMessage } = useWebSocketHub({
 *     onSnapshot:     (state)                  => { ... },  // full state on connect
 *     onDeviceUpdate: (integration, payload)   => { ... },  // incremental update
 *     onScanResult:   (device)                 => { ... },  // streamed scan hit
 *     onScanProgress: (done, total)            => { ... },
 *     onScanDone:     (count)                  => { ... },
 *     onError:        (integration, message)   => { ... },
 *   });
 *
 * The hub URL is read from VITE_HUB_URL env var (default: ws://localhost:3001).
 * If the hub is not running, the hook silently retries with exponential backoff
 * and returns connected=false — the caller falls back to direct polling.
 *
 * The hook is stable across re-renders. Handlers are kept in a ref so callers
 * can use inline functions without causing reconnects.
 */

import { useEffect, useRef, useCallback, useState } from 'react';

const _secret = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_HUB_SECRET) || '';
const _base   = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_HUB_URL) || 'ws://localhost:3001';
const HUB_URL  = _secret
  ? `${_base}${_base.includes('?') ? '&' : '?'}secret=${encodeURIComponent(_secret)}`
  : _base;

const PING_INTERVAL = 25_000;  // send a ping every 25 s to keep the connection alive
const MAX_BACKOFF   = 30_000;  // cap reconnect delay at 30 s

function backoff(attempt) {
  return Math.min(1000 * 2 ** attempt, MAX_BACKOFF);
}

/**
 * @param {{
 *   onSnapshot?:     (state: Record<string, unknown>) => void,
 *   onDeviceUpdate?: (integration: string, payload: unknown) => void,
 *   onScanResult?:   (device: object) => void,
 *   onScanProgress?: (done: number, total: number) => void,
 *   onScanDone?:     (count: number) => void,
 *   onError?:        (integration: string|undefined, message: string) => void,
 *   enabled?:        boolean,
 * }} opts
 */
export function useWebSocketHub({
  onSnapshot,
  onDeviceUpdate,
  onScanResult,
  onScanProgress,
  onScanDone,
  onError,
  enabled = true,
} = {}) {
  const [connected, setConnected] = useState(false);
  const wsRef      = useRef(null);
  const timerRef   = useRef(null);
  const pingRef    = useRef(null);
  const attemptsRef = useRef(0);
  const mountedRef = useRef(true);

  // Keep all handlers in a ref — callers can pass inline functions without
  // causing the WebSocket to reconnect on every render.
  const handlersRef = useRef({});
  handlersRef.current = { onSnapshot, onDeviceUpdate, onScanResult, onScanProgress, onScanDone, onError };

  const _clearTimers = useCallback(() => {
    clearTimeout(timerRef.current);
    clearInterval(pingRef.current);
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current || !enabled) return;

    // Already connecting or open
    const ws = wsRef.current;
    if (ws && (ws.readyState === 0 /* CONNECTING */ || ws.readyState === 1 /* OPEN */)) return;

    const socket = new WebSocket(HUB_URL);
    wsRef.current = socket;

    socket.onopen = () => {
      if (!mountedRef.current) { socket.close(); return; }
      attemptsRef.current = 0;
      setConnected(true);
      // Heartbeat: ping the server so the hub's heartbeat check keeps us alive
      pingRef.current = setInterval(() => {
        if (socket.readyState === 1) {
          socket.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
        }
      }, PING_INTERVAL);
    };

    socket.onmessage = ({ data }) => {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }
      const h = handlersRef.current;
      switch (msg.type) {
        case 'snapshot':
          h.onSnapshot?.(msg.state);
          break;
        case 'device_update':
          h.onDeviceUpdate?.(msg.integration, msg.payload);
          break;
        case 'scan_result':
          h.onScanResult?.(msg.device);
          break;
        case 'scan_progress':
          h.onScanProgress?.(msg.done, msg.total);
          break;
        case 'scan_done':
          h.onScanDone?.(msg.count);
          break;
        case 'error':
          h.onError?.(msg.integration, msg.message);
          break;
        // pong / command_result — ignored by the hook; callers can use onMessage
        default:
          break;
      }
    };

    socket.onclose = () => {
      clearInterval(pingRef.current);
      setConnected(false);
      if (!mountedRef.current) return;
      // Reconnect with exponential backoff
      const delay = backoff(attemptsRef.current++);
      timerRef.current = setTimeout(connect, delay);
    };

    socket.onerror = () => {
      // onclose fires after onerror — reconnect logic lives there
      setConnected(false);
    };
  }, [enabled]);

  // ── Outbound API ─────────────────────────────────────────────────────────

  /** Send a raw JSON message. No-op if not connected. */
  const send = useCallback((msg) => {
    const ws = wsRef.current;
    if (ws?.readyState === 1) ws.send(JSON.stringify(msg));
  }, []);

  /**
   * Relay a command to a device via the hub.
   * @param {string} integration  e.g. "plejd", "sonos", "shelly"
   * @param {string} action       e.g. "toggle", "play", "setBrightness"
   * @param {object} [params]     Action-specific parameters
   */
  const sendCommand = useCallback((integration, action, params) => {
    send({ type: 'command', integration, action, params });
  }, [send]);

  /**
   * Ask the hub to run a server-side LAN scan.
   * Results arrive via onScanResult / onScanDone callbacks.
   * @param {string} [subnet]  e.g. "192.168.1" (hub auto-detects if omitted)
   */
  const triggerScan = useCallback((subnet) => {
    send({ type: 'scan', ...(subnet ? { subnet } : {}) });
  }, [send]);

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true;
    if (enabled) connect();
    return () => {
      mountedRef.current = false;
      _clearTimers();
      const ws = wsRef.current;
      if (ws) {
        ws.onclose = null; // prevent reconnect on unmount
        ws.close();
      }
    };
  }, [connect, enabled, _clearTimers]);

  return { connected, send, sendCommand, triggerScan };
}
