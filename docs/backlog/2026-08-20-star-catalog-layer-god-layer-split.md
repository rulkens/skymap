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

## Also carried by the Layer PR: the star defaults move

The eight `DEFAULT_STAR_*` constants in `src/data/defaults.ts` (`sizePx`,
`brightness`, `glowOverlap`, `refineThreshold`, the three exposure anchors, and
the aggregate intensity cap) belong in
**`src/layers/starCatalog/settings/defaults.ts`** — the Layer already owns the
slice that seeds them, and after the 2026-09-20 extraction nothing in core reads
them: `walkStarOctreeCut`'s `refineThreshold` is a required argument precisely so
that walk stays ignorant of the slider's default, and the only remaining external
reader is `tools/perf/starCutCpuBench.mts`, which is a tool, not core.

Not done in the extraction PR because galaxyCatalog, zoneOfAvoidance and body all
still read their defaults from `data/defaults.ts`; moving star's alone makes it
the first Layer to own them, which is a change of pattern that belongs with the
Layer work rather than bolted onto a refactor.

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
