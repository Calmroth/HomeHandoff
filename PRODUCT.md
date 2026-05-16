# Product

## Register

product

## Users

One household. Primary user is the technical owner (the person who set this up); secondary users are everyone else who lives there — a spouse, kids, in-laws, a babysitter. Everyone uses the same wall-mounted iPad in the kitchen, plus their own phones / laptops on the same LAN.

**The job to be done**: "I want the room to be a certain way" — turn off the kitchen lights, change what's playing in the living room, check whether the bedroom's window is open, see if the dishwasher is still running. In under three seconds, in one hand, while doing something else.

The premium target is the kitchen at 19:00 holding the iPad with one hand while cooking; the secondary target is the bedroom phone at 23:00 wanting just the bedside lamp off without unlocking anything.

## Product Purpose

A single-screen control surface for a multi-vendor smart home. It collapses Plejd lights, Sonos speakers, Shelly outlets, Spotify, Tibber energy prices, and weather into one glanceable dashboard. Quick control is the primary job on every screen; glanceable status is secondary; configuration is rare and lives elsewhere.

The product replaces the household pattern of five vendor apps (Plejd app, Sonos app, Spotify app, Shelly app, Tibber app), each with its own login and design language, with one surface that speaks one design language and reads as one appliance.

**Success** is the spouse who never set it up reaching for it instead of the Plejd app to turn off the bedroom light.

## Brand Personality

**Confident, quiet, useful.** Three words.

- **Confident**: the dashboard makes opinionated choices and sticks with them. One canonical path per job. No "would you like to set up advanced options?" prompts.
- **Quiet**: silence under stress. Errors render as a single breathing dot, never a toast. Animations are short and ease-out; nothing bounces.
- **Useful**: every pixel earns its place. No decoration that doesn't tell the user something true about their home.

The product principle (verbatim from the original PRODUCT context): *"the device speaks like a confident appliance, not a chatty assistant."*

## Anti-references

- **Chatty assistants**: Alexa / Google Home reading the weather aloud, prompting follow-up actions, addressing the user by name in unsolicited moments. The dashboard does not speak.
- **Vendor jargon as feature names**: "Plejd lights" / "MQTT bridge" / "OAuth Client ID" on the home surface. Vendors live in Settings; the home page talks about Lights, Sound, Power, Music.
- **"Smart home" dark UIs that look like consumer SaaS**: navy + cyan, gradient accents, glass cards everywhere, a hero metric in 64px-bold at the top. The home is a household, not a fintech dashboard.
- **Notification-driven dashboards**: red badges, toasts, persistent alert banners. Status is glanceable, not interruptive.
- **Setup wizards as the front door**: a 7-step onboarding before the user sees anything alive. The owner's house IS the demo.

## Design Principles

1. **Silent degradation**: When an integration fails, the affected tile dims and shows a single breathing dot. The dashboard never apologizes, never opens a modal. The kitchen tablet stays useful for everything else.
2. **Single source of truth**: Every tile reads from one observable store. The header, the section card, and the lockscreen MediaSession metadata all show the same track because they all read the same slice.
3. **Honest defaults over magic**: When a credential is in the user's environment, ask before applying it. Auto-discovery via mDNS or BLE that fails 30% of the time is worse than a one-time paste that succeeds 100% of the time.
4. **Appliance-grade tab lifecycle**: Wake Lock on, polling paused when hidden, BroadcastChannel sync across tabs. The dashboard is a 24/7 thing on a wall, not a tab someone opened once.
5. **Idiot-proof Settings**: Tokens render as •••• by default. Technical setup instructions live behind "Advanced ▾" expanders. The user sees their email + a Sign out button, not their OAuth Client ID, when they're already signed in.

## Accessibility & Inclusion

WCAG 2.2 AAA target for daily-use surfaces, since this is a household appliance the same five people touch every day:

- **Contrast 7:1** for body text (clay-50 on clay-950 ≈ 16:1 in the Clay theme — fine; check against photo backdrop in worst cases and bump card opacity if needed).
- **Hit targets ≥ 44×44 CSS pixels**. The visual toggles are smaller for design reasons; hit areas are extended via transparent ::before pseudo-elements.
- **`prefers-reduced-motion: reduce`** disables the photo crossfade, freezes the flicker keyframe, and stops the Wi-Fi dot pulse.
- **No color-only state encoding**. Every "on" state pairs color with shape (toggle thumb position, dot fill, label weight, icon container fill).
- **Screen-reader labels describe the effect**, not the widget. *"Turn off kitchen lights"* not *"Toggle switch, off"*.
- **Keyboard-operable** everywhere; visible focus rings respect the photo backdrop via `outline: 2px solid var(--ring); outline-offset: 2px`.
- **Local-language fallbacks**: greeting strings use the user's first name from Google identity or local profile. Currency / temperature units inherit from browser locale where possible.
