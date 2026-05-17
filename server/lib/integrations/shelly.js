/**
 * Shelly integration — polls each registered device for live switch state + watts.
 *
 * Unlike HA/Sonos, Shelly devices are registered in the frontend Settings UI rather
 * than via env vars. The poller reads the device list from the HubState cache, which
 * gets populated when the first WebSocket client sends a snapshot update.
 *
 * Because clients send their config on connect (via the React hook), this poller
 * starts seeing devices within seconds of the first client connecting.
 *
 * Pushes: hub.pushUpdate('shelly', Outlet[])
 *
 * Commands (via hub.onCommand('shelly', handler)):
 *   action: 'toggle'
 *   params: { ip: string, on: boolean }
 */

const DEFAULT_POLL_MS = 12_000;

async function readShelly(ip) {
  // Try Gen2 (newer devices, richer status).
  const g2 = await fetch(`http://${ip}/rpc/Switch.GetStatus?id=0`).catch(() => null);
  if (g2?.ok) {
    const j = await g2.json().catch(() => null);
    if (j) return { on: Boolean(j.output), watts: j.apower ?? 0, gen: 2 };
  }
  // Fall back to Gen1.
  const g1 = await fetch(`http://${ip}/relay/0`).catch(() => null);
  if (g1?.ok) {
    const j = await g1.json().catch(() => null);
    if (j) return { on: Boolean(j.ison), watts: j.power ?? 0, gen: 1 };
  }
  return null;
}

/**
 * @param {import('../wss.js').WssHub} hub
 * @param {{ state: import('../state.js').HubState, pollMs?: number }} opts
 */
export function startShellyPoller(hub, { state, pollMs = DEFAULT_POLL_MS } = {}) {
  let lastHash = '';

  async function poll() {
    // Device list is managed client-side and mirrored into the hub state cache
    // by the first client that connects. If not yet available, skip this cycle.
    const devices = state.get('shelly')?.devices ?? [];
    if (!devices.length) return;

    const results = await Promise.allSettled(
      devices.map(async (d) => {
        const status = await readShelly(d.ip);
        return status
          ? { ...d, on: status.on, watts: status.watts, _gen: status.gen }
          : { ...d };  // keep stale state if device unreachable
      })
    );

    const outlets = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value);

    const hash = JSON.stringify(outlets.map(o => `${o.id}:${o.on}:${o.watts}`));
    if (hash !== lastHash) {
      lastHash = hash;
      hub.pushUpdate('shelly', outlets);
    }
  }

  poll();
  const interval = setInterval(poll, pollMs);
  console.log(`[hub:shelly] Polling every ${pollMs / 1000}s (reads device list from hub state)`);

  hub.onCommand('shelly', async (action, { ip, on } = {}) => {
    if (!ip) throw new Error('shelly command requires ip');
    if (action !== 'toggle') throw new Error(`Unknown Shelly action: "${action}"`);

    // Try Gen2, fall back to Gen1.
    let r = await fetch(`http://${ip}/rpc/Switch.Set?id=0&on=${Boolean(on)}`).catch(() => null);
    if (!r?.ok) {
      r = await fetch(`http://${ip}/relay/0?turn=${on ? 'on' : 'off'}`).catch(() => null);
    }
    if (!r?.ok) throw new Error(`Shelly unreachable at ${ip}`);

    setTimeout(poll, 600);
    return { ok: true };
  });

  return () => clearInterval(interval);
}
