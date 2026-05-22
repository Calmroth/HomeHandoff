// useSpotifyEmbed — wraps the iFrame API into a React-friendly hook. Returns
// an `attach` ref-callback for the container div (the API injects an iframe
// inside it), a `state` object with isPaused/position/duration, and play/
// pause/seek/skip helpers. The controller is created once; URI changes call
// loadUri so the iframe never reloads (audio doesn't blip between sources).

import { useState, useEffect, useRef, useCallback } from 'react';

const spotifyIFrameApi = new Promise((resolve) => {
  if (typeof window === 'undefined') return;
  if (window.__hdgSpotifyApi) { resolve(window.__hdgSpotifyApi); return; }
  const original = window.onSpotifyIframeApiReady;
  window.onSpotifyIframeApiReady = (api) => {
    window.__hdgSpotifyApi = api;
    if (typeof original === 'function') try { original(api); } catch (e) {}
    resolve(api);
  };
});

export function useSpotifyEmbed(uri) {
  const controllerRef = useRef(null);
  const elementRef = useRef(null);
  const [state, setState] = useState({ isPaused: true, isBuffering: false, position: 0, duration: 0 });
  const lastUriRef = useRef(uri);

  const create = useCallback((api) => {
    const el = elementRef.current;
    if (!el || controllerRef.current) return;
    // Use a safe default URI for the controller; loadUri() updates it once the
    // user picks something. Passing null would cause the iFrame API to error.
    const initUri = lastUriRef.current || 'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M';
    api.createController(el, { uri: initUri, width: '100%', height: '100%' }, (controller) => {
      controllerRef.current = controller;
      controller.addListener('playback_update', (e) => {
        if (e?.data) setState(prev => ({ ...prev, ...e.data }));
      });
      controller.addListener('ready', () => {
        // If we launched with the fallback URI, immediately pause so nothing plays.
        if (!lastUriRef.current) controller.pause?.();
      });
    });
  }, []); // intentional: create only on initial attach; URI updates handled below

  const attach = useCallback((el) => {
    elementRef.current = el;
    if (!el) return;
    spotifyIFrameApi.then(create);
  }, [create]);

  // Load new URI when it changes — the controller stays the same, just
  // tells the embed to point at a new resource.
  useEffect(() => {
    if (lastUriRef.current === uri) return;
    lastUriRef.current = uri;
    if (controllerRef.current && uri) controllerRef.current.loadUri(uri);
  }, [uri]);

  const togglePlay   = useCallback(() => controllerRef.current?.togglePlay(), []);
  const play         = useCallback(() => controllerRef.current?.play(), []);
  const pause        = useCallback(() => controllerRef.current?.pause(), []);
  // The iFrame API has no track-skip; we approximate with a +/-15s seek.
  // Web Playback SDK has real next/prev but requires a Premium token.
  const seekRel = useCallback((deltaSec) => {
    const c = controllerRef.current;
    if (!c) return;
    setState(prev => {
      const newPos = Math.max(0, Math.min(prev.duration || 0, (prev.position || 0) + deltaSec * 1000));
      c.seek(newPos / 1000);
      return { ...prev, position: newPos };
    });
  }, []);

  return { attach, state, togglePlay, play, pause, seekRel };
}
