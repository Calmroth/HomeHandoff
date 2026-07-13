# Design System — Home Domain

Codifies the design tokens, patterns, and constraints already established in
`src/tokens.css` and `src/App.jsx`. This is the contract new UI must follow.
Sibling reference docs in this folder: `CONVENTIONS.md`, `ARCHITECTURE.md`,
`STRUCTURE.md`.

> **Last reconciled with code:** 2026-05-23 (after the visual-hierarchy pass:
> `.section-title` ↔ `.section-summary` inversion, weather hero demotion,
> Wi-Fi pill chrome treatment, Settings active-row stripe).

---

## 1. Stack & constraints

- React 18 + Vite + **vanilla CSS** (no Tailwind, no shadcn, no CSS-in-JS).
- Single theme: **clay** (warm dark on a photo backdrop). Multi-theme support
  was removed; do not reintroduce.
- Color space: `oklch()`. All color mixing via `color-mix(in oklch, …)`.
- Safari < 16.4 fallback: every `color-mix()` rule has a flat-value default
  defined **before** the `@supports (color: color-mix(in oklch, red, blue))`
  block at the top of `tokens.css` (lines 102–126). New tokens MUST follow
  the same pattern.
- iPad 6th gen (Safari 12–15) is a real device — no feature CSS without a
  fallback.

---

## 2. Color tokens

### Layer 1 — primitives (ramps)

| Token | Use it for |
|---|---|
| `--clay-50 / 100 / 200 / 300 / 400` | Foreground, muted text |
| `--clay-500 / 600 / 700` | Reserved (gradients, low-priority strokes) |
| `--clay-800 / 850 / 900 / 950` | Surface ramps; popover, sidebar, background |
| `--amber-300 / 400 / 500 / 600` | The single accent ramp. `--amber-400` is the canonical brand |
| `--red-500` | Destructive |
| `--green-500` | Healthy / live |
| `--chart-1 / 2 / 3` | Lights / Outlets / Speakers — keep stable across views |

### Layer 2 — semantic

| Token | Maps to | Use it for |
|---|---|---|
| `--background` | `--clay-950` | Page background under the photo wash |
| `--foreground` | `--clay-50` | Primary text |
| `--muted-foreground` | `--clay-400` | Secondary text, labels |
| `--popover` | `--clay-850` @ 92% | All card and panel surfaces |
| `--primary` | `--amber-400` | The single accent. Use **sparingly** |
| `--primary-foreground` | `--clay-900` | Text on a primary fill (e.g. brand-mark) |
| `--border` | `--clay-50` @ 8% | Default 1px borders |
| `--border-strong` | `--clay-50` @ 14% | Borders that need to read |
| `--ring` | `--amber-400` | Focus outlines (always 2px, 2px offset) |
| `--destructive` | `--red-500` | Errors, destructive confirmations |
| `--sidebar` | `--clay-950` @ 92% | Sidebar + bottom-nav surfaces |
| `--amber-tint-4 / 10 / 24` | `color-mix` of primary | Callout backgrounds, status fills |

### Rules

- **Amber is the only accent.** A second brand color does not exist. If you
  feel you need one, you don't — promote contrast via weight, size, or
  position instead. Audit: every new use of `var(--primary)` must be the
  single highest-priority interactive element in its container.
- **No hex literals.** All color via tokens or `color-mix()`. Exceptions:
  pure `oklch(0 0 0)` for true black (vinyl-hole gradient inner).
- **Status palette is functional, not decorative.** `--green-500` =
  healthy. `--amber-400` (as alert) = degraded. `--destructive` = down.
  Don't use any of them for branding.
- **Background photo is the canvas, not a texture.** `.bg-photo` is the
  base layer at `z-index: 0`. Everything sits on its `.bg-wash` darkening
  gradient. Don't paint over the photo without a wash.

### z-index ladder

Locked in `tokens.css` comment at ~line 797.

| z | Surface |
|---|---|
| 0 | `.bg-photo` |
| 1 | `.bg-wash` |
| 2 | app shell — sidebar, main content, cards |
| 20 | `.startup-screen` |
| 30 | `.persistent-player` (idle) |
| 40 | `.persistent-player` (active on music page) |
| 60 | `.np-picker` speaker popover |
| 70 | `.env-seed-prompt` |
| 80 | `.music-picker` modal |

New layers MUST claim a slot in this comment. Do not improvise.

---

## 3. Type scale

| Class / Var | Size | Weight | Tracking | Use |
|---|---|---|---|---|
| `.clock-hero-time` | `clamp(48px, 8vw, 120px)` | 100 mono | -0.06em | Header hero clock (always the page focal) |
| `.greeting`, `.startup-title` | 28–36px | 200 heading | -0.03em | Page-level hero copy |
| `.np-title`, `.master-title` | 18px | 500 | -0.01em | Card-level title |
| `.scene-label`, `.outlet-name` | 14px | 500 | — | Tile-level title |
| `.section-summary` | **14px** | 400 fg | -0.005em | **Live data — the content** (inverted 2026-05-23) |
| `body`, `.np-artist` | 12–13px | 400 muted | — | Body / secondary |
| `.section-title` | **10px** | 600 muted | 0.18em uppercase | **Label only — the chrome** |
| `.weather-hero-time`, `.legend-name` | 10–11px | 500 muted | 0.12–0.18em uppercase | Eyebrow labels |
| `.mpw-time`, `.np-progress` mono | 11px | mono tabular-nums | 0.04em | Numeric data |

### Rules

- **Hierarchy jumps must be ≥1.5× per tier.** A 16→18px jump is not
  hierarchy; it's noise. Match the table above or invent a new tier.
- **Section heads are inverted from convention.** `.section-summary`
  (the live data) is the foreground voice; `.section-title` (the label)
  is the small uppercase tag. Touching `tokens.css:436–450` re-inverts
  the whole dashboard — only do it deliberately.
- **`tabular-nums` for any rendered number that ticks.** Time, watts,
  percent, count. Stops layout jitter on each update.
- **Heading font** = `--font-heading` (Albert Sans). **Mono** =
  `--font-mono` (Geist Mono). These ship with the app; do not introduce
  a third family.

---

## 4. Motion

```
--motion-duration-fast: 150ms   /* hover, active, tap */
--motion-duration-base: 300ms   /* state change, panel slide */
--motion-duration-slow: 500ms   /* reserved — backdrop crossfade */
--motion-ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1)
--motion-ease-out-expo:  cubic-bezier(0.16, 1, 0.3, 1)  /* reserved */
```

### Rules

- **Default to `fast` for direct manipulation** (slider thumb, toggle,
  button press) and `base` for state changes (panel mount, theme tint).
  Slow is reserved for backdrop crossfade — do not use it elsewhere
  without checking the comment in `tokens.css`.
- **Always pair duration with an ease.** Linear is a smell here; the
  product is calm/lived-in, not technical.
- **`prefers-reduced-motion: reduce` MUST be honored** for any animation
  > 200ms or any continuous motion (spinners, pulse, breath). See
  `.integration-dot` pattern (`tokens.css:1083`) as the canonical example
  — animation: none !important inside the media query.
- **rAF-driven motion** (the music-player disc spin, the FFT mixer) needs
  the same treatment: pause idle motion when reduced-motion is active.
  See `Animation` section in `MusicPlayerWidget.jsx` — currently partial,
  flagged in the music-player UI-REVIEW.

---

## 5. Layout rhythm

```
--page-pad-x:  clamp(1rem,   3.5vw, 3rem)
--page-pad-y:  clamp(1.25rem, 4vw,  2.5rem)
--section-gap: 2.5rem        /* between <Section> blocks */
--group-gap:   1rem          /* between groups inside a section */
--row-gap:     0.75rem       /* between rows inside a group */
```

### Rules

- **Use the rhythm tokens, not raw pixels**, anywhere outside the
  primitives in `tokens.css`. New components reading `padding: 16px` in
  JSX have escaped the system — refactor to a token or a class.
- **2px gap, no rounded corners is the card-stack signature.** Pattern:
  `.stack { display: flex; flex-direction: column; gap: 2px; }` /
  `.grid-stack { display: grid; gap: 2px; }`. The 2px gap is the visual
  rhythm of every dashboard tile (`.scene`, `.light-room`, `.outlet`,
  `.sensor-tile`, `.speaker`). Don't add `border-radius` to anything that
  lives in a stack. Standalone components (e.g.
  `MusicPlayerWidget`) may break this rule deliberately; the stack rule
  only applies inside dashboard sections.
- **Inside the stack**, use the `--popover` surface (`color-mix(in oklch,
  var(--clay-900) 88%, transparent)`) with backdrop-blur 25px. This is
  the universal card. Don't invent new surface treatments — vary content,
  not chrome.

---

## 6. Component patterns

### `<Section>`

The sole sectioning primitive on every page. Lives in `App.jsx:2462`.

```jsx
<Section title="Lights" statusId="plejd" source="3 rooms · live"
  summary={<><b>{onCount}</b> of <b>{rooms.length}</b> rooms · <b>{Math.round(litWatts)} W</b></>}>
  {/* children */}
</Section>
```

- `title` — uppercase chrome label, smallest type (10px).
- `summary` — the live data, dominant type (14px foreground). When in
  doubt, this is where numbers go.
- `source` — provenance / scope, monospace (e.g. `local`, `3 rooms · live`).
- `statusId` — optional integration id for the breathing dot. Use only
  when the section is backed by an external integration; never for purely
  local sections (Scenes, Activity).

### Card-stack tile (`.scene`, `.light-room`, `.outlet`, etc.)

- 2px gap, no border-radius, `.popover` surface with backdrop-blur 25px.
- Tile padding 14–18px, never less.
- 116px min-height for grid tiles (locked by `.scene`, `.sensor-tile`).
  Don't go smaller; the kitchen iPad needs comfortable hit targets.
- Active state: amber tint via `color-mix(in oklch, var(--amber-400) ~20%,
  …)`. Inactive: clean `--popover`. No third state without a comment.

### Status dots (`<IntegrationStatusDot id>`)

The only mechanism for "is this thing alive?" anywhere in the UI. 6px
circle, four states, lives in `App.jsx:2541` and `tokens.css:1069`.

| State | Color | Motion |
|---|---|---|
| `empty` | `clay-50` @ 22% | none |
| `ok` | `--green-500` + 6px glow | none |
| `degraded` | `--amber-400` | `int-breath` (2.4s) |
| `down` | `--destructive` + 8px glow | `int-pulse` (1.4s) |

**No toasts.** Ever. The dot is the entire failure UI. If a new mechanism
is being proposed, the answer is to extend the dot's state machine.

### Hit-area (WCAG 2.2 AAA)

Visual control + invisible `::before` to expand to 44×44 px without
shifting layout. Pattern in `.np-btn::before`, `.power-toggle::before`,
`.mpw-ctrl::before`.

```css
.my-btn { width: 36px; height: 36px; position: relative; }
.my-btn::before { content: ''; position: absolute; inset: -4px; }
```

Every interactive control under 44px MUST have this. No exceptions.

### Focus visible

```css
:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}
```

Defined globally at `tokens.css:181`. Don't override per-component; if a
custom outline is needed, override `outline-color` only.

### `data-on / data-active` over `.active`

State is expressed as data attributes, never via a class:

```jsx
<button className="scene" data-active={activeScene === scene.id}>
```

Selectors target `[data-active="true"]`. Reasons:
1. The attribute is a more honest signal — it's a value, not a flag.
2. Boolean toggles in React are easier to express via attribute than
   string-concatenated `className`.

### "Hold to commit" for destructive

Master-toggle and any other destructive action uses the `HoldToggle`
component (`.hold-btn` in `tokens.css:1310`). A second deliberate gesture
beats a confirm dialog for a kitchen iPad — children won't trigger it
accidentally, adults learn it in one demo.

### Two-step destructive confirm (settings)

For destructive actions in modal-free forms: first click arms, second
commits, auto-disarm after 3s. Pattern in `SettingsPage` sign-out
(`App.jsx:6359`). Use this over native `confirm()` dialogs.

---

## 7. Naming conventions

| Surface | Convention | Example |
|---|---|---|
| CSS tokens | `--kebab-case`, prefixed by domain | `--motion-duration-fast` |
| CSS classes | `kebab-case`, no BEM, no namespace per component | `.scene`, `.light-room`, `.mpw-ctrl` |
| New self-contained components | Class prefix unique to the component | `.mpw-*` for MusicPlayerWidget |
| React hooks | `use` + camelCase | `useGoogleAuth` |
| Store setters | `set` + PascalNoun, `patch` + PascalNoun | `setRooms`, `patchOutlet` |
| localStorage keys | `hdg-` prefix, kebab-case | `hdg-integrations`, `hdg-sp-token` |
| Files (lib, store, hooks) | camelCase, no namespace | `useHomeStore.js`, `secureStore.js` |
| Files (components) | PascalCase + matching CSS file | `MusicPlayerWidget.jsx` + `musicPlayerWidget.css` |

---

## 8. Accessibility — the actual contract

- **Contrast.** Foreground (`--clay-50`) on `--popover` is well above
  14:1. `--muted-foreground` on `--popover` is comfortably above 4.5:1
  for ≥11px text. Don't drop body text below 11px on `--popover` — the
  ratio falls under 4.5:1.
- **44px hit area on everything tappable.** See section 6.
- **`aria-label` on icon-only controls.** Match state: a shuffle toggle
  is not "Shuffle" — it's `aria-label="Shuffle, currently {on|off}"` plus
  `aria-pressed={state}`. Pattern in `MusicPlayerWidget`.
- **`alt` text on cover art / album art / avatars.** Decorative SVG
  icons inside buttons should be `aria-hidden="true"` since the button
  carries the label.
- **`prefers-reduced-motion`** disables continuous motion. See section 4.
- **`<Text selectable />` equivalent** for any data the user might want to
  copy (sensor values, addresses, IDs). For web, that's just not blocking
  text selection (no `user-select: none` on data).
- **Focus must be reachable via keyboard for every interactive surface.**
  This explicitly includes "click-only" delight features (e.g. zoom-on-
  click). Use a `<button>` (gets keyboard for free) over a `<div
  onClick>` (does not).

---

## 9. Anti-patterns — do not ship these

- Multiple competing focal points in a single header / card / section.
  If two things compete, one is wrong.
- Equal-weight section titles across a dashboard — the everything-is-
  important trap.
- Status colors used for branding (green for "go" buttons, red for
  "no" buttons that aren't destructive). Reserved palette only.
- Soft pillowy radii on stack tiles (the stack is **sharp**, no radius).
- `border-radius` higher than 16px on anything other than a circle. The
  product language is sharp + subtly-soft, not iOS-blobby.
- `<div onClick>` for new interactive surfaces. Use `<button>` and let
  the browser give you keyboard + focus + role for free.
- `confirm()`, `alert()`, `prompt()` — none of these are family-iPad-
  friendly. Use the inline two-step pattern or HoldToggle.
- Toast notifications. **There are zero toasts in the codebase. Keep
  it that way.** The status-dot state machine is the failure UI.
- A second accent color. The brand is one warm-amber. Promote contrast
  via size, weight, or whitespace instead.

---

## 10. Adding to this contract

When a new component, color, motion, or layout pattern needs to enter
the system:

1. **First check if an existing primitive already does the job.** Most
   "I need a new card" answers are "use `<Section>` + a stack child."
2. **If a new token is needed**, add it to `tokens.css` with a comment
   explaining what it's for and what it replaces. Tokens marked
   `/* reserved */` exist for shadcn primitive parity — don't recycle
   them without checking the comment.
3. **If a new class is needed**, namespace it if the component is
   self-contained (e.g. `.mpw-*`). Otherwise add it to its logical block
   in `tokens.css`.
4. **Update this document** in the relevant section. If the pattern is
   load-bearing (status dots, hit-area, hold-to-commit, the section head
   inversion), add it to section 6 with a code anchor.
5. **Run the 5-second test** from `CLAUDE.md` against the home page if
   the change touches anything on `HomePage`. A family member who didn't
   set this up still has to be able to control the house in under 5
   seconds.
