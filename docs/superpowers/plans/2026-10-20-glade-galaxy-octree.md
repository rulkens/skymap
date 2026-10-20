# GLADE on the chunked octree: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development under the lean protocol in
> `docs/superpowers/conventions/sdd-execution.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GLADE streams as a brightness-stratified chunked octree beside its flat SKMP files, chosen per source by a
format setting, so the two can be compared in one build; the other galaxy sources draw exactly as today.

**Architecture:** the bake grows a galaxy family (render columns through the shared stratify/chunk pipeline, CPU-only
info columns written beside each object from the parser's own arrays, a chunk directory and pgc shards in the index);
the runtime adds an octree GLADE slot whose `GalaxyRecordSource` serves picks, rows, ids and positions from the pool
plus an on-demand pair cache; a pooled point pipeline reads 24-byte records through the shared GPU cut and calls the
galaxy vertex body prep 7 extracted. The star layer's per-frame stream driver becomes shared code first (Task 7), so
the galaxy planner is a second caller, not a copy.

**Tech stack:** TypeScript, WebGPU + WESL, Vitest, tsx tools, Redux Toolkit.

**Spec:** `docs/superpowers/specs/2026-10-16-glade-galaxy-octree-design.md` (§1–8; §9's prep shipped in #919,
`0fb596c73`). Prep plan and ledger: `docs/superpowers/plans/completed/2026-10-16-glade-octree-prep{,.ledger}.md`.

## Rulings and plan-time decisions

User rulings (2026-10-20, ask 62Ew):

- **Tier switch copies the star path:** the slot reloads in place on a tier change (the hashed index comes from the
  browser cache) and the commit re-installs the pool at the new tier's slots. Spec §4.3's "never a refetch" is not built.
- **The format is pinned by a boot query flag**, `?galaxyFormat=glade:skmp` (comma-separated `source:format` pairs),
  read once at mount into the settings slice. No hash row; the in-app control changes the slice only.
- Serial, one worktree. Perf gate runs (Task 13).

Decided at plan time (each simpler than the spec text; the reviewer checks against these, not the spec's wording):

- **D1. Info objects are written from the parser's arrays, through a record permutation.** Every bake column is a
  `Float32Array` (`OctreeBuildInput.columns`, `quantiseColumn`), which cannot carry a `u64` pgc. The stratify/chunk
  pipeline reports, per object, the input row of each record (`sourceRows`); the info writer reads the original typed
  arrays through it. `u64` exists only on the info path.
- **D2. Chunk info files are `<level>-<morton>.info.<hash>.bin`** (spec: `.<hash>.info.bin`), so
  `logicalDataName` strips the hash as it does for every other data file.
- **D3. An `SKOF` object describes itself:** its header carries its own `columns`. The index header gets no
  `infoColumns` key and the info header no `bytes`.
- **D4. The index header carries a chunk directory** (`chunkDirectory`: every chunk ref, sorted by `recordBase`). It is
  how a non-resident ordinal finds its chunk; the index's `chunks` lists only the roots and child refs live in chunk
  headers.
- **D5. A pgc shard entry is `{ pgc u64, ordinal u32 }`** (spec: plus a position). The position comes from the record
  once its pair is fetched, so the shard need not repeat it.
- **D6. `angularWeight` is stored as `log10 w`** and quantised affinely with `q0 = −128/127`, `q1 = 1/127`, which is
  exactly `encodeAngularWeight`'s code. The blob aggregate is the flux-weighted mean of `log10 w`.
- **D7. A blob record's row in a `GalaxyColumnBlock` has a NaN position**, and every block consumer skips it. Blobs sit
  between real records in the pool order (one after each node's own records), so a block cannot simply leave them out
  without breaking `ordinalBase + i`.
- **D8. `GalaxyColumnBlock` trades the five bands for `colourIndexAt(i)`.** Only the procedural disk reads bands, to get
  the ramp position (`proceduralDiskSubsystem.ts:126`). The octree has the baked ramp position and no resident bands.
  The flat block computes it lazily per asked row, and nothing is precomputed for flat catalogs.
- **D9. Blobs draw into the galaxy points target**, not a low-res target like the star aggregates.

## Global constraints

- `COLUMN_IDS` and `STAT_IDS` are append-only; the version stays 1 (a new key or magic is never a version bump).
- The star bake's output stays byte-identical. `tests/tools/stars/buildStars.test.ts` "a seeded star bake keeps its
  pinned index digest" must pass unchanged after every task.
- GLADE's SKMP tier files keep being written and synced: the flat format and the mcpm workbench
  (`tools/mcpm-workbench/src/field/loadCatalogPoints.ts:25`) read them.
- The other four sources and the famous catalog draw exactly as today. A flat-path diff outside the renames named
  here is a STOP.
- One symbol per file in `utils/` and `@types/`, `type` never `interface`, deep relative imports, no barrels. Frame and
  pass files export only their one symbol.
- Move or rename TS files with `npm run move-files -- <from> <to>` and symbols with
  `npm run refactor -- rename <file>#<symbol> <newName>`, each with `--dry` first; then grep `src tests tools` for
  the old name (the CLI misses `.wesl` `package::` imports and string literals).
- Comments explain why, within module header ≤ 10 lines and comment lines ≤ half the code lines.
- Never `git add -A`; stage by path. `npx prettier --write` touched files. No attribution trailer on commits.
- Shader tasks also run `npm run build` (a dangling `package::` import is invisible to `tsc`).

## Review focus

The conditions most likely to bite that the spec implies but no happy-path test exercises; each line's test lives in
the owning task.

1. A blob record reaching a consumer as a galaxy: structure membership counting it, a disk drawn for it, `loadRow`
   returning a row for it (Tasks 10, 11).
2. A pgc focus link to a galaxy whose chunk is not resident and whose shard is not loaded: defers, then lands on the
   right galaxy, never on another record with the same ordinal from the flat source (Task 11).
3. Switching GLADE's format while a promise from the released source is pending: the late settle must not be served
   (Task 11; the bridge's per-source-object memo covers it, the test pins it for the octree source).
4. A `?galaxyFormat` value that names an unknown source or format, or GLADE `octree` on a build with no galaxy
   octree file: ignored or failed loudly in the slot, never a blank sky with no error (Tasks 8, 10).
5. NaN band magnitudes and a missing pgc (`objID 0n`) through the info writer and reader: NaN survives `f16`, objId 0
   never answers `hasDurableId` (Tasks 3, 4).

## Grouping and models

| Dispatch | Tasks         | Model  | Why together                                                          |
| -------- | ------------- | ------ | --------------------------------------------------------------------- |
| A        | 1, 2, 3       | Opus   | Binary format and bake internals (`review: yes` on 2 and 3)           |
| B        | 4, 5          | Sonnet | The GLADE emitter and its deploy rows read Task 2–3's shapes          |
| —        | 6             | controller | Run the bake; inline                                              |
| C        | 7, 8          | Sonnet | Shared stream driver extraction, then the format setting and its UI   |
| D        | 9, 10         | Opus   | GPU record, pooled pipeline, cut compute, planner (`review: yes`)     |
| E        | 11            | Opus   | The octree record source: picks, rows, ids, positions (`review: yes`) |
| —        | 12, 13, 14    | controller | Bake sweep, A/B with the user, perf, docs and backlog             |

Serial in this worktree. Mid-branch reviews: Tasks 2, 3, 9, 10, 11. One whole-branch review at the end. Perf gate:
Task 13. Data: Task 6 bakes into this worktree's own `public/data` (assemble symlinks to main's files plus a real
`galaxy-octree/` directory, as done for #902); never write into main's `public/data`.

---

### Task 1: the axial and none aggregate kinds

**Files:** `tools/@types/octree/ColumnAggregate.d.ts`, `tools/octree/aggregateRules.ts`,
`tests/tools/octree/aggregateRules.test.ts` (create).

`ColumnAggregate` gains `'axialFluxMean'` (an angle in degrees with period 180: the flux-weighted mean of the doubled
angle as a vector, halved back, in `[0, 180)`) and `'none'` (the blob value is 0, no sums). Both are rows in
`AGGREGATE_RULES` (`aggregateRules.ts:8`) with the existing `ColumnAggregateRule` shape.

- [ ] Test `axial mean of 175° and 5° at equal flux is 0°, not 90°`.
- [ ] Test `axial mean weights by flux` (10° at flux 3, 40° at flux 1 → the doubled-angle mean, about 17.4°).
- [ ] Test `the none rule writes 0 and takes no sums` (`sums === 0`, blob output 0).
- [ ] Implement; the star digest test passes unchanged. Commit.

### Task 2: the galaxy family in the format — `review: yes`

**Files:**
- `src/@types/octree/OctreeFamily.d.ts`, `ColumnStore.d.ts`, `OctreeColumn.d.ts`, `OctreeIndexHeader.d.ts`
- `src/@types/octree/OctreeInfoHeader.d.ts` (create)
- `src/data/octree/columnIds.ts`, `statIds.ts`, `octreeFormat.ts`, `octreeFamilies.ts`
- `src/data/octree/galaxyOctreeFamily.ts` (create), `decodeOctreeBody.ts`, `readOctreeHeader.ts`
- `src/data/octree/decodeOctreeInfo.ts` (create)
- `tools/@types/octree/OctreeRawColumn.d.ts`, `tools/octree/encodeOctreeObject.ts`, `tools/octree/writeOctreeCatalog.ts`
- `tools/octree/columnAggregate.ts`
- `tests/data/octree/octreeFormat.test.ts`

Contract:

```ts
type OctreeFamily = 'star' | 'galaxy';
type ColumnStore = 'f32' | 'f16' | 'u8' | 'u16' | 'u32' | 'i8' | 'u16x3' | 'u64'; // COLUMN_STORE_BYTES.u64 = 8
type OctreeColumn = Float32Array | Uint16Array | BigUint64Array; // u64 decodes to BigUint64Array, never dequantised
const OCTREE_INFO_MAGIC = 'SKOF';
type OctreeInfoHeader = { readonly kind: 'info'; readonly records: number; readonly columns: readonly ColumnSchema[] };
// OctreeIndexHeader gains three optional keys (absent for stars):
//   chunkDirectory?: readonly OctreeChunkRef[]  — every chunk, sorted by recordBase (D4)
//   pgcShards?: readonly number[]                — first pgc of each shard, ascending (Task 4)
//   namedPgcs?: readonly number[]                — pgcs with a name in pgc_aliases.json, ascending (Task 4)
function decodeOctreeInfo(buf: ArrayBuffer, required: readonly ColumnId[]): { header: OctreeInfoHeader; columns: ReadonlyMap<ColumnId, OctreeColumn> };
```

- `COLUMN_IDS` appends `axisRatio`, `pa`, `logSize`, `flags`, `angularWeight`, `specZ`, `logMass`, `magU`, `magG`,
  `magR`, `magI`, `magZ`, `objId`, `ordinal`. (`ordinal` is the shard column.)
- `STAT_IDS` appends `recordCount`, `medianAbsMag`, `magOffset`, `orientationEstimated`, `diameterEstimated`.
- `FAMILY_REQUIRED_COLUMNS.galaxy` holds the eight render ids. Info columns are checked by `decodeOctreeInfo`'s
  `required`.
- `readOctreeHeader` accepts `SKOF` and its error text names no star command.

`GALAXY_OCTREE_FAMILY` row: `dataPrefix: 'galaxy-octree/v1'`, `countStat: 'recordCount'`, `unitMpc: 1`, and the render
schema below. `q0`/`q1` are the defaults; the emitter overrides `absMag`'s pair from the catalog's range and writes the
used schema into the header, which the decoder reads.

| id              | store   | q0          | q1          | value fed to the quantiser               |
| --------------- | ------- | ----------- | ----------- | ---------------------------------------- |
| `offset`        | `u16x3` | 0           | 1           | fraction of the owning node's box        |
| `absMag`        | `u8`    | catalog min | range / 255 | absolute magnitude after `magOffset`     |
| `colourIndex`   | `u8`    | 0           | 2 / 255     | `pickColourIndex(...)` (1.05 = unknown)  |
| `axisRatio`     | `u8`    | 0           | 1 / 255     | b/a, fallback value when estimated       |
| `pa`            | `u8`    | 0           | 180 / 256   | position angle, degrees, `[0, 180)`      |
| `logSize`       | `u8`    | −1          | 4 / 255     | `log10(diameterKpc)`                     |
| `flags`         | `u8`    | 0           | 1           | bit 0 orientation fallback, bit 1 diameter fallback |
| `angularWeight` | `u8`    | −128 / 127  | 1 / 127     | `log10 w` (D6)                           |

Info schema (written by Task 3/4, read by Task 11): `objId u64`, `specZ f32`, `logMass u8` (q0 0, q1 1/16, raw 0 = absent),
`magU`–`magZ` `f16` (NaN = absent). Shard schema: `objId u64`, `ordinal u32` (q0 0, q1 1).

`COLUMN_AGGREGATE` (`columnAggregate.ts:6`) becomes keyed by render ids only (it is read only for schema columns):
`axisRatio`, `colourIndex`, `logSize`, `angularWeight` → `fluxWeightedMean`; `pa` → `axialFluxMean`; `flags` → `none`.

- [ ] Test `u64 round-trips 2^53 + 1 exactly through encode and decode`.
- [ ] Test `an SKOF object round-trips its own columns, NaN f16 included`.
- [ ] Test `a galaxy index decodes with chunkDirectory, pgcShards and namedPgcs; a star index decodes without them`.
- [ ] Test `decodeOctreeInfo throws naming the missing required column`.
- [ ] Test `quantising log10 w with the angularWeight schema equals encodeAngularWeight(w)` over `w` in
      `{0.1, 1, 3.7, 10}`.
- [ ] Star digest test unchanged. Commit.

### Task 3: record permutation, info objects and pair hashes in the shared bake — `review: yes`

**Files:**
- `tools/@types/octree/OctreeObjects.d.ts` (or wherever `OctreeObjects` / `OctreeChunkObject` / `StratifiedOctree` live)
- `tools/octree/stratifyOctree.ts`, `tools/octree/chunkOctree.ts`, `tools/octree/writeOctreeCatalog.ts`
- `tools/@types/octree/OctreeInfoInput.d.ts` (create), `tools/octree/encodeOctreeInfo.ts` (create)
- `tests/tools/octree/{stratifyOctree,chunkOctree,writeOctreeCatalog}.test.ts`

Contract:

```ts
// StratifiedOctree, OctreeObjects.index and every OctreeChunkObject gain:
readonly sourceRows: Uint32Array; // per record, in the object's record order: the input row, or NO_SOURCE_ROW for a blob
const NO_SOURCE_ROW = 0xffffffff; // tools/data or beside the type, one symbol per file
// Info columns come straight from the caller's arrays (D1):
type OctreeInfoInput = { readonly schema: readonly ColumnSchema[]; readonly columns: ReadonlyMap<ColumnId, Float32Array | Uint8Array | BigUint64Array> };
// writeOctreeCatalog gains an optional `info?: OctreeInfoInput`. With it, each chunk is a pair: the render object plus
// `<level>-<morton>.info.<hash>.bin` (D2), and the index gets `<name>.info.bin` beside `<name>.bin`. A blob's info row
// is objId 0, specZ NaN, logMass raw 0, bands NaN.
```

- **One hash per pair:** `contentHash8` over the render bytes followed by the info bytes. Both files carry it, and the
  ref in the parent's header carries it. Without `info`, the hash is over the render bytes alone, as today.
- With `info`, the index header also gets `chunkDirectory`.

- [ ] Test `sourceRows is a permutation of the input rows plus one NO_SOURCE_ROW per blob`.
- [ ] Test `a record's info row is its input row's values` (a 3-level fixture: pick a chunk record, follow
      `sourceRows`, compare `objId` as a BigInt).
- [ ] Test `changing one info byte renames both files of the pair`.
- [ ] Test `chunkDirectory lists every chunk once, ascending recordBase, matching the files written`.
- [ ] Star digest test unchanged (no `info` → identical bytes). Commit.

### Task 4: the GLADE emitter

**Files:**
- `tools/catalog/buildGladeOctree.ts` (create), `tools/catalog/buildAllBins.ts`, `tools/catalog/buildGladeShards.ts` (create)
- `tests/tools/catalog/buildGladeOctree.test.ts` (create)

After cross-match, `buildAllBins` keeps writing GLADE's tier files and then calls
`buildGladeOctree(records, options)`, which writes `public/data/galaxy-octree/v1/glade{.bin,.info.bin,/…}` and the
shards.

Per record, from the `GalaxyCatalog` that `recordsToCloud` builds over **all** GLADE records:
- `absMag` = `absoluteFromApparent(magG, distance)` after the catalog-wide `galaxyMagOffset`.
- `colourIndex` = `pickColourIndex(Source.Glade, …bands, distance)`.
- `logSize` = `log10(diameterKpc)`.
- `angularWeight` = `log10` of `bakeBiasWeights(cloud, Source.Glade, biasWeight)` over the whole catalog (the
  `--bias-weight` flag, default `angular`).
- `flags` from the two fallback arrays.

Header stats: `recordCount`, `medianAbsMag` (`galaxyMedianAbsMag`), `magOffset`, `orientationEstimated`,
`diameterEstimated` (`countEstimatedProvenance`).

- **Grid:** the Earth origin in Mpc, cube edge covering GLADE's farthest record (follow `deriveGrid`,
  `tools/stars/buildStars.ts:367`). Stratify `refUnit = 1`; `mLim` and `thr` come from the `GLADE_STRATIFY` constant
  (first values `mLim = −14`, `thr = GALAXY_REFINE_THRESHOLD`, created here in `src/data/galaxyCatalog/` with the star
  slice's initial `refineThreshold` as its first value; Task 8's slice reads it as its initial value; Task 12 tunes
  both).
- **Shards:** sort `(pgc, ordinal)` over records with `objID > 0n` (ordinal from the permutation), 65,536 per shard.
  Write each as an `SKOF` object `galaxy-octree/v1/glade.pgc-<k>.bin` (hashed through the data manifest). The header's
  `pgcShards` holds each shard's first pgc.
- **`namedPgcs`:** the GLADE pgcs present in `data/pgc_aliases.json`, read through the raw-data registry.
- A dense cell (`ownCount > 8192`) stays the existing bake STOP. Report it; never raise the cap.

- [ ] Test `a 5,000-record synthetic GLADE bake round-trips: every input pgc resolves through its shard to an ordinal whose info objId is that pgc`.
- [ ] Test `records without a pgc are absent from the shards and from namedPgcs`.
- [ ] Test `header stats equal the flat helpers over the same records`.
- [ ] Commit.

### Task 5: deploy and fetch rows for the galaxy octree

**Files:**
- `tools/deploy/r2/octreeCatalogs.ts`, `tools/deploy/r2/octreeDataFamilies.ts`, `tools/deploy/r2/collectOctreeChunks.ts`
- `tools/fetch/fetchPrebuiltData.ts`
- `tests/tools/deploy/r2/{collectOctreeChunks,dataFamilyOf}.test.ts`, `tests/tools/fetch/fetchPrebuiltData.test.ts`

- `OCTREE_CATALOGS` gains `{ family: 'galaxy', name: 'glade' }`.
- `octreeDataFamilies` gains three rows per catalog, all gzip:
  - `<name>-index-info`: `^<name>\.info\.bin$`, wrangler.
  - `<name>-shards`: `^<name>\.pgc-\d+\.bin$`, wrangler.
  - `<name>-chunk-info`: `^\d+-\d+\.info\.bin$`, bulk.
- `collectOctreeChunks` and `octreeChunkPaths` also collect each chunk's info sibling. A family without info writes
  none, so stars stay unchanged.

- [ ] Test `a galaxy catalog collects each chunk with its info sibling; the star catalog's list is unchanged`.
- [ ] Test `dataFamilyOf routes glade.info.<hash>.bin, glade.pgc-3.<hash>.bin and 2-17.info.<hash>.bin`.
- [ ] Commit.

### Task 6: bake GLADE into this worktree (controller, inline)

- [ ] Assemble `public/data` from symlinks to main's files plus a real `galaxy-octree/` directory.
- [ ] Run `npm run build-tiers` for GLADE.
- [ ] Record in the ledger: the object count, index and chunk bytes (render and info, raw and gzip), shard count, and
      the dense-cell headroom (largest `ownCount`).
- [ ] If the bake STOPs, that is a ruling for the user, not a cap change.

### Task 7: the per-frame octree stream driver, shared

**Files:**
- `src/services/octree/createOctreeFrameDriver.ts` (create)
- `src/@types/octree/{OctreeFrameDriver,OctreeDriverStream,OctreeDriverStep}.d.ts` (create)
- `src/layers/starCatalog/frame.ts`
- `src/services/gpu/octree/octreeCutGpu.ts`, `src/services/gpu/octree/octreeCutLayout.ts`
- `src/layers/starCatalog/render/starCatalogRenderer.ts`
- `tests/services/octree/createOctreeFrameDriver.test.ts` (create)

Behaviour-neutral. Lift the plan cadence, the epoch observation and the plan → update loop out of
`starCatalog/frame.ts:66-123` (the `seenEpoch` map, `plannedCut`, `plannedFrame`, `wantedChunks`, and the moving/recut
step) into a shared driver. The star planner keeps its settings, its slot override and `setFrameCut`.

```ts
type OctreeDriverStream<C> = { readonly stream: OctreeChunkStream<C>; readonly octree: Octree<C> };
type OctreeDriverStep = { readonly recut: boolean; readonly awake: boolean; readonly residencyChanged: boolean };
type OctreeFrameDriver<C> = {
  step(nowMs: number, cut: OctreeCutSpec | null, streams: readonly OctreeDriverStream<C>[]): OctreeDriverStep;
  /** Forget the last plan: the streams were re-installed. */
  reset(): void;
};
function createOctreeFrameDriver<C extends { readonly count: number }>(intervalFrames: number): OctreeFrameDriver<C>;
```

- `createOctreeCutGpu(device, label)`: the label replaces every hardcoded `star-cut` GPU label and the timestamp claim
  name. The star renderer passes `'star-cut'`, so its labels are unchanged.
- `checkOctreePoolCaps`'s message names the family, not "star pool".

- [ ] Test `a landing chunk re-plans at once and returns recut` (fake stream whose epoch bumps).
- [ ] Test `a still cut with nothing wanted plans once, then not again`.
- [ ] Test `a moving cut recuts every other frame`.
- [ ] `tests/layers/starCatalog/frame.test.ts` passes unchanged. Commit.

### Task 8: the galaxy catalog format, its setting and the boot flag

**Files:**
- `src/@types/data/galaxyCatalog/GalaxyCatalogFormat.d.ts` (create), `GalaxyCatalogSourceEntry.d.ts`
- `src/layers/galaxyCatalog/sources/glade.ts`
- `src/@types/settings/GalaxyCatalogSettings.d.ts` (or the slice's state type file)
- `src/layers/galaxyCatalog/state/galaxyCatalogs/{slice,initialState,selectors}.ts`
- `src/utils/url/galaxyFormatsFromSearch.ts` (create), `src/main.tsx`
- `src/layers/galaxyCatalog/load/galaxyCatalogAssetRows.ts`
- `src/layers/galaxyCatalog/ui/GalaxiesSection.tsx`, `GalaxiesSectionContainer.tsx`
- tests for each of the above that already have a test file, plus `tests/utils/url/galaxyFormatsFromSearch.test.ts`

Contract:

```ts
type GalaxyCatalogFormat = 'skmp' | 'octree';
// GalaxyCatalogSourceEntry gains:  readonly octree?: { readonly budgets: OctreeBudgets };
// GLADE_ENTRY gains octree: { budgets: { small: { drawBudget: 600_000, slots: 16 }, medium: { drawBudget: 1_000_000, slots: 32 }, large: { drawBudget: 1_700_000, slots: 64 } } }
//   (first values; Task 12 tunes them)
// Galaxy catalogs settings gain:
formats: Partial<Record<GalaxyCatalogSourceType, GalaxyCatalogFormat>>; // initial {}
refineThreshold: number;                                                // the galaxy cut's threshold; initial GALAXY_REFINE_THRESHOLD (Task 4)
// action: setGalaxyCatalogFormat({ source: GalaxyCatalogSourceType; format: GalaxyCatalogFormat })
function galaxyFormatsFromSearch(search: string): Partial<Record<GalaxyCatalogSourceType, GalaxyCatalogFormat>>;
// selector: selectGalaxyCatalogFormat(state, source) → the setting, else 'octree' when the row ships one, else 'skmp'
```

- `galaxyFormatsFromSearch` parses `?galaxyFormat=glade:skmp,…`. It drops a pair whose id names no galaxy source,
  whose format is unknown, or which asks `octree` of a row without `octree`.
- `main.tsx` seeds the slice from `readUrlAtMount().search` (the capture `buildInitialUiState` uses).
- **Asset rows:** the existing point row's `demand` also requires the format `skmp`. Task 10 adds the octree row,
  demanded when the format is `octree`, so the two never load together.
- **Panel:** the GLADE row (any row with both `tierTargets` and `octree`) shows an Octree / Flat files choice beside its
  checkbox. Follow `docs/superpowers/conventions/ui-ux.md`: an interaction test and the layout tokens.

- [ ] Test `galaxyFormatsFromSearch reads pairs and drops unknown sources, unknown formats and octree on a flat-only row`.
- [ ] Test `the GLADE point row is not demanded when GLADE's format is octree`.
- [ ] Test (UI) `choosing Flat files dispatches setGalaxyCatalogFormat for GLADE; rows without an octree show no choice`.
- [ ] Commit.

### Task 9: the 24-byte galaxy GPU record — `review: yes`

**Files:**
- `src/utils/galaxy/packGalaxyGpuRecords.ts` (create), `src/@types/data/galaxyCatalog/GalaxyColumns.d.ts` (create)
- `src/utils/galaxy/galaxyColumnsOf.ts` (create)
- `tests/utils/galaxy/packGalaxyGpuRecords.test.ts` (create)

`galaxyColumnsOf(columns, count): GalaxyColumns` is the stream decoder (the `OctreeStreamFormat.decodeRecords` of the
galaxy family): the dequantised render columns plus `count`.

`packGalaxyGpuRecords(chunk, grid, stats, out: Uint32Array, at: number)` writes six words per record. It walks the
chunk's node table for each record's node origin, and gets each galaxy's derived values from `derivePointRecord`, the
function the flat interleave calls. Its inputs are:
- the position: node origin + offset;
- the apparent magnitude: `absMag + distance modulus − magOffset`, the inverse of the emitter's step;
- `axisRatio` and `pa`;
- `diameterKpc = 10^logSize`;
- the fallback flags.

| word | bits                                                                   |
| ---- | ---------------------------------------------------------------------- |
| 0    | offset x (16) \| offset y (16) << 16                                    |
| 1    | offset z (16) \| absMag u8 << 16 \| colourIndex u8 << 24               |
| 2    | axisRatio u8 \| angularWeight u8 << 8 \| flags u8 << 16 \| 0 << 24     |
| 3    | paCos f16 \| paSin f16 << 16                                           |
| 4    | apparent magnitude f16 \| sbAmp f16 << 16                              |
| 5    | padded radius Mpc f32 (sign = diameter fallback, as flat slot 8)       |

The `u8` fields are the wire codes, re-quantised from the dequantised columns with the header schema (an exact
inverse). `GALAXY_GPU_RECORD_WORDS = 6` in `src/data/`.

- [ ] Test `the packed record decodes to the flat interleave's slots for the same galaxy` (build one galaxy as a flat
      `GalaxyCatalog` and as a one-record chunk; compare magnitude, paCos/paSin, radius, sbAmp, absMag and colour
      within the quantisation step).
- [ ] Test `re-quantised u8 fields equal the wire codes` (round-trip over all 256 codes per column).
- [ ] Test `NaN axis ratio and fallback flags give the same signs as the flat interleave`.
- [ ] Commit.

### Task 10: the pooled point pipeline, cut compute and planner — `review: yes`

**Files:**
- `src/layers/galaxyCatalog/render/galaxyPooledPointRenderer.ts` (create)
- the incumbent rename: `galaxyPointRenderer.ts` → `galaxyFlatPointRenderer.ts` (symbol `createGalaxyFlatPointRenderer`);
  the `GalaxyPointRenderer` type keeps its name (it is the flat contract)
- `src/layers/galaxyCatalog/render/galaxyPickRenderer.ts` (`drawPoints` → `drawFlatPoints`, plus `drawPooledPoints`)
- `src/services/gpu/shaders/galaxyCatalog/points/pooledVertex.wesl` (create), `colorFragment.wesl`, `pickFragment.wesl`
- `src/services/gpu/shaders/galaxyCatalog/points/pooledColorFragment.wesl` (create)
- `src/layers/galaxyCatalog/passes/galaxyPointSpritesPass.ts`
- `src/layers/galaxyCatalog/computes/galaxyCutCompute.ts` (create)
- `src/layers/galaxyCatalog/frame.ts` (or a new `galaxyOctreePlanner.ts`)
- `src/layers/galaxyCatalog/layer.ts`, `src/data/rendering/frameSections.ts`
- `src/layers/galaxyCatalog/@types/GalaxyCatalogRuntime.d.ts`, `create.ts`
- `src/layers/galaxyCatalog/load/wireGalaxyOctreeSlot.ts` (create), `galaxyOctreeFetcher.ts` (create),
  `galaxyCatalogAssetRows.ts`
- `src/@types/loading/GalaxyOctreeReq.d.ts` (create)
- tests: `tests/layers/galaxyCatalog/render/galaxyPooledPointRenderer.test.ts` (create), the renamed renderer's test,
  `passes/galaxyPointSpritesPass.test.ts`, `load/wireGalaxyOctreeSlot.test.ts` (create)

Rename first, in its own commit, using:

```
npm run refactor -- rename src/layers/galaxyCatalog/render/galaxyPointRenderer.ts#createGalaxyPointRenderer createGalaxyFlatPointRenderer --dry
```

then without `--dry`. Grep for the old name.

**Pipeline bind groups:**

| group | binding | content                                                                                      |
| ----- | ------- | -------------------------------------------------------------------------------------------- |
| 0     | 0       | galaxy `Uniforms` (unchanged)                                                                 |
| 1     | 0–4     | the shared cut draw group (`cut.drawBgl`: CutUniforms, CutNode[], opacity, list, CutStream)   |
| 2     | 0       | `records: array<u32>` (6 words per record)                                                   |
| 2     | 1       | `SourceUniforms` (unchanged struct)                                                          |
| 2     | 2       | `PooledRecordUniforms { absMagQ0: f32, absMagQ1: f32, _pad: vec2<f32> }`                     |
| 2     | 3       | the per-source fade                                                                          |
| 3     | 0       | `FocusUniforms` (unchanged)                                                                  |

- **Vertex:** `pooledVertex.wesl`'s `vs` resolves the record through the cut list as the star `vertex.wesl:180-200`
  does (pool-absolute `base`; a blob draws the record at `firstRecord + ownCount`). It decodes the six words into a
  `PerVertex` and calls `galaxyPointVertex(vi, base, p, u, source, focus)`.
  - `PerVertex.position` is the record's catalog-frame position in Mpc, the value the flat vertex buffer holds.
  - For a blob, `magnitude -= 2.5 * log10(f32(blobCount))` (flux scales with the members). Nothing else differs.
- **Fragment:** the colour fragment's body becomes a library function. The flat `fs` keeps fade at `@group(1)`; the
  pooled `fs` reads it at `@group(2) @binding(3)`. The pick fragment needs no change (it writes the instance index the
  body was given).
- **Renderer:**
  - It owns its own `createOctreeCutGpu(device, 'galaxy-cut')`.
  - It implements `OctreePoolHost<GalaxyColumns>['renderer']` (`upload`, `uploadChunk` writing `packGalaxyGpuRecords`
    at `(index records + slot·chunkCapacity)·24`, `evictChunk`).
  - It keeps a pick-slot snapshot like `starCatalogRenderer.ts:217-223` and exposes
    `recordOrdinal(source, pickIndex)` / `poolRecordIndex(source, ordinal)` over `recordOrdinal`/`poolRecordIndex`.
  - It draws both streams (`drawOf(source, 'leaf' | 'aggregate')`) with `drawIndirect` into the galaxy points target (D9).
- **Slot:**
  - `wireGalaxyOctreeSlot(entry, deps, host)` builds an `AssetSlot<Octree<GalaxyColumns>, GalaxyOctreeReq>`.
  - Its fetcher loads the index and the index info object through `dataUrl(octreeIndexPath('galaxy', 'glade'))`.
  - Its commit runs `installOctreePool(host, source, octree, entry.octree.budgets[tier].slots, { chunkPath, decodeRecords: galaxyColumnsOf })`
    and sets `records` (Task 11's source; until then a stub that answers nothing).
  - Its `onRelease` mirrors the flat slot's. A missing index is a slot error, surfaced as the flat slot's errors are.
- **Planner:** a once-per-frame planner calls the Task 7 driver for the galaxy streams with the galaxy cut inputs:
  - per source, `drawBudget` from `entry.octree.budgets[committedTier]` and `refineThreshold` from the slice;
  - it hands `recut` to the pooled renderer;
  - it bumps a new `runtime.residencyVersion` when `residencyChanged`.
- **Frame:** `galaxyCutCompute` encodes the galaxy cut; add `{ compute 'galaxy-cut' }` to `FRAME_ORDER` after
  `star-cut`.
- **Pass:** draws the flat sources as today, then the pooled ones. `drawPick` does the same through `drawFlatPoints` and
  `drawPooledPoints`.

- [ ] Test `the pooled renderer writes a chunk's records at the slot's pool offset and evicts them` (fake device, as
      `starCatalogRenderer.pool.test.ts`).
- [ ] Test `recordOrdinal reads the pick snapshot, poolRecordIndex the live slots`.
- [ ] Test `the sprites pass draws flat and pooled sources, each faded by its own source`.
- [ ] Test `the octree slot installs the pool at the tier's slots and releases it`.
- [ ] `npm run build`. Commit.

### Task 11: the octree GLADE record source — `review: yes`

**Files:**
- `src/layers/galaxyCatalog/load/octreeGalaxyRecordSource.ts` (create)
- `src/layers/galaxyCatalog/load/createChunkPairCache.ts` (create), `load/fetchPgcShard.ts` (create)
- `src/@types/data/galaxyCatalog/GalaxyColumnBlock.d.ts`, `src/layers/galaxyCatalog/load/flatGalaxyRecordSource.ts`
- `src/layers/galaxyCatalog/subsystems/{proceduralDiskSubsystem,diskPlannerWalk}.ts`
- `src/layers/galaxyCatalog/present/structureMembership.ts`, `src/layers/galaxyCatalog/frame.ts`
- `src/layers/galaxyCatalog/load/wireGalaxyOctreeSlot.ts`
- tests: `tests/layers/galaxyCatalog/load/octreeGalaxyRecordSource.test.ts` (create),
  `present/structureMembership.test.ts`, `subsystems/diskPlannerWalk.test.ts`, `load/flatGalaxyRecordSource.test.ts`

`GalaxyColumnBlock` becomes `Pick<GalaxyCatalog, 'count' | 'positions' | 'diameterKpc' | 'axisRatio' |
'positionAngleDeg' | 'magG'> & { colourIndexAt(i: number): number }` (D8).
- The flat source yields one block wrapping its catalog, with `colourIndexAt` calling `pickColourIndex` for the asked row.
- The procedural disk reads `colourIndexAt`. A row whose position is NaN is a blob (D7): `structureMembership`,
  `diskPlannerWalk` and the disk visitors skip it.

`octreeGalaxyRecordSource(entry, octree, indexInfo, deps)`:

- `recordCount` and `stats` come from the header stats (`recordCount`, `medianAbsMag`, `magOffset`, provenance from
  `orientationEstimated`/`diameterEstimated`).
- `ordinalOfPick` / `pickOfOrdinal` delegate to the pooled renderer's `recordOrdinal` / `poolRecordIndex`.
- `forEachResidentBlock` yields the index block (ordinal base 0) and one block per resident chunk (its `recordBase`).
  - Each block is built once per chunk object and cached in a `WeakMap`.
  - Positions are absolute Mpc from node origin + offset. A blob gets NaN.
  - `magG` is apparent (the Task 9 inverse), `diameterKpc` is `10^logSize`, and `colourIndexAt` reads the baked ramp
    position.
- `hasDurableId('pgc-<n>')` answers from `namedPgcs` (binary search). Nothing else answers.
- `loadRow(ordinal)`:
  - An index-hoisted record answers synchronously from the index pair.
  - Any other ordinal finds its chunk in `chunkDirectory` by `recordBase` and returns a promise from the pair cache,
    which fetches render + info by the ref, LRU of 16 pairs, separate from the pool.
  - A blob or out-of-range ordinal is `null`.
  - The row is built as `extractGalaxyRow` builds one (source GLADE, `objId` from info).
- `resolveDurableId('pgc-<n>')`: the shard by `pgcShards` lower bound, through `fetchPgcShard` (memoised per shard),
  then a binary search for the ordinal. A miss is `null`.
- `resolvePosition(ra, dec, distMpc)`:
  - with a distance: the deepest chunk in `chunkDirectory` whose root cell contains the point, then its pair through
    the cache, then the nearest real record within 30″ (as `nearestRowByDirection`), as a promise;
  - `distMpc === null` answers `null`.
- `frame.ts`: the member-count reconcile also keys on `runtime.residencyVersion`. Prune `diskPlannerWalk`'s stride
  cursors for blocks the last walk did not visit (the deferred #919 item).

- [ ] Test `a blob ordinal loads no row and never counts as a structure member`.
- [ ] Test `pgc of a non-resident chunk resolves through its shard, and loadRow settles to that galaxy`.
- [ ] Test `a pending loadRow from a released octree source is not served after the flat source replaces it` (through
      the bridge).
- [ ] Test `hasDurableId is false for objId 0 and for pgcs outside namedPgcs`.
- [ ] Test `resolvePosition with a distance finds the record; without one it answers null`.
- [ ] Test `the disk walk drops cursors of blocks no longer resident`.
- [ ] The flat suite stays green with only the D8 block change. Commit.

### Task 12: bake sweep (controller, with the user)

- [ ] Tune `GLADE_STRATIFY.mLim`, `refineThreshold` and the three budgets so the zoomed-out survey pose draws about the
      medium tier's point count before any chunk loads, and the large budget holds under the pick cap
      (`indexRecords + slots·chunkCapacity < 2²⁶`).
- [ ] Re-bake. Record the values and the per-pose draw counts in the ledger.

### Task 13: A/B and perf gate (controller, with the user)

- [ ] Shots in one build through the boot flag (`?galaxyFormat=glade:skmp` vs no flag): full-survey, 3.5 Gpc, and one
      close pose inside the Local Volume, each under bias None, Volume-limited and Angular. Show each pair to the
      user as a before/after check.
- [ ] One zoomed-out shot with no chunk resident (blobs only).
- [ ] `npm run perf -- --url <wt server>` at `full-survey`, `local-group` and the close pose, flat vs octree. Quote
      merged totals. A regression over 1 ms halts for a ruling.
- [ ] `npm run loadtime` first paint on throttled 4G, flat vs octree.
- [ ] The user rules on the angular weight (keep or drop the column) and on whether blobs need a disc look.

### Task 14: docs and backlog

**Files:** `docs/DATA.md`, `docs/DEPLOY.md`, `docs/BACKLOG.md`, `docs/backlog/` (new detail files as needed).

- [ ] `DATA.md`: the galaxy octree objects, the pair naming, shards, and the `?galaxyFormat` flag.
- [ ] `DEPLOY.md`: add `galaxy-octree/v1` to the manual Cloudflare cache-rule step (`:129`), and correct `:80` (the v2
      index is edge-cached, HIT).
- [ ] Backlog lines:
  - Gaia `source_id` dropped by the star bake;
  - `galaxyCatalogFluxLimits.ts` has no runtime caller;
  - stale header `tools/octree/writeOctreeCatalog.ts:6`;
  - catalog-wide stats for the flat sources;
  - mcpm on the octree;
  - retiring GLADE's flat files and the format setting after the A/B.
- [ ] Commit.

## Definition of Done

**Deliverables**

- The `galaxy` family: `GALAXY_OCTREE_FAMILY` row, the appended `COLUMN_IDS`/`STAT_IDS`, the `u64` store, `SKOF` info
  objects with `decodeOctreeInfo`, and the index keys `chunkDirectory`, `pgcShards`, `namedPgcs`.
- `sourceRows` on the bake's objects, info pairs with one hash per pair, and `buildGladeOctree` writing
  `galaxy-octree/v1/glade*` plus shards from `build-tiers`. The tier files keep shipping.
- Deploy and fetch rows for the index info, shards and chunk info objects.
- `createOctreeFrameDriver` shared by the star and galaxy planners, and `createOctreeCutGpu(device, label)`.
- `GalaxyCatalogFormat`, GLADE's `octree` row member, the `formats` and `refineThreshold` settings,
  `?galaxyFormat`, and the panel choice.
- `packGalaxyGpuRecords`, `galaxyPooledPointRenderer` (with `createGalaxyFlatPointRenderer` renamed), the galaxy cut
  compute and the galaxy planner.
- `octreeGalaxyRecordSource` with the pair cache and the shard lookup, and `GalaxyColumnBlock.colourIndexAt`.

**Smoke (on this worktree's dev server, octree format)**

- **Pick:** picking a GLADE galaxy fills the InfoCard after one info round trip, and the selection ring sits on it.
- **Deep link:** `#focus=pgc-44086` from a cold load, with its chunk not resident, flies to and selects PGC 44086.
- **Search:** palette search for a GLADE-only name lists it, and choosing it focuses it.
- **Tier switch:** small → large grows the pool and keeps the selection.
- **Format switch:** the panel's Flat files ↔ Octree swaps the source, and the sky stays filled.
- **Structures:** a selected cluster's member count rises as chunks land.
- **Boot flag:** `?galaxyFormat=glade:skmp` loads the flat files.

**Out of scope**

- REGALADE.
- Moving SDSS, 2MRS, DESI or Milliquas onto the pool.
- Stratification-driven thumbnail LOD.
- Gaia `source_id`.
- Retiring GLADE's flat files and the format setting (a ruling after the A/B).
- A disc look for blobs (only if the A/B asks).
- The Cloudflare cache rule itself: a dashboard step the user takes, listed in `DEPLOY.md`.
