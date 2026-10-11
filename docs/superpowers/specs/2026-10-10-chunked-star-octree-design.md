# Chunked star octree: design spec

A family-agnostic chunked octree container, the Gaia star catalog baked onto it, and chunk streaming into a fixed-slot GPU pool. Source of truth: `docs/research/2026-10-08-galaxy-octree-streaming.md` §8 (decisions 1 to 9) and §10 (refactor-ground checkpoint and its rulings A to F). Those rulings are not re-litigated here.

Packaging: three prep PRs (§8, P1 to P3), each landing on main before any feature commit, then the feature PR. Each gets its own plan.

## 1. Goal and non-goals

- **Goal:** Gaia streams from R2 as one index object plus content-hashed chunk objects, drawn by the existing GPU cut over a fixed-slot pool. The browser never holds the whole catalog.
- **Goal:** the zoomed-out sky draws the brightest stars from the index alone, with no chunk fetched (brightness stratification, §3).
- **Goal:** SKST v1 and the new container both load behind one format switch, so a v1/v2 A/B runs on the same renderer (ruling E).
- **Non-goal:** galaxies. The container already accommodates them (column registry, node-relative `u16x3` offsets, blob as a schema record); their open questions stay in research §7 and the "still open" paragraph of §8.
- **Non-goal:** deleting the v1 reader, `starBinCodec.ts` or `tools/stars-rs`. Those are rulings at `/feature-done` (E) and after the bake timing (F, §6).

## 2. Container format

Two object kinds share one framing: an **index object** per catalog and a **chunk object** per chunk root. All integers are little-endian.

### 2.1 Framing (both objects)

| Offset | Size | Field                                                                                                     |
| ------ | ---- | --------------------------------------------------------------------------------------------------------- |
| 0      | 4    | magic: `SKOI` (index) or `SKOC` (chunk), ASCII                                                            |
| 4      | 2    | version (u16), 1                                                                                          |
| 6      | 4    | `headerBytes` (u32): length of the JSON header                                                            |
| 10     | h    | JSON header, UTF-8, right-padded with ASCII spaces so the node table starts on a multiple of 8 (ruling A) |
| …      | 24·n | node table, `n = header.nodes` rows (§2.3)                                                                |
| …      | …    | record columns, one per `columns` entry in schema order, each starting on a multiple of 8 (§2.4)          |

A wrong magic or version throws the "regenerate" error, as v1 does (`starCatalogFormat.ts:340-348`). A new stat or column is a header key, never a version bump.

### 2.2 Header JSON

```ts
type ColumnStore = 'f32' | 'f16' | 'u8' | 'u16' | 'u32' | 'u64' | 'i8' | 'u10x3' | 'u16x3';
type ColumnSchema = {
  readonly id: ColumnId;
  readonly store: ColumnStore;
  readonly q0: number;
  readonly q1: number;
};

type OctreeChunkRef = {
  readonly level: number;
  readonly morton: number; // the chunk root's key
  readonly hash: string;
  readonly bytes: number; // object name and wire-size hint
  readonly nodes: number;
  readonly records: number;
};

type OctreeIndexHeader = {
  readonly kind: 'index';
  readonly family: 'star'; // selects the required ColumnIds
  readonly grid: { readonly bits: number; readonly origin: Vec3; readonly cellEdge: number }; // catalog unit (pc for stars)
  readonly stratify: { readonly thr: number; readonly mLim: number; readonly refUnit: number };
  readonly chunkCapacity: number; // max records in one chunk object
  readonly chunkNodeCap: number; // max node rows in one chunk object (pool row stride)
  readonly nodes: number;
  readonly records: number; // this object's own counts
  readonly columns: readonly ColumnSchema[];
  readonly stats: Readonly<Partial<Record<StatId, number>>>;
  readonly chunks: readonly OctreeChunkRef[]; // the index IS the chunk manifest (ruling D)
};

type OctreeChunkHeader = {
  readonly kind: 'chunk';
  readonly level: number;
  readonly morton: number;
  readonly nodes: number;
  readonly records: number;
};
```

A chunk carries no schema: `decodeOctreeChunk(buf, indexHeader)` reads the columns the index declares. Integer stores dequantise as `q0 + raw·q1`; float and packed-vector stores carry `q0 = 0, q1 = 1`. The decoder yields one typed array per column and throws when a family's required id is missing.

**`ColumnId` registry** (`src/data/octree/columnIds.ts`, append-only, never renamed or reused): `offset`, `absMag`, `colourIndex`. Galaxy ids (`classByte`, `axisRatio`, `pa`, `logSize`, `specZ`, `logMass`, `objId`, research §8.1) append in their slice. The star family requires all three.

**`StatId` registry** (append-only): `starCount`, the total of real (non-blob) records, read by the UI count (`starCatalogSourceCounts.ts:38`). Galaxy stats (`magOffset`, `medianAbsMag`) append in their slice.

### 2.3 Node row (24 B, same in both objects)

| Offset | Size | Field                                                                                                |
| ------ | ---- | ---------------------------------------------------------------------------------------------------- |
| 0      | 4    | `morton` (u32)                                                                                       |
| 4      | 1    | `level` (u8), 0 = finest leaf cell                                                                   |
| 5      | 1    | `childMask` (u8); non-zero ⇒ the node has a blob record                                              |
| 6      | 2    | reserved, zero                                                                                       |
| 8      | 4    | `firstRecord` (u32), **object-local** (ruling B)                                                     |
| 12     | 4    | `ownCount` (u32): records owned at this level; the blob, if any, follows at `firstRecord + ownCount` |
| 16     | 4    | `blobCount` (u32): real records the blob stands for (the shader's flux multiplier)                   |
| 20     | 4    | `chunkRef` (u32): index into `header.chunks`, `0xFFFFFFFF` when none (always none in a chunk)        |

Rows sort by `(level, morton)` ascending, as v1 does, so a forward scan visits children before parents. The index's root is its last row. A chunk's table holds only the nodes strictly below its root; its up-to-eight top rows are its last rows. Records lie in node-row order, each node's own records then its blob, so v1's two-region record layout is gone.

### 2.4 Record stores and the star schema

| Store         | Bytes/record | Packing                       |
| ------------- | ------------ | ----------------------------- |
| `u10x3`       | 4            | x bits 0–9, y 10–19, z 20–29  |
| `u16x3`       | 6            | x bits 0–15, y 16–31, z 32–47 |
| scalar stores | natural size | `f16` is IEEE half            |

`offset` is a fraction of the owning node's box (edge `cellEdge·2^level`): `raw / 2^16` for `u16x3`. A record is drawn only once its parent refines, so the viewer is farther than `cellEdge·2^(level+1) / thr`; a 2⁻¹⁶ box-edge error then subtends under `2⁻¹⁶·thr / 2` rad, about 0.25 arcsec at `thr = 0.16`. That beats v1's 10 bits inside a leaf at every level, so hoisted records lose nothing (research §8.9 asked for 20 bits; 16 suffice because the box, not the leaf cell, is the reference).

| id            | store   | q0                                           | q1                   |
| ------------- | ------- | -------------------------------------------- | -------------------- |
| `offset`      | `u16x3` | 0                                            | 1                    |
| `absMag`      | `u8`    | `STAR_ABSMAG_MIN + 0.5·STAR_ABSMAG_STEP`     | `STAR_ABSMAG_STEP`   |
| `colourIndex` | `u8`    | `STAR_COLORIDX_MIN + 0.5·STAR_COLORIDX_STEP` | `STAR_COLORIDX_STEP` |

The `q` pairs reproduce `lutIndexToAbsMag` / `colorIdxToBpRp` (`starCatalogFormat.ts:163-176`) exactly, so upload re-quantises to the frozen LUT without loss. A star record is 8 B on the wire (v1: 6 B, `starCatalogFormat.ts:89`).

### 2.5 GPU layout

Columns bake into the GPU record at upload (research §8.5); the shader never dequantises. The 2×u32 star record (`starCatalogRenderer.ts:116`, decoded at `vertex.wesl:191-199`) keeps its width: word 0 = x (16 bits) | y << 16; word 1 = z (16) | absMagIdx << 16 | colorIdx << 23, 3 bits spare. The vertex stage scales the offset by the node's box edge instead of the leaf cell. `CutNode` (`cutIo.wesl:29-36`) keeps six words; its `bits` word becomes `level | hasBlob << 4 | childrenResident << 5 | ownCount << 8`, `subtreeCount` becomes `blobCount`, and a chunk row's `parent` and `firstRecord` are written **pool-absolute** when the row is composed at upload (ruled 2026-10-11, §5.3). The wire format's `firstRecord` stays object-local (§2.3).

### 2.6 Hard caps (replacing `starCutLayout.ts:27-37,99-118`)

| Cap                | SKST v1                                         | v2                                                        | Why                                                                                         |
| ------------------ | ----------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Grid bits per axis | 10 (`GRID_AXIS_BITS`, `:27`)                    | ≤ 10, from `grid.bits`                                    | `CutNode.grid` packs 3×10 and the Morton key fits 30 bits                                   |
| Node index         | catalog-wide < 2²² (`:37`, `:100`)              | pool-wide: `indexNodes + slots·chunkNodeCap < 2²²`        | leaf-list entry `node \| block << 22` kept; the cap binds the resident set, not the catalog |
| Records per node   | ≤ 8192 (`:108`)                                 | `ownCount ≤ 8192`, bake STOP above                        | 10-bit block index × 8                                                                      |
| Records per chunk  | none                                            | `chunkCapacity` (32,768)                                  | pool slot stride                                                                            |
| Pick record index  | bin-global < 2²⁶ (`selectionEncoding.ts:15-18`) | pool-absolute: `indexRecords + slots·chunkCapacity < 2²⁶` | ⇒ about 2,040 slots at 32k, less the index records                                          |

## 3. Brightness stratification

A record lives at the level its brightness earns (research §8.9), verbatim:

```
L(M)     = clamp(round(log2(d_res(M)·thr / cellEdge)), 0, maxLevel)
d_res(M) = refUnit·10^((mLim − M)/5)
```

`thr`, `mLim` and `refUnit` come from `header.stratify`; `cellEdge` and `maxLevel = grid.bits` from `header.grid`. For stars `refUnit = 10 pc`. Why it holds: a level-L node refines inside distance `cellEdge·2^L / thr`, and setting that equal to the distance where `M` reaches `mLim` gives `L`.

| Per node        | Content                                                                                                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| own records     | every record with `L(M)` equal to the node's level, inside its box                                                                                                           |
| blob record (C) | one schema record when `childMask ≠ 0`: flux-weighted centroid of all descendant records, mean-flux `absMag`, flux-weighted `colourIndex`; `blobCount` = their number (§8.8) |

A record's level is `L(M)` alone: hoisting wins over v1's fat-leaf fold (`STAR_LEAF_CAPACITY = 64`, `buildStarOctree.ts:139`), which this format drops.

**Cut terms**, replacing `isAgg` and v1's `refineDelta` (`starCutLayout.ts:136`):

- `refineDelta = Σ_children (ownCount + hasBlob) − 1`. The `−1` is the node's own blob; a refining node always has children, hence a blob. Its own records stay drawn across the refine, so they cancel.
- `drawOwn = parentRefines` (the root counts its parent as refining).
- `drawBlob = drawOwn && !refines(self)`.
- **Fold** (runtime, added at the perf fix round): a childful row other than a chunk root whose subtree holds at most `STAR_FOLD_RECORDS = 64` records refines exactly when its nearest unfolded ancestor does, so a sparse outskirt draws as points, as v1's fat leaves did, instead of as a box-sized blob over a handful of stars. The format is unchanged; the CPU marks the row and writes the ancestor as its `parent` at upload.

**Flux conservation.** A node in the cut draws own + blob, which is its whole subtree's flux. A refining node draws own, and each child contributes its own subtree's flux by induction. No level gains or loses light, and the cross-fade stays linear (`cut.wesl` header, "Fades").

**Bright before faint.** The budget's log-proxy threshold therefore resolves stars in magnitude order. Shifting `thr` by an octave shifts the resolved magnitude by 1.5 mag at every level, so `thr` is the limiting-magnitude knob. The bake writes `thr = 0.16`, the runtime default (`initialState.ts:11`); a runtime setting that differs moves the on-screen limit by `5·log10(ratio)` mag.

**Hoisting above chunk roots.** Records whose `L(M)` sits above a chunk root's level live in index rows. The zoomed-out sky draws them with no chunk fetched. The index object's size is therefore set by `mLim` and `thr`, and is an A/B measurement (§5.6).

## 4. Chunking

Chunks are capacity-bounded, not cut at a fixed level (research §8.2).

1. Start at the root. A node with children whose descendant records number at most `chunkCapacity` (first guess **32,768**) becomes a **chunk root**.
2. A chunk root stays in the index: its row keeps its own records and its blob, so an absent chunk draws as a glow, never a hole. Its `chunkRef` names the chunk.
3. Every node strictly below a chunk root goes into that chunk object, with its own node table and records. A chunk decodes without any other chunk; chunks never nest.
4. A node over capacity stays in the index and the split recurses into its children.
5. **Dense-cell STOP.** The bake stops loudly when a level-0 node would land in the index (its parent's subtree exceeds `chunkCapacity`), or when any node's `ownCount` exceeds 8,192. A deeper grid or a dense-leaf split is the open alternative (§10).

`chunkNodeCap` is the largest chunk's row count, written by the bake; the pool's node stride reads it.

## 5. Runtime

### 5.1 Load path

| Object | Path                                                                                                                 |
| ------ | -------------------------------------------------------------------------------------------------------------------- |
| index  | the existing `AssetSlot` (one value per source, `AssetSlot.d.ts`), fetched through the manifest                      |
| chunks | `createTileStreamSubsystem<Chunk, BufferSlotStore>` over P1's `SlotPool`, not an `AssetSlot`; no sibling stream loop |

Chunk URLs are `star-catalog/v2/stars/<level>-<morton>.<hash>.bin`; `resolveDataPath` passes names absent from the manifest through unchanged (`dataManifest.ts:36-37`). No `DecompressionStream`: R2 serves `Content-Encoding: gzip` and the browser inflates.

The format switch is the source row's `format: 'skst' | 'octree'`, read where `starCatalogFetcher.ts:71-79` names and decodes the file today. The v1 reader stays and yields the same runtime shape with no chunks: a v1 leaf is a node with `ownCount = recordCount` and no blob; a v1 aggregate is a node with `ownCount = 0` whose blob is its aggregate record, already at its `firstRecord`. A v1 offset is 10 bits over the node's own box, so upload widens it `<< 6`. One cut and one vertex path draw both formats.

### 5.2 CPU planner over the index

- Each frame walks the index tree over all views, as `cutSurfaceTiles` does: frustum test, then the cut's refine proxy `edge² / dist²` against `thr²`.
- A chunk root that wants to refine requests its chunk, priority = the largest proxy over views.
- A resident chunk the walk reaches is touched (`lastSeenFrame`).
- Concurrency 4, the `SURFACE_TILE_CONCURRENCY` precedent (`surfaceTileParams.ts:50`), on the existing `PriorityQueue` (`priorityQueue.ts:59`).
- Slots recycle LRU by `lastSeenFrame`; allocation is refused when every slot was claimed this frame, so a stationary camera never evicts and refetches in a loop (`textureAtlas.ts:212-253`).

The CPU cannot see the GPU's budget bin, so it may fetch a chunk the budget then declines to refine. That costs bytes, not correctness.

### 5.3 GPU cut over the resident set

- `refines(i)` (`cut.wesl:146-149`) gains `&& childrenResident(i)`. The bit is 1 for every non-chunk-root row and is written for a chunk root's row (one word) when its chunk lands or is evicted.
- A chunk's `CutNode` rows are composed on the CPU at upload (the wire columns are packed into GPU words there anyway), so that pass writes each row's `parent` and `firstRecord` pool-absolute: `nodeBase = indexNodes + slot·chunkNodeCap`, `recordBase = indexRecords + slot·chunkCapacity`; a chunk's top rows name the chunk root's index row directly. The shader reads them as plain indices; there is no per-node slot word, no base arithmetic and no `slotRoot` table. The index is never rewritten (ruling B's goal). **Ruled 2026-10-11 at plan review**: the spec's earlier `slot` word + shader bases + `slotRoot` sentinel bought nothing once the rows are CPU-composed, and cost a seventh word, two helpers and a binding.
- The root comes from a `rootNode` uniform, replacing "root is the last node" (`cut.wesl:128`, `starCutLayout.ts:123-124`).
- An empty or evicted slot's rows are zeroed (`ownCount 0`, no blob, `refineDelta 0`), so `histogram` and `emit` pass over them inert.

### 5.4 Buffer sizing and budgets

Buffers are created once per source at index load, replacing the catalog-sized ones (`starCutGpu.ts:113-123`):

| Buffer                   | Rows                                                    |
| ------------------------ | ------------------------------------------------------- |
| nodes, opacity, agg list | `indexNodes + slots·chunkNodeCap`                       |
| records                  | `indexRecords + slots·chunkCapacity`, 2 u32 each        |
| leaf list                | index blocks + `slots·(chunkCapacity/8 + chunkNodeCap)` |

Tiers become pool budgets (research §8.4). The source row's `budgets: Record<Tier, { slots: number; drawBudget: number }>` (P2 introduces it, the feature adds `slots`) picks the pool size and the cut's instance budget per tier. Starting values are tuned with `npm run perf`; large at 256 slots is about 67 MB of records.

### 5.5 Pick, fade, wake

- **Pick.** The vertex stage emits `firstRecord + local` (the row's `firstRecord` is already pool-absolute), a pool-absolute index (`pickFragment.wesl:58` is unchanged, 26-bit cap per §2.6). `resolveStarRecord` (`resolveStarRecord.ts:67`) maps it arithmetically to an object and reads that object's decoded columns; the owner node is a binary search on `firstRecord`, which is monotone in row order now.
- **Pick survives eviction.** Today `resolvePick` stores the raw index (`starCatalogSelectionRow.ts:57-60`). Under pooling, slot reuse would silently rename the selection, so `resolvePick` converts to an object-stable `(objectKey, localRecord)` and `extractRow` returns null when that object is not resident.
- **Fade** stays keyed by node index (`cutOpacity[nodeIdx]`, `NODE_FADE_MS = 250`, `starNodeFade.ts:7`). Slot reuse zeroes the slot's opacity rows, so a newly landed chunk fades in. That reset is wanted.
- **Wake.** The vote at `frame.ts:38` ORs in "chunks in flight" and restarts the fade window on any residency change, since a landing chunk changes the cut without changing `sameStarCut`'s inputs (`frame.ts:33`).

### 5.6 The v1/v2 A/B

Both formats load on the same renderer, so the A/B isolates the format. It must report, at the `npm run perf` poses and per tier:

| Measurement                    | Source                                                               |
| ------------------------------ | -------------------------------------------------------------------- |
| GPU and CPU frame ms           | `npm run perf` and `npm run perf:cpu`, v1 then v2, same `drawBudget` |
| bytes on the wire to settle    | index + chunks fetched, per pose and cold                            |
| chunk count, fetched and total | per pose; total from the index header                                |
| index object size              | raw and gzipped                                                      |

## 6. Build

- **`tools/octree/`**, family-agnostic: input is per-record position in the catalog unit plus typed column arrays, the schema and `stratify`. Steps: stratify (assign `L(M)`, build own and blob records) → chunk (§4) → write. Output: one index object and one object per chunk, named `<level>-<morton>.<hash>.bin` by content hash; the index lists every chunk hash.
- **`buildStars`** feeds it and drops the tier search: `TIER_BUDGET_BYTES` (`buildStars.ts:147-151`) and `buildTier`'s binary search (`:494`, `:530-553`). One bake per catalog serves every tier.
- **`tools/stars-rs` deferred (ruling F).** The v2 emitter is TypeScript-only in this slice. Gate: time the full TS v2 bake on the 1.8 GB Gaia input, wall-clock and peak heap (today's TS v1 bake needs a 16 GB heap, `package.json:49`), and the user rules port-or-drop with that number.

## 7. Deploy

- Chunks and index sit under `public/data/star-catalog/v2/`.
- **Chunks:** one bulk sync group `star-catalog/v2/**` (rclone, `immutable`, no purge, gzip on the wire). It runs before the manifest group, as surface tiles do (`syncR2.ts:89-101`).
- The bulk transport has no gzip path today (`R2Transport.ts:14-16`); P3 gives a sync group a `gzipOnWire` flag that both transports honour.
- **Index:** one row in the global data manifest per catalog, on the hashed wrangler path. A re-bake rehashes the index because it lists every chunk hash (ruling D).
- The `stars-*` opt-outs (`allowDataFile.ts:34`, `shouldGzipOnWire.ts:15`) go with P3.
- Old chunk objects stay in R2 after a re-bake; pruning is manual.

## 8. Ground preparation

### 8.1 Ideal diff (research §10, condensed)

```
src/data/octree/                 family-agnostic container; @types: OctreeIndexHeader, OctreeNode, ColumnSchema
  decodeOctreeIndex.ts / decodeOctreeChunk.ts   typed arrays per column, required-column check throws
src/layers/starCatalog/
  sources/gaia-stars.ts          format: 'octree', columns, budgets (replaces tiered + drawBudget)
  load/                          index via AssetSlot; chunks via the buffer stream subsystem
  render/starCutGpu.ts           pool-sized buffers, slot base in the shader, resident-children bit
  render/starCutLayout.ts        caps per §2.6; parent from the object's own table
src/services/engine/subsystems/  tile stream loop (P1) over a buffer-backed SlotStore; no sibling
tools/octree/                    stratify → chunk → write
tools/deploy/r2/                 data-family sync groups; star-catalog/v2/** bulk + gzip
```

### 8.2 Verdicts

| Joint                    | Today                                                                                                                                                                  | Verdict                     | Prep |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ---- |
| Fixed-slot LRU           | welded into `TextureAtlas.allocate` (`textureAtlas.ts:212-253`); the tile stream constructs its atlas (`tileStreamSubsystem.ts:36-42`)                                 | bolt-on                     | P1   |
| Tiers as budgets         | `tiered` read once (`starCatalogFetcher.ts:71`), `drawBudget.typical` once (`render/cut/starCutInputs.ts:63`); a budget meaning of tier would be a second special case | bolt-on                     | P2   |
| Data-family sync         | hand regex lists (`allowDataFile.ts:34`, `shouldGzipOnWire.ts:15`); bulk only for surface tiles (`syncR2.ts:89-101`)                                                   | bolt-on                     | P3   |
| Cut buffers, record base | sized once, global `firstRecord` (`starCutGpu.ts:113-123`, `vertex.wesl:187`)                                                                                          | rewritten by the feature    | none |
| Root and node count      | root is the last node (`cut.wesl:128`)                                                                                                                                 | growth (`rootNode` uniform) | none |
| Wake vote                | fade timer only (`frame.ts:38`)                                                                                                                                        | growth                      | none |
| Whole-table index        | `starOctreeIndex.ts:27` assumes a whole sorted table                                                                                                                   | stays for the v1 reader (E) | none |

### 8.3 Prep list (each its own PR, landing before feature commits)

- **P1 `SlotPool` out of `TextureAtlas`.** Key → slot LRU by `lastSeenFrame`, refuse-when-all-claimed-this-frame, evict handler. `TextureAtlas` composes it; `createTileStreamSubsystem` takes the slot store as a dep. Behaviour-neutral. The hi-res-famous substrate (`docs/backlog/2026-08-20-hires-famous-lru-substrate.md`) stays backlogged: its victim policy (smallest recent apparent diameter, refuse a smaller newcomer, `hiResFamousTexture.ts:147-159`) is one `SlotPool` does not have.
- **P2 per-source `budgets` row.** `budgets: Record<Tier, { drawBudget }>` replaces `tiered` (`SurveyStarCatalogSourceEntry.d.ts:21`, `gaia-stars.ts:29`) and `drawBudget` (`:23`, `gaia-stars.ts:36`). The fetcher names the file from the row, the cut reads the committed tier's budget. All three tiers carry today's 1.5 M, so it is behaviour-neutral. The five `binBaseName !== null` survey tests (`starCatalogFetcher.ts:58`, `starSourcesInBand.ts:23`, `starSourceDrawOpacity.ts:19`, `create.ts:77`, `starCatalogAssetRows.ts:16`) stay as they are.
- **P3 data-family sync groups.** A family declares `{ prefix, transport, gzipOnWire }` in `tools/deploy/r2`, replacing the two regex lists; the bulk transport learns gzip. Existing families keep their keys and encodings.

## 9. Testing

Each test fails on a real bug that no other test or compiler check catches.

| Test                                    | Catches                                                                                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Format round-trip, every store          | a mis-packed `u16x3` / `u10x3` bit, wrong column alignment, `q0/q1` applied to the wrong store                                                   |
| Missing required column throws          | a star index decoding with a silently absent `absMag`                                                                                            |
| `L(M)` at known magnitudes              | the formula's sign, base or rounding; clamp at 0 and `maxLevel`; a one-octave `thr` shift moving the level by exactly one                        |
| Flux conservation per node              | own + blob ≠ subtree flux at any node of a baked fixture; a blob counting its own node's records                                                 |
| `refineDelta` against a brute-force cut | the delta formula disagreeing with the instance count of a refine                                                                                |
| Chunk self-containment                  | a chunk whose decode needs another chunk; a parent link leaving the chunk except through the root sentinel; records outside the chunk root's box |
| Dense-cell STOP                         | the bake writing a level-0 node into the index instead of stopping                                                                               |
| Planner request order                   | requests not in descending proxy, a culled chunk requested, a resident chunk not touched                                                         |
| Slot-pool refusal                       | evicting a slot claimed this frame (the refetch loop)                                                                                            |
| v1 adapter                              | a v1 aggregate not drawing its record as the blob; a v1 in-leaf offset not rescaled to the node box                                              |
| Pick after eviction                     | a stale selection resolving to another star instead of null                                                                                      |
| Deploy group membership                 | a v2 chunk missed by the bulk group or uploaded without gzip; an old family's key changed by P3                                                  |

The GPU cut over the pool, the fade reset on slot reuse and the wake on chunk landing are eye-checks with deep links, plus the A/B numbers.

## 10. Open questions this slice does not answer

- Dense cells beyond the STOP: a deeper grid (Morton no longer fits 30 bits) or a dense-leaf split (research §6, §8).
- Node count under pure `L(M)` placement with no fat-leaf fold: sparse regions may build long single-record chains. `chunkNodeCap` and the index size from the first bake decide whether path compression is needed.
- Tiny chunks: capacity-bounded splitting can emit many small chunks under unbalanced parents. The chunk-count measurement decides whether siblings pack together.
- `chunkCapacity`, pool slots per tier and planner concurrency are first guesses for the A/B to tune.
- Galaxies: record packing, aggregate look and bias modes, SDSS/2MRS/DESI on the octree or on SKMP, `pgc-`/`sdss-` side index, search into non-resident chunks (research §7.2 to §7.5).
- Whether stratification also drives galaxy thumbnails and procedural discs (research §9).
- The production `.bin` Cache Rule is still a manual step (`DEPLOY.md:80`); until it lands, every chunk fetch is an R2 origin hit.
- The A/B star sets differ: v1 on R2 is built by `stars-rs`, which adds two dedup rules over the TS reference (`tools/stars-rs/README.md:15-16`), and v1 tiers are truncated by gzip budget. Compare at equal `drawBudget`, and decide whether v2 needs the dedup rules.
