# Design System Extract — Home Control Surface

**Source files audited**
- `tokens.css` (1923 lines)
- `app.jsx` (~2884 lines)
- `README.md` (handoff spec — ground truth)

**Important caveat up front:** The README is partially stale. It describes a **two-theme** product (Clay + Clear), repeatedly references a `:root[data-theme="clear"]` block in `tokens.css`, and claims `--section-gap: 40px`. The current `tokens.css` is **single-theme** (Clay only), explicitly carries the comment `(Removed: Clear and Vision themes -- single-theme product now.)` (line 32), and uses `--section-gap: 2.5rem` (≈ 40px) — but expressed in `rem`, not `px`. Treat all "Clear theme" sections in this document as informational, not as something that exists in the current CSS.

---

## 1. Token Layer 1 — Primitives

### 1.1 Clay scale (warm dark neutrals, hue 65) — `tokens.css:6–17`

| Token | OKLCH (Clay) | OKLCH (Clear — per README, not in CSS) | Notes |
|---|---|---|---|
| `--clay-50`  | `oklch(0.97 0.005 65)` | `oklch(0.16 0 0)` | Used as `--foreground` |
| `--clay-100` | `oklch(0.94 0.006 65)` | `oklch(0.24 0 0)` | **Defined, never referenced** in CSS or JSX |
| `--clay-200` | `oklch(0.85 0.008 65)` | `oklch(0.38 0 0)` | Used once: `.activity-row` color (`tokens.css:953`) |
| `--clay-300` | `oklch(0.74 0.01 65)`  | `oklch(0.5 0 0)`  | **Defined, never referenced** |
| `--clay-400` | `oklch(0.62 0.012 65)` | `oklch(0.6 0 0)`  | Used in `--muted-foreground` |
| `--clay-500` | `oklch(0.5 0.014 65)`  | `oklch(0.7 0 0)`  | **Defined, never referenced** |
| `--clay-600` | `oklch(0.38 0.014 65)` | `oklch(0.78 0 0)` | **Defined, never referenced** |
| `--clay-700` | `oklch(0.28 0.012 65)` | `oklch(0.87 0 0)` | Used in `--accent` (which is itself unused) |
| `--clay-800` | `oklch(0.22 0.01 65)`  | `oklch(0.93 0 0)` | Used in `--muted`, `--secondary`, hover surfaces |
| `--clay-850` | `oklch(0.19 0.01 65)`  | `oklch(0.96 0 0)` | **The signature panel tint** — base of `--popover` |
| `--clay-900` | `oklch(0.17 0.01 65)`  | `oklch(0.98 0 0)` | Used in `--card`, `--primary-foreground`, toggle thumb |
| `--clay-950` | `oklch(0.13 0.008 65)` | `oklch(0.995 0 0)` | Used in `--background`, iframe shell bg |

### 1.2 Amber scale (single chromatic accent, hue ~60–70) — `tokens.css:19–22`

| Token | OKLCH (Clay) | OKLCH (Clear — README) | Notes |
|---|---|---|---|
| `--amber-300` | `oklch(0.85 0.12 70)` | `oklch(0.55 0.15 35)` | **Defined, never referenced** in tokens.css |
| `--amber-400` | `oklch(0.78 0.14 70)` | `oklch(0.46 0.17 30)` | **The accent** — backs `--primary` and `--ring` |
| `--amber-500` | `oklch(0.7 0.16 65)`  | `oklch(0.4 0.18 28)`  | **Defined, never referenced** |
| `--amber-600` | `oklch(0.55 0.18 60)` | `oklch(0.32 0.18 25)` | Used in avatar gradient, bg-wash radial, np-art |

### 1.3 Additional primitive ramps — `tokens.css:36–39`

| Token | OKLCH | Used for |
|---|---|---|
| `--red-500`   | `oklch(0.64 0.18 25)` | Backs `--destructive`. Used only via `--destructive`. |
| `--red-600`   | `oklch(0.55 0.2 25)`  | **Defined, never referenced** |
| `--green-500` | `oklch(0.7 0.12 145)` | Wi-Fi pulse dot (`tokens.css:781–782`). Lives outside the semantic layer. |

### 1.4 One-off raw OKLCH values (NOT in any ramp)

| Where | Value | Purpose |
|---|---|---|
| `tokens.css:612` | `oklch(0.78 0.14 70)` | np-art radial highlight (duplicates `--amber-400` literally — replace with token) |
| `tokens.css:613` | `oklch(0.55 0.18 60)` | np-art radial shadow (duplicates `--amber-600` literally — replace with token) |
| `tokens.css:614` | `oklch(0.4 0.06 35)` / `oklch(0.3 0.04 65)` | np-art base gradient — page-scoped warm browns |
| `tokens.css:747–748` | `oklch(0.17 0.01 65)` / `oklch(0.78 0.14 70)` | Theme-swatch face — literal duplicates of `--clay-900` / `--amber-400` |
| `tokens.css:960` | `oklch(0.55 0.08 130)` | Activity dot for `outlet` kind — desaturated green |
| `tokens.css:961` | `oklch(0.72 0.1 95)`  | Activity dot for `speaker` kind — pale yellow |
| `app.jsx:1640, 2396` | `oklch(0.55 0.08 130)` | Outlets legend swatch in `PowerLive` / `EnergyPage` |
| `app.jsx:1641, 2397` | `oklch(0.72 0.1 95)`  | Speakers legend swatch in `PowerLive` / `EnergyPage` |
| Shadows (6 places) | `rgba(0,0,0,*)` | Box / text / drop shadows — `tokens.css:486, 1097, 1135, 1160, 1169, 1186` |

---

## 2. Token Layer 2 — Semantic

All defined in `tokens.css:34–76`. Clear-theme column from README only; not in current CSS.

| Token | Clay value | Clear value (README) | UI role / observed use-sites |
|---|---|---|---|
| `--background` | `var(--clay-950)` | (inverts via clay ramp swap) | `body` bg under the photo backdrop |
| `--foreground` | `var(--clay-50)` | (inverts) | Primary text, slider thumb, np-btn-primary bg |
| `--card` | `color-mix(in oklch, var(--clay-900) 88%, transparent)` | `white 62%` mix per README | **Defined but never referenced** in CSS/JSX. Everything uses `--popover` instead. |
| `--card-foreground` | `var(--clay-50)` | — | **Defined, never referenced** |
| `--popover` | `color-mix(in oklch, var(--clay-850) 92%, transparent)` | — | **The single card-surface token.** Used by ~25 selectors with `backdrop-filter: blur(25px)`: `.surface, .scene, .card, .light-room, .outlet, .power-live, .now-playing, .speaker, .master, .music-hero, .music-page-stage, .music-page-frame anchor, .music-side-card, .activity-log, .rooms-room, .energy-hero, .energy-chart, .energy-sources, .weather-current, .weather-hourly, .weather-day, .news-frame, .news-side, .settings-section, .music-picker-card` |
| `--popover-foreground` | `var(--clay-50)` | — | **Defined, never referenced** |
| `--primary` | `var(--amber-400)` | (re-defined amber) | Accent everywhere: dot fills, active labels, focus ring, brightness slider fill, scene active state, ALWAYS-ON pill, brand-mark bg, theme-swatch active border target |
| `--primary-foreground` | `var(--clay-900)` | — | Brand-mark text, np-btn-primary text, toggle thumb when on |
| `--secondary` | `var(--clay-800)` | — | **Defined, never referenced** |
| `--muted` | `var(--clay-800)` | — | Used only by `.nav .row-active` (sidebar active state) |
| `--muted-foreground` | `color-mix(in oklch, var(--clay-400) 100%, transparent)` (i.e. `--clay-400`) | — | **Most-used color in the file.** All caption/label/meta copy, icon defaults, section sources, etc. |
| `--accent` | `var(--clay-700)` | — | **Defined, never referenced** |
| `--destructive` | `var(--red-500)` | — | Used once for Sign-out row text (`app.jsx:2754`) |
| `--border` | `color-mix(in oklch, var(--clay-50) 8%, transparent)` | `white 60%` per README | All card borders, search inputs, list dividers |
| `--border-strong` | `color-mix(in oklch, var(--clay-50) 14%, transparent)` | — | Hover-state borders, header pills (`.wifi-pill`, `.weather-chip`) |
| `--ring` | `var(--amber-400)` | — | Global `:focus-visible` outline; `.settings-input:focus` border |
| `--sidebar` | `color-mix(in oklch, var(--clay-950) 92%, transparent)` | `white 75%` per README | `.sidebar` bg |

**Defined-but-unreferenced semantic tokens** (candidates for deletion or repurposing in the port):
`--card`, `--card-foreground`, `--popover-foreground`, `--secondary`, `--accent`

---

## 3. Typography Tokens & Scale

### 3.1 Font stack tokens — `tokens.css:25–29`

```css
--font-sans:    'Albert Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;
--font-heading: 'Albert Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;
--font-mono:    'Geist Mono', ui-monospace, 'SF Mono', Menlo, monospace;
--heading-tracking: -0.03em;
--heading-weight: 200;
```

Note: `--font-sans` and `--font-heading` are **identical** today. README says this is intentional: Albert Sans handles both. `--heading-weight` and `--heading-tracking` are referenced exactly once each (`.np-title-big` in `tokens.css:844–845`); every other heading hardcodes weight/tracking inline. **This is drift — see §8.**

### 3.2 Type scale (actual values from `tokens.css` cross-checked against README §"Typography")

| Use | Size | Weight | Tracking | Selector / line | README match? |
|---|---|---|---|---|---|
| Clock hero time | `clamp(72px, 9vw, 132px)` mono | 100 | -0.06em | `.clock-hero-time` (`262–270`) | yes |
| Clock hero date | `clamp(18px, 1.4vw, 22px)` | 300 | -0.005em | `.clock-hero-date` (`271–277`) | yes |
| Welcome row | 12px | 400 (greeting span: 500) | 0.01em | `.welcome-row` (`234–244`) | yes |
| Greeting (h2-style) | 28px | 200 | -0.03em | `.greeting` (`247`) | unspec — uses `--heading-weight` value inline |
| Sub-greet | 13px | inherits | — | `.subgreet` (`248`) | unspec |
| Section eyebrow | 11px | 600 uppercase | 0.18em | `.section-title` (`362–367`) | yes |
| Section source | 10px | 400 | 0.02em | `.section-source` (`352–361`) | yes |
| Section summary | 12px | 400 (b: 500) | — | `.section-summary` (`368–369`) | yes |
| Weather temp | `clamp(52px, 6vw, 88px)` | 100 | -0.06em | `.weather-hero-temp` (`313–320`) | yes |
| Weather condition | 14px | 400 | — | `.weather-hero-cond` (`330–334`) | yes |
| Weather caption | 10px uppercase | inherits | 0.18em | `.weather-hero-time` (`335–340`) | yes |
| Wi-Fi pill | 11px (sub: 10px) | 400 | — | `.wifi-pill`/`.wifi-sub` (`770–785`) | yes |
| Card title (room, outlet, speaker name) | 14px | 500 | — | `.room-name`, `.outlet-name`, `.speaker-name` | yes |
| Brightness pct | 22px mono | 500 | -0.02em | `.brightness-pct` (`460–463`) | yes |
| Live watts (Power) | **56px** mono | 500 | -0.04em | `.live-watts` (`558–562`) | **README says 64px — drift** |
| Live unit | 18px | 400 | — | `.live-watts .unit` (`563`) | yes |
| Outlet watts | 13px mono | 400 | — | `.outlet-watts` (`539–545`) | yes |
| Master row title / sub / count | 13 / 11 / 12 | 500 / 400 / 400 | — | `.master-*` (`701–704`) | yes |
| Now-playing label | 10px uppercase | inherits | 0.18em | `.np-label` (`849–854`) | yes |
| Now-playing title (small) | 18px | 500 | -0.01em | `.np-title` (`627`) | unspec |
| Now-playing title (big) | 22px | `var(--heading-weight)` = 200 | `var(--heading-tracking)` = -0.03em | `.np-title-big` (`841–847`) | README says weight 500 — **drift, intentional?** |
| Micro label | 10px uppercase | inherits | 0.16em | `.micro-label` (`855–860`) | yes |
| Energy hero "big" | `clamp(64px, 7vw, 108px)` mono | 200 | -0.05em | `.energy-hero-total .big` (`1448–1454`) | (Energy page, not in README spec) |
| Weather current temp | `clamp(80px, 9vw, 140px)` mono | 200 | -0.06em | `.weather-current-temp` (`1551–1558`) | (Weather page) |
| Weather day hi | 18px mono | 500 | -0.02em | `.weather-day-hi` (`1653–1657`) | — |
| Header-music title | 14px | 500 | -0.005em | `.header-music-title` (`1152–1161`) | — |
| Header-music artist | 11px | 300 | — | `.header-music-artist` (`1162–1170`) | — |

### 3.3 Inline-styled type values (should be tokens or use classes)

| Where | Inline style | Suggestion |
|---|---|---|
| `app.jsx:1618, 1743` | `{ color: 'var(--primary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em' }` — "Always on" / "Lead" badges | Promote to a `.pill-accent` class |
| `app.jsx:1647` | `{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--muted-foreground)' }` — "Live draw" inline label | Reuse `.micro-label` instead |
| `app.jsx:1600, 1887` | `{ fontSize: 13, color: 'var(--muted-foreground)', marginLeft: 4 }` — "%" unit after brightness | Extract a `.unit` span class |
| `app.jsx:1622` | `{ fontSize: 10, color: 'var(--muted-foreground)', marginLeft: 3 }` — "W" unit after wattage | Same |

---

## 4. Spacing & Layout Tokens

Defined in `tokens.css:70–76`:

| Token | Value (current) | README spec | Notes |
|---|---|---|---|
| `--page-pad-x` | `clamp(1rem, 3.5vw, 3rem)` (≈ 16–48px) | `clamp(16px, 5vw, 64px)` | **Drift**: lower max and narrower mid-band |
| `--page-pad-y` | `clamp(1.25rem, 4vw, 2.5rem)` (≈ 20–40px) | `clamp(24px, 5vw, 56px)` | **Drift**: lower min and lower max |
| `--section-gap` | `2.5rem` (= 40px) | `40px` | Matches (README is right that "globals had 48px"; this CSS already corrects to 40) |
| `--group-gap` | `1rem` (16px) | `16px` | Matches |
| `--row-gap` | `0.75rem` (12px) | `12px` | Matches |

**No `--spacing-1..16` token scale exists in this file** — the README references one ("Existing tokens from `globals.css`"). In the prototype, that scale is implicit. In the Next.js port, use Tailwind v4's default `--spacing-*` scale (4–64px in 4px steps).

### Main padding override — `tokens.css:223`

```css
.main { padding: 8px var(--page-pad-x) var(--page-pad-y); /* tight top */ }
```

Intentionally shaves the top padding to 8px to lift the clock-hero.

### Card-stack signature (the 2-pixel gap)

Used on every multi-card grid. Hardcoded as a literal `2px`, never tokenized. Occurrences:

| Selector | Line | Layout |
|---|---|---|
| `.stack` | `tokens.css:127` | Flex column, the master row + lights grid combo |
| `.grid-stack` | `tokens.css:128` | Generic grid stack |
| `.lights-grid` | `tokens.css:426` | `repeat(4, 1fr)` |
| `.speaker-grid` | `tokens.css:908` | `repeat(4, 1fr)` |
| `.sound-grid` | `tokens.css:596` | `1.4fr 1fr 1fr` (legacy — Home no longer uses this layout) |
| `.power-grid` | `tokens.css:509` | `2fr 1fr` |
| `.scenes` | `tokens.css:374` | `repeat(5, 1fr)` |
| `.outlets` | `tokens.css:512` | flex column |
| `.rooms-grid` | `tokens.css:1030` | `repeat(2, 1fr)` |
| `.music-side` | `tokens.css:1238` | flex column |
| `.music-page` | `tokens.css:1210` | `1fr 360px` |
| `.energy-page` | `tokens.css:1430` | flex column |
| `.energy-charts` | `tokens.css:1473` | `1fr 1fr` |
| `.weather-page` | `tokens.css:1532` | flex column |
| `.weather-days` | `tokens.css:1626` | `repeat(7, 1fr)` |
| `.news-page` | `tokens.css:1675` | `1fr 320px` |
| `.settings-page` | `tokens.css:1821` | flex column |

**Recommendation:** introduce `--stack-gap: 2px` and reference it across every site, so a redesign that wants 1px or 3px requires one edit.

---

## 5. Motion Tokens

### 5.1 Durations & easings — `tokens.css:64–68`

```css
--motion-duration-fast: 150ms;
--motion-duration-base: 300ms;
--motion-duration-slow: 500ms;
--motion-ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);
--motion-ease-out-expo:  cubic-bezier(0.16, 1, 0.3, 1);
```

`--motion-duration-slow` and `--motion-ease-out-expo` are **defined but never referenced**.

### 5.2 Named keyframes

| Keyframe | Definition | Used by | Notes |
|---|---|---|---|
| `flicker` | `tokens.css:707–711` — `0% → 40% → 100%` opacity ramp (`0 → 1 → 0`) | `.flick` overlay (`tokens.css:712–717`), spawned in `RoomCard` via `useFlicker` (`app.jsx:633–641`) | 600ms one-shot per state change |
| `pulse` | `tokens.css:786–789` — opacity 1 → 0.55 → 1 | `.wifi-dot` (`tokens.css:779–784`) | 2.4s ease-in-out infinite |

### 5.3 Hardcoded transitions (not in tokens)

Plenty of one-off durations buried in CSS — most cluster around the existing tokens:
- `600ms` (mini histogram bar height, photo crossfade, flicker)
- `1200ms` (photo crossfade in `.bg-photo`)
- `2.4s` (Wi-Fi pulse)
- `1800ms` (outlet watts jitter interval — set in `app.jsx:1086`)

Photo crossfade (1200ms) and bar-height (600ms) are good candidates for a `--motion-duration-photo` / `--motion-duration-extra-slow` token.

### 5.4 prefers-reduced-motion handling — `tokens.css:1876–1886`

A global override drops every animation/transition to `0.001ms`, hides `.flick`, and stops `.wifi-dot`. `app.jsx` also skips the 1800ms watts jitter when reduced motion is on (`1078`). Good.

---

## 6. Component Inventory

For each row: name → CSS class(es) → key props/state → README primitive directive → API shape hint.

| Component | CSS class(es) | Key props / data attrs | README says | API shape |
|---|---|---|---|---|
| **Sidebar** | `.sidebar`, `.brand`, `.search-trigger`, `.nav`, `.nav-row`, `.row-active`, `.account`, `.avatar` | route, onNavigate | "Use existing `<Sidebar>` component" — **replace** | `<Sidebar route onNavigate />` (defined `app.jsx:523`) |
| **Slider** (hand-rolled) | `.slider`, `.slider-fill`, `.slider-thumb` | `value, onChange, disabled` | "Use base-ui-backed `<Slider>` from `src/components/ui/`" — **replace** | `<Slider value onValueChange disabled />` (defined `app.jsx:575`) |
| **Toggle** (hand-rolled) | `.power-toggle` (40×22) | `on, onToggle, ariaLabel` | "Use the base-ui-backed `<Switch>`" — **replace**. Hit target 40×22 fails 44×44 minimum. | `<Switch checked onCheckedChange aria-label />` (defined `app.jsx:616`) |
| **Card / surface** (generic) | `.card`, `.surface` | — | Use existing `Card` primitive | `<Card>` (note: `--card` token is unused; this consumes `--popover`) |
| **Scene chip** | `.scene`, `.scene-icon`, `.scene-label`, `.scene-sub`, `.scene-key`, `data-active` | scene, active, onApply | hand-roll OK — it's a domain widget | `<SceneChip scene active onApply />` |
| **Section header** | `.section-head`, `.section-title`, `.section-source`, `.section-summary` | title, source, summary | hand-roll OK | `<SectionHead title source summary />` (used by `<Section>` `app.jsx:1565`) |
| **Master row** | `.master`, `.master-title`, `.master-sub`, `.master-count` | title, sub, count, on, onToggle | hand-roll OK; the inner toggle should be the `<Switch>` primitive | `<MasterRow title sub count switch />` |
| **Light room card** | `.light-room`, `.room-head`, `.room-name`, `.bulb-pill`, `.brightness`, `.brightness-row`, `.brightness-pct`, `.brightness-label`, `data-on`, `--glow` CSS var | room, onToggle, onBrightness | use base primitives inside; this card is domain | `<RoomCard room onToggle onBrightness />` (`app.jsx:1580`) |
| **Outlet row** | `.outlet`, `.outlet-icon`, `.outlet-name`, `.outlet-room`, `.outlet-watts`, `data-on` | outlet, onToggle | use base primitives inside | `<OutletRow outlet onToggle />` (`app.jsx:1609`) |
| **Speaker card** | `.speaker`, `.speaker-head`, `.speaker-name`, `.speaker-source`, `.speaker-vol-row`, `.vol-icon`, `.vol-num`, `data-on` | speaker, onToggle, onVolume | use base primitives inside | `<SpeakerCard speaker onToggle onVolume />` (`app.jsx:1735`) |
| **Now playing hero** | `.music-hero`, `.music-hero-embed`, `.music-hero-side`, `.np-label`, `.np-title-big`, `.np-source`, `.hero-rooms`, `.hero-rooms-head`, `.hero-rooms-list`, `.hero-room-row`, `.hero-room-dot`, `.hero-room-name`, `.hero-room-state`, `.hero-actions` | speakers | hand-roll OK (uses iframe primitive); README says square aspect ratio is critical | `<NowPlaying speakers />` (`app.jsx:1683`) |
| **Header music** (compact player) | `.header-music`, `.header-music-art`, `.header-music-meta`, `.header-music-title`, `.header-music-artist`, `.header-music-controls`, `.header-music-btn`, `.header-music-btn-play` | playback, oembed, sourceLabel, sourceSub, onClickArt, togglePlay, seekRel | new component (post-README) | `<HeaderMusic playback oembed ...handlers />` (`app.jsx:886`) |
| **PowerLive panel** | `.power-live`, `.live-watts`, `.live-bar`, `.live-bar-fill`, `.live-legend`, `.legend-row`, `.legend-swatch`, `.legend-name`, `.legend-val`, `.live-meta` | totalW, litWatts, outletWatts, speakerWatts | hand-roll | `<PowerLive totalW litWatts outletWatts speakerWatts />` (`app.jsx:1630`) |
| **ActivityLog** | `.activity-log`, `.activity-head`, `.activity-count`, `.activity-rows`, `.activity-row`, `.activity-dot`, `.activity-text`, `.activity-time`, `.activity-empty`, `data-kind` | items, now | new component | `<ActivityLog items now />` (`app.jsx:1771`) |
| **Wi-Fi pill** | `.wifi-pill`, `.wifi-dot`, `.wifi-sub` | deviceCount | hand-roll OK | `<WifiPill count />` |
| **Weather chip (header)** | `.weather-chip`, `.weather-temp` | — | (legacy — current header uses `.weather-hero` instead) | `<WeatherChip />` |
| **Weather hero** | `.weather-hero`, `.weather-hero-icon`, `.weather-hero-temp`, `.weather-hero-meta`, `.weather-hero-cond`, `.weather-hero-time` | weather, weatherData, city, now | hand-roll | `<WeatherHero weather data city now />` |
| **Theme switcher** | `.theme-switcher`, `.theme-swatch`, `data-theme` | — | (legacy — only 1 swatch ever rendered) | strip entirely; single-theme product |
| **Group toggle pill** | `.group-toggle`, `data-active` | active, onClick | use a `<Button variant="pill">` from base | `<Button pill active onClick />` |
| **Bulb pill** | `.bulb-pill`, `.dot-on` | count | hand-roll OK | `<BulbPill count on />` |
| **Scene timer chip** | `.scene-timer`, `.scene-timer .clear-btn`, `.scene-timer .mono` | activeScene, activeSceneAt, now, onClear | hand-roll OK | `<SceneTimer scene since now onClear />` |
| **Room scene buttons** | `.room-scene`, `data-active` (in RoomsPage) | label, active, onApply | use `<Button variant="pill">` | `<RoomScenePill label active onApply />` |
| **Empty integration** | (no class — uses inline `.integration-empty*` referenced from JSX but not present in CSS!) | title, sub | replace with existing empty-state primitive | `<EmptyState icon title sub />` (`app.jsx:1796`) — **CSS missing, see drift report §8** |
| **MiniLineChart** (Energy) | inline SVG | values, color, height | reuse a chart primitive from the source repo if any | `<MiniLineChart values color height />` (`app.jsx:2357`) |
| **News tabs / News item** | `.news-tab`, `.news-item`, `.news-item-image`, `.news-item-source`, `.news-item-title`, `.news-item-meta` | tab, setTab, items | hand-roll OK | `<NewsTabs/>`, `<NewsItem/>` |
| **Settings input / row** | `.settings-input`, `.settings-section`, `.settings-row`, `.settings-row-icon`, `.settings-row-name`, `.settings-row-sub`, `.settings-row-state` | — | replace input with existing `<Input>` primitive | `<SettingsRow icon name sub state />` |

---

## 7. Page-Scoped One-Offs to Promote

These values appear in 2+ places, so per the project rule ("if a third decoration use emerges, promote to `--chart-*`") they need tokens. Names proposed:

| Current literal | Where it's used | Proposed token | Notes |
|---|---|---|---|
| `oklch(0.55 0.08 130)` (desat green) | `tokens.css:960` (`activity-row[data-kind=outlet] .activity-dot`), `app.jsx:1640` (`PowerLive` outlets swatch), `app.jsx:2396` (`EnergyPage` outlets swatch) | **`--chart-2` / `--chart-outlet`** | Used 3× — promotion is overdue (it's the Outlets color across the whole product) |
| `oklch(0.72 0.1 95)` (pale yellow) | `tokens.css:961` (`activity-row[data-kind=speaker] .activity-dot`), `app.jsx:1641` (`PowerLive` speakers swatch), `app.jsx:2397` (`EnergyPage` speakers swatch) | **`--chart-3` / `--chart-speaker`** | Used 3× — promote |
| `var(--amber-400)` as "Lights" series color | `app.jsx:1639, 2395`, `tokens.css:959` | **`--chart-1` / `--chart-light`** (alias of `--amber-400`) | Already a token, but should be promoted to a `--chart-*` alias for symmetry so charts read as a system, not as "amber + two literals" |
| `rgba(0,0,0,0.4)` slider thumb shadow | `tokens.css:486` | `--shadow-thumb` | Used once but lives next to similar shadow values |
| `rgba(0,0,0,0.25)` `header-music-art` shadow | `tokens.css:1135` | `--shadow-card-sm` | Could share with persistent-player shadow |
| `rgba(0,0,0,0.55)` `persistent-player` shadow | `tokens.css:1097` | `--shadow-card-lg` | |
| `rgba(0,0,0,0.35)` `text-shadow` for header-music | `tokens.css:1160, 1186` | `--text-shadow-on-photo` | Used 3× — promote |
| `rgba(0,0,0,0.3)` `text-shadow` for header-music-artist | `tokens.css:1169` | same as above (`--text-shadow-on-photo-soft`) | |
| `color-mix(in oklch, var(--clay-850) 60–75% transparent)` for chip backgrounds | `tokens.css:727, 764, 777` (theme-switcher, weather-chip, wifi-pill) | `--chip-bg` | Used 3+× with slightly different opacities (60/65/70%) — unify on one value or two named tiers (`--chip-bg-soft` / `--chip-bg`) |
| `color-mix(in oklch, var(--clay-50) 3–8% transparent)` for "tinted glass" insets | `tokens.css:175, 400, 450, 467, 567, 622, 651, 862, 1066, 1129, 1269, 1309, 1346, 1413, 1517, 1790, 1846` | `--inset-tint-1` / `--inset-tint-2` / `--inset-tint-3` (4 / 8 / 14%) | Used **~17 times** with three different opacities. Strong candidate for a 3-step inset-tint ramp. |
| `color-mix(in oklch, var(--amber-400) 18% transparent)` (active-pill fills) | `tokens.css:686, 1071, 1273, 1330, 1400, 1705, 1850` | `--accent-soft` | 7+ uses — clear pattern |
| `color-mix(in oklch, var(--amber-400) 35% transparent)` (active-pill borders) | `tokens.css:688, 1073, 1328, 1705` | `--accent-soft-border` | 4 uses |
| `color-mix(in oklch, var(--amber-400) 22% transparent)` (scene active bg) | `tokens.css:393, 404, 714` | `--accent-soft-strong` | 3 uses |
| `np-art` browns: `oklch(0.4 0.06 35)` + `oklch(0.3 0.04 65)` | `tokens.css:614` | leave page-scoped (single decorative use) | |

---

## 8. Drift Report

Findings where CSS / JSX diverges from the README, or where token/spec hygiene fails:

### 8.1 README ↔ CSS drift

| Item | README | Actual | File:line | Severity |
|---|---|---|---|---|
| Number of themes | Two (Clay + Clear) | One (Clay only); explicit removal comment | `tokens.css:32` | **High** — the README's entire "Themes" section is stale. |
| `--section-gap` | "was 48px in globals.css — this design uses 40" | `2.5rem` (40px, but in rem) | `tokens.css:73` | Low — value matches if you assume default root font-size 16px. README wrote "40px" — code uses rem. |
| `--page-pad-x` | `clamp(16px, 5vw, 64px)` | `clamp(1rem, 3.5vw, 3rem)` (16–48px) | `tokens.css:71` | **Medium** — narrower than spec |
| `--page-pad-y` | `clamp(24px, 5vw, 56px)` | `clamp(1.25rem, 4vw, 2.5rem)` (20–40px) | `tokens.css:72` | **Medium** — tighter than spec |
| `--heading-weight` | 200 | 200 | `tokens.css:29` | Match; but the token is only consumed by `.np-title-big` — every other heading hardcodes its weight |
| Power Live "huge mono total" | `64px / weight 500 / tracking -0.04em / line-height 1` | `56px / weight 500 / -0.04em / line-height 1` | `tokens.css:558–562` | **Medium** — 8px short of spec |
| Music hero "Big title" `.np-title-big` | README: 22px weight 500 tracking -0.02em | Actual: 22px **weight `var(--heading-weight)` = 200** tracking `var(--heading-tracking)` = -0.03em | `tokens.css:841–847` | **Medium** — weight and tracking both diverge; this looks intentional (the dashboard's "hairline" feel) but contradicts README. |
| Master row | `13px / 500` title, `11px muted` sub, mono count `5/8` | Same values (matches) | `tokens.css:702–704` | Match |
| Header card chrome | "no bg, no border, no shadow" | `.page-header` has `padding: 0 24px 12px` — no card chrome, correct | `tokens.css:230–233` | Match |
| Scene chip min-height | 116px | 116px | `tokens.css:388` | Match |
| Brightness slider thumb | "14px round thumb in foreground color" | 14px round thumb, `background: var(--foreground)` | `tokens.css:480–488` | Match |
| Wi-Fi pill bg | `color-mix(in oklch, var(--clay-850) 70%, transparent)` | Exact match | `tokens.css:777` | Match |
| Spotify embed container border | "14px radius, 1px var(--border)" | Exact match | `tokens.css:826–833` | Match |
| Streaming-to inner box | "14px 16px padding, 12px radius, 1px var(--border)" | Exact match | `tokens.css:861–869` | Match |
| Toggle dimensions / hit target | "44× hit target minimum; prototype is 40×22 — bump to 44×" | Still 40×22 in `.power-toggle` | `tokens.css:492` | **High** — accessibility issue, called out in README but unfixed. The base-ui `<Switch>` primitive must provide the wrapper. |
| `--font-sans` vs `--font-heading` | Identical (Albert Sans first) | Identical | `tokens.css:25–26` | Match |

### 8.2 Hand-rolled where README says "use the primitive"

| Primitive | Prototype's hand-rolled version | Location |
|---|---|---|
| `<Slider>` (base-ui) | `.slider` + custom pointer drag logic | `app.jsx:575–611` |
| `<Switch>` (base-ui) | `.power-toggle` Toggle component | `app.jsx:616–628` |
| `<Card>` | `.card`, `.light-room`, `.outlet`, `.speaker`, `.scene`, `.now-playing`, `.master`, `.music-hero`, `.music-page-stage`, `.power-live`, etc. — 25+ ad-hoc selectors that all share `bg: var(--popover); backdrop-filter: blur(25px)` | many places |
| `<Button>` | `.group-toggle`, `.news-tab`, `.room-scene`, `.scene` button — each re-implements pill styling | many places |
| `<Badge>` | `.bulb-pill`, "Always on" inline span, "Lead" inline span, `.scene-key` | many places |

### 8.3 Inline JSX styles that should be tokens or classes

`app.jsx` carries ~30 inline `style={{...}}` blocks (full list in §6 of the grep output). The load-bearing ones:

| Where | Inline | Tokenize as |
|---|---|---|
| `app.jsx:1618, 1743` | "Always on" / "Lead" badge style — `color, fontSize:10, textTransform:uppercase, letterSpacing:0.14em` | `.pill-meta-accent` class |
| `app.jsx:1647` | "Live draw" eyebrow inline — should reuse `.micro-label` | swap class |
| `app.jsx:1656` | Mini-histogram bar mix value `color-mix(in oklch, var(--clay-50) 16%, transparent)` | Promote to `--inset-tint-strong` |
| `app.jsx:1658` | `transition: 'height 600ms var(--motion-ease-out-quart)'` | Bind to new `--motion-duration-photo` |
| `app.jsx:2456` | `style={{ background: 'transparent', backdropFilter: 'none', padding: 0 }}` — overriding `.energy-sources` to flatten it. Smell: makes the class less reusable. | Add an `.energy-sources--flat` modifier |

### 8.4 Token hygiene issues

- **Five semantic tokens defined but never referenced** in the file: `--card`, `--card-foreground`, `--popover-foreground`, `--secondary`, `--accent`. They exist for shadcn parity (`globals.css` symmetry) but currently dangle. Decision needed for the port: keep for primitive compatibility, or prune.
- **Two primitives never referenced**: `--clay-100`, `--clay-300`, `--clay-500`, `--clay-600`, `--amber-300`, `--amber-500`, `--red-600`. Likely needed by other pages in the source repo — keep in `globals.css`.
- **One motion token unused**: `--motion-duration-slow: 500ms`. Possible use sites: photo crossfade (currently 1200ms — too slow for slow), histogram bar (600ms — close).
- **One ease unused**: `--motion-ease-out-expo`. Could replace the hardcoded `1200ms ease-out` on `.bg-photo`.

### 8.5 CSS classes referenced in JSX but missing from `tokens.css`

The `EmptyIntegration` component (`app.jsx:1796–1806`) uses `.integration-empty`, `.integration-empty-icon`, `.integration-empty-title`, `.integration-empty-sub`, `.integration-empty-link`. **None of these selectors exist in `tokens.css`** — confirmed via grep. The empty-state therefore renders as bare divs with no styling. Either:
- The component is dead, or
- Styles exist in some other file (none in this bundle), or
- The prototype's empty-state was never wired in.

This is a **High** drift item for the port: the engineer must build this from scratch or use the existing repo primitive.

Same applies to `.energy-chart-empty` (referenced `app.jsx:2446, 2468` — no CSS).

### 8.6 Hit target audit (per WCAG 2.2 AAA the README cites)

| Element | Size | ≥ 44×44? |
|---|---|---|
| `.power-toggle` | 40×22 | **No** — README flags this |
| `.np-btn` | 36×36 | **No** |
| `.np-btn-primary` | 48×48 | Yes |
| `.scene` (chip) | min-height 116px × flex 1/5 | Yes |
| `.header-music-btn` | 32×32 | **No** |
| `.header-music-btn-play` | 44×44 | Yes |
| `.music-source-rm` | 22×22 | **No** |
| `.theme-swatch` | 22×22 | **No** |
| `.light-room` (full card) | 192px min | Yes |
| `.outlet` row | 14×18 padding × full width | Yes |
| `.scene-timer .clear-btn` | 14×14 | **No** |

**Five toggles/buttons below 44×44.** The base-ui primitives in the production repo should pad these out.

---

## 9. Implementation Checklist for the Next.js Port

Ordered for least-blocking-to-most-blocking. Line numbers reference `tokens.css` unless noted.

### Phase 0 — Foundations (do once)

1. **Audit `globals.css` against the layer-1 ramps in §1.** Mark the dashboard token diffs (`--section-gap` 48 → 40, `--page-pad-x/y` widening per README, `--heading-weight` to 200) and apply globally if no other pages regress, else scope via `[data-page="home"]`. Sources: `tokens.css:6–22, 29, 71–75`.
2. **Add fonts in `src/app/layout.tsx`:** Albert Sans (weights 100/200/300/400/500/600) and Geist Mono (100/200/300/400/500) via `next/font/google`. Set `--font-sans = --font-heading = AlbertSans.variable`, `--font-mono = GeistMono.variable`. README §"Typography" explicitly requires the 100/200/300 weights or the hairline clock falls back to Regular.
3. **Promote per-domain chart colors to tokens:** add to `globals.css`:
   ```css
   --chart-1: var(--amber-400);          /* Lights */
   --chart-2: oklch(0.55 0.08 130);      /* Outlets — desat green */
   --chart-3: oklch(0.72 0.1 95);        /* Speakers — pale yellow */
   ```
   Refactor `tokens.css:960–961` and `app.jsx:1640–1641, 2396–2397` to consume them.
4. **Remove dead semantic tokens** (optional): `--card-foreground`, `--popover-foreground`, `--secondary`, `--accent` if not used elsewhere in the production repo. **Keep `--card`** — it's the canonical "card" semantic; refactor the prototype to use `--card` instead of `--popover` for card surfaces if the production repo already has that convention.

### Phase 1 — Layout shell

5. **Update `src/app/page.tsx`** to render `<AppShell><PageHeader><Section …/>×5</AppShell>` in the order: Music → Sound → Lights → Power → Scenes → Activity (per `app.jsx:1352–1485`).
6. **Implement `.bg-photo` + `.bg-wash`** as a sticky portal at z-index 0 inside the `<AppShell>`. Source: `tokens.css:89–111`. Reuse `src/lib/weather-bg.ts` `pickBackdrop()` instead of the prototype's 4-bucket version (`app.jsx:708–723`).
7. **Page padding** — apply `padding: 8px var(--page-pad-x) var(--page-pad-y)` to the main column to keep the tight top (`tokens.css:223`).
8. **Section gap** — set `gap: var(--section-gap)` on the page stack (`tokens.css:227`).

### Phase 2 — Header

9. **`<PageHeader>`** — port from `app.jsx:1490–1563`. Three-column grid: clock-hero / header-music / header-right (wifi-pill + weather-hero). Source classes: `.page-header, .welcome-row, .header-meta, .clock-hero, .clock-hero-time, .clock-hero-date, .header-right, .header-controls, .weather-hero*, .wifi-pill, .wifi-dot, .wifi-sub` (`tokens.css:230–340, 770–789`).
10. **Welcome row** per-route subtitle — port the `subByRoute` map from `app.jsx:1507–1515`.
11. **Strip the theme switcher** — single-theme product. Drop `.theme-switcher` (`tokens.css:719–749`) entirely.

### Phase 3 — Sections (use existing primitives)

12. **`<Section>` wrapper** — port from `app.jsx:1565–1578`. Provides title / source / summary chrome.
13. **Music hero** (`<NowPlaying>`) — `app.jsx:1683–1733`. **Critical**: the Spotify embed iframe must be 1:1 aspect ratio to trigger Spotify's LARGE layout (`tokens.css:830–833`, README §"Music section"). Wrap the iframe in `.music-hero-embed` with `aspect-ratio: 1/1, width: 100%`.
14. **Sound section** — `<SpeakerCard>` × 4 in `.speaker-grid` (`app.jsx:1735–1758`, `tokens.css:655–689, 906–910`). **Replace** the hand-rolled `Toggle` and `Slider` with the production `<Switch>` and `<Slider>` primitives. Wrap each in a 44×44 hit-target div.
15. **Lights section** — master row + `<RoomCard>` × N in `.lights-grid` (`app.jsx:1395–1411, 1580–1607`, `tokens.css:422–488`). Carry over the `--glow` CSS variable trick for the brightness-driven amber tint. Carry over the `useFlicker` hook + `.flick` overlay (`tokens.css:707–717`, `app.jsx:633–641`).
16. **Power section** — `<OutletRow>` × N + `<PowerLive>` (`app.jsx:1609–1681`, `tokens.css:507–590`). Reuse the three `--chart-*` tokens from Phase 0. Implement the 20-bar histogram from `app.jsx:1651–1662`.
17. **Scenes section** — 5 chips in `.scenes` grid (`app.jsx:1452–1473`, `tokens.css:371–408`). Bind keyboard shortcuts `1-5`, `0`, `Esc`, `g` (`app.jsx:1212–1229`).
18. **Activity log** — newest-first feed (`app.jsx:1771–1793`, `tokens.css:923–975`). Uses the new `--chart-*` colors via `data-kind`.

### Phase 4 — Polish & guardrails

19. **Replace hand-rolled `Toggle` (`app.jsx:616–628`)** with base-ui `<Switch>`. Production primitive must satisfy the 44×44 hit target — wrap in `<div style={{ minWidth: 44, minHeight: 44 }}>` if Switch is visually smaller.
20. **Replace hand-rolled `Slider` (`app.jsx:575–611`)** with base-ui `<Slider>`. Keep the styling: 8px track, primary fill, 14px round thumb in `--foreground`.
21. **Replace `EmptyIntegration` (`app.jsx:1796–1806`)** with the production empty-state primitive — the prototype has no CSS for it (`§8.5`).
22. **Wire data** — swap `INITIAL_*` fixtures (`app.jsx:650–652`) for `useQuery` calls per the existing integration endpoints. Optimistic state writes per `app.jsx:1122–1191`.
23. **Reduced-motion** — verify the global `@media (prefers-reduced-motion: reduce)` block (`tokens.css:1876–1886`) survives the Tailwind v4 pipeline; freeze `.flick`, kill `.wifi-dot` animation, skip the 1800ms outlet jitter (`app.jsx:1078`).
24. **Promote inline JSX styles** (§8.3) to classes — the "Always on", "Lead", "unit", and inline `.micro-label` clones.
25. **Honor accessibility** — every toggle/slider needs an `aria-label` describing the *effect* not the widget (e.g. `Turn off kitchen lights`), per README §"Accessibility". Pattern already in `app.jsx:1595, 1625, 1746`.
26. **Photo crossfade** — keep the 1200ms transition on `background-image` (`tokens.css:98`). Optionally promote to `--motion-duration-photo: 1200ms`.

### Phase 5 — Other pages (post-Home)

27. The prototype also implements **Rooms / Music / Energy / Weather / News / Settings** as full pages (`app.jsx:1824–2884`). They share the same surface system and `<Section>` chrome, so each is a 1–2 day port once Home is solid. These are out-of-scope for the dashboard handoff per the README, but the CSS for them is already in `tokens.css:1021–1868` — don't delete it during cleanup.

---

## Appendix A — Token quick-lookup (alphabetical, Clay theme)

```css
--accent:               var(--clay-700);   /* unused */
--amber-300:            oklch(0.85 0.12 70);  /* unused */
--amber-400:            oklch(0.78 0.14 70);  /* primary */
--amber-500:            oklch(0.7 0.16 65);   /* unused */
--amber-600:            oklch(0.55 0.18 60);
--background:           var(--clay-950);
--border:               color-mix(in oklch, var(--clay-50) 8%, transparent);
--border-strong:        color-mix(in oklch, var(--clay-50) 14%, transparent);
--card:                 color-mix(in oklch, var(--clay-900) 88%, transparent);  /* unused */
--card-foreground:      var(--clay-50);    /* unused */
--clay-50:  oklch(0.97 0.005 65);  --clay-100: oklch(0.94 0.006 65);  /* clay-100 unused */
--clay-200: oklch(0.85 0.008 65);  --clay-300: oklch(0.74 0.01 65);   /* clay-300 unused */
--clay-400: oklch(0.62 0.012 65);  --clay-500: oklch(0.5 0.014 65);   /* clay-500 unused */
--clay-600: oklch(0.38 0.014 65);  --clay-700: oklch(0.28 0.012 65);  /* clay-600 unused */
--clay-800: oklch(0.22 0.01 65);   --clay-850: oklch(0.19 0.01 65);
--clay-900: oklch(0.17 0.01 65);   --clay-950: oklch(0.13 0.008 65);
--destructive:          var(--red-500);
--font-heading:         'Albert Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;
--font-mono:            'Geist Mono', ui-monospace, 'SF Mono', Menlo, monospace;
--font-sans:            'Albert Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;
--foreground:           var(--clay-50);
--green-500:            oklch(0.7 0.12 145);  /* wi-fi only */
--group-gap:            1rem;
--heading-tracking:     -0.03em;
--heading-weight:       200;
--motion-duration-base: 300ms;
--motion-duration-fast: 150ms;
--motion-duration-slow: 500ms;   /* unused */
--motion-ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);   /* unused */
--motion-ease-out-quart:cubic-bezier(0.25, 1, 0.5, 1);
--muted:                var(--clay-800);
--muted-foreground:     color-mix(in oklch, var(--clay-400) 100%, transparent);
--page-pad-x:           clamp(1rem, 3.5vw, 3rem);
--page-pad-y:           clamp(1.25rem, 4vw, 2.5rem);
--popover:              color-mix(in oklch, var(--clay-850) 92%, transparent);
--popover-foreground:   var(--clay-50);    /* unused */
--primary:              var(--amber-400);
--primary-foreground:   var(--clay-900);
--red-500:              oklch(0.64 0.18 25);
--red-600:              oklch(0.55 0.2 25);  /* unused */
--ring:                 var(--amber-400);
--row-gap:              0.75rem;
--secondary:            var(--clay-800);   /* unused */
--section-gap:          2.5rem;
--sidebar:              color-mix(in oklch, var(--clay-950) 92%, transparent);
```

Total: **~50 tokens defined**; **~13 dangle unused** (5 semantic + 7 primitive + 1 duration + 1 ease).

---

*End of extract. For anything that contradicts this document, trust the source files (`tokens.css` / `app.jsx`) over the README — see §8.1.*
