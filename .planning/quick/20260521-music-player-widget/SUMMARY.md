---
slug: music-player-widget
date: 2026-05-21
type: quick
status: complete
---

# Summary — Port MusicPlayer widget

## Outcome

Two files created, no other files touched, no dependencies added.

- `src/components/MusicPlayerWidget.jsx` — TS stripped, default + named
  exports. Contains all sub-components inline (Disc, ScalesMixer, TrackInfo,
  ProgressBar, Controls) and all hooks (useRafLoop, useTransitionSound,
  useAudioAnalyser, useAudioPlayer, useKeyboardShortcuts) — same single-file
  density convention as `src/App.jsx`.
- `src/components/musicPlayerWidget.css` — full stylesheet. The original
  paste only included 4 `@keyframes`; the rest of the rules (`.mpw-card`,
  `.mpw-mask`, `.mpw-spin`, `.mpw-cover`, `.mpw-hole`, `.mpw-scales`,
  `.mpw-track-info`, `.mpw-ti-layer`, `.mpw-bar`, `.mpw-time`,
  `.mpw-controls`, `.mpw-ctrl`, etc.) were authored from the component's
  class usage.

## Key decisions

- **Namespace prefix `mpw-`** on every class. The component originally used
  `.card`, `.bar`, `.controls`, `.scales`, `.cover` — all of which already
  exist in `tokens.css` / `App.jsx` with conflicting meanings.
- **Tokens, not hex.** All colors via `--popover`, `--border`, `--primary`,
  `--foreground`, `--muted-foreground`, `--clay-50/900/950`, `--ring`. All
  timings via `--motion-duration-fast/base` and `--motion-ease-out-quart`.
  All fonts via `--font-sans/heading/mono`.
- **No wire-up.** Component is standalone. Integration into the Music page
  is left to the user; the existing Spotify player on that page remains
  untouched.
- **Web Audio crossOrigin.** `<audio crossOrigin>` is passed through so the
  FFT analyser can read frequency data from cross-origin sources that send
  `Access-Control-Allow-Origin`.

## Verification

- Static review: all referenced tokens exist in `src/tokens.css`. No
  imports outside of `react` (already a project dep).
- Not run in the browser. User can verify by importing both files into a
  test route and rendering with three tracks.

## Risks / follow-ups

- The Web Audio API `createMediaElementSource` permanently routes the audio
  element's output through the analyser. If the user later wires this
  widget into a shared player that also feeds other audio paths, that
  rerouting can interfere. Worth noting if integration changes.
- Cover art `<img>` and audio `src` come from the consumer's `tracks` prop;
  no sanitisation in the widget. Acceptable for LAN-only family app.
- No unit tests — consistent with project's "manual verification only"
  policy in CLAUDE.md.

## Files changed

```
src/components/MusicPlayerWidget.jsx    (new, ~600 lines)
src/components/musicPlayerWidget.css    (new, ~270 lines)
.planning/quick/20260521-music-player-widget/PLAN.md     (new)
.planning/quick/20260521-music-player-widget/SUMMARY.md  (this file)
.planning/STATE.md                                       (Quick Tasks table added)
```
