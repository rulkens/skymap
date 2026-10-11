# Capture — palette-card and structure thumbnails

`npm run capture-featured` drives a running dev server headlessly and writes one 204×204 webp
thumbnail per capturable card in `src/data/palette/featuredTabs.ts` to
`<cardId>.webp` under `public/` + `CARD_IMAGE_DIR` (`src/data/palette/cardImageDir.ts`), which is
the path `cardImageSrc` reads by default.

The same run also shoots every featured **cosmic-scale** structure (galaxy cluster, supercluster,
void, galaxy group — the registry rows with `scale: 'cosmic'`) onto its focus id, with the selection
kept, to `public/images/structures/<focusId>.webp` (`STRUCTURE_SHOT_DIR`,
`src/data/structure/structureShotDir.ts`). Milky Way-scale structures are not shot from the app;
`npm run capture-structures` cuts them from the DSS2 sky survey instead (see below). A target
carries its own output path, so skip-existing and `--force <id>` work the same for both; `--force`
takes a card id or a structure focus id.

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

## Milky Way structures: sky cutouts

`npm run capture-structures` writes the 204×204 shot for every featured open cluster, globular
cluster, nebula and Galactic Centre anchor that has none, by fetching a DSS2 colour cutout from the
CDS `hips2fits` service (centred on the anchor, field of view 1.3× its angular diameter, clamped to
0.1°–8°). It needs no dev server. `--force <focusId…>` refetches the named ones. DSS2 is a red/blue
photographic survey, so dust-obscured fields (the Galactic Centre clusters) come out near-black;
those are left as they are.

## Skip rules

A card is never a target when: it carries an `image` override (the Galaxies tab), or its webp
already exists and it isn't named in `--force`. A card id repeated across tabs is captured once,
from its first capturable copy.

## Exhibit cards

A `kind: 'exhibit'` card (`cosmicFlows`, `cosmicWeb`, `solarSystem`, `observableUniverse`) boots on
`#exhibit=<id>` — the same arrival a deep link gets — so its `exhibitRegistry` entry's `settings`
and `pose` apply themselves before the shot is taken; no `capture` override is needed unless a
card wants to frame it differently. A `capture.pose` on the card is applied afterward and wins.

**Decluttering splits in two, and which half runs is the difference between the two card kinds.**
`labelDeclutterActions` (every label, plus the selection passes) runs for every shot — no
thumbnail wants text burned into it. `sceneDeclutterActions` (structure rings, orbit trails, and
with `hideGalaxyField` the survey clouds) runs for FOCUS shots only: a focus card's subject is one
object and the rest is backdrop, but an exhibit's subject IS the scene, and its own `settings`
decide what belongs in it. Run the scene half over the Solar System exhibit and the thumbnail
loses the orbit rings that are the whole picture.

Order within the dispatch is load-bearing: scene declutter, then the exhibit's settings, then the
labels. A settings snapshot is a whole-cluster replacement, so an exhibit's `galaxyCatalogs`
carries its Layer's default `labelEnabled: true` — land it after the labels and they come back on.

## Per-card framing

Some cards carry a `capture` override on their `featuredTabs.ts` entry:

| field             | what it does                                                                                                                                                                                               |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pose`            | Applied once boot settles — the boot commits in place, so this lands and stays. Fly to the vantage in the app and press `l` to log one in the units it takes (Mpc, radians).                               |
| `phaseDeg`        | Frames a focused body lit to this phase instead, computing `pose` from the body's place at `t` — 0 full, 180 new, under 180 lit on the right and over 180 on the left. The Solar System cards share `315`. |
| `t`               | Pins the lit instant (the same string `#t=` takes).                                                                                                                                                        |
| `keepFocus`       | Leaves the selection (focus dim) in the shot.                                                                                                                                                              |
| `hideGalaxyField` | Hides the survey point clouds, for a card whose subject is one galaxy rather than the field.                                                                                                               |

`pose` and `phaseDeg` are alternatives — setting both fails the card.

## Landmines

- **Selection chrome is hidden via `disabledPasses`,** not a dedicated capture mode: three render
  passes (`CAPTURE_HIDDEN_PASSES`) draw selection rings, and the tool disables them by name
  through the same debug-panel mechanism a developer would click.
