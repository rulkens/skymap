# wireSlots → engine data layer — grill session

> What started as "wireSlots is a huge mess, what can we refactor?" became a
> redesign of the engine's data layer. We separated two conflated axes —
> **data type** (galaxy / structure / filament / volume) from **presentation
> mechanism** (points, thumbnails, markers, labels, lines, volumes) — and
> landed on: per-type **data stores** as the single home for each type's
> app-side state; a **demand-driven** loading model (an asset loads iff it's
> required, one unifying predicate replacing ~5 ad-hoc trigger sites); a
> declarative **asset-wiring registry** keyed by a superset `AssetKey`; and
> **shared, read-only presentation** producers that read the stores. The work
> decomposes into one ADR + three sequenced specs, with a standalone
> rework-proof **wireSlots refactor first**.

**Date:** 2026-06-01
**Participants:** Alexander Rulkens, Claude
**Status:** decided (loading + data-layer model); presentation realignment specced; two items explicitly parked

Produces: [ADR 0005](../adrs/0005-engine-data-layer-and-asset-loading.md),
[Spec 1 — wireSlots refactor](../superpowers/specs/2026-06-01-wireslots-refactor-design.md),
[Spec 2 — data stores](../superpowers/specs/2026-06-01-engine-data-stores-design.md),
[Spec 3 — presentation realignment](../superpowers/specs/2026-06-01-poi-presentation-realignment-design.md).

## Decision log

### Scope: full data-driven redesign, not a relocation

**Question:** Was the ask a cosmetic split of the 530-line `wireSlots`, or a
real structural redesign?

**Options considered:**
- **Pure relocation** — carve `wireSlots` into named sub-functions, logic
  unchanged. Pros: trivial, low-risk. Cons: leaves the duplicated three-pass
  slot handling and ad-hoc load triggers intact.
- **Just worst offenders** — data-drive the slot passes + extract the
  synthetic gate only.
- **Full data-driven redesign** — make the wiring declarative and confront
  the data model. Pros: fixes root causes. Cons: bigger.

**Decision:** Full data-driven redesign, grilled before committing.

**Reasoning:** The mess is structural (one function, 8 responsibilities; three
hand-maintained passes over the slot set; load behavior scattered). Relocation
would re-encode the same coupling in more files.

**Consequences:** Triggered the deeper data-model questions below.

---

### Identity layer already unified; wiring layer is what's fragmented

**Question:** Do we need new per-type registries (e.g. a volume registry)?

**Options considered:**
- **Add a `VOLUME_FIELD_REGISTRY`** mirroring the point-cloud registry.
- **Recognize `SOURCE_REGISTRY` already does this.**

**Decision:** No new identity registry. `src/data/sources.ts`'s
`SOURCE_REGISTRY` is *already* the single source of truth for identity +
presentation defaults across all four `type`s (`survey`/`poi`/`filament`/
`volume`), including the three DEV debug volumes (codes 12–14).
`volumeFieldDefaults.ts` is already just a lookup into it.

**Reasoning:** The earlier proposal was redundant — reading the file showed the
data already exists there. The genuine fragmentation is the **wiring** layer
(fetcher + slot factory + load policy): declarative only for point clouds
(`GALAXY_CATALOG_SOURCE_REGISTRY`), hand-coded for everything else.

**Consequences:** Two registries is correct and *forced* by layering —
`data/sources.ts` must not import `services/loading/fetchers/*`. Identity lives
in `data/`; wiring lives in `services/`.

---

### Source ≠ Asset; wiring keyed by a superset `AssetKey`

**Question:** How do we key the new wiring registry?

**Options considered:**
- **(A) `AssetKey` superset** — every fetchable Source + the three auxiliary
  assets (`clusterCatalog`, `famousMeta`, `pgcAlias`). Source enum keeps its
  tight render/pick + on-disk meaning.
- **(B) Promote everything to `Source`** — add `Source.ClusterCatalog`, etc.
  Cons: pollutes the append-only on-disk-format enum with metadata identities
  that never render or persist.
- **(C) Extend declarative pattern to volumes/filaments only**, leave
  auxiliary assets hand-wired.

**Decision:** A.

**Reasoning:** "Source" (render/pick identity, baked into `.bin` + pick texture)
and "Asset" (fetchable file) are genuinely different sets: some Sources aren't
fetched (`Cluster`/`Supercluster`/`Void` come from a seed), and some assets
aren't Sources (`clusterCatalog`, `famousMeta`, `pgcAlias`). Keying the wiring
by a broader `AssetKey` respects both the layering boundary and the enum's
on-disk discipline.

**Consequences:** The wiring registry replaces `GALAXY_CATALOG_SOURCE_REGISTRY`
and absorbs all the hand-wiring.

---

### Demand-driven loading (the unifying pattern)

**Question:** How declarative should the per-asset load policy be?

**Options considered:**
- **A `when` union** (`boot` / `boot-if-visible` / `companion` / `lazy` /
  `fallback` / `never`) interpreted by a boot loop.
- **A `demand` predicate** — `demand: (ctx) => boolean`. An asset loads iff it
  is *required*; one `reevaluateDemand(state)` evaluator replaces every ad-hoc
  trigger site.

**Decision:** `demand` predicate. (Supersedes the `when` union entirely.)

**Reasoning:** Every entry in the load-policy table was secretly answering the
same question — "is this asset required right now?" — with the answer hardcoded
into a different `when`. `boot-if-visible` = required ⇔ enabled; `boot
unconditional` (mcpm) = required ⇔ enabled *and default-on*; `companion` =
required ⇔ owner required; `lazy`/`never` = required ⇔ requested/toggled;
`fallback` = required ⇔ all surveys settled without success. They collapse into
one predicate. Several current assets (filaments, mcpm, clusterCatalog) skip the
predicate and load unconditionally at boot — the over-eager loading the
principle objects to. `companionOf` also dissolves: a companion is just a
predicate referencing the owner. Idempotent `slot.load` makes repeated
evaluation safe. The two genuinely event-driven cases (palette request,
synthetic settling gate) stay as code but *read their slot set from the
registry* and trigger a re-evaluation rather than encoding control flow as data.

**Consequences:** Public-handle setters (`setSourceVisible`,
`setVolumeFieldEnabled`) stop calling `.load()` directly — they flip a setting
and re-evaluate. `DemandCtx` exposes four read surfaces: settings, visibility/
drawMask, request flags, sibling slot states. Trigger model is a coarse
"re-evaluate all on any change" pulse (≈15 assets × a boolean is free).

---

### Demand governs loading only (not unloading)

**Question:** Does "only if required" also mean "unload when no longer
required"?

**Decision:** Loading only for this program. Once loaded, an asset stays
resident (matches today's toggle-off = fade, not free).

**Reasoning:** Full immutability/eviction is impossible-or-wrong for a render
engine (GPU handles, per-frame reads). Symmetric unload reaches into the
renderer's upload/unload + GPU memory model — a much larger, separate concern.

**Consequences:** **Parked:** demand-driven unload / GPU eviction → own spec,
only if GPU memory becomes a pressure.

---

### State mutation: concentrate, don't eliminate

**Question:** Can we stop mutating `state` directly everywhere?

**Decision:** Concentrate mutation into a thin shell; don't chase immutability.
This program does *construction purity*: (i) factories **return**, never
install; (ii) the orchestrator does the **single install** (assemble-then-
assign).

**Reasoning:** A long-lived render engine can't be copy-on-write (GPU handles,
per-frame hot path, async asset arrivals). The real smell is that factories both
*construct and install* (`state.assetSlots.X = slot; return slot;`) and that
runtime writes happen ad-hoc from any closure. Pure constructors + a single
install site shrink the "pass state everywhere" surface and isolate mutation to
the orchestrator.

**Consequences:** **Parked:** typed runtime setters + deep-`readonly`
`EngineState` (the type-enforced thin shell) → own spec; it touches the frame
loop + public handle.

---

### POI is a consumer, not a data type; the merge is dissolvable

**Question:** Why does `rebuildAllPois` merge three groups, and where should
the merge live?

**Options considered:**
- **(A)** `poiSubsystem.registerSource({build, dependsOn})` — subsystem owns
  the merge + every asset format.
- **(B)** Central `wirePoiProjection` module — relocates the merge.
- **(C)** `poiSubsystem` holds **keyed groups**; each projection writes its own
  group via `setGroup(id, pois)`; the subsystem concatenates internally.

**Decision:** C.

**Reasoning:** The merge exists *only* because `setPois` replaces the whole list
while three groups (static anchors / famous join / bulk clusters) arrive on
different schedules — independent writers would clobber each other. Keyed groups
make clobbering structurally impossible and dissolve the merge instead of
relocating it. It matches the demand-driven, each-asset-owns-its-projection
spirit. The famous group is a 2-asset **join** (Famous catalog ⋈ famousMeta) and
sets its group when both are ready.

**Consequences:** `poiSubsystem.setPois` → keyed `setGroup`/`clearGroup`.

---

### The POI subsystem has no single responsibility — split data from presentation

**Question:** What *is* the POI subsystem's single responsibility?

**Decision:** Today it has two on two clocks — a **store** (POI list +
visibility + identity lookups, mutates on async arrival) and two **per-frame
producers** (labels, markers, hot path). It's the same data-vs-presentation seam
as the rest of the system. The subsystem's SRP *should be* the store; the
producers are separate presentation units (they already have the `LabelProducer`
shape the director polls).

**Reasoning:** Store and producers change for different reasons and run on
different clocks; co-locating them is why the subsystem reads as incoherent.

**Consequences:** Narrowing to the store is required by C and lands now;
extracting the producers is presentation-layer work → Spec 3.

---

### Structures are a first-class data type — symmetry across all four types

**Question:** Galaxies have many subsystems; structures (cluster/SC/void) have
none. Illogical?

**Options considered:**
- **(A)** Keep "POI" as a shared labeled-anchor presentation store; structures
  served by it; famous galaxies a flagged guest.
- **(B)** Full symmetry: a first-class **structureStore**; evict famous-galaxy
  labels to a galaxy-side producer; "POI" dissolves as a concept.

**Decision:** B — no exceptions.

**Reasoning:** The apparent asymmetry mixes two axes. Most "galaxy subsystems"
(atlas, disks, hi-res) are *presentation*; galaxies have more because billboards
need LOD escalation — proportionate, not illogical. The real bugs: "POI" is a
*presentation role pretending to be a data type* (so structures have no clearly-
named data home) and it *smuggles in famous galaxies* (a galaxy dual-role
borrowing the label path). B gives structures their own store and removes the
guest, making galaxies and structures symmetric at the data layer. The user
rejected interim exceptions in the *final* design.

**Consequences:** famousMeta becomes galaxy data; famous-galaxy labels are
produced by a galaxy-side label producer reading `galaxyStore` + famousMeta;
"POI" disappears. (Famous galaxies may remain an *interim* labeled-anchor member
until Spec 3 lands — an incremental-delivery state, not a permanent exception.)

---

### One store per data type — depth follows CPU footprint, not dogma

**Question:** If structures get a store, why not galaxies / filaments / volumes?

**Decision:** Yes — `state.data.{ galaxies, structures, filaments, volumes }`,
each the authoritative app-side home + canonical query API for its type. A store
holds the *app-side authoritative state*, **not** a blind copy of the payload:

| Store | Holds | Why that depth |
|---|---|---|
| galaxyStore | `Map<Source, GalaxyCatalog>` + famousMeta | CPU-queried (InfoCard, pick, famous join) → rich |
| structureStore | cluster/SC/void records, keyed groups, lookups, visibility | CPU-queried (pick, labels, markers, camera) → rich |
| volumeStore | registered field ids + per-field params | voxels live on GPU → thin metadata |
| filamentStore | loaded flag + counts | geometry lives on GPU → thin metadata |

**Reasoning:** Symmetry is in the *pattern* (one store per type; the renderer is
never the source of truth for *status*), not in identical contents. Forcing a
full CPU copy of GPU-resident voxels/geometry would duplicate ~100 MB for
nothing. Rich vs thin reflects "does the app query this on the CPU?" — a real
property, not an exception.

**Consequences:** `state.sources.catalogs` → `galaxyStore`; `clusterBulk` + the
narrowed POI store → `structureStore`; volume field settings →
`volumeStore`; filament status → `filamentStore`.

---

### Sequencing: wireSlots first, then stores, then presentation

**Question:** Given the expanded scope, can we still do a standalone wireSlots
refactor, and in what order?

**Decision:** wireSlots' mess decomposes into three rework-risk tiers. Ship a
standalone **Tier-1 wireSlots refactor first** (pure relocation: extract impostor-
subsystem construction, fade-handle registration, the POI merge → keyed groups,
and the synthetic-fallback gate; plus construction purity) — rework-proof
against the later store rename. Then **Spec 2 (data stores)**, then **Spec 3
(presentation realignment)**. The demand-driven wiring registry can be folded
into the wireSlots spec or the stores spec; it carries modest rename rework if
done pre-stores.

**Reasoning:** Tier-1 barely touches `state.sources.*` (the part the store reorg
renames), so it survives the program untouched and delivers the original goal
immediately while de-risking the bigger work.

**Consequences:** Three specs under one ADR. Two parked items (readonly state +
typed setters; demand-driven unload) get their own specs later.

---

## Parked (explicitly unresolved)

- **Typed runtime setters + deep-`readonly` `EngineState`** — the type-enforced
  thin shell. Touches the frame loop + public handle. Own spec.
- **Demand-driven unload / GPU eviction** — the symmetric half of demand. Touches
  renderer memory model. Own spec; only if GPU memory becomes a pressure.
- **Famous-galaxy label producer placement** — within Spec 3, whether famous
  labels live in a single all-category label producer or a famous-specific one.
