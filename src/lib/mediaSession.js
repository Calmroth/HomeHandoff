// MediaSession bridge. The council's "ambient ubiquity" pick (Expansionist)
// + Outsider's "music controls work from the lockscreen" magic. Wires the
// browser's MediaSession API to the live Spotify Connect state so that:
//
//   - the phone's lockscreen shows album art + title + artist
//   - hardware play/pause / next / prev (AirPods, headphones, BT keyboard,
//     car BT, watch) drive playback on whatever Spotify Connect target is
//     active right now
//
// This is most useful on a phone or a touch laptop running the dashboard --
// on a wall-mounted iPad in standalone PWA mode it's a no-op until iPadOS
// catches up.
//
// React integration is via `useMediaSession(playback, controls)` which is a
// thin wrapper over the imperative DOM API. Returns nothing (the API is
// global, not per-instance) and tears down on unmount.

import { useEffect } from 'react';
import { featureSupported } from './secureContext.js';

export function useMediaSession(playback, controls) {
  useEffect(() => {
    if (!featureSupported.mediaSession()) return;
    if (!playback?.track) {
      // Empty state -- clear metadata so the lockscreen doesn't show stale
      // album art from a previous session.
      try { navigator.mediaSession.metadata = null; } catch (e) {}
      try { navigator.mediaSession.playbackState = 'none'; } catch (e) {}
      return;
    }

    // 1. Metadata -- this is what the lockscreen / control center shows.
    try {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: playback.track,
        artist: playback.artist || '',
        album: playback.album || '',
        artwork: playback.art ? [
          { src: playback.art, sizes: '300x300', type: 'image/jpeg' },
          { src: playback.art, sizes: '512x512', type: 'image/jpeg' },
        ] : [],
      });
    } catch (e) {}

    // 2. Playback state -- needed so the lockscreen shows the correct
    //    play/pause icon and so iOS keeps the controls alive.
    try {
      navigator.mediaSession.playbackState = playback.isPlaying ? 'playing' : 'paused';
    } catch (e) {}

    // 3. Action handlers -- the lockscreen / hardware key invokes these.
    //    Each one is best-effort; if the controls object doesn't supply a
    //    given action we just don't register it and the browser disables
    //    the corresponding button.
    const actions = {
      play:           controls?.play,
      pause:          controls?.pause,
      nexttrack:      controls?.next,
      previoustrack:  controls?.previous,
      stop:           controls?.stop,
    };
    const registered = [];
    for (const [action, handler] of Object.entries(actions)) {
      if (typeof handler !== 'function') continue;
      try {
        navigator.mediaSession.setActionHandler(action, () => {
          try { handler(); } catch (e) {}
        });
        registered.push(action);
      } catch (e) {
        // Browser doesn't support this action -- ignore.
      }
    }

    return () => {
      // Clear handlers on unmount / dep change so an old `controls` closure
      // doesn't fire stale callbacks against a torn-down React tree.
      for (const action of registered) {
        try { navigator.mediaSession.setActionHandler(action, null); } catch (e) {}
      }
    };
  }, [playback?.track, playback?.artist, playback?.album, playback?.art, playback?.isPlaying, controls?.play, controls?.pause, controls?.next, controls?.previous, controls?.stop]);
}
