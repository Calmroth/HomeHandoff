// Routing — hash-based so the prototype works as a flat file with no router lib.
//
// Per-device last-route persistence: the kitchen iPad becomes the kitchen iPad
// by virtue of being where you last opened the music or lights view; reloading
// it returns to that view, not to Home.
//
// If the URL has an explicit hash, that always wins (someone tapped a link or
// pasted a URL). When the hash is empty AND we've saved a route before, boot
// into the saved route. Settings is excluded from the auto-restore so finishing
// OAuth never re-opens the Settings page after a reload.

import { useState, useEffect, useCallback } from 'react';

const ROUTES = ['home', 'rooms', 'music', 'energy', 'weather', 'news', 'settings'];
const LAST_ROUTE_KEY = 'hdg-last-route';

export function useRoute() {
  const read = () => {
    const raw = window.location.hash || '';
    if (raw) {
      const h = raw.replace(/^#\/?/, '');
      return ROUTES.includes(h) ? h : 'home';
    }
    // No hash -- consider the stored bookmark.
    try {
      const stored = localStorage.getItem(LAST_ROUTE_KEY);
      if (stored && ROUTES.includes(stored) && stored !== 'settings') return stored;
    } catch (e) {}
    return 'home';
  };
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onHash = () => setRoute(read());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  // Persist every non-Settings route as the "preferred starting view" for
  // this device. Skip Settings because it's a destination, not a home.
  useEffect(() => {
    if (route && route !== 'settings') {
      try { localStorage.setItem(LAST_ROUTE_KEY, route); } catch (e) {}
    }
  }, [route]);
  const navigate = useCallback((id) => { window.location.hash = '#' + id; }, []);
  return [route, navigate];
}
