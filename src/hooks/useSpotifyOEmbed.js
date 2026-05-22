// useSpotifyOEmbed — fetches the public oEmbed thumbnail + title for any
// Spotify resource (album/playlist/track/artist). No auth needed and CORS-
// friendly. Used for the album cover and human-readable title in the header
// player. Cached in-memory so navigating back to the same source is instant.

import { useState, useEffect } from 'react';

const oembedCache = new Map();

export function useSpotifyOEmbed(type, id) {
  const [data, setData] = useState(() => {
    const k = `${type}/${id}`;
    return oembedCache.has(k) ? oembedCache.get(k) : null;
  });
  useEffect(() => {
    if (!type || !id) { setData(null); return; }
    const k = `${type}/${id}`;
    if (oembedCache.has(k)) { setData(oembedCache.get(k)); return; }
    let cancelled = false;
    const url = `https://open.spotify.com/oembed?url=${encodeURIComponent(`https://open.spotify.com/${type}/${id}`)}`;
    fetch(url).then(r => r.ok ? r.json() : null).then(j => {
      if (cancelled || !j) return;
      const next = { title: j.title, thumb: j.thumbnail_url, author: j.author_name || j.provider_name };
      oembedCache.set(k, next);
      setData(next);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [type, id]);
  return data;
}
