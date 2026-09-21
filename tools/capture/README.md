# Capture — palette-card thumbnails

`npm run capture-featured` drives a running dev server headlessly and writes one 204×204 webp
thumbnail per capturable card in `src/data/palette/featuredTabs.ts` to
`<cardId>.webp` under `public/` + `CARD_IMAGE_DIR` (`src/data/palette/cardImageDir.ts`), which is
the path `cardImageSrc` reads by default.

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

A card is never a target when: it carries an `image` override (the Galaxies tab), or its webp
already exists and it isn't named in `--force`. A card id repeated across tabs is captured once,
from its first capturable copy.

## View cards

A `kind: 'view'` card (`cosmicFlows`, `cosmicWeb`, `solarSystem`, `observableUniverse`) is shot
without running its takeover — no `openView`, no fly-in, no `#view=` boot. Its `viewRegistry`
entry already carries what a shot needs: `settings` is merged in, and `pose` frames it, so no
`capture` override is needed unless a card wants to frame it differently. A `capture.pose` on the
card still wins over the registry's.

**Decluttering splits in two, and which half runs is the difference between the two card kinds.**
`labelDeclutterActions` (every label, plus the selection passes) runs for every shot — no
thumbnail wants text burned into it. `sceneDeclutterActions` (structure rings, orbit trails, and
with `hideGalaxyField` the survey clouds) runs for FOCUS shots only: a focus card's subject is one
object and the rest is backdrop, but a view's subject IS the scene, and its own `settings` decide
what belongs in it. Run the scene half over the Solar System view and the thumbnail loses the
orbit rings that are the whole picture.

Order within the dispatch is load-bearing: scene declutter, then the view's settings, then the
labels. A settings snapshot is a whole-cluster replacement, so a view's `galaxyCatalogs` carries
its Layer's default `labelEnabled: true` — land it after the labels and they come back on.

## Per-card framing

Some cards carry a `capture` override on their `featuredTabs.ts` entry:

| field             | what it does                                                                                                                                                                                               |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pose`            | Re-applied after the focus fly-in settles. Fly to the vantage in the app and press `l` to log one in the units it takes (Mpc, radians).                                                                    |
| `phaseDeg`        | Frames a focused body lit to this phase instead, computing `pose` from the body's place at `t` — 0 full, 180 new, under 180 lit on the right and over 180 on the left. The Solar System cards share `315`. |
| `t`               | Pins the lit instant (the same string `#t=` takes).                                                                                                                                                        |
| `keepFocus`       | Leaves the selection (focus dim) in the shot.                                                                                                                                                              |
| `hideGalaxyField` | Hides the survey point clouds, for a card whose subject is one galaxy rather than the field.                                                                                                               |

`pose` and `phaseDeg` are alternatives — setting both fails the card.

## Landmines

- **The fly-in overwrites an early pose.** A focus always re-settles the camera after landing, so
  `capture.pose` must be applied — and re-verified — AFTER the initial settle, never before.
- **Selection chrome is hidden via `disabledPasses`,** not a dedicated capture mode: three render
  passes (`CAPTURE_HIDDEN_PASSES`) draw selection rings, and the tool disables them by name
  through the same debug-panel mechanism a developer would click.
