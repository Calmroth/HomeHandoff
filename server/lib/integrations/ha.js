/**
 * Home Assistant integration — polls /api/states and maps to hub payloads.
 *
 * Environment variables (loaded by server/index.js from .env.local):
 *   HOME_ASSISTANT_URL    e.g. http://homeassistant.local:8123
 *   HOME_ASSISTANT_TOKEN  Long-lived access token from HA profile page
 *
 * Pushes:
 *   hub.pushUpdate('ha_lights',   Room[])    — light.* entities
 *   hub.pushUpdate('ha_speakers', Speaker[]) — media_player.* entities
 *
 * Commands (via hub.onCommand('ha', handler)):
 *   action: 'call_service'
 *   params: { domain, service, entity_id, ...serviceData }
 *
 * Light control example (from App.jsx):
 *   hubSendCommand('ha', 'call_service', {
 *     domain: 'light', service: 'turn_on',
 *     entity_id: 'light.living_room', brightness: 200,
 *   })
 */

const DEFAULT_POLL_MS = 8_000;

// ── Mappers ───────────────────────────────────────────────────────────────────

/**
 * Map light.* HA entities → Room[] (matches existing app room shape).
 * Groups by area_name when available so related bulbs become one row.
 */
function mapLights(entities) {
  return entities
    .filter(e => e.entity_id.startsWith('light.') && e.state !== 'unavailable')
    .map(e => ({
      id:         e.entity_id,
      name:       e.attributes.friendly_name
                  || e.entity_id.replace('light.', '').replace(/_/g, ' '),
      on:         e.state === 'on',
      brightness: Math.round(
        (e.attributes.brightness ?? (e.state === 'on' ? 255 : 0)) / 2.55
      ),
      // HA doesn't expose physical bulb count; colour-temp / brightness attr
      // hints suggest a real bulb so 1 is an honest default.
      bulbs:      e.attributes.entity_count ?? 1,
      _entity:    e.entity_id,
      _area:      e.attributes.area_id ?? null,
    }));
}

/**
 * Map media_player.* HA entities → Speaker[] (matches existing speaker shape).
 */
function mapSpeakers(entities) {
  return entities
    .filter(e => e.entity_id.startsWith('media_player.') && e.state !== 'unavailable')
    .map(e => ({
      id:      e.entity_id,
      name:    e.attributes.friendly_name
               || e.entity_id.replace('media_player.', '').replace(/_/g, ' '),
      source:  e.attributes.media_title
               || e.attributes.app_name
               || (e.state === 'playing' ? 'Playing' : e.state),
      artist:  e.attributes.media_artist || '',
      on:      e.state === 'playing',
      paused:  e.state === 'paused' || e.state === 'idle',
      volume:  Math.round((e.attributes.volume_level ?? 0) * 100),
      primary: false,
      _entity: e.entity_id,
    }));
}

// ── Poller ────────────────────────────────────────────────────────────────────

/**
 * @param {import('../wss.js').WssHub} hub
 * @param {{ url?: string, token?: string, pollMs?: number }} opts
 * @returns {(() => void)|undefined}  cleanup fn (clears the interval)
 */
export function startHAPoller(hub, { url, token, pollMs = DEFAULT_POLL_MS } = {}) {
  if (!url || !token) {
    console.log('[hub:ha] Skipped — set HOME_ASSISTANT_URL + HOME_ASSISTANT_TOKEN in .env.local');
    return;
  }

  const base    = url.replace(/\/$/, '');
  const headers = {
    Authorization:  `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // ── Poll ────────────────────────────────────────────────────────────────────
  let lastLightHash    = '';
  let lastSpeakerHash  = '';

  async function poll() {
    let entities;
    try {
      const r = await fetch(`${base}/api/states`, { headers });
      if (!r.ok) throw new Error(`HTTP ${r.status} from HA`);
      entities = await r.json();
    } catch (e) {
      hub.pushError('ha', `Poll failed: ${e.message}`);
      return;
    }

    const lights   = mapLights(entities);
    const speakers = mapSpeakers(entities);

    // Only broadcast when something actually changed (cheap string comparison).
    const lh = JSON.stringify(lights.map(l => `${l.id}:${l.on}:${l.brightness}`));
    const sh = JSON.stringify(speakers.map(s => `${s.id}:${s.on}:${s.paused}:${s.volume}`));

    if (lights.length && lh !== lastLightHash) {
      lastLightHash = lh;
      hub.pushUpdate('ha_lights', lights);
    }
    if (speakers.length && sh !== lastSpeakerHash) {
      lastSpeakerHash = sh;
      hub.pushUpdate('ha_speakers', speakers);
    }
  }

  poll();  // immediate first fetch
  const interval = setInterval(poll, pollMs);
  console.log(`[hub:ha] Polling ${base} every ${pollMs / 1000}s`);

  // ── Command handler ─────────────────────────────────────────────────────────
  hub.onCommand('ha', async (action, params = {}) => {
    if (action !== 'call_service') throw new Error(`Unknown HA action: "${action}"`);

    const { domain, service, entity_id, ...serviceData } = params;
    if (!domain || !service) throw new Error('ha call_service requires domain and service');

    const r = await fetch(`${base}/api/services/${domain}/${service}`, {
      method:  'POST',
      headers,
      body:    JSON.stringify({ entity_id, ...serviceData }),
    });
    if (!r.ok) throw new Error(`HA service ${domain}.${service} failed: HTTP ${r.status}`);

    // Re-poll shortly after command so the updated state reaches all tabs quickly.
    setTimeout(poll, 600);
    return { ok: true };
  });

  return () => clearInterval(interval);
}
