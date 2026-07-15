// Solar-phase backdrop selection.
//
// The council picked sunrise/sunset over hour buckets unanimously: "the room
// genuinely behaves differently at dusk" (First Principles). Hour buckets
// like "5-9 = sunrise" are wrong in Stockholm in December (sunrise at 8:45)
// and wrong in Stockholm in June (sunrise at 3:40). suncalc + lat/lon gives
// the actual terminator.
//
// The selection rules mirror the README's spirit but on the real sun, not
// the wall clock:
//
//   nautical twilight or earlier (sun > 12° below horizon)  -> night
//   civil twilight at dawn (-6° rising)                      -> sunrise
//   sun risen, before noon                                   -> day
//   sun risen, afternoon                                     -> day (weather decides)
//   civil twilight at dusk (-6° falling)                     -> sunset
//   nautical twilight or later                               -> night
//
// Weather still overrides: during day, "rain" and "snow" pick their own
// backdrops; "clear" and "cloudy" both fall through to the daylight photo,
// which is itself overcast (see DAY_PHOTO below).

import SunCalc from 'suncalc';

const NIGHT_PHOTO    = '/assets/backdrop-night.avif';
const SUNRISE_PHOTO  = '/assets/backdrop-sunrise.avif';
const SUNSET_PHOTO   = '/assets/backdrop-sunset.avif';
const RAIN_PHOTO     = '/assets/backdrop-rain.avif';
const SNOW_PHOTO     = '/assets/backdrop-winter.avif';

// The one daylight photo we have is overcast, so "clear" and "cloudy" share it.
// This used to look like a real choice: backdrop-day.avif was a byte-identical
// copy of backdrop-cabin.avif (same SHA-256), so the branch shipped 111 KB of
// duplicate payload to pick between two names for one picture. Collapsed to the
// truth. Split it again when a genuine sunlit exposure of the cabin exists.
const DAY_PHOTO      = '/assets/backdrop-cabin.avif';

// Where "twilight" sits. SunCalc's `getTimes()` returns named milestones --
// we want the civil-twilight pair (sun 6 degrees below horizon).
function phase(now, lat, lon) {
  const t = SunCalc.getTimes(now, lat, lon);
  const nowMs = now.getTime();
  // Order: nightEnd -> dawn -> sunrise -> solarNoon -> sunsetStart -> sunset -> dusk -> night
  if (nowMs < t.nightEnd?.getTime?.()) return 'night';
  if (nowMs < t.sunriseEnd?.getTime?.()) return 'sunrise';
  if (nowMs < t.sunsetStart?.getTime?.()) return 'day';
  if (nowMs < t.night?.getTime?.()) return 'sunset';
  return 'night';
}

// Pick the right backdrop. `lat`/`lon` may be falsy (user hasn't shared
// location yet) -- we fall back to a coarse wall-clock heuristic that's
// "good enough" for the demo and clearly upgraded on real coords.
export function pickBackdrop(now, weather, lat, lon) {
  let p;
  if (lat != null && lon != null) {
    p = phase(now, Number(lat), Number(lon));
  } else {
    // Fallback (no location yet) -- the old hour-bucket rule.
    const h = now.getHours();
    if (h >= 21 || h < 5) p = 'night';
    else if (h < 9) p = 'sunrise';
    else if (h < 17) p = 'day';
    else p = 'sunset';
  }
  if (p === 'night')   return NIGHT_PHOTO;
  if (p === 'sunrise') return SUNRISE_PHOTO;
  if (p === 'sunset')  return SUNSET_PHOTO;
  // Daytime -- weather decides.
  if (weather === 'rain') return RAIN_PHOTO;
  if (weather === 'snow') return SNOW_PHOTO;
  return DAY_PHOTO; // 'clear' and 'cloudy' -- one overcast photo serves both
}

// Optional helper exposed for UI ("17 minutes until sunset"). Returns
// `{ next: 'sunset'|'sunrise'|'night', minutes: 17 }` -- null if no
// location available.
export function nextTransition(now, lat, lon) {
  if (lat == null || lon == null) return null;
  const t = SunCalc.getTimes(now, Number(lat), Number(lon));
  const ordered = [
    { name: 'sunrise', at: t.sunriseEnd },
    { name: 'noon',    at: t.solarNoon },
    { name: 'sunset',  at: t.sunsetStart },
    { name: 'night',   at: t.night },
  ].filter(x => x.at && x.at.getTime() > now.getTime());
  if (ordered.length === 0) return null;
  ordered.sort((a, b) => a.at.getTime() - b.at.getTime());
  const next = ordered[0];
  return { next: next.name, minutes: Math.round((next.at.getTime() - now.getTime()) / 60000) };
}
