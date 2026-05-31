# ADR 0005: Engine Data Layer & Demand-Driven Asset Loading

- **Status:** Accepted
- **Date:** 2026-06-01
- **Deciders:** Alexander Rulkens
- **Tags:** engine, data-model, loading, rendering, architecture

## Context

The engine bootstrap phase `wireSlots` had grown to ~530 lines doing eight
distinct jobs: minting sidecar slots, building the `allSlots` registry, wiring
the POI merge, constructing the thumbnail/impostor subsystems, registering fade
handles, and kicking off the multi-survey load with a synthetic fallback. Three
of those jobs (mint, register, boot-`.load()`) are *separate hand-maintained
passes over the same slot set*, and the load behavior is scattered across ~5
ad-hoc trigger sites (`wireSlots` boot loop, `setSourceVisible`,
`setVolumeFieldEnabled`, `loadPgcAliases`, the fallback gate).

Grilling the structure surfaced that the root problem is conceptual, not
cosmetic. Two orthogonal axes were conflated throughout the engine:

- **Data type** — galaxy, structure (cluster/supercluster/void), filament,
  volume field. *What a thing is.*
- **Presentation mechanism** — point billboard, thumbnail LOD, ring/halo marker,
  text label, line strip, raymarched volume. *How a thing draws.* These are
  shared; multiple data types feed the same mechanism.

The engine was organized mostly by presentation mechanism. As a result galaxies
accrued many subsystems (atlas, textured/procedural disks, hi-res famous) while
structures had no clearly-named data home — they were dissolved into a
"`poiSubsystem`" whose name is a *presentation role* ("a labeled anchor with an
optional ring"), which additionally smuggled in famous-galaxy labels (a galaxy
dual-role).

Two registries already exist with a real, layering-forced split:

- `src/data/sources.ts` `SOURCE_REGISTRY` — **identity + presentation defaults**
  for every `Source` across all four `type`s. The pure-data layer; it must not
  import services.
- `services/engine/wiring/galaxyCatalogSourceRegistry.ts` — **wiring** (fetcher,
  category, companions) for point clouds only. Everything else is hand-wired in
  `wireSlots`.

## Decision

### 1. Per-type data stores

`EngineState.data.{ galaxies, structures, filaments, volumes }` — one store per
data type, each the **authoritative app-side home** and canonical query API for
its type. A store holds the app-side authoritative *state*, not a blind copy of
the payload; depth follows whether the CPU queries the data:

- **galaxyStore** (rich) — `Map<Source, GalaxyCatalog>` + the famousMeta sidecar.
  CPU-queried by InfoCard, picking, the famous label join.
- **structureStore** (rich) — cluster/supercluster/void records (featured anchors
  + bulk catalog), keyed groups, `byId`/`byCategory` lookups, per-category
  visibility. CPU-queried by picking, labels, markers, camera focus, membership.
- **volumeStore** (thin) — registered field ids + per-field params; voxels live
  on the GPU.
- **filamentStore** (thin) — loaded flag + counts; geometry lives on the GPU.

The renderer is never the source of truth for *status*. "Store per type" is the
uniform pattern; rich-vs-thin contents are not exceptions but the pattern sized
to each type's real CPU footprint.

### 2. Identity vs wiring layers; `AssetKey`

`SOURCE_REGISTRY` remains the single source of truth for **identity +
presentation defaults**, unchanged. A new declarative **asset-wiring registry**
in `services/` carries the **wiring** (fetcher, slot factory, demand predicate),
keyed by `AssetKey` — a superset of every fetchable `Source` plus the three
auxiliary assets `clusterCatalog`, `famousMeta`, `pgcAlias`. The `Source` enum
keeps its tight render/pick + on-disk meaning; "Source" (identity) and "Asset"
(fetchable file) are different sets. This registry replaces
`GALAXY_CATALOG_SOURCE_REGISTRY` and absorbs the `wireSlots` hand-wiring.

### 3. Demand-driven loading

Each wiring row declares `demand: (ctx: DemandCtx) => boolean`. An asset loads
**iff it is required**. One `reevaluateDemand(state)` evaluator replaces every
ad-hoc trigger site; it re-checks all rows on any change (boot, settings toggle,
visibility change, request flag, sibling slot transition) and calls the
idempotent `slot.load(req)` for newly-required assets. `DemandCtx` exposes four
read surfaces: settings, visibility/drawMask, request flags, sibling slot states.
Companions are demand predicates referencing the owner; the synthetic fallback is
a predicate over sibling slot states; the palette alias is a predicate over a
one-shot request flag. Public-handle setters flip a setting and re-evaluate
rather than calling `.load()` directly. **Demand governs loading only** —
residency is unchanged (toggle-off fades, does not free).

### 4. Construction purity (concentrated mutation)

The engine cannot be immutable (GPU handles, per-frame reads, async arrivals);
the goal is a thin mutable shell. Slot/subsystem factories become **pure
constructors that return and never install**; the bootstrap orchestrator
performs the **single install** (assemble-then-assign). This shrinks the
"pass `state` everywhere" surface and isolates init-time mutation.

### 5. Shared, read-only presentation

Label and marker production are presentation mechanisms shared across data types,
not owned by any one. They read the stores (read-only) and emit renderer
descriptors. "POI" dissolves: structures own their store and feed the
marker+label producers; famous-galaxy labels move to a galaxy-side label producer
reading `galaxyStore` + famousMeta. No `poiSubsystem` god-object that conflates a
data store with two per-frame producers.

## Consequences

- **Decomposed into one ADR + three sequenced specs:** (1) wireSlots refactor —
  rework-proof Tier-1 relocation, shipped first; (2) per-type data stores;
  (3) presentation realignment (producer split + famous-label eviction).
- `state.sources.catalogs` → `galaxyStore`; `clusterBulk` + narrowed POI store
  → `structureStore`; volume field settings → `volumeStore`; filament status →
  `filamentStore`.
- The wireSlots refactor may land before the stores; its demand predicates +
  commit bodies that reference `state.sources.*` then carry a mechanical rename
  pass when Spec 2 lands. Famous galaxies may remain an interim labeled-anchor
  member until Spec 3 — an incremental-delivery state, not a permanent exception.
- **Parked (own specs):** typed runtime setters + deep-`readonly` `EngineState`;
  demand-driven unload / GPU eviction.

## Alternatives rejected

- **Pure relocation of `wireSlots`** — re-encodes the three-pass coupling and
  scattered load triggers in more files.
- **Promote all assets to `Source` enum members** — pollutes the append-only
  on-disk-format enum with metadata identities that never render or persist.
- **A `when` load-policy union** (`boot`/`boot-if-visible`/`companion`/`lazy`/
  `fallback`/`never`) — every case was secretly "is it required?"; one `demand`
  predicate subsumes them. Encoding the settling-gate state machine as config is
  less readable than the imperative trigger that re-evaluates.
- **Keep "POI" as a shared labeled-anchor store with famous as a permanent
  guest** — leaves structures without a first-class data home and conflates two
  data types under a presentation-role name.
- **Full CPU payload copy for every store** — duplicates GPU-resident voxels /
  geometry on the CPU for no consumer.

See the grill session:
[`docs/grill-sessions/2026-06-01-wireslots-data-layer.md`](../grill-sessions/2026-06-01-wireslots-data-layer.md).
