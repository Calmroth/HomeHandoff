# Design

## Visual theme

**Single theme, warm-dark, photo-backed.** The dashboard sits on a full-bleed photographic backdrop that crossfades through the day (dawn / morning / midday / golden / dusk / blue / night). Over the photo, a stack of glass cards — `oklch(0.19 0.01 65)` mixed with 92% opacity — holds the actual UI. The cards are tinted toward a hue=65 warm grey (clay) so the photo bleed reads as warmth, not as colour cast.

**Color strategy: Committed.** One saturated accent — amber `oklch(0.78 0.14 70)` — carries every "on" / "active" / "live" / "focus" / "selected" signal in the product. Nothing else competes. The supporting palette is a single warm-neutral ramp (clay-50 through clay-950 at hue 65) plus three semantic dot-colors used only in charts (amber for Lights, desat-green for Outlets, pale-yellow for Speakers).

**Physical scene.** Spouse holding the iPad in the kitchen at 19:00 while pasta water boils, under warm overhead halogens. Dark surfaces vanish into the photo backdrop; the amber accent is the one thing that reads from across the room. The same surface is mounted on a wall at 23:00 with the ambient light off — the photo dims (night phase), the amber dims with it. Dark mode is mandatory: a bright white surface in a dim kitchen at night is hostile.

## Color palette (OKLCH)

All neutrals tinted toward the brand hue 65. No `#000`, no `#fff`. Chroma is low (0.005–0.014) — these are *tinted* neutrals, not chromatic ones.

### Clay ramp (warm dark neutrals)

```
--clay-50:  oklch(0.97 0.005 65)   /* primary text on dark cards */
--clay-200: oklch(0.85 0.008 65)
--clay-400: oklch(0.62 0.012 65)   /* muted-foreground (all captions, labels, meta) */
--clay-700: oklch(0.28 0.012 65)
--clay-800: oklch(0.22 0.01 65)    /* hover surfaces, sidebar active */
--clay-850: oklch(0.19 0.01 65)    /* THE card tint — base of --popover */
--clay-900: oklch(0.17 0.01 65)    /* primary-foreground (text on amber) */
--clay-950: oklch(0.13 0.008 65)   /* page background under the photo */
```

(`--clay-100/300/500/600` defined for shadcn parity, currently unreferenced.)

### Amber (the only chromatic accent)

```
--amber-400: oklch(0.78 0.14 70)   /* --primary, --ring, every "on" state */
--amber-600: oklch(0.55 0.18 60)   /* avatar gradient, np-art highlight */
```

(`--amber-300/500` defined, unused.)

### Status & chart

```
--red-500:    oklch(0.64 0.18 25)        /* destructive (Sign-out only) */
--green-500:  oklch(0.7 0.12 145)        /* Wi-Fi pulse dot */
--chart-outlet:  oklch(0.55 0.08 130)    /* Outlets — desat green */
--chart-speaker: oklch(0.72 0.1 95)      /* Speakers — pale yellow */
```

### Semantic mapping

```
--background:       var(--clay-950)
--foreground:       var(--clay-50)
--popover:          color-mix(in oklch, var(--clay-850) 92%, transparent)
--primary:          var(--amber-400)
--primary-foreground: var(--clay-900)
--muted-foreground: var(--clay-400)
--border:           color-mix(in oklch, var(--clay-50) 8%, transparent)
--border-strong:    color-mix(in oklch, var(--clay-50) 14%, transparent)
--ring:             var(--amber-400)
--sidebar:          color-mix(in oklch, var(--clay-950) 92%, transparent)
```

The `--popover` mix at 92% opacity over the photo backdrop is the **card signature**. Every card surface in the product — lights, outlets, speakers, scenes, music hero, weather, energy, settings — is this same translucent tint with a `backdrop-filter: blur(25px)` behind it.

## Typography

**Single typeface for body and heading: Albert Sans** (weights 100 / 200 / 300 / 400 / 500 / 600). The hairline weights (100/200) carry the hero clock and weather temps; 400/500 carry body and card titles; 600 carries the uppercase eyebrows. **Monospace: Geist Mono** for any number that's being read as data (clock, watts, percentage, temperatures, energy totals).

`--font-sans` and `--font-heading` resolve to the same family on purpose. Hierarchy comes from **weight + size + tracking**, not from a typeface switch.

### Scale (selected)

| Use | Size | Weight | Tracking |
|---|---|---|---|
| Clock hero | `clamp(72px, 9vw, 132px)` mono | 100 | -0.06em |
| Weather hero temp | `clamp(80px, 9vw, 140px)` mono | 200 | -0.06em |
| Greeting | 28px | 200 | -0.03em |
| Brightness % | 22px mono | 500 | -0.02em |
| Card title (room / outlet / speaker) | 14px | 500 | — |
| Power live watts | 56px mono | 500 | -0.04em |
| Section eyebrow | 11px uppercase | 600 | 0.18em |
| Body / row | 12–13px | 400 | — |
| Muted caption | 10–11px | 400 | — |

Contrast ratio is 7:1 minimum (clay-50 on clay-950 ≈ 16:1 over the dimmer photo backdrops; cards bump opacity if the photo is too bright underneath).

## Layout

### Spacing

```
--page-pad-x:  clamp(1rem, 3.5vw, 3rem)     /* 16–48px */
--page-pad-y:  clamp(1.25rem, 4vw, 2.5rem)  /* 20–40px */
--section-gap: 2.5rem                       /* 40px between sections */
--group-gap:   1rem                         /* 16px between cards in a group */
--row-gap:     0.75rem                      /* 12px between rows in a card */
```

The main content column shaves the top padding to 8px so the clock-hero hangs near the photo edge: `padding: 8px var(--page-pad-x) var(--page-pad-y)`.

### Card stack signature

Every multi-card grid is a **2px gap, not the usual 16/24px**. This is the visual signature of the dashboard — cards are mortared together like wall tile, not floating like a feed. Used on: lights grid (4 cols), outlets, speakers (4 cols), scenes (5 cols), rooms (2 cols), music page (1fr 360px), energy charts (2 cols), weather days (7 cols), news page (1fr 320px), settings page.

### No container chrome

The page header carries no background, no border, no shadow. The photo IS the chrome. Section headers are flush-left eyebrow + source + summary, with section-gap providing the only separator.

## Motion

```
--motion-duration-fast: 150ms     /* hover state, dot pulse */
--motion-duration-base: 300ms     /* toggles, slider thumb, card lift */
--motion-ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1)
```

Photo crossfade is its own long beat: `1200ms ease-out` on `background-image`. The bulb flicker (light-switch state change) is a one-shot 600ms three-stop keyframe. The Wi-Fi pulse is `2.4s ease-in-out infinite` — the slowest motion in the product, sized to look like breathing.

No bounce. No elastic. No spring. Ease-out exponential / quartic everywhere.

**`prefers-reduced-motion: reduce` drops every animation to `0.001ms`, hides the flicker overlay, stops the Wi-Fi pulse, and skips the 1800ms outlet-watts jitter.** This is non-negotiable — the dashboard runs 24/7 on a wall and motion that "looks great" the first day is sensory pollution by day 30 if you can't opt out.

## Components

The product is built from **eight load-bearing primitives** plus domain widgets:

| Primitive | Purpose | Visual |
|---|---|---|
| `<Section>` | Eyebrow + source + summary header; wraps a content block. Provides the 40px gap. | flush-left, hairline weights |
| `<Card>` (`--popover` surface) | The translucent glass card everything else sits on. Border `--border`, blur 25px. | radius 14px, no shadow |
| `<Switch>` | On/off control. **Hit area must be 44×44 CSS pixels minimum**; visual thumb may be 40×22 inside a transparent hit-target pseudo-element. | amber fill when on, clay-900 thumb |
| `<Slider>` | Brightness, volume. 8px track, 14px round thumb in `--foreground`. | amber fill from 0→value |
| `<SceneChip>` | One of five scene buttons in the home grid. Min-height 116px. Active state = amber-soft fill + amber border + amber number. | square-ish, photo can show through |
| `<RoomCard>` | Light room card. Brightness slider + toggle + bulb pill + flicker overlay. `--glow` CSS var tints the card amber as brightness rises. | data-on state changes whole card |
| `<OutletRow>` / `<SpeakerCard>` | Power and sound siblings of `<RoomCard>`. | identical surface system |
| `<NowPlaying>` | Music hero. 1:1 aspect ratio Spotify embed is critical — triggers the LARGE Spotify layout. | square art + side panel listing rooms |

**Cards are the lazy answer everywhere else in modern UI. Here they are the deliberate answer** — the product's whole identity is "many small status surfaces, glanceable in parallel." Card grids are the right affordance for that. Nested cards are still banned.

### State signaling

Every "on" state pairs **color + shape**, never color alone:
- Lights on: amber `--glow` fill + bulb-pill dot fills + toggle thumb slides right
- Outlets on: amber border + amber dot + toggle thumb slides
- Speaker active: amber name + volume number lights + toggle thumb
- Scene active: amber-soft card fill + amber border + amber number + "Lead" pill appears
- Wi-Fi healthy: green dot pulses; degraded: dot stops, dims to 50%

### Failure rendering

When an integration is down, the affected tile **dims to 60% opacity** and shows a **single breathing dot** at the corner. No toast, no banner, no modal. The kitchen tablet stays useful for everything else. This is the most important behavior in the product.

## Accessibility

WCAG 2.2 **AAA** target (daily-use household appliance):

- **Contrast 7:1** for body text. Clay-50 on clay-950 ≈ 16:1 baseline.
- **Hit targets ≥ 44×44 CSS pixels**, expanded via transparent `::before` where visual control is smaller.
- **No color-only state encoding** (see above).
- **Screen-reader labels describe the effect, not the widget**: `Turn off kitchen lights`, not `Toggle switch, off`.
- **Visible focus rings** via `outline: 2px solid var(--ring); outline-offset: 2px` — always survives the photo backdrop.
- **`prefers-reduced-motion: reduce`** disables crossfade, flicker, and Wi-Fi pulse.
- **Keyboard everywhere**: scene chips bind `1`-`5`, `0` clears, `Esc` exits, `g` opens search. Every card is tab-reachable.

## What we don't do

- **No toasts.** Status is glanceable, not interruptive.
- **No modals as first thought.** Settings pages are full-route, not overlays. Login flows are dedicated screens.
- **No gradient text.** Hierarchy through weight + size.
- **No glassmorphism elsewhere.** The card-blur is intentional; it doesn't propagate to buttons, pills, dots, sliders.
- **No hero metrics** in 64-bold at the top of a card. Numbers are read where the data lives — watts next to the outlet, % next to the slider, °C next to the cloud icon.
- **No setup wizards** as the front door. The owner's house IS the demo. Signed-out state shows the household name + sign-in button on the photo backdrop; that's the entire onboarding.
- **No vendor jargon on the home surface.** "Plejd" / "Sonos" / "Shelly" live in Settings. The home talks about Lights, Sound, Power, Music.
