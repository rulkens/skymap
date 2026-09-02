# Hoist the three per-call-site solar-system derivations onto the planner pattern

Surfaced by [`subsystem-sweep.md`](../research/engine/subsystem-sweep.md)'s
"Solar-system bodies" table row (planner/prepare column, `:18`) and misfit #4
(`:31`); ruled in `decisions.md` #7 ("Planner-hoist (memoised on ctx,
`prepareStarCut` style) is the norm; the four solar-system derivations
recomputed per call site migrate to it (long tail)"). `ORPHAN` in the
2026-08-20 carry-forward audit: named "long tail" with no rung number and no
backlog file — checked, only incidental mentions of the four derivation names
turn up in unrelated backlog files.

## What it is

Three shared per-frame derivations for the solar-system-bodies subsystem (12
`ContentLayer` rows: earth, cloud-shell, atmosphere-shell, star-spheres,
field-star-sphere, planets, textured-bodies, rings, star-points, body-glints,
orbit-trails, foreground-labels) are recomputed independently at every call
site instead of hoisted to `runFrame` and memoised once:

- `sceneBodyPartition` — shared by 3 layers (glints/flat/textured split).
- `partitionStarsByResolution` — shared by 2 layers (spheres/points split).
- `atmosphereDrawList` — own derivation.

(`ringsLayer`'s rings derivation was hoisted since this item was filed —
`enabled()` and `draw()` now share one `ringDrawForBody` call — so it drops
off this list.)

Per the sweep: "computed independently inside `enabled()` AND `draw()` of
every consumer" — i.e. not just duplicated across layers, but duplicated
_within_ a single layer between its gate and its draw call.

The codebase already has the target pattern shipped and working:
`prepareStarCut` (the star-catalog octree walk) is hoisted to `runFrame`,
memoised on `ctx`, and consumed by all three star-catalog layers from one
computation. `decisions.md` #7 names this exact shape ("`prepareStarCut`
style") as the norm the solar-system derivations should migrate to.

## Why it matters

Bug-risk, not just cleanup: `sceneBodyPartition` and
`partitionStarsByResolution` each have multiple independent copies (one per
consuming layer, sometimes one per `enabled()`/`draw()` pair within a layer).
Nothing keeps those copies in agreement — an edit to the partition logic that
updates one call site but misses a sibling produces a layer whose `enabled()`
gate and `draw()` body disagree about which bodies are in scope, a drift bug
invisible to any test that only exercises one call site at a time.

## Approach

The pattern to follow already exists in the codebase (`prepareStarCut`), so
this is closer to `ready` than `needs-design` once someone reads that
implementation as the template. Shape:

1. For each of the three derivations, hoist the computation into `runFrame`
   (or a shared planner step alongside `prepareStarCut`'s), memoised on
   `ctx` for the frame's duration.
2. Update every consuming layer's `enabled()` and `draw()` to read the
   memoised result off `ctx` instead of recomputing.
3. Sequencing: `sceneBodyPartition` and `partitionStarsByResolution` touch
   the same layer files `starCatalogLayer`'s god-layer split
   ([companion orphan item](2026-08-20-star-catalog-layer-god-layer-split.md))
   would also touch — worth checking whether either lands first to avoid
   re-doing the other's diff.
4. Not gated on any ladder rung — decisions.md #7 names it as long-tail work
   independent of the umbrella `SubsystemBundle` reassessment.

## Partial progress

The [inside-atmosphere-rendering spec](../superpowers/specs/2026-08-24-inside-atmosphere-rendering-design.md)
(§5a) hoisted a fifth, closely-related pair onto `AtmosphereDrawEntry`
(551f62357) — but #634's body-slab restructure superseded that hoist with its
own pose seam: at HEAD, `atmosphereShellLayer.ts` and
`encodeAtmosphereSkyView.ts` each derive `camLocal`/`sunDirLocal`
independently from `ctx.bodyPose` via the `bodySlabCamLocal`/`sunDirLocal`
utils, not from a shared `AtmosphereDrawEntry` field. The atmosphere pair is
STILL OPEN scope for this item, alongside the derivations listed above.
