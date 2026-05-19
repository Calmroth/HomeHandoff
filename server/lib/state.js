/**
 * HubState — in-memory state cache.
 *
 * Each integration writes its latest payload here via set(). New WebSocket
 * clients receive the full snapshot on connect so they catch up instantly
 * without waiting for the next poll cycle.
 *
 * The shape of each integration's payload is intentionally open (just stored
 * as-is). Integrations own their payload shape; the hub is just the pipe.
 */
export class HubState {
  constructor() {
    /** @type {Map<string, unknown>} */
    this._state = new Map();
    /** ISO timestamp of last update per integration */
    this._updated = new Map();
    /** Per-integration health: { status: 'ok'|'degraded'|'down', detail: string, ts: ISO } */
    this._health = new Map();
  }

  /**
   * Store (or overwrite) the state for one integration.
   * @param {string} integration  e.g. "plejd", "sonos", "shelly", "tibber"
   * @param {unknown} payload     Arbitrary serialisable value
   */
  set(integration, payload) {
    this._state.set(integration, payload);
    this._updated.set(integration, new Date().toISOString());
  }

  /** Return the last stored value for one integration, or undefined. */
  get(integration) {
    return this._state.get(integration);
  }

  /**
   * Return a plain object snapshot of all stored state.
   * This is the payload of the "snapshot" message sent to new clients.
   */
  getSnapshot() {
    const out = {};
    for (const [key, value] of this._state) {
      out[key] = value;
    }
    return {
      integrations: out,
      lastUpdated: Object.fromEntries(this._updated),
    };
  }

  /** List integration keys that have been written at least once. */
  get keys() {
    return [...this._state.keys()];
  }

  /**
   * Record health status for one integration.
   * Called by WssHub.pushHealth() and WssHub.pushError().
   * @param {string} integration
   * @param {'ok'|'degraded'|'down'} status
   * @param {string} [detail]
   */
  setHealth(integration, status, detail = '') {
    this._health.set(integration, { status, detail, ts: new Date().toISOString() });
  }

  /**
   * Return a plain-object map of per-integration health for the /health endpoint.
   * Infers 'unknown' for integrations that have state but no explicit health record.
   */
  getHealthSnapshot() {
    const out = {};
    // Start with explicit health records
    for (const [k, v] of this._health) out[k] = v;
    // Fill in 'unknown' for integrations that have state but no health record yet
    for (const k of this._state.keys()) {
      if (!out[k]) out[k] = { status: 'unknown', detail: '', ts: this._updated.get(k) || null };
    }
    return out;
  }

  /**
   * Seed from a persisted snapshot (hub-state.json).
   * Only restores integration data; health starts fresh each boot.
   * @param {{ integrations: Record<string, unknown> }} snapshot
   */
  restore(snapshot) {
    const { integrations = {}, lastUpdated = {} } = snapshot;
    for (const [k, v] of Object.entries(integrations)) {
      this._state.set(k, v);
      this._updated.set(k, lastUpdated[k] || new Date().toISOString());
    }
  }
}
