/**
 * Tibber integration — fetches hourly electricity prices via GraphQL.
 *
 * Environment variables:
 *   TIBBER_TOKEN  Personal access token from https://developer.tibber.com/settings/access-token
 *
 * Pushes: hub.pushUpdate('tibber', { today: PricePoint[], tomorrow: PricePoint[] })
 *
 * PricePoint: { total: number, startsAt: string (ISO), level: string }
 *
 * Polls once per hour — Tibber prices don't change more often, and tomorrow's
 * prices appear around 13:00 CET so the hourly cadence catches that update.
 */

const DEFAULT_POLL_MS = 60 * 60 * 1_000;  // 1 hour

const QUERY = /* GraphQL */ `{
  viewer {
    homes {
      currentSubscription {
        priceInfo {
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

  async function poll() {
    try {
      const r = await fetch('https://api.tibber.com/v1-beta/gql', {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: QUERY }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const { data, errors } = await r.json();
      if (errors?.length) throw new Error(errors[0].message);

      const priceInfo = data?.viewer?.homes?.[0]?.currentSubscription?.priceInfo;
      if (!priceInfo) throw new Error('No priceInfo in Tibber response');

      hub.pushUpdate('tibber', {
        today:    priceInfo.today    ?? [],
        tomorrow: priceInfo.tomorrow ?? [],
        fetchedAt: new Date().toISOString(),
      });
      console.log(`[hub:tibber] ${(priceInfo.today ?? []).length} prices today, ${(priceInfo.tomorrow ?? []).length} tomorrow`);
    } catch (e) {
      hub.pushError('tibber', `Poll failed: ${e.message}`);
    }
  }

  poll();  // fetch immediately on start
  const interval = setInterval(poll, pollMs);
  console.log(`[hub:tibber] Polling every ${pollMs / 1000 / 60} min`);

  return () => clearInterval(interval);
}
