# POI Presentation Realignment — Design

- **Status:** Draft
- **Date:** 2026-06-01
- **Author:** Alexander Rulkens
- **ADR:** [0005](../../adrs/0005-engine-data-layer-and-asset-loading.md)
- **Sequence:** Spec 3 of 3. Follows the
  [wireSlots refactor](2026-06-01-wireslots-refactor-design.md) and
  [data stores](2026-06-01-engine-data-stores-design.md).

## Summary

Dissolve "POI" as a concept. Today `poiSubsystem` is a data store fused with two
per-frame producers (labels, markers), and it conflates a real data type
(structures) with a guest from another (famous-galaxy labels). After Spec 2 the
*data* lives in `structureStore` (structures) and `galaxyStore` (galaxies +
famousMeta). This spec finishes the job: extract the per-frame **label** and
**marker** producers as standalone presentation units that read those stores, and
move famous-galaxy label production to the **galaxy** side. The result is
symmetric — galaxies and structures are first-class data types, and labels/markers
are shared presentation mechanisms — and the `poiSubsystem` god-object is gone.

## Why this is its own spec

The producers run every frame (hot path) and are wired into the `labelDirector`
+ the marker pass. Touching them is presentation-layer surgery distinct from the
loading cleanup (Spec 1) and the state-shape refactor (Spec 2). Until this lands,
famous galaxies remain an interim member of the labeled-anchor data (an
incremental-delivery state, not a permanent exception — see ADR 0005).

## Target structure

### Presentation units (read-only over stores)

```ts
// Structures → ring/halo descriptors. Reads structureStore.
function produceStructureMarkers(store: StructureStore, ctx: ReadyFrameContext,
                                 selection: SelectionView): readonly ClusterMarkerDescriptor[];

// Structures → text labels (+ ring-anchored). Reads structureStore.
function produceStructureLabels(store: StructureStore, ctx: ReadyFrameContext): LabelProducerOutput;

// Famous galaxies → text labels (+ lifted anchor line). Reads galaxyStore.
function produceFamousLabels(store: GalaxyStore, ctx: ReadyFrameContext): LabelProducerOutput;
```

All three are `LabelProducer`/marker-producer-shaped, registered with the
existing `labelDirector` (labels) and marker pass exactly where
`poiSubsystem.produceLabels`/`produceMarkers` are registered today. `POI_STYLES`
splits: structure styles travel with the structure producers; the famous-galaxy
style travels with `produceFamousLabels`.

### Screen-space declutter

Today one `produceLabels` declutters structure + famous labels together. After
the split, the `labelDirector` already merges multiple producers' outputs before
flushing — the declutter moves to the **director's merge step** so structure and
famous labels still de-collide against each other (and against youAreHere). This
keeps the cross-producer declutter that the single-loop version provided for free.

### Famous galaxies: the join, on the galaxy side

`produceFamousLabels` reads `galaxyStore.get(Source.Famous)` (worldPos +
diameterKpc) ⋈ `galaxyStore.famousMeta` (name) — the 2-asset join, now entirely
within galaxy data. It carries the famous-specific label behavior verbatim:
apparent-size gate (`apparentDiameterKpc` vs `minApparentSizePx`), per-POI
`labelWorldEmMpc`, lifted label + vertical anchor `MarkerLine`. Famous galaxies
emit **no** ring/halo (as today).

The famous-label record type loses the `PointOfInterest` union membership; it
becomes a galaxy-presentation concern derived from `galaxyStore`, not a stored
entity.

## What gets deleted

- `poiSubsystem` (the fused store+producers) — its store half became
  `structureStore` (Spec 2); its producer half becomes the three functions above.
- `PointOfInterest` discriminated union's famous arm — famous labels are derived,
  not stored. The structure arms become `StructureRecord` (Spec 2).
- `buildPoisFromFamousMeta` / `buildPoisFromClusterCatalog` / `rebuildAllPois`
  naming → replaced by store projections (Spec 1's `wirePoiProjection` becomes
  `wireStructureProjection`, writing `structureStore` groups) + the galaxy-side
  famous join.

## Picking

The ring pick path packs `@builtin(instance_index)` as a per-category-local
index resolved through `byCategory`. `produceStructureMarkers` must emit in
`structureStore.byCategory(cat)` order (the emit-all-then-discard contract is
preserved — faded markers still emit alpha-0 descriptors to keep indices
aligned). Famous galaxies are picked via the point path (unchanged); they never
had ring picks.

## Data flow (end state)

```
galaxyStore ─┬─▶ pointRenderer (billboards)
             ├─▶ thumbnail subsystems (atlas/disks/hi-res)
             └─▶ produceFamousLabels ─▶ labelDirector ─┐
structureStore ─┬─▶ produceStructureMarkers ─▶ marker pass
                └─▶ produceStructureLabels ──▶ labelDirector ─┴─▶ declutter+merge ─▶ labelRenderer
```

## Error handling

No new failure modes — presentation reads stores that already encode
graceful-degraded empties. A missing famousMeta yields famous galaxies with no
labels (points/thumbnails unaffected); a missing structure bulk group yields
featured anchors only.

## Testing

- **Producer unit tests:** each of the three producers against a stub store +
  `ReadyFrameContext` — gates, fades, anchor-line geometry, per-POI sizing.
- **Director-level declutter:** structure vs famous labels de-collide across
  producers; ranking by on-screen prominence is preserved.
- **Pick alignment:** `byCategory` order ↔ marker emit order; faded markers still
  emit alpha-0 descriptors so indices don't shift.
- **Parity:** visual/baseline render tests stay green; selection-ring-on-POI and
  camera-focus-on-structure behavior unchanged.

## Out of scope / parked

- **Famous-label producer placement** — whether `produceFamousLabels` stays its
  own producer or folds into a single all-category label producer. Default:
  separate producer (cleanest data ownership). Revisit if director plumbing
  argues otherwise.
- **Demand-driven unload** and **readonly `EngineState`** remain their own parked
  specs (ADR 0005).
