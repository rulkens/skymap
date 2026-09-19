# Capture — palette-card thumbnails

`npm run capture-featured` drives a running dev server headlessly and writes one 204×204 webp
thumbnail per focus card in `src/data/palette/featuredTabs.ts` to
`public/images/featured/<cardId>.webp` — the path `cardImageSrc` reads by default.

## Prerequisites

- **A running dev server** — the tool does not start one. **In a worktree, pass `--url`** with
  your `npm run dev`'s `Local:` port (Vite auto-increments past 5173).
- The Playwright `chromium` channel (`npx playwright install chromium`).

## Usage

```bash
npm run capture-featured                                   # every card missing a webp
npm run capture-featured -- --url http://localhost:5174    # worktree dev server
npm run capture-featured -- --force body-hubble body-earth # recapture named cards
```

A second run with no `--force` captures nothing and exits 0 — it skips any card whose webp
already exists.

## Skip rules

A card is never a target when: its action is a view (not `focus`), it carries an `image`
override (the Galaxies tab), or its webp already exists and it isn't named in `--force`. A card
id repeated across tabs is captured once, from its first capturable copy.

## Per-card framing

Some cards carry a `capture` override on their `featuredTabs.ts` entry — a `pose` re-applied
after the focus fly-in settles, a `t` pinning the lit instant, and `keepFocus` to leave the
selection (focus dim) in the shot. Fly to the vantage in the app and press `l` to log the pose in
the units `capture.pose` takes (Mpc, radians).

## Landmines

- **The fly-in overwrites an early pose.** A focus always re-settles the camera after landing, so
  `capture.pose` must be applied — and re-verified — AFTER the initial settle, never before.
- **Selection chrome is hidden via `disabledPasses`,** not a dedicated capture mode: three render
  passes (`CAPTURE_HIDDEN_PASSES`) draw selection rings, and the tool disables them by name
  through the same debug-panel mechanism a developer would click.
