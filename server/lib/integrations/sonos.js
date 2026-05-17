/**
 * Sonos integration — polls node-sonos-http-api /zones.
 *
 * Environment variables:
 *   SONOS_URL  Base URL of the node-sonos-http-api bridge (e.g. http://localhost:5005)
 *
 * Pushes: hub.pushUpdate('sonos', Speaker[])
 *
 * Commands (via hub.onCommand('sonos', handler)):
 *   action: 'play' | 'pause' | 'next' | 'previous' | 'volume' | 'groupVolume'
 *   params: { room: string, value?: number }
 */

const DEFAULT_POLL_MS = 5_000;

function mapZones(zones) {
  const speakers = [];
  for (const zone of zones) {
    const members = Array.isArray(zone.members) ? zone.members : [];
    if (!members.length) continue;

    // The coordinator is the leader for this zone group.
    const coordName = zone.coordinator;

    for (const m of members) {
      const track = m.state?.currentTrack ?? {};
      speakers.push({
        id:      m.roomName.toLowerCase().replace(/\s+/g, '-'),
        name:    m.roomName,
        source:  track.title || track.type || (m.state?.playbackState === 'PLAYING' ? 'Playing' : 'Stopped'),
        artist:  track.artist || '',
        on:      m.state?.playbackState === 'PLAYING',
        paused:  m.state?.playbackState === 'PAUSED_PLAYBACK',
        volume:  m.state?.volume ?? 0,
        primary: m.roomName === coordName,
        _room:   m.roomName,
        _zone:   coordName,
      });
    }
  }
  return speakers;
}

/**
 * @param {import('../wss.js').WssHub} hub
 * @param {{ url?: string, pollMs?: number }} opts
 */
export function startSonosPoller(hub, { url, pollMs = DEFAULT_POLL_MS } = {}) {
  if (!url) {
    console.log('[hub:sonos] Skipped — set SONOS_URL in .env.local');
    return;
  }

  const base = url.replace(/\/$/, '');
  let lastHash = '';

  async function poll() {
    try {
      const r = await fetch(`${base}/zones`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const zones    = await r.json();
      const speakers = mapZones(zones);
      const hash     = JSON.stringify(speakers.map(s => `${s.id}:${s.on}:${s.paused}:${s.volume}`));
      if (hash !== lastHash) {
        lastHash = hash;
        hub.pushUpdate('sonos', speakers);
      }
    } catch (e) {
      hub.pushError('sonos', `Poll failed: ${e.message}`);
    }
  }

  poll();
  const interval = setInterval(poll, pollMs);
  console.log(`[hub:sonos] Polling ${base} every ${pollMs / 1000}s`);

  hub.onCommand('sonos', async (action, { room, value } = {}) => {
    if (!room) throw new Error('sonos command requires room');
    const enc  = encodeURIComponent(room);
    const paths = {
      play:        `${enc}/play`,
      pause:       `${enc}/pause`,
      next:        `${enc}/next`,
      previous:    `${enc}/previous`,
      volume:      `${enc}/volume/${Math.round(value ?? 0)}`,
      groupVolume: `${enc}/groupVolume/${Math.round(value ?? 0)}`,
    };
    const path = paths[action];
    if (!path) throw new Error(`Unknown Sonos action: "${action}"`);
    const r = await fetch(`${base}/${path}`);
    if (!r.ok) throw new Error(`Sonos error: HTTP ${r.status}`);
    setTimeout(poll, 800);  // re-poll quickly so state reflects the command
    return { ok: true };
  });

  return () => clearInterval(interval);
}
