---
slug: music-player-widget
date: 2026-05-21
type: ui-review
scope: quick-task
review_mode: code-only
target_files:
  - src/components/MusicPlayerWidget.jsx
  - src/components/musicPlayerWidget.css
overall_score: 20/24
---

# UI Review — MusicPlayerWidget

Retroactive 6-pillar visual audit of the standalone music-player widget shipped
as a quick task on 2026-05-21. Code-only review — no Playwright MCP available
in this session, widget was not rendered in a browser. Visual claims below are
inferred from the JSX class structure and the CSS rules against this project's
existing token system in `src/tokens.css`.

## Score Summary

| Pillar | Score |
|--------|-------|
| Copywriting | 3/4 |
| Visuals | 4/4 |
| Color | 4/4 |
| Typography | 3/4 |
| Spacing | 3/4 |
| Experience Design | 3/4 |
| **Total** | **20/24** |

Verdict: **ship-ready with three concrete polish items below**. None block use;
all are improvements rather than fixes.

---

## 1. Copywriting — 3/4

**What's present**

- `aria-label` on every control: "Shuffle", "Previous", "Pause"/"Play",
  "Next", "Loop".
- `<img alt={`${title} -- ${artist}`}>` on cover layers — meaningful, not
  decorative.
- No body copy, no empty-state copy, no error copy.

**Findings**

- `aria-label="Shuffle"` doesn't communicate *state*. Screen-reader users
  hear "Shuffle button" but not whether shuffle is currently on or off. Same
  for loop. Should be `aria-pressed={shuffled}` on the toggle buttons, and
  `aria-label="Loop, currently {off|all|one}"`.
- The component crashes on `tracks={[]}` (see Experience Design). There's no
  empty-state UI to write copy for because the empty state isn't handled at
  all.
- Alt text uses `--` (two hyphens) instead of `—` (em dash) to satisfy
  ASCII safety in the source — fine, but the rest of the project uses em
  dashes freely in user-visible strings. Pick a side; minor.

## 2. Visuals — 4/4

**What's present**

- Spinning vinyl disc with cover art, momentum-based velocity, parking-snap
  when zoomed.
- Burst rotation (±360° eased) on track skip — direction-aware (prev =
  +360, next = -360).
- Crossfade between cover layers on track change — entering layer scales
  from 1.08 to 1.0, exiting layer fades to 0.9. Two layers coexist for the
  560ms transition window.
- 10×10 FFT-reactive dot grid (`ScalesMixer`) using bin-banded energy.
  Continues idle motion when paused so the widget never looks dead.
- Vinyl center hole with radial gradient + inner-ring shadow — small
  signature detail that elevates the piece.
- Zoom-on-click for the disc; signals interactive without a hint.

**Findings**

- No broken-image fallback for cover art. A 404 cover would show the
  browser's broken-image glyph framed in a circle. Add `onError` swap to a
  CSS gradient (the existing `.np-art` block in `tokens.css` has a perfect
  pattern to copy — three layered radial gradients).
- The two-layer cover stack permanently keeps the newest layer after the
  exit timeout (`setLayers((prev) => prev.filter(l => l.id === id))`).
  Verified — the old layer is correctly garbage-collected.

## 3. Color — 4/4

**What's present**

- Tokens used: `--popover`, `--border`, `--primary`, `--foreground`,
  `--muted-foreground`, `--clay-50/900/950`, `--ring`, `--motion-*`,
  `--font-sans/heading/mono`.
- No hex literals outside the existing `oklch(0 0 0)` for the vinyl-hole
  inner. Acceptable — pure black has no semantic equivalent in the token
  layer and is correct here.
- Amber primary used only on (a) the FFT mixer (`fill: currentColor` with
  `color: var(--primary)`) and (b) toggle buttons when active. Disciplined
  accent use.
- `color-mix(in oklch, ...)` follows the existing Safari fallback pattern in
  `tokens.css`. No rogue gradients on the mark.

**Findings**

- Contrast: `--foreground` (clay-50) on the popover surface is well above
  14:1. `--muted-foreground` (clay-400) on the same surface is comfortably
  above 4.5:1 for the 11–13px labels.
- The vinyl-hole gradient stops at `oklch(0 0 0)` — pure black — which is
  one perceptual step deeper than `--clay-950`. Intentional and reads as a
  hole rather than a darker surface.

## 4. Typography — 3/4

**What's present**

- Track title: `--font-heading` (Albert Sans), 20px, weight 200, tracking
  `-0.02em`. Matches the project's `.greeting`/`.startup-title` heading
  treatment.
- Artist label: 11px uppercase, tracking `0.18em`, weight 500 — matches the
  existing `.section-title` / `.np-label` pattern in `App.jsx`.
- Time display: `--font-mono` (Geist Mono), 10px, tabular-nums. Matches
  `.np-progress`'s 11px mono treatment.

**Findings**

- 10px mono time labels are at the lower edge of legibility on the kitchen
  iPad at typical viewing distance (~60–90 cm). The rest of the app uses
  10–11px sparingly and only on secondary metadata. Recommend bumping to
  11px to match `.np-progress`.
- The track title uses `text-overflow: ellipsis` with `white-space: nowrap`
  — long titles silently truncate. The existing app pattern for long names
  is to ellipsis at the card boundary, so this is consistent, but consider
  a marquee or two-line wrap for the kitchen-iPad use case where users walk
  past and want to read the full title.
- Heading weight 200 is correct for the hero `.startup-title` (36px) but
  feels thin at 20px. The closest app analog is `.np-title` at 18px
  weight 500. Worth testing both in browser.

## 5. Spacing — 3/4

**What's present**

- Card: 18px padding, 18px child gaps. Internal `.mpw-info` uses 10px gaps
  between scales, track-info, bar, time, controls — tighter than the outer
  card, gives the info pane a controlled rhythm.
- Disc sizing: `clamp(280px, 70vw, 360px)` — fluid between phone and iPad.
- Controls: 12px gap, 36×36 standard buttons, 48×48 primary play button,
  4px hit-area extension via `::before` for the AAA 44px target.
- `min-height: 52px` on `.mpw-track-info` prevents layout jump when the
  absolute-positioned exit layer mounts above the new layer.

**Findings**

- The widget uses a **24px border-radius** card. The rest of the dashboard
  follows a "2px gaps, no border-radius" card-stack signature (see
  `.stack` and `.grid-stack` in `tokens.css`). This is a deliberate
  divergence because the widget is a self-contained standalone component,
  not a card in the dashboard stack. Defensible — but if it ever lands on a
  page alongside `.scene` / `.light-room` / `.outlet` cards, the radius
  will look out of place. Decide before integration.
- Spacing scale doesn't reference the project's `--page-pad-x`,
  `--section-gap`, `--group-gap`, `--row-gap` rhythm tokens. Acceptable
  because the widget is self-contained, but it means scaling the widget
  alongside the rest of the dashboard requires manual harmonization.

## 6. Experience Design — 3/4

**What's present**

- Keyboard shortcuts: Space (toggle), Arrow Left/Right (seek ±5s),
  Shift+Arrow (prev/next track), S (shuffle), L (loop). Mapping is
  standard and unsurprising.
- `tagName === 'INPUT'` guard prevents shortcuts from firing inside text
  inputs.
- WCAG 2.2 AAA 44px hit-area via invisible `::before` on `.mpw-ctrl`.
- `:focus-visible { outline: 2px solid var(--ring); }` on controls.
- `prefers-reduced-motion: reduce` disables the cover/track-info keyframes
  and the progress-bar `width` transition.
- Web Audio: lazy-connects on first `play` event, handles suspended
  context, cleans up the `AudioContext` on unmount.
- `crossOrigin` prop is correctly wired to `<audio>` so the FFT analyser
  can read frequency data from CORS-friendly sources.

**Findings**

- `tracks={[]}` crashes immediately: `useState(() => [{ id: 0, track:
  tracks[0], dir: null }])` dereferences `tracks[0]` synchronously. Add
  `if (tracks.length === 0) return <EmptyState />` at the top of
  `MusicPlayer`, or guard the layer initializer.
- `audio.play().catch(() => {})` and the cross-track autoplay silently
  swallow all errors. A track with a broken `src` produces no user
  feedback — the play button toggles, nothing happens, no error state. At
  minimum, surface a small error chip; ideally retry-once-then-skip.
- `prefers-reduced-motion` only disables the keyframes. The rAF-driven
  disc spin and FFT mixer continue running. The component's own comment
  acknowledges this. For a strict implementation, the disc spin should
  freeze (or only rotate when actually playing audio, which it already
  does — that may be enough) and the idle mixer should still itself.
- The zoom-on-click affordance is undiscoverable. Acceptable for a delight
  feature, but worth noting that no cursor change, no hover hint, and no
  visible affordance signals "this is interactive."
- `aria-pressed` is missing on toggle buttons (shuffle, loop). Screen
  readers will not announce the state change. See Copywriting.

## Top Fixes

In order of effort × impact:

1. ✅ **Guard `tracks={[]}`.** Done — `MusicPlayer` early-returns an empty
   state card; the actual hook tree moved into `MusicPlayerInner`.
2. ✅ **Add `aria-pressed` to the shuffle and loop toggle buttons** and
   change their `aria-label` to communicate state. Done.
3. ✅ **Cover-art `onError` fallback.** Done — broken `src` triggers the
   `.mpw-cover-fallback` class which paints the `.np-art` triple-radial
   pattern.
4. ✅ **Bump time display from 10px to 11px.** Done.
5. ✅ **Surface play errors.** Done — `safePlay()` wraps every play() call,
   maps the rejection `name` to a human message, and the chip renders
   between the time row and controls. Auto-clears on next successful
   play, on track change, or on user dismiss. Also handles `<audio
   error>` events.

### Hardening pass (post-audit, 2026-05-23)

Three further fixes applied beyond the original top-5:

6. ✅ **Reduced-motion gap.** Added `usePrefersReducedMotion()` hook;
   `ScalesMixer` rAF bails when reduced, `Disc` parks rotation at 0deg
   and disables the burst-on-skip transform when reduced. Cover crossfade
   already opted out via CSS media query in `musicPlayerWidget.css`.
7. ✅ **Disc keyboard a11y.** `mpw-mask` is now `role="button"
   tabIndex={0} aria-pressed={isZoomed}` with Enter/Space key handler.
   Adds `:focus-visible` ring (2px ring, 4px offset). Cursor was already
   `pointer`.
8. ✅ **Global shortcut conflict.** `useKeyboardShortcuts` now bails when
   focus is on any BUTTON / role=button / INPUT / TEXTAREA / SELECT — so
   pressing Space on the focused disc only triggers zoom, not the global
   play-toggle on top of it.

## Out of Scope

- No Playwright screenshot comparison — MCP not available in this session.
- No browser-rendered visual verification — widget not yet integrated into
  any route.
- No keyboard-trap test, no screen-reader test (NVDA/VoiceOver). Both
  recommended before this widget ships to a public surface; lower
  priority for a household app.

---

*Audit performed 2026-05-21 against the files as committed to the working
tree. No agent (gsd-ui-auditor) spawned because the project has no
`.claude/agents/` entry for it and the GSD SDK shell tooling was not
reachable from this session — review performed by orchestrator directly.*
