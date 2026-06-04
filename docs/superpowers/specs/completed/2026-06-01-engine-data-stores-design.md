# Engine Per-Type Data Stores — Design

- **Status:** Draft
- **Date:** 2026-06-01
- **Author:** Alexander Rulkens
- **ADR:** [0005](../../adrs/0005-engine-data-layer-and-asset-loading.md)
- **Sequence:** Spec 2 of 3. Follows the
  [wireSlots refactor](2026-06-01-wireslots-refactor-design.md); precedes
  [presentation realignment](2026-06-01-poi-presentation-realignment-design.md).

## Summary

Give every data type one authoritative app-side home. Today data lands in
inconsistent places: galaxies in `state.sources.catalogs`, structures split
across `state.sources.clusterBulk` + the POI subsystem + a compiled-in seed,
volume params in `state.settings.volumes.fields`, filament status nowhere
durable. This spec introduces `state.data.{ galaxies, structures, filaments,
volumes }`, each with a typed store + query API, and migrates consumers. It is a
**state-shape refactor with no behavior change** — the foundation the other two
specs read from.

## The stores

A store holds the *authoritative app-side state* for its type, not a blind copy
of the payload. Depth follows whether the CPU queries the data (ADR 0005 §1).

### galaxyStore (rich)

```ts
type GalaxyStore = {
  catalogs: ReadonlyMap<SourceType, GalaxyCatalog>; // CPU metadata
  famousMeta: readonly FamousMetaEntry[];           // moved from sources.famousMeta
  setCatalog(s: SourceType, c: GalaxyCatalog): void;
  removeCatalog(s: SourceType): void;
  get(s: SourceType): GalaxyCatalog | undefined;
  setFamousMeta(m: readonly FamousMetaEntry[]): void;
};
```

Readers: InfoCard, picking metadata, the famous label join (Spec 3), bias
correction. famousMeta becomes galaxy data here (it is a sidecar of the Famous
source) — this is what lets Spec 3 evict famous labels from POI.

### structureStore (rich)

```ts
type StructureStore = {
  // Keyed groups (replaces the POI merge): 'anchors' | 'bulk'.
  setGroup(id: StructureGroupId, records: readonly StructureRecord[]): void;
  clearGroup(id: StructureGroupId): void;
  all(): readonly StructureRecord[];           // concatenated, for producers
  byId(id: string): StructureRecord | null;    // click resolver
  byCategory(c: StructureCategory): readonly StructureRecord[]; // pick-index alignment
  // Two independent visibility axes (marker/label), as today.
  markerVisible(c: StructureCategory): boolean;
  labelVisible(c: StructureCategory): boolean;
  setMarkerVisible(c: StructureCategory, v: boolean): void;
  setLabelVisible(c: StructureCategory, v: boolean): void;
};
```

`StructureRecord` is the cluster/SC/void data (the non-famous arms of today's
`PointOfInterest`): `id`, `name`, `worldPos`, `category`, `featured`,
`physicalRadiusMpc`, `apparentRadiusMpc?`, `significance?`, `abell?`,
`description?`. Readers: marker + label producers, picking
(`byCategory` preserves the `instance_index`-alignment contract), camera focus,
membership search.

Note: this store deliberately does **not** hold famous galaxies. Famous galaxies
are galaxy data (`galaxyStore`); their *label* is produced from there in Spec 3.
This is the structural form of ADR 0005's "B, no exceptions" decision.

### volumeStore (thin)

```ts
type VolumeStore = {
  fields: ReadonlyMap<VolumeFieldId, VolumeFieldParams>; // intensity/palette/enabled/...
  registered(): readonly VolumeFieldId[];
  params(id: VolumeFieldId): VolumeFieldParams | undefined;
  setParams(id: VolumeFieldId, p: VolumeFieldParams): void;
};
```

Voxel cubes live on `scalarVolumeRenderer`; the store tracks which fields exist +
their params (absorbing `state.settings.volumes.fields`). Readers: the Volumes
panel, the volume slot commits.

### filamentStore (thin)

```ts
type FilamentStore = {
  loaded: boolean;
  stripCount: number;
  vertexCount: number;
  setLoaded(stripCount: number, vertexCount: number): void;
};
```

Geometry lives on `filamentRenderer`; the store tracks status. Readers: status
UI, the filament slot commit.

## Migration map

| Today | After |
|---|---|
| `state.sources.catalogs` | `state.data.galaxies.catalogs` |
| `state.sources.famousMeta` | `state.data.galaxies.famousMeta` |
| `state.sources.clusterBulk` + POI subsystem list + static anchors | `state.data.structures` (groups `anchors`/`bulk`) |
| `poiSubsystem` marker/label visibility records | `state.data.structures` visibility |
| `state.settings.volumes.fields` | `state.data.volumes.fields` |
| (filament counts: transient) | `state.data.filaments` |

`state.sources.tier` / `state.sources.drawMask` stay as session/source config
(they are not per-type *data* — they are loading inputs the demand predicates
read). They may be renamed for tidiness but are out of the per-type-store model.

## Data flow

```
slot commit ──▶ store.setX(...)   (the only writers, post-construction-purity)
                     │
   producers / UI / pick / camera ──read──▶ store query API (read-only)
```

This is also where the parked **typed-setters + readonly `EngineState`** spec
will eventually land: the store query API is already the natural mutation seam,
so making the rest of `state` `readonly` to consumers becomes incremental rather
than a rewrite.

## Error handling

No new failure modes — this is relocation. The graceful-degradation writes
(famousMeta → `[]`, clusterBulk/structures bulk group → empty, filaments not
loaded) move onto the store setters unchanged.

## Testing

- **Per-store unit tests:** query API behavior, keyed-group concat order,
  `byCategory` ordering (pick-index alignment), visibility axes.
- **Migration safety:** a sweep test that no code still reads `state.sources.catalogs`
  / `.clusterBulk` / `.famousMeta` / `state.settings.volumes.fields` after
  migration (greppable forbidden-path assertion in CI, or a typecheck via removed
  fields).
- **Behavior parity:** existing engine/render/pick/camera tests stay green.

## Out of scope

- Demand wiring + construction purity → Spec 1 (already landed; this spec renames
  its write targets to the stores).
- Producer split + famous-label eviction → Spec 3 (consumes these stores).
- Deep-`readonly` `EngineState` + typed setters → parked own spec (enabled by
  the store seam introduced here).
