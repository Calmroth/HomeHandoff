// Integrations — one persisted blob of per-service config (URLs, tokens,
// device lists). Lives in localStorage so each browser keeps its own setup.
// Each integration's "status" is derived: a non-empty URL/token = configured.
// Network calls live here so components can stay declarative.

import { useState, useCallback } from 'react';

export const DEFAULT_INTEGRATIONS = {
  // Stockholm fallback; Settings lets the user change this.
  weather:    { lat: '59.3293', lon: '18.0686', city: 'Stockholm' },
  plejd:      { url: '', token: '' },          // Home Assistant REST base URL + long-lived token
  sonos:      { url: '' },                     // node-sonos-http-api base URL
  shelly:     { devices: [] },                 // [{ id, name, room, ip, icon, alwaysOn }]
  tibber:     { token: '' },                   // Tibber personal access token (api.tibber.com)
  // Network discovery: each item = { id, ip?, entityId?, name, type, protocol, model, assignedTo }
  // type: 'speaker'|'lights'|'outlet'|'tv'|'alarm'
  // assignedTo: 'music'|'lights'|'outlets'|'tv'|'security'|'ignore'
  discovered: { devices: [], lastScan: null },
};

export function useIntegrations() {
  const [config, setConfig] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('hdg-integrations') || '{}');
      return { ...DEFAULT_INTEGRATIONS, ...raw };
    } catch (e) { return { ...DEFAULT_INTEGRATIONS }; }
  });
  // setConfig + localStorage write. Functional setter form -- crucial when
  // multiple setIntegration calls land in the same render tick (e.g. the
  // .env.local one-shot seed touches plejd + tibber + weather back-to-back).
  // Without the functional form, each closure'd `config` was the same stale
  // value and later calls would clobber earlier ones.
  const persist = useCallback((updater) => {
    setConfig((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      try { localStorage.setItem('hdg-integrations', JSON.stringify(next)); } catch (e) {}
      return next;
    });
  }, []);
  const setIntegration = useCallback((id, patch) => {
    persist((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch } }));
  }, [persist]);
  const status = useCallback((id) => {
    const c = config[id] || {};
    switch (id) {
      case 'weather': return c.lat && c.lon ? 'configured' : 'default';
      case 'plejd':   return c.url ? 'configured' : 'not-configured';
      case 'sonos':   return c.url ? 'configured' : 'not-configured';
      case 'shelly':  return (c.devices?.length ?? 0) > 0 ? 'configured' : 'not-configured';
      case 'tibber':  return c.token ? 'configured' : 'not-configured';
      default: return 'not-configured';
    }
  }, [config]);
  return { config, setIntegration, status };
}
