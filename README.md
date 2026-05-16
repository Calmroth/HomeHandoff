# Handoff: Home Control Surface

## Overview

A single-page **home control surface** for a multi-vendor smart home — the Home page of the Home Domain product (Plejd lights, Shelly outlets, Tibber energy, Sonos speakers, Spotify Web). One screen lets a non-technical household member control **lights, power, and sound** in as few taps as possible, with a music web player as the hero and an at-a-glance clock + weather + Wi-Fi status as the header.

The product principle is *"the device speaks like a confident appliance, not a chatty assistant"* (see `PRODUCT.md` in the source repo). Quick control is the primary job on every screen; glanceable status is secondary; configuration is rare and lives elsewhere.

## About the Design Files

The files in this bundle are **design references created in HTML/JSX**. They are prototypes showing the intended look and behavior — they are **not production code to ship as-is**. Your task is to **recreate this design in the target codebase** (Next.js + Tailwind v4 + shadcn-style components, per `DESIGN.md`/`AGENTS.md` in the source repo) using its established patterns, design tokens, and component primitives.

The source repo already has the design system (Tailwind v4 tokens in `src/app/globals.css`, primitives in `src/components/ui/*`, layout in `src/components/layout/*`). This handoff **replaces the existing dashboard page (`src/app/page.tsx`)** with the new control-first layout. Keep:

- The existing token layer (`--clay-*`, `--amber-*`, `--popover`, `--primary`, etc.) as defined in `globals.css`
- The existing primitives (`Card`, `Button`, `Switch`, `Slider`, `Badge` from `src/components/ui/*`)
- The existing `<AppShell>`, `<Sidebar>`, `<PageTransition>` in `src/components/layout/*`
- The weather-bg system in `src/lib/weather-bg.ts` (this design uses the same time-of-day/weather → photo mapping)

This handoff **adds** the typography/layout direction (Helvetica-stack hairline type, lifted-to-top header with big clock + weather, light "Clear" theme option) and **replaces** the dashboard card grid with a 4-section control surface.

## Fidelity

**High-fidelity.** Exact colors, type scale, weights, spacing, and interactions are specified. Recreate pixel-perfectly using the codebase's existing libraries. Reuse `Card`, `Switch`, `Slider`, `Button` from `@/components/ui/*`. Do **not** copy the prototype's hand-rolled `Slider` / `Toggle` — use the base-ui-backed primitives already in the repo.

---

## Page structure

The page is a single scrollable column inside `<AppShell>` (which provides the fixed 256px sidebar). Each section is a `<section>` with a small uppercase eyebrow + summary, then its content. Section order, top to bottom:

1. **Header** (no surface, no card — bare type over the photo backdrop)
2. **Music** — Spotify Web Embed (hero, full-width)
3. **Sound** — per-room speakers (4-up grid)
4. **Lights** — All-lights master row + room cards (4-up grid with brightness sliders)
5. **Power** — outlet list (left) + live-draw panel (right)
6. **Scenes** — one-tap shortcut chips (Morning / Dinner / Movie / Sleep / All off)
7. **Footer** (one line of meta)

### Page rhythm

- Main padding: `8px 24px 56px` (top is intentionally tight — header sits near the viewport top)
- Section gap (`--section-gap`): `40px`
- Inside each section: `12px` between the section-head and the section content
- **Card-stack signature**: cards inside a section sit with a `2px` gap — no border-radius — so thin slivers of the photo backdrop show through. This is the product's signature; preserve it.

---

## Header

**Layout**: two-column grid, equal height, baseline-aligned.

```
+-----------------------------------------------------------+
| Good afternoon, Mira. · 5 rooms lit · 410 W now           |   <- welcome row
+-----------------------------------------------------------+
| 17:29                          [● ○]  [● 18 on Wi-Fi]     |
| Thursday 14 May                                            |
|                                ☁  +11°                     |
|                                   Light cloud              |
|                                   SUNSET · STOCKHOLM       |
+-----------------------------------------------------------+
```

### Welcome row (top, small)
- Inline: `<greeting>, Mira.` then `·` then `{onCount} rooms lit · {totalW} W now`
- Font size: `12px`, color: `var(--foreground)` for the greeting, `var(--muted-foreground)` for the meta
- Margin bottom: `8px`
- Letter spacing: `0.01em`

### Left hero — Clock
- Time, `HH:MM` 24-hour: `clamp(72px, 9vw, 132px)`, font: `var(--font-mono)` (Geist Mono), weight **100**, tracking `-0.06em`, line-height `0.9`, color: `var(--foreground)`
- Date below: `clamp(18px, 1.4vw, 22px)`, font: `var(--font-heading)` (Helvetica-stack), weight `300`, color: `var(--muted-foreground)`

### Right column — controls strip + weather hero
**Top strip** (Wi-Fi pill — single-theme product, no theme switcher):
- Wi-Fi pill: green pulsing dot + `{count} on Wi-Fi` + `home.local` in mono. Background `color-mix(in oklch, var(--clay-850) 70%, transparent)`, 11px text

**Below the strip** — weather (smaller than the clock):
- 88×88 weather icon, no frame, stroke-width 1, color `var(--primary)`
- Temperature: `clamp(52px, 6vw, 88px)` weight 100 mono inside (use `--font-mono`), tracking `-0.06em`
- Condition label: `14px / weight 400`, color `var(--foreground)`
- Caption: `10px` uppercase, `letter-spacing: 0.18em`, color `var(--muted-foreground)`. Reads `{timeSlot} · Stockholm`

### Greeting text
- "Working late" (h < 5) / "Good morning" (h < 12) / "Good afternoon" (h < 18) / "Good evening" (h ≥ 18)

### No header card
The header has no `bg`, no border, no shadow. Type sits directly on the photo backdrop.

---

## Music section

Full-width hero — the Music section is the most prominent block on the page.

### Layout
Two columns inside one card:
```
[ square Spotify embed ][ now-playing meta ]
       (left ~420px)        (right, flex 1)
```

Grid: `grid-template-columns: minmax(360px, 420px) 1fr; gap: 22px;`

### Card chrome
- `bg-card` (`var(--popover)` semantic token)
- `backdrop-filter: blur(25px)`
- Padding: `20px`
- No border-radius (flat — matches the card-stack signature)

### Left — Spotify Web Embed
- Iframe `<iframe src="https://open.spotify.com/embed/album/<id>?utm_source=generator&theme=0">`
- Container has `aspect-ratio: 1 / 1`, `width: 100%` — the **square aspect ratio** forces Spotify into the "large" layout (full album art + scrollable tracklist). A wide/short iframe shows only the compact bar with whitespace below it; do not change this.
- Container `border: 1px solid var(--border)`, `border-radius: 14px`, `overflow: hidden`, `background: var(--clay-950)` (placeholder while loading)
- The embed is **public** and requires no API or auth — the product's philosophy is to host vendor web UIs as iframes rather than calling vendor APIs

### Right — meta panel
Flex column, space-between:

1. **Label** "NOW PLAYING" — 10px uppercase tracking 0.18em, `color: var(--primary)`
2. **Big title** "Living room is leading" — `22px`, weight 500, tracking `-0.02em` (use `var(--font-heading)`)
3. **Source** `open.spotify.com/embed` — 10px mono, `var(--muted-foreground)`
4. **Streaming-to panel**:
   - Inner box with `bg: color-mix(in oklch, var(--clay-50) 4%, transparent)`, `border: 1px solid var(--border)`, `border-radius: 12px`, `padding: 14px 16px`
   - Header row: small label "STREAMING TO" + mono count "3/4"
   - List rows: 8px colored dot (primary on, muted off) · room name · volume number (mono)
5. **Actions row**: two pill buttons "Cast to room" (active variant) and "Switch source"

---

## Sound section

Per-room speakers in a 4-up grid (`grid-template-columns: repeat(4, 1fr); gap: 2px;`).

### Speaker card
Flat card, `bg-card`, `backdrop-blur: 25px`, padding `18px`, min-height `220px`, flex-col, `gap: 14px`.

Contents:
- Head row (flex space-between):
  - Name (14px, weight 500) + source caption (11px muted, e.g. "Living room", "Now playing", "Standalone")
  - Switch toggle (use existing `<Switch>` primitive)
- Volume row (flex, gap 12px, mt:auto):
  - Volume icon (muted color)
  - `<Slider value={volume} onChange={setVolume}>` filling the row
  - Mono number on the right (13px, min-width 28px)

When `speaker.on === false`: card opacity `0.65`, source caption muted further. Setting volume > 0 turns the speaker on.

### Section head
- Eyebrow: "SOUND" (11px uppercase tracking 0.18em, muted)
- Source: `via sonos.local` (10px muted)
- Summary on the right: `<b>{onCount}</b> of <b>{total}</b> speakers` + pill button "Group all" / "Grouped". The group toggle, when active, switches every speaker on and points them all at the lead room.

---

## Lights section

### Master row
A single `2px`-gap card sitting above the room grid:
- Layout: `grid-template-columns: 1fr auto auto; gap: 16px; padding: 14px 18px;`
- Title "All lights" (13px / 500), sub "5 of 25 bulbs lit" (11px muted)
- Mono count "5/8" on the right
- Switch toggle

### Room grid
`grid-template-columns: repeat(4, 1fr); gap: 2px;` on desktop. 2-up at 1100px, 1-up at 720px.

### Room card (`.light-room`)
- Padding `18px`, min-height `192px`, flex-col, gap `14px`
- Head row: name + bulb-count pill on left, Switch toggle on right
- Brightness block at bottom:
  - Big mono percent "72%" (22px, weight 500)
  - Right-aligned "BRIGHTNESS" label (10px uppercase, 0.14em tracking, muted)
  - Slider (8px tall track, primary fill, 14px round thumb in foreground color)
- When `room.on === true`, the card bg blends amber-400 in proportional to `(0.04 + brightness/100 * 0.18)`. Looks like the bulb glow getting warmer as you turn brightness up.
- A 600ms `flicker` keyframe runs once when a room turns on (a semi-transparent amber overlay that fades in and out).

### Section head
Eyebrow "LIGHTS", source `via plejd.local`, summary: `<b>{onCount}</b> of <b>{total}</b> rooms · <b>{drawnW} W</b> drawn`.

---

## Power section

Two columns: `grid-template-columns: 2fr 1fr; gap: 2px;`. Collapses to one column under 1100px.

### Left — outlets list
Vertical 2px-gap stack of outlet rows. Each row:
- Grid: `36px 1fr auto auto`, `align-items: center`, `gap: 14px`, padding `14px 18px`
- 32×32 icon container (rounded 10px), muted icon → amber-tinted bg + primary icon when on
- Name + room (`<room>` 11px muted, plus "ALWAYS ON" pill in primary color for `alwaysOn` outlets)
- Live wattage (13px mono, right-aligned, "Live" or "Off" caption below in 9px uppercase)
- Switch toggle (disabled-style for `alwaysOn` outlets — they cannot turn off)

Watts jitter ~6% every 1800ms with `Math.random()` to simulate live data.

### Right — Live draw panel
- "LIVE DRAW" eyebrow (10px uppercase, 0.16em tracking, muted)
- Huge mono total: `56px / weight 500 / tracking -0.04em / line-height 1`, with " W" unit in 18px muted
- Mini 20-bar histogram below: each bar is the total W over the last 20 ticks, with the most recent in `var(--primary)` and the rest in `clay-50 16%`. Bars use `flex: 1` with `transition: height 600ms`.
- Legend (3 rows):
  - Lights (amber-400) — `{litW} W`
  - Outlets (oklch(0.55 0.08 130) — desaturated green) — `{outletW} W`
  - Speakers (oklch(0.72 0.1 95) — pale yellow) — `{speakerW} W`
- Meta row: `Tibber · 0.84 SEK/kWh` ∙ `This hour 0.41 kWh`

### Watts model
- Lights: `bulbs * 9W * (brightness/100)` per active room
- Outlets: live `outlet.watts` (jittered)
- Speakers: `6 + volume * 0.15` per active speaker

---

## Scenes section

Five chips in a `grid-template-columns: repeat(5, 1fr); gap: 2px;` row at the bottom of the page.

### Chip
- Padding `18px 16px 16px`, min-height `116px`
- 36×36 rounded icon block on top (10px radius, `bg: clay-50 7%`)
- Label (14px / 500) + sub-label (11px muted) at the bottom
- Active state: bg shifts to `color-mix(in oklch, var(--amber-400) 22%, color-mix(in oklch, var(--clay-850) 75%, transparent))`, label color → `var(--primary)`, icon bg → `amber-400 22%`

### Scene definitions
Five scenes, each with an `apply(state)` function that returns new state:

| Scene | Lights | Outlets | Speakers |
|---|---|---|---|
| **Morning** | Kitchen 90%, Dining/Bath 60% | Coffee on + always-on | Kitchen only @ 18 |
| **Dinner** | Kitchen/Dining/Living dim 35–55% | always-on + Hi-fi amp | Kitchen/Dining/Living grouped @ 28 |
| **Movie** | Living only @ 8% | always-on + TV | Living only @ 45 |
| **Sleep** | Bedroom only @ 15% | always-on only | All off |
| **All off** | Everything off | always-on only | All off |

Applying a scene sets `activeScene` to the scene id; any subsequent manual change to a room/outlet/speaker clears `activeScene` (no longer matching the preset).

---

## Background system

### `.bg-photo` (fixed, z-index 0)
- Full-viewport `background-size: cover; position: fixed; inset: 0;`
- `filter: brightness(0.85) saturate(0.85)` (default theme)
- Photo URL is **dynamic** — see the time-of-day + weather table below
- 1200ms crossfade transition on `background-image` change

### `.bg-wash` (fixed, z-index 0, on top of `.bg-photo`)
A radial-amber-tint + vertical-clay-fade overlay. Default (Clay theme):
```css
background:
  radial-gradient(70% 50% at 80% 0%, color-mix(in oklch, var(--amber-600) 14%, transparent) 0%, transparent 65%),
  linear-gradient(180deg,
    color-mix(in oklch, var(--clay-950) 25%, transparent) 0%,
    color-mix(in oklch, var(--clay-950) 55%, transparent) 100%);
```

### Time + weather → photo
Reuse `src/lib/weather-bg.ts` from the source repo. The prototype uses a simpler 4-bucket version:

| Hour | Weather | Image |
|---|---|---|
| 21–5 | any | `assets/weather/night-1.avif` |
| 5–9 | any | `assets/weather/sunrise-clear.avif` |
| 9–17 | `rain` | `assets/weather/rainy-all-season-foggy-cloudy.avif` |
| 9–17 | `snow` | `assets/weather/winter-sunny-snow.avif` |
| 9–17 | `cloudy` | `assets/weather/cabin-base.avif` (overcast) |
| 9–17 | `clear` | `assets/weather/summer-autumn-cloudy.avif` |
| 17–21 | any | `assets/weather/Sunset-autumn-summer.avif` |

In production, use the existing `pickBackdrop(now, condition)` from `weather-bg.ts` directly.

### Weather state
Local state in the page — clicking the weather icon in the header cycles through `['clear', 'cloudy', 'rain', 'snow']`. In production, this should come from the `/api/weather` endpoint (already exists in the source repo).

---

## Themes

**Single theme** — Clay (warm dark, photo backdrop). The prototype previously shipped with a second `Clear` light theme; that was removed when the photo-backdrop direction was finalized (see the `(Removed: Clear and Vision themes -- single-theme product now.)` marker at the top of `tokens.css`). Production should likewise ship single-theme and use `prefers-color-scheme` only if it later adds a light mode back. There is no `data-theme` attribute, no `hdg-theme` localStorage key, and no theme-switcher widget in the header.

The Clay tokens (layer-1 + layer-2) are listed in the **Colors** section above. They are already in `globals.css` in the production repo — do not redefine.

---

## Sidebar (use existing `<Sidebar>` component)

Unchanged from the source repo — fixed 256px, opaque `bg-sidebar`, holds nav + Cmd-K trigger + user avatar. The prototype's sidebar is a static mock; in production the real component handles conditional nav rows (Music/Energy hidden until connected) and the integration-status query.

---

## Typography

```css
--font-sans:    'Albert Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;
--font-heading: 'Albert Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;
--font-mono:    'Geist Mono', ui-monospace, 'SF Mono', Menlo, monospace;
--heading-tracking: -0.03em;
--heading-weight: 200;
```

**Why Albert Sans first, Helvetica second**: the design relies heavily on weight 100 ("hairline") at very large sizes. On macOS, `'Helvetica Neue'` weight 100 is `Helvetica Neue Thin` and renders correctly. On Windows/Linux/Android, Helvetica typically isn't installed and the browser falls back to Arial, which only has weight 400 — meaning the big clock and weather temp render at Regular, not Thin. **Albert Sans** is a Google Font (variable, weights 100–900, Helvetica-grotesque-style) that ships from the CDN and guarantees the hairline weight on every platform. Helvetica stays as a fallback so macOS users still see real Helvetica.

**Geist Mono** is loaded at weights 100/200/300/400/500 (default Google Fonts only loads 400/500 — you must request the lighter weights explicitly or weight 100 silently falls back to Regular).

### Type scale used

| Use | Size | Weight | Tracking |
|---|---|---|---|
| Clock hero time | `clamp(72px, 9vw, 132px)` mono | 100 | -0.06em |
| Clock hero date | `clamp(18px, 1.4vw, 22px)` | 300 | -0.005em |
| Weather temp | `clamp(52px, 6vw, 88px)` mono | 100 | -0.06em |
| Weather condition | 14px | 400 | — |
| Weather caption | 10px uppercase | — | 0.18em |
| Welcome row | 12px | 400 / 500 (greeting) | 0.01em |
| Section eyebrow | 11px uppercase | 600 | 0.18em |
| Section source | 10px (with "via " prefix) | 400 | — |
| Card title (room/outlet/speaker) | 14px | 500 | — |
| Brightness pct, watt readouts | 22px mono, 56px mono (Power Live) | 500 | -0.02em / -0.04em |
| Body / labels | 13px / 11px / 10px | 400 | — |

Note on `.np-title-big` ("Living room is leading"): the prototype uses `var(--heading-weight)` (= 200) and `var(--heading-tracking)` (= -0.03em) for hairline feel, not the 22px/500/-0.02em the earlier draft of this spec called for. Match the prototype.

---

## Spacing & layout tokens

Existing tokens from `globals.css` — do not invent new ones:
- `--spacing-1..16` (4–64px scale)
- `--page-pad-x: clamp(1rem, 3.5vw, 3rem)` (~16–48px) — narrower than the original draft so the photo backdrop reads as the canvas
- `--page-pad-y: clamp(1.25rem, 4vw, 2.5rem)` (~20–40px)
- `--section-gap: 2.5rem` (= 40px) — was 48px in upstream `globals.css`; this design uses 40
- `--group-gap: 1rem` (16px)
- `--row-gap: 0.75rem` (12px)

Main override: `padding: 8px var(--page-pad-x) var(--page-pad-y)` — the top padding is intentionally tight (8px) to lift the header.

**Card-stack signature**: `gap: 2px` between cards within a section, no `border-radius` on cards. Slivers of the photo show through. Preserve.

---

## Colors (semantic tokens — already in `globals.css`)

| Token | Resolves to | Use |
|---|---|---|
| `--background` | `var(--clay-950)` | Body bg (under the photo) |
| `--foreground` | `var(--clay-50)` | Primary text |
| `--card` | `color-mix(in oklch, var(--clay-900) 18%, transparent)` | Card bg (with `backdrop-blur(25px)`) |
| `--popover` | `color-mix(in oklch, var(--clay-850) 28%, transparent)` | Translucent panels |
| `--primary` | `var(--amber-400)` | Accent (now-playing, dot, active state) |
| `--muted-foreground` | `var(--clay-400)` | Captions, meta |
| `--border` | `color-mix(in oklch, var(--clay-50) 8%, transparent)` | Card border |
| `--ring` | `var(--amber-400)` | Focus ring |
| `--destructive` | `var(--red-500)` | Reserved — not used in this page |

**Per-section legend swatches** (Power Live / Energy / Activity log) — now promoted to tokens:
- Lights: `var(--chart-1)` — alias of `var(--amber-400)`
- Outlets: `var(--chart-2)` — `oklch(0.55 0.08 130)` (desat green)
- Speakers: `var(--chart-3)` — `oklch(0.72 0.1 95)` (pale yellow)

Per `DESIGN.md`: "When meaning is missing without color, the helper is page-scoped, not a token. If a third decoration use emerges, promote to `--chart-*`." All three are now in `tokens.css` layer 1 and consumed via `var(--chart-*)` in CSS and JSX. In the Next.js port, mirror these in `globals.css`.

---

## Interactions & behavior

### State (top-level page state)
```ts
const [rooms, setRooms] = useState<Room[]>(INITIAL_ROOMS);          // 8 rooms
const [outlets, setOutlets] = useState<Outlet[]>(INITIAL_OUTLETS);  // 6 outlets
const [speakers, setSpeakers] = useState<Speaker[]>(INITIAL_SPEAKERS); // 4 speakers
const [activeScene, setActiveScene] = useState<string | null>(null);
const [groupAll, setGroupAll] = useState(false);
const [theme, setTheme] = useState<'clay' | 'clear'>(/* from localStorage */);
const [weather, setWeather] = useState<'clear'|'cloudy'|'rain'|'snow'>(/* from localStorage */);
const [now, setNow] = useState(new Date());
```

In production, replace the `INITIAL_*` fixtures with real data from the integrations (`useQuery` against `/api/plejd`, `/api/sonos`, `/api/shelly`, etc.). Toggle/slider handlers should `POST` to the integration endpoint and optimistically update local state.

### Interactions

| Element | Action | Effect |
|---|---|---|
| Scene chip | click | Apply scene to all three domains; set `activeScene` |
| Any toggle/slider | change | Clear `activeScene` (no longer matches a preset) |
| Room toggle | click | Flip `room.on` |
| Brightness slider | drag | Set `room.brightness`, auto-turn-on if > 0 |
| All-lights toggle | click | Set every room to the same state |
| Outlet toggle | click | Flip `outlet.on`; skip the toggle entirely for `alwaysOn` outlets |
| Speaker toggle | click | Flip `speaker.on` |
| Volume slider | drag | Set `speaker.volume`, auto-turn-on if > 0 |
| "Group all" pill | click | Set every speaker to `on=true`, point sources at the lead room |
| Weather icon | click | Cycle weather (clear → cloudy → rain → snow → clear) |

### Animations & motion
- Page entry: staggered fade-up via Framer Motion (existing `<PageTransition>`) — `mode="wait"`, 320ms
- Card flicker on light turn-on: 600ms `flicker` keyframe (amber overlay fading in/out)
- Slider thumb / toggle: 150ms ease-out (existing `--motion-duration-fast`)
- Card bg color change (brightness glow): 300ms (`--motion-duration-base`)
- Photo crossfade: 1200ms ease-out
- Wi-Fi dot pulse: 2.4s ease-in-out infinite
- Mini histogram bar height transitions: 600ms ease-out
- Watts jitter timer: every 1800ms

Use Framer Motion for everything except simple CSS hover/active states. The product is on **Framer Motion only** — do not introduce another motion lib.

### Outlet wattage simulation
```ts
useEffect(() => {
  const t = setInterval(() => {
    setOutlets(os => os.map(o => {
      if (!o.on) return { ...o, watts: 0 };
      const base = BASE_WATTS[o.id] ?? 30;
      const jitter = (Math.random() - 0.5) * base * 0.06;
      return { ...o, watts: Math.max(2, Math.round(base + jitter)) };
    }));
  }, 1800);
  return () => clearInterval(t);
}, []);
```

In production, replace with live wattage from `/api/shelly/<outlet>/power`.

---

## Responsive

```css
@media (max-width: 1100px) {
  .lights-grid    { grid-template-columns: repeat(2, 1fr); }
  .speaker-grid   { grid-template-columns: repeat(2, 1fr); }
  .scenes         { grid-template-columns: repeat(3, 1fr); }
  .power-grid     { grid-template-columns: 1fr; }
  .music-hero     { grid-template-columns: minmax(320px, 380px) 1fr; }
}
@media (max-width: 720px) {
  .app            { grid-template-columns: 1fr; }
  .sidebar        { display: none; }
  .lights-grid, .speaker-grid, .music-hero { grid-template-columns: 1fr; }
  .scenes         { grid-template-columns: repeat(2, 1fr); }
}
```

The primary form factor is phone/tablet held in one hand at 19:00 (per `PRODUCT.md`). Hit targets must be ≥ 44×44 CSS pixels — the toggles in this prototype are 40×22 — bump them to 44× or wrap them in a 44×44 hit area in the real implementation.

---

## Accessibility

Per the source repo's WCAG 2.2 AAA target for daily-use surfaces:
- Contrast 7:1 for body text (clay-50 on clay-950 ≈ 16:1 — fine; verify against the photo behind the cards; if it falls below 7:1 in worst cases, bump card opacity)
- Hit targets ≥ 44×44 (WCAG 2.2 AAA). The visual controls below 44px (`.power-toggle` 40×22, `.np-btn` 36×36, `.header-music-btn` 32×32, `.music-source-rm` 22×22, `.scene-timer .clear-btn` 14×14) have their hit areas expanded via a transparent `::before` pseudo-element. When replacing with base-ui primitives, either pick a primitive that already meets 44×44 or apply the same `::before` pattern.
- All controls keyboard-operable; visible focus rings respect the dark theme — the prototype uses `outline: 2px solid var(--ring); outline-offset: 2px` globally; the production primitives already handle this via `focus-visible`
- `prefers-reduced-motion: reduce` honored — disable the bg-photo transition and the watts-jitter timer; freeze the flicker animation
- No color-only state encoding — every active/on state pairs with shape (toggle thumb position, dot fill, label color shift, icon container fill)
- Screen-reader labels describe the *effect* not the widget: "Turn off kitchen lights" not "Toggle switch, off"

---

## Files in this handoff

| File | Purpose |
|---|---|
| `index.html` | The HTML shell — sets up the page, imports React/Babel CDN, loads `tokens.css` and `app.jsx` |
| `app.jsx` | The React app (~630 lines) — single file containing all components, state, scene definitions, time/weather backdrop logic |
| `tokens.css` | All CSS — token layer 1+2, layout, components, both themes (~990 lines) |
| `assets/backdrop-*.avif` | 7 backdrop photos covering night/sunrise/day/sunset/rain/snow/overcast |

To preview locally, open `index.html` in any modern browser (no build step). The Spotify iframe and Google Fonts load from CDN.

---

## Implementation checklist

When you bring this into the Next.js app:

- [ ] Replace `src/app/page.tsx` with a new dashboard component that renders Music + Sound + Lights + Power + Scenes in this order
- [ ] Add `--chart-1/2/3` to `globals.css` matching the prototype (Lights = amber-400 alias, Outlets = `oklch(0.55 0.08 130)`, Speakers = `oklch(0.72 0.1 95)`)
- [ ] Add Albert Sans + Geist Mono weights 100/200/300 to the Next.js font setup (`src/app/layout.tsx`)
- [ ] Set `--font-sans` and `--font-heading` to the Albert Sans / Helvetica stack
- [ ] Set the heading weight token to 200 (currently 600 in `globals.css`) — verify this doesn't regress other pages; if it does, only apply to the dashboard page via a scoped class
- [ ] Create per-domain widgets (`<LightsBlock>`, `<PowerBlock>`, `<SoundBlock>`, `<MusicHero>`, `<ScenesRow>`) in `src/components/dashboard/` reusing the existing `Card`, `Switch`, `Slider`, `Button` primitives
- [ ] Wire the data: replace `INITIAL_*` fixtures with `useQuery` against the existing integration endpoints (`/api/plejd`, `/api/sonos`, `/api/music`, `/api/shelly`, `/api/tibber`)
- [ ] Replace the prototype's `pickBackdrop()` with the existing `src/lib/weather-bg.ts`
- [ ] Replace the hand-rolled `Slider` and `Toggle` in the prototype with the base-ui-backed `<Slider>` / `<Switch>` from `src/components/ui/` — ensure they satisfy the 44×44 hit-target minimum (the prototype expanded its hit areas via `::before` pseudo-elements; base-ui primitives may or may not do the same)
- [ ] Use the existing empty-state primitive in place of the prototype's `<EmptyIntegration>` block (or port the `.integration-empty*` styles from `tokens.css`)
- [ ] Add the weather chip's "cycle on click" interaction only as a dev/debug affordance — in production, weather comes from the API

---

## Open questions to confirm with the designer

1. **Spotify embed source** — currently hardcoded to a placeholder album. Should this read from `/api/music`'s `nowPlaying.track.uri` and rebuild the embed URL? Or always show the user's playlist?
2. **Time-of-day swap** — should the photo update every minute, or only when crossing a slot boundary?
3. **"Group all" speaker behavior** — when active, all speakers join the lead room's source. What happens when the lead room changes? (Currently all speakers stay grouped.)
4. **Scene state persistence** — should `activeScene` survive page reload? (Currently no.)
