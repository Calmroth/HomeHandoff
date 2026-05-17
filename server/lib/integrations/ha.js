/**
 * Home Assistant integration — polls /api/states and maps all major domains.
 *
 * Environment variables (loaded by server/index.js from .env.local):
 *   HOME_ASSISTANT_URL    e.g. http://homeassistant.local:8123
 *   HOME_ASSISTANT_TOKEN  Long-lived access token from HA profile page
 *
 * HA is the universal bridge: Google Home, Apple HomeKit, Matter, Zigbee,
 * Z-Wave, Hue, IKEA TRÅDFRI — if the device is in HA it flows to the app.
 *
 * Pushes (each only broadcast when something actually changed):
 *   hub.pushUpdate('ha_lights',         Room[])         — light.*
 *   hub.pushUpdate('ha_speakers',       Speaker[])      — media_player.*
 *   hub.pushUpdate('ha_switches',       Outlet[])       — switch.*
 *   hub.pushUpdate('ha_climate',        Thermostat[])   — climate.*
 *   hub.pushUpdate('ha_covers',         Cover[])        — cover.* (blinds/curtains)
 *   hub.pushUpdate('ha_locks',          Lock[])         — lock.*
 *   hub.pushUpdate('ha_binary_sensors', BinarySensor[]) — binary_sensor.* (motion, door)
 *   hub.pushUpdate('ha_scenes',         Scene[])        — scene.*
 *
 * Commands (all via hub.onCommand('ha', handler)):
 *   action: 'call_service'
 *   params: { domain, service, entity_id, ...serviceData }
 *
 * Examples:
 *   Turn light on/off:  { domain:'light',   service:'turn_on',      entity_id:'light.xyz', brightness:200 }
 *   Set thermostat:     { domain:'climate', service:'set_temperature', entity_id:'climate.xyz', temperature:21 }
 *   Open cover:         { domain:'cover',   service:'open_cover',   entity_id:'cover.xyz' }
 *   Lock a lock:        { domain:'lock',    service:'lock',          entity_id:'lock.xyz' }
 *   Trigger scene:      { domain:'scene',   service:'turn_on',       entity_id:'scene.xyz' }
 */

const DEFAULT_POLL_MS = 8_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

const friendly = (entity_id) =>
  entity_id.replace(/^[^.]+\./, '').replace(/_/g, ' ');

// ── Mappers ───────────────────────────────────────────────────────────────────

/** light.* → Room[] */
function mapLights(entities) {
  return entities
    .filter(e => e.entity_id.startsWith('light.') && e.state !== 'unavailable')
    .map(e => ({
      id:         e.entity_id,
      name:       e.attributes.friendly_name || friendly(e.entity_id),
      on:         e.state === 'on',
      brightness: Math.round(
        (e.attributes.brightness ?? (e.state === 'on' ? 255 : 0)) / 2.55
      ),
      colorTemp:  e.attributes.color_temp ?? null,
      supportsColor: !!(e.attributes.rgb_color),
      bulbs:      e.attributes.entity_count ?? 1,
      _entity:    e.entity_id,
      _area:      e.attributes.area_id ?? null,
      _platform:  e.platform ?? null,
    }));
}

/** media_player.* → Speaker[] */
function mapSpeakers(entities) {
  return entities
    .filter(e => e.entity_id.startsWith('media_player.') && e.state !== 'unavailable')
    .map(e => {
      const attr = e.attributes;
      return {
        id:      e.entity_id,
        name:    attr.friendly_name || friendly(e.entity_id),
        source:  attr.media_title || attr.app_name || (e.state === 'playing' ? 'Playing' : e.state),
        artist:  attr.media_artist || '',
        album:   attr.media_album_name || '',
        cover:   attr.entity_picture ?? null,
        on:      e.state === 'playing',
        paused:  e.state === 'paused' || e.state === 'idle',
        volume:  Math.round((attr.volume_level ?? 0) * 100),
        muted:   attr.is_volume_muted ?? false,
        primary: false,
        _entity: e.entity_id,
        // Hints for UI — which controls are meaningful for this player
        _supportsBrowse: !!(attr.media_playlist),
        _supportsVolume: attr.supported_features ? !!(attr.supported_features & 4) : true,
      };
    });
}

/** switch.* → Outlet[] (same shape as Shelly outlets for seamless merge) */
function mapSwitches(entities) {
  return entities
    .filter(e => e.entity_id.startsWith('switch.') && e.state !== 'unavailable')
    .map(e => ({
      id:       e.entity_id,
      name:     e.attributes.friendly_name || friendly(e.entity_id),
      on:       e.state === 'on',
      watts:    e.attributes.current_power_w ?? 0,
      alwaysOn: false,
      icon:     'outlet',
      _entity:  e.entity_id,
      _area:    e.attributes.area_id ?? null,
    }));
}

/**
 * climate.* → Thermostat[]
 * Covers Google Nest, Tado, Honeywell, Apple HomeKit thermostats, etc.
 */
function mapClimate(entities) {
  return entities
    .filter(e => e.entity_id.startsWith('climate.') && e.state !== 'unavailable')
    .map(e => {
      const attr = e.attributes;
      return {
        id:          e.entity_id,
        name:        attr.friendly_name || friendly(e.entity_id),
        mode:        e.state,                        // 'heat'|'cool'|'off'|'auto'|'heat_cool'
        currentTemp: attr.current_temperature ?? null,
        targetTemp:  attr.temperature ?? attr.target_temp_low ?? null,
        tempLow:     attr.target_temp_low  ?? null,
        tempHigh:    attr.target_temp_high ?? null,
        unit:        attr.temperature_unit ?? '°C',
        humidity:    attr.current_humidity ?? null,
        hvacAction:  attr.hvac_action ?? null,       // 'heating'|'cooling'|'idle'|'off'
        modes:       attr.hvac_modes ?? [],
        _entity:     e.entity_id,
        _area:       attr.area_id ?? null,
      };
    });
}

/**
 * cover.* → Cover[]
 * Covers blinds, curtains, garage doors, awnings from any platform.
 */
function mapCovers(entities) {
  return entities
    .filter(e => e.entity_id.startsWith('cover.') && e.state !== 'unavailable')
    .map(e => {
      const attr = e.attributes;
      return {
        id:           e.entity_id,
        name:         attr.friendly_name || friendly(e.entity_id),
        state:        e.state,          // 'open'|'closed'|'opening'|'closing'
        open:         e.state === 'open',
        position:     attr.current_position ?? null,   // 0–100
        tilt:         attr.current_tilt_position ?? null,
        deviceClass:  attr.device_class ?? 'blind',    // 'blind'|'curtain'|'garage'|'gate'|'door'
        _entity:      e.entity_id,
        _area:        attr.area_id ?? null,
      };
    });
}

/**
 * lock.* → Lock[]
 * Smart locks from August, Yale, Nuki, Schlage, etc.
 */
function mapLocks(entities) {
  return entities
    .filter(e => e.entity_id.startsWith('lock.') && e.state !== 'unavailable')
    .map(e => ({
      id:      e.entity_id,
      name:    e.attributes.friendly_name || friendly(e.entity_id),
      locked:  e.state === 'locked',
      state:   e.state,  // 'locked'|'unlocked'|'locking'|'unlocking'
      _entity: e.entity_id,
      _area:   e.attributes.area_id ?? null,
    }));
}

/**
 * binary_sensor.* → BinarySensor[]
 * Motion, door/window contact, presence, smoke, water leak sensors.
 */
function mapBinarySensors(entities) {
  return entities
    .filter(e => e.entity_id.startsWith('binary_sensor.') && e.state !== 'unavailable')
    .filter(e => ['motion', 'door', 'window', 'presence', 'occupancy',
                  'smoke', 'moisture', 'vibration', 'gas', 'opening'].includes(
                    e.attributes.device_class ?? ''))
    .map(e => ({
      id:          e.entity_id,
      name:        e.attributes.friendly_name || friendly(e.entity_id),
      active:      e.state === 'on',
      deviceClass: e.attributes.device_class ?? 'motion',
      lastChanged: e.last_changed,
      _entity:     e.entity_id,
      _area:       e.attributes.area_id ?? null,
    }));
}

/** scene.* → Scene[] — HA one-tap scenes */
function mapScenes(entities) {
  return entities
    .filter(e => e.entity_id.startsWith('scene.'))
    .map(e => ({
      id:      e.entity_id,
      name:    e.attributes.friendly_name || friendly(e.entity_id),
      icon:    e.attributes.icon ?? null,
      _entity: e.entity_id,
    }));
}

// ── Hash helpers (skip broadcast if nothing changed) ──────────────────────────

const h = (arr, keyFn) => arr.map(keyFn).join('|');

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

  const hashes = {};  // tracks last broadcast hash per integration key

  function pushIfChanged(key, items, hashFn) {
    if (!items.length) return;
    const digest = h(items, hashFn);
    if (digest === hashes[key]) return;
    hashes[key] = digest;
    hub.pushUpdate(key, items);
  }

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

    pushIfChanged('ha_lights',         mapLights(entities),        l => `${l.id}:${l.on}:${l.brightness}`);
    pushIfChanged('ha_speakers',       mapSpeakers(entities),      s => `${s.id}:${s.on}:${s.paused}:${s.volume}`);
    pushIfChanged('ha_switches',       mapSwitches(entities),      s => `${s.id}:${s.on}`);
    pushIfChanged('ha_climate',        mapClimate(entities),       c => `${c.id}:${c.mode}:${c.currentTemp}:${c.targetTemp}`);
    pushIfChanged('ha_covers',         mapCovers(entities),        c => `${c.id}:${c.state}:${c.position}`);
    pushIfChanged('ha_locks',          mapLocks(entities),         l => `${l.id}:${l.locked}`);
    pushIfChanged('ha_binary_sensors', mapBinarySensors(entities), b => `${b.id}:${b.active}`);
    pushIfChanged('ha_scenes',         mapScenes(entities),        s => s.id);
  }

  poll();  // immediate first fetch
  const interval = setInterval(poll, pollMs);
  console.log(`[hub:ha] Polling ${base} every ${pollMs / 1000}s (lights, speakers, switches, climate, covers, locks, sensors, scenes)`);

  // ── Command handler ─────────────────────────────────────────────────────────
  // Single generic handler covers every HA domain. The client sends:
  //   { action: 'call_service', params: { domain, service, entity_id, ...serviceData } }
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

    // Re-poll so updated state reaches all tabs quickly (HA needs ~100ms to reflect).
    setTimeout(poll, 600);
    return { ok: true };
  });

  return () => clearInterval(interval);
}
