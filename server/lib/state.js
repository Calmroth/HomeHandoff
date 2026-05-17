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
}
