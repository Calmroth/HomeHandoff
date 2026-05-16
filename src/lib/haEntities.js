// Generic Home Assistant entity bridge.
//
// The user already supplies an HA URL + long-lived access token for Plejd
// (Settings -> Integrations -> Plejd). HA exposes every entity it knows
// about at GET /api/states/<entity_id>. Reusing that auth pair, we can let
// the user pin any HA entity onto the dashboard -- temperature sensors,
// motion sensors, vacuum-cleaner battery, dishwasher state, whatever.
//
// Storage shape (lives in the integrations config blob, alongside plejd):
//   integrations.config.ha = {
//     entities: [
//       { id: 'sensor.kitchen_temperature', label: 'Kitchen', unit: '°C', icon: 'Sun' },
//       { id: 'binary_sensor.front_door',   label: 'Front door', icon: 'Home' },
//       ...
//     ]
//   }
//
// State shape returned by the hook (one row per entity):
//   { id, state, attributes, lastChanged, lastUpdated, err }

import { useEffect, useState } from 'react';

async function fetchEntity({ url, token }, entityId, signal) {
  const baseUrl = url.replace(/\/$/, '');
  const r = await fetch(`${baseUrl}/api/states/${encodeURIComponent(entityId)}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    signal,
  });
  if (!r.ok) throw new Error(`HA ${entityId}: ${r.status}`);
  return r.json();
}

// useHaEntities: poll a list of HA entity IDs every `pollMs` (default 20s)
// while the page is visible AND HA creds are available. Returns a Map
// keyed by entityId. Each map value:
//   { id, state, attributes, lastChanged, lastUpdated, err }
// Callers should treat `null` state as "not yet loaded"; `err` as failed.
//
// haCreds: { url, token } -- typically integrations.config.plejd, since the
// existing Plejd hookup IS an HA connection. Pass null/undefined to disable.
export function useHaEntities(entityIds, haCreds, { pollMs = 20_000, pageVisible = true } = {}) {
  const [rows, setRows] = useState(() => new Map());
  const idsKey = JSON.stringify(entityIds || []);
  const url   = haCreds?.url;
  const token = haCreds?.token;

  useEffect(() => {
    if (!pageVisible) return;
    if (!entityIds || entityIds.length === 0) return;
    if (!url || !token) return;
    let cancelled = false;
    const ctrl = new AbortController();
    const tick = async () => {
      const next = new Map();
      await Promise.all(entityIds.map(async (id) => {
        try {
          const j = await fetchEntity({ url, token }, id, ctrl.signal);
          next.set(id, {
            id,
            state: j.state,
            attributes: j.attributes || {},
            lastChanged: j.last_changed,
            lastUpdated: j.last_updated,
            err: null,
          });
        } catch (err) {
          if (err.name === 'AbortError') return;
          next.set(id, { id, state: null, attributes: {}, err: String(err.message || err) });
        }
      }));
      if (!cancelled) setRows(next);
    };
    tick();
    const t = setInterval(tick, pollMs);
    return () => {
      cancelled = true;
      ctrl.abort();
      clearInterval(t);
    };
  }, [pageVisible, pollMs, idsKey, url, token]);

  return rows;
}
