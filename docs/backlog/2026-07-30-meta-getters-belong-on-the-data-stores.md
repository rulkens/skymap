# The famous-star sidecar meta has no data-store home

`ready` · Engine & State · filed 2026-07-30, out of the #522 review; galaxy half done in PR-C of layer composition (d)

## What it is

The galaxy half landed: `GalaxyStore.famousMeta` is the engine-side home for
`famous_galaxies_meta.json`, and `EngineState.famousGalaxiesMeta` is gone. The
star twin has not moved. `famous_stars_meta.json` lives only in
`engine.meta.famousStars` and is read through `selectFamousStarsMeta`, by
`BodyDetailCardContainer` and nothing else.

## Why it is not just "do the same thing"

Nothing engine-side reads the star meta today, so a `BodyStore.famousMeta`
would have no reader — the placement complaint that motivated the galaxy move
(loaded data sitting on `EngineState` beside Intent and runtime state) does
not apply, because the star meta never sat there.

What would create the reader: the star Layer, (e) in the layer-composition
sequence. Its selection row needs the same join the galaxy row does (catalog
row ⋈ sidecar record), and a row closes over engine resources, not the redux
store. When that row exists, `BodyStore` gains `famousMeta` + `setFamousMeta`,
`famousStarsMetaSlot`'s subscriber writes it beside its dispatch, and the
redux copy stays as long as `BodyDetailCardContainer` is its only other
reader.

## Shape

- `BodyStore.famousMeta` / `setFamousMeta`, written by the sidecar slot's
  subscriber on `ready` and reset to `[]` on `error` — the galaxy slot is the
  worked example.
- The redux copy (`engineFamousStarsMetaReported`, `engine.meta.famousStars`,
  `selectFamousStarsMeta`) survives until the shell reads the published fact
  instead, exactly as the galaxy copy does until PR-D.
