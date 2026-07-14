/**
 * Tibber integration — spot prices (hourly poll) + real-time power (WebSocket).
 *
 * Two independent data streams, gated on what the account actually has:
 *   1. Spot prices (priceInfo) — REQUIRES an active Tibber power contract.
 *      When currentSubscription is null (monitoring/Pulse-only account, or the
 *      contract ended) there is NO priceInfo and never will be until a contract
 *      is active. We surface that as an honest, non-spammy state instead of a
 *      generic error every hour.
 *   2. Live power (liveMeasurement) — REQUIRES a Tibber Pulse or Watty
 *      (features.realTimeConsumptionEnabled). Independent of any price contract.
 *      Streams whole-home instantaneous watts + today's kWh over a
 *      graphql-transport-ws subscription.
 *
 * Environment variables:
 *   TIBBER_TOKEN  Personal access token (developer.tibber.com)
 *
 * Pushes:
 *   hub.pushUpdate('tibber',      { hasSubscription, currency, current, today[], tomorrow[], fetchedAt })
 *   hub.pushUpdate('tibber_live', { power, accumulatedConsumption, accumulatedCost, currency,
 *                                   minPower, maxPower, averagePower, timestamp })
 */

import { WebSocket } from 'ws';

const DEFAULT_POLL_MS = 60 * 60 * 1_000;  // 1 hour — prices update at most hourly
const LIVE_RECONNECT_MS = 10_000;

// Public spot-price fallback (Nord Pool via elprisetjustnu.se, free, no auth).
// Used when the account has no Tibber price contract so the Energy page can
// still show the real market curve + cheapest/most-expensive hours. Zone
// defaults to SE3 (Stockholm/Gothenburg); override with ELPRIS_ZONE.
const ELPRIS_ZONE = process.env.ELPRIS_ZONE || 'SE3';

async function fetchPublicDay(date, zone) {
  const y = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const url = `https://www.elprisetjustnu.se/api/v1/prices/${y}/${mm}-${dd}_${zone}.json`;
  const r = await fetch(url);
  if (!r.ok) return []; // no data yet (e.g. tomorrow before ~13:00) → empty
  const rows = await r.json().catch(() => []);
  // Nord Pool moved to 15-min slots (96/day). Aggregate to hourly (24) so the
  // shape matches Tibber's hourly prices and the chart stays readable.
  const byHour = new Map();
  for (const x of (rows || [])) {
    const d = new Date(x.time_start);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}`;
    if (!byHour.has(key)) byHour.set(key, { sum: 0, n: 0, startsAt: x.time_start });
    const b = byHour.get(key); b.sum += x.SEK_per_kWh; b.n++;
  }
  return [...byHour.values()].map(b => ({ total: b.sum / b.n, startsAt: b.startsAt }));
}

// Prices live under currentSubscription (null without an active contract).
// features.realTimeConsumptionEnabled tells us whether the live stream exists.
const QUERY = /* GraphQL */ `{
  viewer {
    websocketSubscriptionUrl
    homes {
      id
      appNickname
      features { realTimeConsumptionEnabled }
      currentSubscription {
        status
        priceInfo {
          current  { total currency level startsAt }
          today    { total startsAt level }
          tomorrow { total startsAt level }
        }
      }
    }
  }
}`;

/**
 * @param {import('../wss.js').WssHub} hub
 * @param {{ token?: string, pollMs?: number }} opts
 */
export function startTibberPoller(hub, { token, pollMs = DEFAULT_POLL_MS } = {}) {
  if (!token) {
    console.log('[hub:tibber] Skipped — set TIBBER_TOKEN in .env.local');
    return;
  }

  let liveSocket   = null;
  let liveReconnect = null;
  let stopped      = false;
  let liveStarted  = false;

  // ── Price polling ────────────────────────────────────────────────────────
  async function poll() {
    try {
      const r = await fetch('https://api.tibber.com/v1-beta/gql', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: QUERY }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const { data, errors } = await r.json();
      if (errors?.length) throw new Error(errors[0].message);

      const viewer = data?.viewer;
      const home = viewer?.homes?.[0];
      if (!home) {
        hub.pushUpdate('tibber', { hasSubscription: false, reason: 'no-homes', today: [], tomorrow: [], fetchedAt: new Date().toISOString() });
        hub.pushHealth('tibber', 'degraded', 'No homes on this Tibber account');
        return;
      }

      // Kick off the live stream once we know a Pulse is present.
      if (home.features?.realTimeConsumptionEnabled && viewer.websocketSubscriptionUrl) {
        startLive(viewer.websocketSubscriptionUrl, home.id);
      }

      const sub = home.currentSubscription;
      if (!sub || !sub.priceInfo) {
        // No Tibber price contract — fall back to the PUBLIC market spot price
        // (Nord Pool). Still honest (labelled as market spot, raw, excl. fees),
        // and lets the Energy page show the real curve + cheapest/priciest hours.
        const today    = await fetchPublicDay(new Date(), ELPRIS_ZONE).catch(() => []);
        const tomorrow = await fetchPublicDay(new Date(Date.now() + 86_400_000), ELPRIS_ZONE).catch(() => []);
        const nowMs = Date.now();
        const curSlot = today.find(p => {
          const t0 = new Date(p.startsAt).getTime();
          return nowMs >= t0 && nowMs < t0 + 3_600_000;
        });
        hub.pushUpdate('tibber', {
          hasSubscription: false, priceSource: 'public', zone: ELPRIS_ZONE, currency: 'SEK',
          current: curSlot ? { total: curSlot.total, currency: 'SEK' } : null,
          today, tomorrow, fetchedAt: new Date().toISOString(),
        });
        if (today.length) hub.pushHealth('tibber', 'ok', `Public market spot prices (${ELPRIS_ZONE}) — no Tibber contract`);
        else hub.pushHealth('tibber', 'degraded', `No Tibber contract; public spot prices unavailable for ${ELPRIS_ZONE}`);
        return;
      }

      const pi = sub.priceInfo;
      hub.pushUpdate('tibber', {
        hasSubscription: true,
        currency: pi.current?.currency ?? 'SEK',
        current:  pi.current  ?? null,
        today:    pi.today    ?? [],
        tomorrow: pi.tomorrow ?? [],
        fetchedAt: new Date().toISOString(),
      });
      hub.pushHealth('tibber', 'ok', `${(pi.today ?? []).length} prices today, ${(pi.tomorrow ?? []).length} tomorrow`);
    } catch (e) {
      hub.pushError('tibber', `Price poll failed: ${e.message}`);
    }
  }

  // ── Live power (graphql-transport-ws subscription) ─────────────────────────
  function startLive(url, homeId) {
    if (liveStarted || stopped) return; // single subscription
    liveStarted = true;
    connectLive(url, homeId);
  }

  function connectLive(url, homeId) {
    if (stopped) return;
    const sock = new WebSocket(url, 'graphql-transport-ws', {
      headers: { 'User-Agent': 'HomeDomainHub/1.0' },
    });
    liveSocket = sock;

    sock.on('open', () => {
      sock.send(JSON.stringify({ type: 'connection_init', payload: { token } }));
    });

    sock.on('message', (raw) => {
      let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }
      switch (msg.type) {
        case 'connection_ack':
          sock.send(JSON.stringify({
            id: '1', type: 'subscribe',
            payload: { query: `subscription{ liveMeasurement(homeId:"${homeId}"){ timestamp power accumulatedConsumption accumulatedCost currency minPower maxPower averagePower } }` },
          }));
          console.log('[hub:tibber] Live power subscription active');
          break;
        case 'next': {
          const m = msg.payload?.data?.liveMeasurement;
          if (m) hub.pushUpdate('tibber_live', m);
          break;
        }
        case 'ping':
          sock.send(JSON.stringify({ type: 'pong' }));
          break;
        case 'error':
          console.warn('[hub:tibber] live error:', JSON.stringify(msg.payload));
          break;
        // 'complete' / 'ka' fall through
      }
    });

    const retry = () => {
      if (stopped) return;
      hub.pushHealth('tibber', 'degraded', 'Live power link dropped — reconnecting');
      liveReconnect = setTimeout(() => connectLive(url, homeId), LIVE_RECONNECT_MS);
    };
    sock.on('close', retry);
    sock.on('error', (e) => { console.warn('[hub:tibber] live socket error:', e.message); try { sock.close(); } catch {} });
  }

  poll();
  const interval = setInterval(poll, pollMs);
  console.log(`[hub:tibber] Polling prices every ${pollMs / 1000 / 60} min`);

  return () => {
    stopped = true;
    clearInterval(interval);
    if (liveReconnect) clearTimeout(liveReconnect);
    if (liveSocket) { try { liveSocket.close(); } catch {} }
  };
}
