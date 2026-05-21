---
slug: music-player-widget
date: 2026-05-21
type: quick
status: complete
---

# Port 21st.dev MusicPlayer widget to vanilla stack

## Context

User pasted a 21st.dev component (`music-player-widget.tsx`) intended for a
shadcn + Tailwind + TypeScript project. This project uses React 18 + Vite +
vanilla CSS + vanilla JavaScript and CLAUDE.md explicitly forbids introducing
Tailwind or component libraries.

Three options surfaced; user chose **Option A** — port to the existing stack.

## Scope

- Create `src/components/MusicPlayerWidget.jsx` with TS annotations stripped.
- Author the **full** stylesheet in vanilla CSS using the existing
  `--clay-*` / `--amber-*` / `--motion-*` tokens from `src/tokens.css`. The
  CSS snippet the user pasted only contained 4 keyframes; the rest is
  authored from the component's class usage.
- Namespace every class with `mpw-` prefix to avoid collisions with
  `.card`, `.bar`, `.controls`, `.scales`, `.cover` etc. already in
  `tokens.css` and `src/App.jsx`.
- **Do not wire** into `App.jsx` — keep as a standalone importable widget.
  User has an existing Spotify-account-linked player on the Music page; this
  is a separate component the user will place themselves.

## Out of scope

- Integration into the Music page or any other route.
- Tailwind / shadcn / TypeScript adoption.
- Tests (project has no test suite per CLAUDE.md).
- Visual verification via running the dev server.

## Files

- Create: `src/components/MusicPlayerWidget.jsx`
- Create: `src/components/musicPlayerWidget.css`

## Acceptance

- Component compiles under the existing Vite + React 18 setup with no new
  dependencies.
- All class names prefixed `mpw-`; no overlap with existing global classes.
- Stylesheet references only tokens already defined in `src/tokens.css`
  (`--popover`, `--border`, `--primary`, `--foreground`,
  `--muted-foreground`, `--clay-*`, `--ring`, `--motion-*`, `--font-*`).
- `prefers-reduced-motion` honored for keyframe-driven animations.
- WCAG 2.2 AAA 44px hit-area pattern reused via invisible `::before` on
  control buttons (matches `.np-btn` convention).
