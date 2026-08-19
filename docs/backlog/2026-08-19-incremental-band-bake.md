# Incremental band re-bake

`npm run build-earth-tiles` always bakes every band in one `bakeAll` call
(`tools/textures/buildEarthTiles.ts`), because `index.txt` and
`manifest.json` are written whole from the current run's `written`/
`bandEntries` accumulators — there is no way to bake one band and leave the
others' index lines alone. Today that means ~10 minutes of byte-identical
BMNG re-baking on every EOX-only iteration (a new region, a retuned
`underfill`, a harvest re-run), just to regenerate a manifest that would
otherwise be unchanged for that band.

## Wanted

A `--only <sourceId>` flag that bakes a single band's tiles and stitches
the other bands' `index.txt`/`manifest.json` lines forward from the
previous run's output, instead of re-baking them. Today this is easy
because each band's z-range partitions its tile paths from every other
band's — but that's incidental to the current two-band (BMNG/EOX) shape,
not a designed guarantee, so a general "stitch the untouched bands" pass
needs to reason about path ownership explicitly rather than relying on the
coincidence.

## Named failure mode to design against

A stitched index that claims tiles which don't actually exist on disk —
e.g. the previous run's index referencing paths that got manually deleted,
or a band whose `minLevel`/`maxLevel` changed between runs so its old index
lines no longer match what a fresh bake of it would produce. The design
needs an explicit check (or an explicit acceptance) of this before treating
"unchanged band → skip its bake" as safe.

## Why this becomes necessary, not just convenient

Once the EOX absorb grows past hand-picked regional patches
(`docs/superpowers/specs/2026-08-19-eox-deep-tile-bands-design.md`, §9's
open follow-ups) toward the full dataset, the fixed ~10 minute BMNG tax per
iteration stops being a minor annoyance and starts being the dominant cost
of every bake-and-check loop.
