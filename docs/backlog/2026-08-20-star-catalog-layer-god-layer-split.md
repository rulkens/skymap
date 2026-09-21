# `computeStarCut`'s stream SoA crossfade bookkeeping stays braided into one boolean flag

Surfaced by the 2026-08-17 renderer/layer sweep
([`renderer-layer-outliers.md`](../research/engine/renderer-layer-outliers.md):74,
"God-layers" table). Originally filed against `starCatalogPass` (983 LoC,
three braided concerns); the 2026-09-20 `starCatalogPass` extraction
(`docs/superpowers/plans/2026-09-20-star-catalog-pass-extraction.md`) resolved
two of the three mechanically and left this one, by design, for the
`starCatalog` Layer PR (spec `docs/superpowers/specs/2026-09-09-layer-composition-design.md`
§6.4, §10e).

## What's already resolved

- **Visibility gate** — `starCatalogVisible` is its own module
  (`src/services/gpu/renderers/starCatalog/cut/starCatalogVisible.ts`); the
  two sibling passes (`starAggregatesPass`, `starAggregateUpsamplePass`)
  import it directly instead of reaching into a layer-shaped pass file's
  internals.
- **The shared octree walk** — `computeStarCut` / `readStarCut` /
  `advanceStarCut` are their own modules under
  `src/services/gpu/renderers/starCatalog/cut/`, sharing one `ctx`-keyed memo
  (`starCutOncePerCtx`) across all three star-catalog layers.

- **The star defaults** — the star boot values now live in
  `src/layers/starCatalog/state/starCatalogs/initialState.ts` (+ `state/defaults.ts`
  for the one shared constant). They were deferred here only
  because moving star's alone would have made it the first Layer to own its
  defaults; the 2026-09-20 defaults sweep moved all seven Layers' at once, so
  the objection is gone.

## What's left

`computeStarCut(state, ctx, advanceFades: boolean)` still switches between a
pure read (`advanceFades: false`, used by the pick path and capture faces)
and a mutating fade-ramp advance (`advanceFades: true`, `runFrame`'s one real
call per frame) via a boolean flag rather than two distinct functions or a
before/after split. Un-braiding it is design work — it touches the two-stamp
fade scheme, the double-buffered active-node lists, and the per-catalog
`StarFadeState` — not mechanical prep, so it stays deferred to the
`starCatalog` Layer PR rather than riding this extraction.

## Why it matters

Cleanup, not a correctness bug today. A boolean that switches a function
between pure and side-effecting is a shape that's easy to call wrong (the
pick-path double-advance bug class the fade tests guard against); splitting
it removes that whole failure class instead of relying on call-site
discipline.
