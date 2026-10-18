# GLADE on the chunked octree: design spec

**Research:** `docs/research/2026-10-08-galaxy-octree-streaming.md` §8 (converged container design), §11 (GLADE
brainstorm, rulings 2026-10-14 and the refactor-ground checkpoint 2026-10-16). **Container:** the star spec,
`docs/superpowers/specs/completed/2026-10-10-chunked-star-octree-design.md`, whose framing, node row, stratification and
chunking this slice reuses unchanged. This spec is written against the architecture after the prep in §9.

## 1. Goal and non-goals

GLADE streams as a brightness-stratified chunked octree: one build, coarse-to-fine by screen size, an unloaded subtree
drawn as its blob, tiers as pool budgets. The other four galaxy sources (SDSS, 2MRS, DESI, Milliquas) and the famous
galaxies stay on SKMP v10 and draw exactly as today.

Non-goals: REGALADE (wired after GLADE streams); moving the flat sources onto the pool (the record contract in §5.1 keeps
that open); thumbnail LOD driven by the stratification; Gaia `source_id` (backlog).

## 2. Objects

Each chunk is **two objects**: a **render object** holding the columns the GPU record needs, and an **info object**
holding the columns only the CPU reads (ruled 2026-10-16). The index object gets an info object too, for its hoisted
records. Both objects of a pair hold the same records in the same order, so a record's ordinal and object-local index
are shared.

| Object        | Framing                                          | Path                                                     |
| ------------- | ------------------------------------------------ | -------------------------------------------------------- |
| index         | `SKOI`, node table, render columns               | `galaxy-octree/v1/glade.<hash>.bin` (data manifest)      |
| index info    | `SKOF`, no node table, info columns              | `galaxy-octree/v1/glade.info.<hash>.bin` (data manifest) |
| chunk         | `SKOC`, node table, render columns (star §2.1)   | `galaxy-octree/v1/glade/<level>-<morton>.<hash>.bin`     |
| chunk info    | `SKOF`, no node table, info columns              | `galaxy-octree/v1/glade/<level>-<morton>.<hash>.info.bin` |

- **One hash per pair.** `OctreeChunkRef.hash` is taken over both objects' bytes, so a change to either renames both and
  the immutable cache never serves a stale half. `OctreeChunkRef` keeps its shape; `bytes` stays the render object's size
  (the planner's wire hint), and the info object's size is in its own header.
- **The index header declares both groups**: `columns` (render, as today) and `infoColumns` (absent for stars, read as
  `[]`). An info object's header carries `kind: 'info'`, `records`, and its byte size; its columns follow the framing in
  `infoColumns` order, 8-byte aligned as in star §2.4.
- The `SKOF` magic is new; the version stays 1 (star §2.1: a new key is never a version bump).

## 3. Galaxy family

### 3.1 Registry rows

- `OctreeFamily` gains `'galaxy'`; the family table (prep 2) gets a galaxy row: prefix `galaxy-octree/v1`, render and info
  schemas, `unitMpc = 1` (the grid is in Mpc).
- `COLUMN_IDS` appends `axisRatio`, `pa`, `logSize`, `flags`, `angularWeight`, `specZ`, `logMass`, `magU`, `magG`, `magR`,
  `magI`, `magZ` (the five bands of `GalaxyCatalog`), `objId`.
- `FAMILY_REQUIRED_COLUMNS.galaxy`: `offset`, `absMag`, `colourIndex`, `axisRatio`, `pa`, `logSize`, `flags`,
  `angularWeight` (render) and `objId`, `specZ` (info).
- `STAT_IDS` appends `recordCount`, `medianAbsMag`,
  `magOffset`, `orientationEstimated` and `diameterEstimated` (the per-axis counts today's `countEstimatedProvenance` returns).
- `ColumnStore` gains `u64` for `objId` (decoder, raw column type, writer and encoder: four files).
- The family table names each family's count stat (`starCount` for stars, `recordCount` for galaxies) and
  `Octree<C>.recordCount` reads it. `STAT_IDS` is append-only and every shipped star index says `starCount`, so the
  name cannot be unified without a star re-bake.

### 3.2 Schemas

Render, 13 B per record on the wire:

| id              | store   | encoding                                                                                 |
| --------------- | ------- | ---------------------------------------------------------------------------------------- |
| `offset`        | `u16x3` | fraction of the owning node's box (star §2.4)                                             |
| `absMag`        | `u8`    | affine over the catalog's absolute-magnitude range                                        |
| `colourIndex`   | `u8`    | the value `pickColourIndex` computes today, baked (`src/data/galaxyCatalog/colourIndex.ts`) |
| `axisRatio`     | `u8`    | linear 0–1                                                                                 |
| `pa`            | `u8`    | 0–180° (axial)                                                                             |
| `logSize`       | `u8`    | log of the physical diameter (feeds the padded radius at upload)                          |
| `flags`         | `u8`    | bit 0 orientation fallback, bit 1 diameter fallback (`orientationIsFallback`, `diameterIsFallback`) |
| `angularWeight` | `u8`    | the v10 log codec (`encodeAngularWeight`), computed over the **whole catalog** (§6)        |

Info, 23 B per record: `objId` `u64`, `specZ` `f32` (`spectroscopicZ`), `logMass` `u8` (sentinel 0 = absent), five band
magnitudes `f16` (NaN = absent). GLADE large at 1.67 M records: about 22 MB render and 38 MB info, before gzip.

### 3.3 Aggregation (blob values)

Through the aggregate rule table (prep 5): `offset` flux centroid, `absMag` mean-flux magnitude, `colourIndex` and
`logSize` flux-weighted mean, `axisRatio` flux-weighted mean, `pa` **axial** flux-weighted mean (doubled-angle vector
sum), `flags` **none** (zero), `angularWeight` flux-weighted mean of the decoded weight. Info columns are not aggregated:
a blob has no info record (`objId` 0).

### 3.4 Stratification

The galaxy family gets its own triple (research §11 open item 3: `GLADE_ENTRY.mLim` is apparent, the stratify `mLim` is
absolute at `refUnit`):

- `refUnit = 1` Mpc; `mLim` the absolute magnitude that resolves at 1 Mpc; `thr` the galaxy refine threshold, a new
  setting in the galaxy catalog slice (the star layer's `refineThreshold` is the precedent).
- First values are fixed by a bake sweep in the plan: the zoomed-out survey pose must draw about the same number of points
  as today's medium tier before any chunk loads. Dense cells: `ownCount ≤ 8192` stays a bake STOP (star §2.6).

## 4. GPU

### 4.1 Record

24 B, six `u32` words, written at upload. **Every per-galaxy derivation runs in TypeScript at upload, through the same
helpers the flat interleave uses** (`buildPointInterleavedBuffer.ts:70-105`: the PA sign flip and cos/sin,
`paddedRadiusMpc`, the apparent magnitude with `magOffset`, `galaxySbAmp` with `medianAbsMag`); the shader only decodes.
A second copy of those derivations in WGSL would drift, and point ↔ disk brightness parity rests on `galaxySbAmp`.

| word | content                                                              |
| ---- | -------------------------------------------------------------------- |
| 0    | x (16) \| y << 16 (node-relative offset)                             |
| 1    | z (16) \| absMag (8) << 16 \| colourIndex (8) << 24                  |
| 2    | axisRatio (8) \| angularWeight (8) << 8 \| flags (8) << 16, 8 spare  |
| 3    | paCos (f16) \| paSin (f16) << 16                                     |
| 4    | apparent magnitude (f16) \| sbAmp (f16) << 16                        |
| 5    | padded radius in Mpc (f32; sign = diameter fallback, as slot 8 today) |

The wire's `u8` columns land in the record unchanged, so upload loses no precision. 24 B against the flat interleave's
48 B.

### 4.2 Pipelines

A second point pipeline, `galaxyPooledPointRenderer`: the cut (shared, record-blind) at `@group(1)`, the record pool at
`@group(2)`, the galaxy `Uniforms` at `@group(0)` and a per-source block carrying today's `SourceUniforms` and fade. Its
prologue reads a record through the cut list (as the star `vertex.wesl` does) and builds the same `PerVertex` the flat
pipeline gets from its vertex buffer; both call the vertex-stage body extracted in prep 7, so bias modes, the distance
fade, SB terms, highlight and pick are one shader function. The pick pipeline mirrors this. Blobs draw through the same
body with `blobCount` scaling flux (research §11 ruling: plain brighter billboard first).

### 4.3 Pool and budgets

`OctreeBudgets` per tier (the renamed star budgets): small / medium / large set pool slots and the draw budget; a tier
switch is a pool resize (the star path's `resizePools`), never a refetch of the index. Slot stride `chunkCapacity` ×
24 B (32,768 records ≈ 768 KB). The pick cap (`indexRecords + slots·chunkCapacity < 2²⁶`) binds the large budget.

## 5. Runtime

### 5.1 The record contract

Consumers read rows through `GalaxyRecordSource` (prep 6), one per loaded source:

```ts
type GalaxyRecordSource = {
  readonly source: GalaxyCatalogSourceType;
  /** Real records the source holds in total (UI count); resident or not. */
  readonly recordCount: number;
  readonly stats: { readonly medianAbsMag: number; readonly magOffset: number; readonly provenance: ProvenanceCounts };
  /** Pick instance → ordinal and back; null when the record's object is not resident. */
  ordinalOfPick(pickIndex: number): number | null;
  pickOfOrdinal(ordinal: number): number | null;
  /** Resident records as column blocks: flat yields its catalog once, the octree one block per resident chunk. */
  forEachResidentBlock(visit: (block: GalaxyColumnBlock, ordinalBase: number) => void): void;
  /** Synchronous membership, for the palette's name join. */
  hasDurableId(id: string): boolean;
  /** Lookups that may need data first: a plain value when at hand, a promise when not. */
  loadRow(ordinal: number): GalaxyRow | null | Promise<GalaxyRow | null>;
  resolveDurableId(id: string): number | null | Promise<number | null>; // `pgc-…`, `sdss-…` → ordinal
  resolvePosition(raDeg: number, decDeg: number, distMpc: number | null): number | null | Promise<number | null>;
};
```

- The flat implementation wraps today's `GalaxyCatalog`: ordinal = row index, everything resident, every lookup a
  plain value (`resolveDurableId` is today's `resolvePgc`/`resolveSdss` scan, `resolvePosition` today's `resolvePos`).
  The octree implementation is §5.2–5.5.
- **The bridge to the synchronous selection row** stays inside the galaxy Layer: a plain value passes straight through;
  a promise is memoised per ref, the call returns null (defer) while it is pending, and on settle the bridge emits the
  source-count pulse the deferring saga already retries on (`resolveFocusRefDeferringSaga.ts:16-21`). The saga does not
  change. (Ruled 2026-10-18: a settled promise cannot be read synchronously, so always-promise lookups would defer every
  flat selection by a pulse.)
- **`pos@` ids carry the distance** (ruled 2026-10-18): `pos@<ra>,<dec>,<dMpc>`. A legacy two-part id decodes with a
  `null` distance and is answered by direction, as today, by the sources that can; the octree answers only ids with a
  distance.
- The interleave builder takes `stats` from the source instead of recomputing them per tier; for flat sources the values
  are what it computes today, so their render is unchanged.

### 5.2 Load and streaming

**Both GLADE versions stay loadable** (ruled 2026-10-16), so they can be compared in the app and the mcpm workbench keeps
its input. The choice is a property of the galaxy catalog, not of GLADE:

- `GalaxyCatalogFormat = 'skmp' | 'octree'` (the galaxy counterpart of `StarCatalogFormat`).
- A row declares what it ships: `tierTargets` for SKMP files (as today) and an optional `octree: { budgets: OctreeBudgets }`.
  GLADE ships both; the other four ship SKMP only; REGALADE will ship the octree only.
- A **per-source format** setting in the galaxy catalog slice, `formats: Partial<Record<GalaxyCatalogSourceType,
  GalaxyCatalogFormat>>`, persisted in the URL so a shot can pin it. A source with no entry loads its row's default
  (the octree when it ships one); the settings panel shows the Octree / Flat files choice only on rows that ship both.
- The slot wiring is the one site that reads the row's formats and the setting, and builds the matching record source.
  Switching releases one and loads the other, as a tier switch does today. Index + index info fetch
through the data manifest; chunks stream through the shared chunk stream (prep 3) with the galaxy path builder and
decoder, planned by the shared CPU planner over the index each frame. Info objects are not streamed: `loadRow` fetches
them on demand through a small LRU keyed by chunk id, separate from the render pool.

### 5.3 Pick, InfoCard, highlight

The pick draw writes the pool-absolute index; `ordinalOfPick` maps it through the extracted ordinal mapping (prep 3,
`recordOrdinal`), and `pickOfOrdinal` serves the highlight (`poolRecordIndex`). Selecting a GLADE record calls
`loadRow`, which fetches its chunk's info object, so the selection defers one round trip through the bridge in §5.1. The
`pgc-` focus id stays the persisted id (`encodeGalaxyId.ts`): ordinals never enter a URL.

### 5.4 Durable ids and search

- **pgc side index**, baked: shards of 65,536 entries sorted by pgc, each entry `{ pgc u64, ordinal u32, position f32x3 }`
  (24 B; one shard ≈ 1.5 MB). The shard directory (first pgc per shard) is its own index-header key, `pgcShards`.
- The octree `resolveDurableId('pgc-…')` fetches the shard and returns the ordinal; the focus flies to the entry's
  position, the planner loads the chunks there, and `loadRow` resolves once the chunk and its info object are resident.
- **Names keep their join, through the contract** (ruled 2026-10-18): the palette lists a name when a source's
  `hasDurableId('pgc-<n>')` confirms it, over every source with a `pgc` claim instead of the hardcoded
  `[Glade, TwoMRS]` list (`frame.ts:52`). The octree answers `hasDurableId` from a baked set of the pgcs that have a
  name in `pgc_aliases.json`, small enough to ride in the index header.
- The octree `resolvePosition` (with a distance) descends the index to the cell holding the position, requests that
  chunk, and settles once it is resident; without a distance it returns null.

### 5.5 Planners, structures, stats

- Disk planners walk `forEachResidentBlock`, the stride window per block; sticky maps key by ordinal, which is stable for the bake and survives eviction.
- Structure membership and its member count keep today's meaning, **the rendered members**
  (`structureMemberCount.ts:1-16`), for every source: both walk `forEachResidentBlock`. For GLADE that is the resident set,
  which is what is on screen; nothing is baked for structures.
- `medianAbsMag`, `magOffset` and the provenance counts are header stats; the decode-time passes go for GLADE. The flat
  sources keep computing them per tier file (prep 6 is behaviour-neutral); making them catalog-wide everywhere is a
  backlog item.
- `VolumeLimited` cuts on absolute magnitude after `magOffset`; for GLADE `magOffset` becomes one catalog-wide value
  instead of a per-tier one, so its threshold moves. The A/B checks this mode (§8).

## 6. Bias weight

The angular weight is computed over the whole GLADE catalog (ruled 2026-10-14: blobs conserve flux, so every view draws
the whole catalog, as today's large tier does). "None" stays in the dropdown; the A/B compares None against Angular before
the column is treated as permanent (the user is unsure it is needed on the octree).

## 7. Build and deploy

- `build-tiers` keeps its pipeline through cross-match; for GLADE it then calls the octree emitter (shared
  `buildOctreeCatalog`) instead of writing tier files, and writes the info objects and the pgc shards beside it. Chunk
  info objects are named `octreeChunkFileName(ref)` with an `.info` suffix; the index info object is a data-manifest
  entry like the index.
- GLADE's SKMP tier files keep being written and synced: the flat GLADE format reads them, and so does the mcpm
  workbench. Retiring them (and the format setting) is a later ruling, after the A/B.
- Deploy: the galaxy octree is a row in the octree catalog list (prep 4): chunk and info objects in one bulk group,
  immutable, gzip on the wire; the index pair and the shard objects on the hashed-manifest path. The galaxy octree joins
  the star family's Cloudflare cache rule (research §11 open item 4).

## 8. Testing and the A/B

- Unit: galaxy schema round-trip through encode/decode (render and info), the `u64` store, the axial `pa` aggregate, the
  24-byte GPU packer against the flat interleave's slots for the same galaxy (one derivation, two layouts), `ordinalOfPick`/`pickOfOrdinal` inverse, shard lookup.
- Prep 6 is behaviour-neutral: the flat source's `stats` equal today's per-tier values (a test pins them), and the
  existing galaxy suite stays green unchanged.
- A/B in one build through GLADE's format setting (Flat files vs Octree, same data, same code), before/after shots at the full-survey and 3.5 Gpc poses and one close pose inside the
  Local Volume, per bias mode (None, Volume-limited, Angular): brightness and structure must match within the eye-check;
  the zoomed-out pose must look right with no chunk loaded (blobs only); `npm run perf` before and after at the perf
  poses; a phone check of first paint on throttled 4G (`npm run loadtime`).
- Smoke: pick a GLADE galaxy → InfoCard fills; `#focus=pgc-<id>` deep link to a galaxy whose chunk is not resident;
  palette search for a GLADE-only name; tier switch with no refetch.

## 9. Ground preparation

From the refactor-ground checkpoint of 2026-10-16 (research §11). 19 touchpoints would be special cases today. Seven
prep commits create the joints, landing as **one separate PR** before the feature PR; none changes a file format or needs
a re-bake.

| # | Prep commit                                                                                          | Bolt-on it removes                                                     |
| - | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1 | `StarOctree`/`StarChunk` → `Octree<C>`/`OctreeChunk<C>`; shared cut, stream, pool, planner, residency and ~35 companion types renamed and moved to a family-neutral home; `StarSourceBudgets` → `OctreeBudgets` | record-blind modules typed as stars, under `layers/starCatalog` and `utils/star` |
| 2 | Family table (prefix, render schema, grid unit) keyed by the header's family; star rows to a star family file; the 9 parsec sites read `unitMpc` | star constants in `octreeFormat.ts:69-103`, `MPC_TO_PC` on the octree path |
| 3 | Chunk stream and pool take the path builder, decoder and record stride; the `type === 'starCatalog'` guards go; `recordOrdinal`/`poolRecordIndex` extracted from the star renderer | `starChunkStream.ts:20`, `installStarPool.ts:23`, `starCatalogRenderer.ts:205` |
| 4 | One list of octree catalogs drives the sync group, chunk collector, `DATA_FAMILIES` rows and `fetchPrebuiltData` | four star-only spots in `tools/deploy` and `tools/catalog` |
| 5 | Aggregate kinds as a rule table; the star bake's output byte-identical                              | if/else on the kind at `stratifyOctree.ts:110,146,164`                 |
| 6 | `GalaxyRecordSource` with the flat implementation; the 12 consumers move onto it; names resolve through `resolveDurableId` | flat row index as identity, whole-array scans, the `[Glade, TwoMRS]` lists (§5.1, §5.4) |
| 7 | The galaxy vertex-stage body becomes a library function the flat prologue calls; the per-galaxy derivations in `buildPointInterleavedBuffer` become one function over a galaxy's fields, so the octree upload calls it too | attributes reachable only from a vertex buffer (`points/vertex.wesl:86`); derivations inlined in the interleave loop |

Growth in the feature (no prep): the galaxy rows of §3.1, the info objects and `SKOF`, the `u64` store, the GLADE
emitter call, the galaxy stratify setting, the octree record source, the pooled pipeline, the pgc shards, the `octree`
member on GLADE's row, `GalaxyCatalogFormat` and the per-source format setting.

Rejected at the checkpoint: a `format: 'skmp' | 'octree'` branch at each of the 12 consumer sites (two cases at 12 sites
for as long as both kinds exist); decoding the flat files into the pooled record now (one path, but a re-verification of
all five sources in this slice); a galaxy grid in parsecs; GLADE as its own Layer (collides with the shared `pgc-` claim
and settings slice).

## 10. Risks and open questions

- **Collision with the in-flight layer-visibility plans** (`docs/superpowers/plans/2026-10-14-layer-declared-visibility.md`,
  `2026-10-15-layer-visibility-ground.md`): both edit `galaxyCatalog/frame.ts`, `wireGalaxyCatalogSourceSlot.ts` and
  `galaxyPointSpritesPass.ts`. Whichever lands second rebases; prep 6 should start after the ground plan merges.
- The info object costs one round trip on every GLADE pick; if that reads as lag, the index-hoisted records' info is
  already resident and the nearest chunks' info can be prefetched with the render object.
- `thr`, `mLim` and the budgets need a bake sweep (§3.4); the A/B decides whether blobs need a disc look.
- Whether the angular weight stays (§6).
- The format setting and GLADE's flat files are a deliberate second path for the A/B; the spec does not decide when they
  go.
