# Chunked star octree: feature plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development under the lean protocol in `docs/superpowers/conventions/sdd-execution.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gaia streams from R2 as one index object plus content-hashed chunk objects into a fixed-slot GPU pool, drawn by the existing GPU cut; SKST v1 keeps loading behind the source row's `format` switch so a v1/v2 A/B runs on one renderer.

**Architecture:**

- `src/data/octree/` is the family-agnostic container: a JSON header after a 10-byte framing, a 24 B node table, columnar records with a per-column affine dequantisation. `decodeOctreeIndex` / `decodeOctreeChunk` yield typed arrays; a chunk decodes against the index's schema.
- Both formats decode to one runtime shape, `StarOctree` (node table + decoded star columns + chunk manifest). The v1 reader becomes the `starOctreeFromSkst` adapter (no chunks, offsets widened to 16 bits); the v2 reader is `starOctreeFromIndex`. One cut, one vertex path.
- The GPU cut runs over a pool: index rows first, then `slots × chunkNodeCap` rows. Every node draws its own records when its parent refines and its blob when it does not refine itself; a chunk root refines only once its chunk is resident. Bases come from a per-row `slot` word, so the index is never rewritten.
- A CPU planner walks the index each frame with the cut's own proxy and frustum test, requests chunks through `createTileStreamSubsystem<StarChunk, SlotPool>` (P1), and the renderer writes a landed chunk's rows, records and the root's resident bit.
- `tools/octree/` bakes stratify → chunk → write; `buildStars` feeds it once per catalog and drops the per-tier gzip search. Deploy adds two `DATA_FAMILIES` rows and one bulk gzip group (P3).

**Tech stack:** TS, Vitest, WESL/WGSL, WebGPU, rclone + wrangler (deploy).

**Spec:** [`docs/superpowers/specs/2026-10-10-chunked-star-octree-design.md`](../specs/2026-10-10-chunked-star-octree-design.md), §2 to §7. Background rulings: `docs/research/2026-10-08-galaxy-octree-streaming.md` §8 and §10. Preps P1 (#872), P2 (#871), P3 (#873) are on main; this plan builds on their shipped names (`SlotPool`, `SlotStore`, `budgets`, `DATA_FAMILIES`, `R2SyncGroup.gzipOnWire`).

## Dispatch groups

Tasks are executed in four grouped dispatches, in order. Each group ends in a state the branch can be checked at.

| Group | Tasks   | State at the end                                                                                             |
| ----- | ------- | ------------------------------------------------------------------------------------------------------------ |
| A     | 1 to 6  | Container codec, bake pipeline and `buildStars` v2 exist and are tested; the TS bake timing ruling is asked.  |
| B     | 7 to 10 | Both formats decode to `StarOctree`; the cut draws own + blob over a (still empty) pool; v1 renders as on main; perf before/after reported (advisory). |
| C     | 11 to 15 | `format: 'octree'` streams chunks; planner, residency writes, pick, wake, dev-only chunk facts.               |
| D     | 16 to 18 | Deploy rows and bulk group, `fetch-data` pulls chunks, docs, the v2 bake into `public/data`, eye checks, the A/B table. |

Group A's Task 6 is a **checkpoint**: it reports numbers to the user and continues; it does not block Group B.

## Global constraints

- `type` aliases, never `interface`. One type per `@types/` file (filename = symbol); one function per `utils/` file. Types never inline in implementation files. No barrels; deep relative imports.
- Named constants for every byte offset, size, shift, mask and sentinel, even single-use. Every WESL `const` has a TS twin and a row in `starCutLayout.parity.test.ts`'s `expected` map.
- Comments explain why, never what: module header ≤ 10 lines, comment lines ≤ half the code lines. Byte-layout files may run over and say so in their first line. No cross-file line citations in comments. No refactor narration.
- Moves and renames use the CLI: `npm run move-files -- <from> <to>` and `npm run refactor -- rename <file>#<symbol> <newName>` (see `.claude/skills/refactor/SKILL.md`); never `git mv` plus hand-edited imports. The CLI does not reach WESL, string literals or `.md`: grep afterwards.
- Raw-data paths go through `rawDataPath(...)` (`tools/utils/io/rawDataRegistry.ts`). No new raw key is needed: every Gaia input is already registered (`gaia.dir`, `gaia.gcns`, `gaia.hipparcos`, `gaia.hip-xmatch`) and `ATTRIBUTIONS.md` already carries Gaia, Bailer-Jones, GCNS and Hipparcos entries. Task 17 only updates the Gaia entry's "Enters skymap" path.
- Tests mirror `src/` and `tools/` under `tests/`. Only tests that fail on a real bug no other test or compiler check catches; type sweeps, deletions and plumbing get none, and the task says so.
- Each task is one commit. `npx prettier --write` on touched files, never `npm run format`. Stage by path, never `git add -A`. No `Co-Authored-By` trailers.
- Format values copied from the spec: magic `SKOI` / `SKOC`, version `1`, node row 24 B, columns 8-byte aligned, `u16x3` offsets as a fraction of the owning node's box, star record 8 B on the wire, `chunkCapacity = 32_768`, `CHUNK_NODE_CAPACITY = 2_048` rows per chunk (ruling 11; 4,096 under ruling 10), `ownCount ≤ 8192`, grid bits ≤ 10, node index cap 2²² pool-wide, pick cap 2²⁶ pool-wide, `thr = 0.16`, `refUnit = 10` pc, `NODE_FADE_MS = 250`, planner concurrency 4.
- `public/data/` in this worktree is a symlink to the main checkout's tree (`/link-data`). The timing bake (Task 6) writes to a scratch `--out-dir`; the real bake (Task 18) is the user's call. `data/raw/gaia` is per-worktree: symlink it from the main checkout before any bake, read-only.
- Read `docs/DATA.md` before Group A and Group D, `docs/RENDERER.md` and the `wesl-shaders` skill before Group B and Task 12, `docs/DEPLOY.md` before Task 16, and the `perf` skill before Tasks 10 and 18.
- Out of scope, do not touch: GLADE / REGALADE on the octree, `tools/stars-rs`, deleting `starBinCodec.ts` or the v1 reader, galaxy column ids, the hi-res-famous substrate.

## Rulings made at plan time

Rulings 1 to 8 were choices the spec left open; **all eight were accepted as-is by the user at the 2026-10-11 plan review.** Ruling 9 is the user's own, made at that review; the spec (§2.5, §5.3) was amended to match in the same worktree. Implementation go was given for groups A to D in order.

1. **Two fade channels per node.** The spec's second cut predicate (`drawOwn = parentRefines`, `drawBlob = drawOwn && !refines(self)`) means a node's own records and its blob are in the cut under different conditions, so each needs its own opacity ramp: `opacity` holds two f32 per node row (own, blob). Flux conservation across a refine holds channel by channel.
2. **The pick index is the catalog-global record ordinal**, not a `(chunk, record)` pair: index records first (0 … `indexRecords − 1`), then each chunk's records in `header.chunks` order. `starRecordObject(octree, ordinal)` is one binary search over a prefix sum. `StarCatalogRef.index` and the `#focus=star-…` deep link keep their shape; the ordinal is stable per bake, and a pool-absolute index never leaves the GPU side.
3. **`mLim = 10`** for the Gaia bake (the spec gives `thr` and `refUnit` but no `mLim`). At `thr = 0.16` and `cellEdge ≈ 23 pc` the brightest Gaia stars (`M ≈ −6`) land at level 7 and `M ≈ −3` at level 5, so the brightest few 10⁴ stars sit above typical chunk roots and the zoomed-out sky has stars from the index alone (spec §1 goal 2). `mLim = 6` would hoist almost nothing. Tunable by the A/B (§5.6); the index size is the readout.
4. **`rootNode` is derived, not a uniform**: the root is the index's last row (format invariant, §2.3), so `rootNode = indexNodes − 1` in `cutIo.wesl`. `indexNodes` is a uniform the shader needs anyway for the slot base.
5. **The v1 reader's symbols take the `Skst` mark** (plan-style rule 6): `StarCatalog → SkstCatalog`, `StarCatalogNode → SkstNode`, `decodeStarCatalog → decodeSkstCatalog`, `encodeStarCatalog → encodeSkstCatalog`. The unmarked names now belong to the shared shape (`StarOctree`) and the shared LUT quantisers. `starCatalogFormat.ts` keeps its file name: it also holds the LUT constants both formats share.
6. **A chunk's CPU copy stays resident with its slot** (the stream payload is kept in a per-slot map until eviction), so picks and the field-star sphere read a resident chunk's decoded columns without a second fetch. ~250 KB per slot at 32 k records.
7. **A/B chunk measurements are a DEV-only console line** at settle (in-flight back to 0): `fetched / total` chunks and bytes. No DebugPanel row: the A/B is one measurement campaign, not a product surface.
8. **`buildStarOctree.ts` stays** (the v1 TS tree builder): the v1 adapter's test needs a v1 fixture with aggregates, and `encodeSkstCatalog` stays with it. Both are `/feature-done` deletion candidates under ruling E, with the reader.
9. **No per-node slot word, no shader base helpers, no `slotRoot` table (user ruling, 2026-10-11).** A chunk's `CutNode` rows are composed on the CPU at upload, where the slot is known, so `parent` and `firstRecord` are written pool-absolute there; a chunk's top rows name the chunk root's index row directly. `CutNode` stays at six words, the shader reads plain indices, and the index is still never rewritten (ruling B's goal).
10. **Chunk size floor + node bound, bake-side; re-bake (user ruling, 2026-10-11).** After the first real bake (2,017 chunks, `chunkNodeCap` 11,530 against a 547-row median, 94 % pool padding, 37 chunks under 10 KB), a chunk also closes on rows: `CHUNK_NODE_CAPACITY = 4_096` beside the 32,768-record capacity (spec §4). Measured on the real bake: 2,227 chunks, `chunkNodeCap` 4,082, 85 % padding, 83 chunks under 10 KB, index 2,545 rows / 318,133 records; stratified rows and records unchanged. The floor was measured and dropped: with one root per chunk a small subtree can only fold into the index, and a 1,024-record floor grows the index from 2.8 MB to about 4.5 MB. Sibling packing (a chunk with several roots) reaches both goals in simulation but changes the format and the runtime, so it stays open (spec §10).
11. **Multi-root chunks in this PR (user ruling, 2026-10-11).** Chunk roots pack in Morton order into one chunk under a 2,048-row bound and the 32,768-record cap (spec §4.3); `chunkNodeCap` is the row bound. The manifest entry lists its roots' index rows; a landing writes rows, row count and fades, then every root's resident bit; eviction clears every root's bit first; the planner requests a chunk once, at its best root's priority; record ordinals stay index records, then chunks in header order, so the deep-link shape is unchanged, but ordinals are per bake (ruling 2) and a `#focus=star-<n>` link from an earlier bake names another star; the index is never rewritten. Real bake: 975 chunks, 1 under 10 KB, 33 % padding, index 3,561 rows / 343,872 records.
12. **Nested chunks in this PR (user ruling, 2026-10-11).** The index splits into chunks too: the bake re-applies the chunking to the rows left above the roots until the top object fits the same two bounds, each object lists only the chunks rooted in its rows, a row's `chunkRef` is a catalog-global id, and each ref carries its `recordBase`; the runtime learns refs as objects decode, walks into resident chunks, and evicts in cascade. See "Nested chunks" below.

## Review focus

Inputs the spec implies but no §9 test names; each line's test lives in the task that owns the code.

1. **A pool that overflows a hard cap at index load** (large tier, many slots): the renderer throws naming the slot count that fits, never silently clamps or wraps the 22-bit node index. Test in Task 9.
2. **A chunk fetch that fails** (local dev with no chunks on disk, a 404 after a re-bake): the chunk root keeps drawing as a glow, the key is marked failed and never re-enqueued, nothing throws into the frame. Test in Task 12.
3. **A pick raced by an eviction** (the slot is reused between the pick draw and the readback): `resolvePick` returns null, never another star's ref; `extractRow` of an evicted ordinal returns null. Test in Task 14.
4. **An index with zero chunks** (a small bake, a test fixture, every v1 catalog): no stream, no pool rows, the cut still draws, `loadedCatalogs()` still lists it. Test in Task 9 (zero slots); the slot factory's no-stream branch (Task 12) is one line, covered by its review.
5. **Slot reuse ordering**: a landing chunk's rows and records are written before the root row's resident bit, so no frame refines a root over the previous occupant's rows. Test in Task 9 (write order on a recording device).

---

## Group A: container format and bake

### Task 1: Octree container types, registries and layout constants

**Files:** `src/@types/octree/ColumnId.d.ts`, `ColumnStore.d.ts`, `ColumnSchema.d.ts`, `StatId.d.ts`, `OctreeFamily.d.ts`, `OctreeGrid.d.ts`, `OctreeStratify.d.ts`, `OctreeChunkRef.d.ts`, `OctreeIndexHeader.d.ts`, `OctreeChunkHeader.d.ts`, `OctreeNodeTable.d.ts`, `OctreeColumn.d.ts`, `DecodedOctreeObject.d.ts` (all new); `src/data/octree/columnIds.ts`, `src/data/octree/statIds.ts`, `src/data/octree/octreeFormat.ts` (new)

No test: declarations and constants only. The constants are pinned by Task 2's round-trip and Task 8's parity test.

**Contract:**

```ts
// src/@types/octree/ColumnId.d.ts — append-only registry, never renamed or reused
export type ColumnId = (typeof COLUMN_IDS)[number];
// src/data/octree/columnIds.ts
export const COLUMN_IDS = ['offset', 'absMag', 'colourIndex'] as const;
export const FAMILY_REQUIRED_COLUMNS: Readonly<Record<OctreeFamily, readonly ColumnId[]>> = {
  star: ['offset', 'absMag', 'colourIndex'],
};
// src/data/octree/statIds.ts, StatId.d.ts
export const STAT_IDS = ['starCount'] as const;

export type ColumnStore = 'f32' | 'f16' | 'u8' | 'u16' | 'u32' | 'u64' | 'i8' | 'u10x3' | 'u16x3';
export type ColumnSchema = { readonly id: ColumnId; readonly store: ColumnStore; readonly q0: number; readonly q1: number };
export type OctreeFamily = 'star';
export type OctreeGrid = { readonly bits: number; readonly origin: Vec3; readonly cellEdge: number }; // catalog unit, pc for stars
export type OctreeStratify = { readonly thr: number; readonly mLim: number; readonly refUnit: number };
export type OctreeChunkRef = { readonly level: number; readonly morton: number; readonly hash: string; readonly bytes: number; readonly nodes: number; readonly records: number };
export type OctreeIndexHeader = {
  readonly kind: 'index'; readonly family: OctreeFamily; readonly grid: OctreeGrid; readonly stratify: OctreeStratify;
  readonly chunkCapacity: number; readonly chunkNodeCap: number; readonly nodes: number; readonly records: number;
  readonly columns: readonly ColumnSchema[]; readonly stats: Readonly<Partial<Record<StatId, number>>>;
  readonly chunks: readonly OctreeChunkRef[];
};
export type OctreeChunkHeader = { readonly kind: 'chunk'; readonly level: number; readonly morton: number; readonly nodes: number; readonly records: number };
/** Node rows as parallel typed arrays, `count` rows, sorted (level, morton) ascending. `firstRecord` is object-local. */
export type OctreeNodeTable = {
  readonly count: number; readonly morton: Uint32Array; readonly level: Uint8Array; readonly childMask: Uint8Array;
  readonly firstRecord: Uint32Array; readonly ownCount: Uint32Array; readonly blobCount: Uint32Array; readonly chunkRef: Uint32Array;
};
/** A decoded column: dequantised `q0 + raw·q1` as f32 for scalar stores; packed vectors stay raw (`u10x3` → Uint16Array ×3, `u16x3` → Uint16Array ×3); `u64` → BigUint64Array. */
export type OctreeColumn = Float32Array | Uint16Array | BigUint64Array;
export type DecodedOctreeObject<H extends OctreeIndexHeader | OctreeChunkHeader> = {
  readonly header: H; readonly nodes: OctreeNodeTable; readonly columns: ReadonlyMap<ColumnId, OctreeColumn>;
};
```

`octreeFormat.ts` (byte-layout file; its first header line says so) exports, with these values:

| Constant                     | Value        | Meaning                                                |
| ---------------------------- | ------------ | ------------------------------------------------------ |
| `OCTREE_INDEX_MAGIC`         | `'SKOI'`     | ASCII at offset 0                                      |
| `OCTREE_CHUNK_MAGIC`         | `'SKOC'`     |                                                        |
| `OCTREE_VERSION`             | `1`          | u16 at offset 4                                        |
| `OCTREE_HEADER_BYTES_OFFSET` | `6`          | u32 length of the JSON header                          |
| `OCTREE_JSON_OFFSET`         | `10`         | JSON starts here, space-padded to `OCTREE_ALIGN`       |
| `OCTREE_ALIGN`               | `8`          | node table and every column start on a multiple of it  |
| `OCTREE_NODE_BYTES`          | `24`         |                                                        |
| `NODE_MORTON_OFFSET`         | `0`          | u32                                                    |
| `NODE_LEVEL_OFFSET`          | `4`          | u8                                                     |
| `NODE_CHILD_MASK_OFFSET`     | `5`          | u8; non-zero ⇒ a blob record follows the own records   |
| `NODE_FIRST_RECORD_OFFSET`   | `8`          | u32, object-local                                      |
| `NODE_OWN_COUNT_OFFSET`      | `12`         | u32                                                    |
| `NODE_BLOB_COUNT_OFFSET`     | `16`         | u32, real records the blob stands for                  |
| `NODE_CHUNK_REF_OFFSET`      | `20`         | u32 index into `header.chunks`                         |
| `NO_CHUNK_REF`               | `0xffffffff` |                                                        |
| `COLUMN_STORE_BYTES`         | per store    | `u10x3: 4`, `u16x3: 6`, scalars their natural size     |
| `OFFSET_FRACTION_LEVELS`     | `65536`      | `u16x3` raw / this = fraction of the owning node's box |
| `MAX_OWN_COUNT`              | `8192`       | bake STOP above (10-bit block index × 8)               |
| `MAX_GRID_BITS`              | `10`         | Morton must fit 30 bits                                |
| `STAR_OCTREE_DATA_PREFIX`    | `'star-catalog/v2'` | the v1 prefix stays `star-catalog/v1`            |
| `STAR_COLUMN_SCHEMA`         | 3 rows       | `offset u16x3 (0, 1)`, `absMag u8 (STAR_ABSMAG_MIN + 0.5·STAR_ABSMAG_STEP, STAR_ABSMAG_STEP)`, `colourIndex u8 (STAR_COLORIDX_MIN + 0.5·STAR_COLORIDX_STEP, STAR_COLORIDX_STEP)` — imported from `starCatalogFormat.ts`, so the q pairs cannot drift from `lutIndexToAbsMag` / `colorIdxToBpRp` |
| `starChunkPath(binBaseName, ref)` | function | `` `${STAR_OCTREE_DATA_PREFIX}/${binBaseName}/${ref.level}-${ref.morton}.${ref.hash}.bin` `` |
| `starIndexPath(binBaseName)` | function     | `` `${STAR_OCTREE_DATA_PREFIX}/${binBaseName}.bin` ``   |

- [x] Create the `@types/octree/` files; each header is one line of purpose plus units on non-obvious fields.
- [x] Create `columnIds.ts`, `statIds.ts` and `octreeFormat.ts` with the table above. Packing comments for `u10x3` (x bits 0–9, y 10–19, z 20–29) and `u16x3` (x 0–15, y 16–31, z 32–47, little-endian over 6 bytes) go in `octreeFormat.ts`.
- [x] Commit.

### Task 2: Encode and decode an octree object, `review: yes`

`review: yes`: a binary format and its parser.

**Files:** `src/data/octree/octreeFormat.ts` (modify), `src/data/octree/decodeOctreeIndex.ts`, `src/data/octree/decodeOctreeChunk.ts`, `src/data/octree/readOctreeHeader.ts` (new), `tools/octree/encodeOctreeObject.ts` (new), `tests/data/octree/octreeFormat.test.ts` (new)

**Contract:**

```ts
// tools/octree/encodeOctreeObject.ts — raw columns (quantised already), one entry per schema column
export function encodeOctreeObject(
  header: OctreeIndexHeader | OctreeChunkHeader,
  nodes: OctreeNodeTable,
  columns: readonly ColumnSchema[],
  raw: ReadonlyMap<ColumnId, Uint8Array | Uint16Array | Uint32Array | BigUint64Array | Int8Array | Float32Array>,
): Uint8Array;
// src/data/octree/readOctreeHeader.ts — framing only: magic, version, JSON; throws the "regenerate" error on a wrong magic or version
export function readOctreeHeader<H extends OctreeIndexHeader | OctreeChunkHeader>(buf: ArrayBuffer, magic: string): { header: H; nodeTableOffset: number };
// src/data/octree/decodeOctreeIndex.ts — throws when a FAMILY_REQUIRED_COLUMNS id is missing
export function decodeOctreeIndex(buf: ArrayBuffer): DecodedOctreeObject<OctreeIndexHeader>;
// src/data/octree/decodeOctreeChunk.ts — reads the columns the index declares
export function decodeOctreeChunk(buf: ArrayBuffer, index: OctreeIndexHeader): DecodedOctreeObject<OctreeChunkHeader>;
```

Dequantisation: integer scalar stores yield `Float32Array` of `q0 + raw·q1`; `f32` and `f16` yield `Float32Array` (f16 via `DataView.getFloat16` where available, else the usual bit expansion in a private helper); `u10x3` and `u16x3` yield a `Uint16Array` of 3·n raw components; `u64` a `BigUint64Array`. The "regenerate" error text follows `starCatalogFormat.ts`'s pattern: `` `unsupported octree version: ${v} — please regenerate via "npm run build-stars"` ``.

- [x] Test `round-trips every column store field-for-field` — one schema with all nine stores, three nodes, five records, hand-written raw values (including the max of each packed component: 1023 for `u10x3`, 65535 for `u16x3`), `q0 = −6.0, q1 = 0.19` on the `u8` column; assert each decoded value equals the hand-computed dequantisation and both node tables are equal.
- [x] Test `pads the JSON header so the node table starts on a multiple of 8` — a header whose JSON length is not ≡ 6 mod 8; assert `nodeTableOffset % 8 === 0` and the decoded header equals the input (the padding is spaces, which `JSON.parse` ignores).
- [x] Test `every column starts on a multiple of 8` — a `u8` column of 5 records followed by a `u16x3` column; decode and assert the second column's values survive (a misaligned reader would read garbage).
- [x] Test `a chunk decodes against the index schema it carries none of` — encode a chunk with the same raw columns, decode it with the index header, assert equality.
- [x] Test `throws when a required star column is missing` — an index with `family: 'star'` whose `columns` lacks `absMag`; `expect(() => decodeOctreeIndex(buf)).toThrow(/absMag/)`.
- [x] Test `rejects a wrong magic and a stale version with the regenerate message` — `SKOC` bytes handed to `decodeOctreeIndex`, and a version-2 index.
- [x] Implement the encoder in `tools/octree/` and the three readers in `src/data/octree/`. The private framing writer/reader share `octreeFormat.ts`'s constants only.
- [x] `npm test -- octreeFormat` passes. Commit.

### Task 3: Brightness stratification, `review: yes`

`review: yes`: the bake's level assignment and flux maths decide what every later number means.

**Files:** `tools/octree/levelForMagnitude.ts`, `tools/octree/stratifyOctree.ts`, `tools/octree/columnAggregate.ts` (new), `tools/@types/octree/OctreeBuildInput.d.ts`, `tools/@types/octree/StratifiedOctree.d.ts`, `tools/@types/octree/ColumnAggregate.d.ts` (new), `tests/tools/octree/levelForMagnitude.test.ts`, `tests/tools/octree/stratifyOctree.test.ts` (new)

**Contract:**

```ts
// L(M) = clamp(round(log2(d_res(M)·thr / cellEdge)), 0, grid.bits), d_res(M) = refUnit·10^((mLim − M)/5)
export function levelForMagnitude(absMag: number, stratify: OctreeStratify, grid: OctreeGrid): number;

export type ColumnAggregate = 'fluxCentroid' | 'fluxMeanMagnitude' | 'fluxWeightedMean';
// tools/octree/columnAggregate.ts — how a blob's value for each column is formed
export const COLUMN_AGGREGATE: Readonly<Record<ColumnId, ColumnAggregate>>; // offset: fluxCentroid, absMag: fluxMeanMagnitude, colourIndex: fluxWeightedMean

export type OctreeBuildInput = {
  readonly grid: OctreeGrid;
  readonly stratify: OctreeStratify;
  /** 3·n positions in the catalog unit, relative to `grid.origin`. */
  readonly positions: Float64Array;
  /** The column `levelForMagnitude` reads (`absMag` for stars). */
  readonly magnitudeColumn: ColumnId;
  /** Dequantised per-record values, one array per schema column except `offset` (derived from `positions`). */
  readonly columns: ReadonlyMap<ColumnId, Float32Array>;
  readonly schema: readonly ColumnSchema[];
};
/** Catalog-wide node table (firstRecord catalog-global, chunkRef all NO_CHUNK_REF) plus record columns in node-row order, own records then blob. */
export type StratifiedOctree = {
  readonly nodes: OctreeNodeTable;
  readonly columns: ReadonlyMap<ColumnId, Float32Array>; // `offset` is the fraction-of-box, 3 per record, in [0, 1)
  readonly childIndex: Int32Array; // 8 per node, −1 absent
};
export function stratifyOctree(input: OctreeBuildInput): StratifiedOctree;
```

Node set: every record's node at `L(M)` (Morton of its cell at that level) plus every ancestor to the root; rows sorted `(level, morton)` ascending so a forward scan visits children before parents. A node with `childMask ≠ 0` gets one blob record built over every descendant record (flux `10^(−0.4·M)` weights; centroid is a fraction of the node's own box; `blobCount` = their number). A node with no children has no blob. `STAR_LEAF_CAPACITY`'s fat-leaf fold is not applied. Flux helpers already exist: `fluxFromAbsMag`, `aggregateMeanAbsMag` (`tools/stars/mergeFluxAggregate.ts`); reuse them.

- [x] Test `levelForMagnitude: hand-computed levels at known magnitudes` — `grid = { bits: 10, cellEdge: 23.4 }`, `stratify = { thr: 0.16, mLim: 10, refUnit: 10 }`: `M = 10 → 0` (clamped from negative), `M = −3 → 5`, `M = −6 → 7` (compute the expected values by hand in the test's comment, never by calling the function).
- [x] Test `levelForMagnitude: an octave of thr moves the level by exactly one` — same inputs at `thr` and `2·thr` for three magnitudes away from a rounding boundary.
- [x] Test `levelForMagnitude: clamps at 0 and at grid.bits` — `M = +20` and `M = −30`.
- [x] Test `stratifyOctree: a record lives at the level its magnitude earns` — four records at hand-chosen magnitudes landing at levels 0, 0, 2, 5 in one 10-bit grid; assert each record's owner row has that level and the row's Morton is the record's cell at that level.
- [x] Test `stratifyOctree: own + blob flux equals subtree flux at every node` (spec §9 "flux conservation") — a fixture of ~200 random records; for every row with a blob: `flux(blob.absMag)·blobCount` equals the sum of flux over every descendant record (own records of strict descendants) within 1e-6 relative; `blobCount` equals that descendant count, which excludes the node's own records.
- [x] Test `stratifyOctree: rows sort by (level, morton) and the root is last; records lie own-then-blob per row` — assert `firstRecord` is monotone and `firstRecord[i] + ownCount[i] + (childMask[i] ? 1 : 0) === firstRecord[i + 1]`.
- [x] Implement. `npm test -- tools/octree` passes. Commit.

### Task 4: Capacity-bounded chunking and the object writer, `review: yes`

`review: yes`: object-local renumbering and the dense-cell STOP.

**Files:** `tools/octree/chunkOctree.ts`, `tools/octree/buildOctreeCatalog.ts`, `tools/octree/writeOctreeCatalog.ts` (new), `tools/@types/octree/OctreeObjects.d.ts`, `tools/@types/octree/OctreeChunkObject.d.ts` (new), `tests/tools/octree/chunkOctree.test.ts`, `tests/tools/octree/buildOctreeCatalog.test.ts` (new)

**Contract:**

```ts
export type OctreeChunkObject = { readonly level: number; readonly morton: number; readonly nodes: OctreeNodeTable; readonly columns: ReadonlyMap<ColumnId, Float32Array> };
export type OctreeObjects = {
  readonly index: { readonly nodes: OctreeNodeTable; readonly columns: ReadonlyMap<ColumnId, Float32Array>; readonly chunkNodeCap: number };
  readonly chunks: readonly OctreeChunkObject[]; // in index-row order of their roots
};
export const CHUNK_CAPACITY = 32_768;
/** Splits from the root: a childful node whose strict-descendant record count (own + blob per descendant) ≤ capacity becomes a chunk root; over capacity recurses. Throws (dense-cell STOP) when a level-0 row would stay in the index or any ownCount > MAX_OWN_COUNT. */
export function chunkOctree(tree: StratifiedOctree, capacity: number): OctreeObjects;
export function buildOctreeCatalog(input: OctreeBuildInput, capacity?: number): OctreeObjects; // stratify → chunk
/** Quantises columns per schema, encodes, writes `<outDir>/<name>/<level>-<morton>.<hash8>.bin` per chunk, then `<outDir>/<name>.bin` last. */
export function writeOctreeCatalog(objects: OctreeObjects, meta: { family: OctreeFamily; grid; stratify; schema; stats; capacity }, outDir: string, name: string): OctreeIndexHeader;
```

Rules carried from the spec: a chunk root's index row keeps its own records and blob and gets `chunkRef`; the chunk's table holds only rows strictly below the root, `firstRecord` renumbered object-local, its up-to-eight top rows last; chunks never nest; `chunkNodeCap` = the largest chunk's row count. Chunk file names use `contentHash8` (`tools/utils/data/contentHash8.ts`) of the encoded bytes; `OctreeChunkRef.bytes` is the raw byte length. Quantisation at write: `raw = round((value − q0) / q1)` clamped to the store's range, `offset` fraction × `OFFSET_FRACTION_LEVELS`.

- [x] Test `chunkOctree: a chunk decodes without any other chunk` (spec §9 "self-containment") — build objects from a ~2000-record fixture at capacity 300; for every chunk: every row's parent (`morton >>> 3` at `level + 1`) is either another row of the same chunk or the chunk root itself; every record's node box lies inside the root's box; `firstRecord` runs 0 … records − 1 contiguously.
- [x] Test `chunkOctree: an over-capacity node stays in the index and the split recurses` — assert the index holds the root plus every node over capacity, each chunk root's descendant count ≤ capacity, and chunk roots are never ancestors of one another.
- [x] Test `chunkOctree: STOPs when a level-0 node would land in the index` (spec §9 "dense-cell STOP") — 400 records in one level-0 cell at capacity 300: `expect(() => chunkOctree(tree, 300)).toThrow(/level 0/)`.
- [x] Test `chunkOctree: STOPs when a node owns more than MAX_OWN_COUNT records` — 8193 same-magnitude records in one cell with a capacity large enough that the split never reaches it.
- [x] Test `buildOctreeCatalog → write → decode round-trips the index and every chunk` — write to a temp dir, `decodeOctreeIndex` the index, assert `header.chunks.length` equals the chunk count, `chunkNodeCap` equals the max row count, `stats.starCount` equals the real record count, and one chunk's decoded `offset` column equals the written fraction within 1/65536.
- [x] Test `writeOctreeCatalog writes the index last` — a `writeFileSync` spy (`vi.spyOn(fs, 'writeFileSync')`) records the call order; the last path ends with `/<name>.bin`.
- [x] Implement. Commit.

### Task 5: `buildStars` bakes the octree, once per catalog

**Files:** `tools/stars/buildStars.ts`, `package.json` (script `build-stars`), `tests/tools/stars/buildStars.test.ts`, `tools/stars/buildStarOctree.ts` (header only)

**Contract (what changes in `buildStars.ts`):**

- Delete `TIER_BUDGET_BYTES` (`:148-151`), `BuildStarInputs.tierBudgets`, `StarTierResult`, `buildTier` with its `encodeFor`/`probeSize` and the binary search (`:494-570`), `CODEC_MISS_TOLERANCE` (`:156`), and the `TIER_LADDER` loop (`:446-459`).
- `BuildStarResult` becomes `{ readonly objects: OctreeObjects; readonly drops: StarDropCounts; readonly clamps: StarClampCounts }`; the CLI writes the objects and takes the header `writeOctreeCatalog` returns.
- `buildStarCatalog` keeps its selection, dedup, taper and distance stages, then forms one `OctreeBuildInput`: `positions` in pc relative to `deriveGrid`'s origin (reuse `deriveGrid`, `:602`), `columns` = `absMag`, `colourIndex` (bp−rp) as `Float32Array`, `schema = STAR_COLUMN_SCHEMA`, `stratify = GAIA_STRATIFY`, and calls `buildOctreeCatalog`.
- `export const GAIA_STRATIFY: OctreeStratify = { thr: initialState.refineThreshold, mLim: 10, refUnit: 10 }` with `initialState` imported from `src/layers/starCatalog/state/starCatalogs/initialState.ts`, so the bake and the runtime default cannot drift. One comment line states the mLim derivation (ruling 3).
- `runCli` writes with `writeOctreeCatalog(objects, …, join(outDir, STAR_OCTREE_DATA_PREFIX), 'stars')` and logs chunk count, `chunkNodeCap`, index node and record counts, index bytes. It no longer writes `stars-<tier>.bin`.
- `package.json` `build-stars` keeps its 16 GB heap for now (Task 6 measures); the script text is unchanged.
- `buildStarOctree.ts` header: one line saying it builds the SKST v1 tree and is kept for the v1 fixture (ruling 8).

- [x] Update `buildStars.test.ts`: `produces a round-trippable catalog from a synthetic fixture` (`:136`) now decodes the written index with `decodeOctreeIndex` and asserts `stats.starCount` equals the fixture's surviving star count; the famous-dedup and drop-counter tests (`:172`, `:183`) keep their assertions on `drops`.
- [x] Delete the per-tier assertions and the `tierBudgets` fixture inputs. No new test: the pipeline below `buildStars` is tested in Tasks 3 and 4.
- [x] `npm run typecheck:fast` and `npm test -- buildStars` pass. Commit.

### Task 6: TS bake timing checkpoint (ruling F) and first-bake statistics

**Files:** none committed. Report only.

Research §10 ruling F defers `tools/stars-rs` (port or drop) to "after timing a TS bake". This task produces the number and stops for the user's ruling; Group B does not wait for it.

- [x] Ensure `data/raw/gaia` resolves in this worktree (`ln -s <main checkout>/data/raw/gaia data/raw/gaia` if absent; never write into it).
- [x] Run `NODE_OPTIONS=--max-old-space-size=16384 /usr/bin/time -l npx tsx tools/stars/buildStars.ts --out-dir <scratchpad>/octree-bake` in the background (`run_in_background`), capturing stdout and stderr to the scratchpad.
- [x] Record: wall-clock seconds, `maximum resident set size` (bytes, from `time -l`), the logged chunk count, `chunkNodeCap`, index node count, index record count, index bytes raw and gzipped (`gzip -6 -c stars.bin | wc -c`), total chunk bytes, and the smallest and largest chunk sizes.
- [x] If the bake STOPs on a dense cell, record the node (level, morton, count) and stop here: the user rules on the deeper-grid vs dense-leaf-split alternative (spec §10) before Group C can stream real data. Group B still proceeds on fixtures.
- [x] Write the numbers into the ledger as `Checkpoint: TS bake timing — <wall> s, <RSS> GB peak, <chunks> chunks, chunkNodeCap <n>, index <bytes>` and ask the user for the ruling F verdict (port `stars-rs` to v2, or drop it) and whether the node count under pure `L(M)` placement wants path compression (spec §10, "node count"). Do not implement either; both are their own plans.

## Group B: one runtime shape, the cut over a pool

### Task 7: `StarOctree`, the two adapters, and the `Skst` rename

**Files:** `src/@types/data/starCatalog/StarCatalog.d.ts` → `SkstCatalog.d.ts`, `StarCatalogNode.d.ts` → `SkstNode.d.ts` (rename + move), `src/@types/data/starCatalog/StarOctree.d.ts`, `StarColumns.d.ts`, `StarChunk.d.ts` (new), `src/data/starCatalog/starCatalogFormat.ts`, `src/utils/star/starOctreeFromSkst.ts`, `src/utils/star/starOctreeFromIndex.ts`, `src/utils/star/starColumnsOf.ts`, `src/utils/star/packStarGpuRecords.ts` (new), `src/utils/star/starOctreeIndex.ts`, `src/layers/starCatalog/@types/StarOctreeIndex.d.ts`, `src/utils/star/starNodeOriginRelCamMpc.ts`, `tests/utils/star/starOctreeFromSkst.test.ts`, `tests/utils/star/packStarGpuRecords.test.ts` (new), `tests/layers/starCatalog/render/recordRepackUnpackParity.test.ts` (becomes the pack test's parity half), every importer the CLI rewrites

**Contract:**

```ts
/** What both formats decode to and the renderer, planner and pick read. */
export type StarOctree = {
  readonly grid: OctreeGrid;
  readonly starCount: number;
  readonly columns: readonly ColumnSchema[]; // STAR_COLUMN_SCHEMA for both formats
  readonly nodes: OctreeNodeTable;          // index rows (every row for SKST)
  readonly records: StarColumns;            // the index object's records
  readonly chunks: readonly OctreeChunkRef[]; // [] for SKST
  readonly chunkCapacity: number;           // 0 for SKST
  readonly chunkNodeCap: number;            // 0 for SKST
  /** Prefix sum over `chunks[i].records`, length chunks + 1, starting at `records.count` (ruling 2). */
  readonly recordOrdinalBase: Uint32Array;
};
export type StarColumns = { readonly count: number; readonly offset: Uint16Array /* 3·count, fraction of box ×65536 */; readonly absMag: Float32Array; readonly colourIndex: Float32Array };
export type StarChunk = { readonly ref: number; readonly nodes: OctreeNodeTable; readonly records: StarColumns };

export function starOctreeFromSkst(cat: SkstCatalog): StarOctree;   // v1 adapter
export function starOctreeFromIndex(obj: DecodedOctreeObject<OctreeIndexHeader>): StarOctree;
export function starColumnsOf(columns: ReadonlyMap<ColumnId, OctreeColumn>, count: number): StarColumns; // picks the three required ids
/** 2×u32 per record: w0 = x | y << 16; w1 = z | absMagToLutIndex(absMag) << 16 | bpRpToColorIdx(colourIndex) << 23. */
export function packStarGpuRecords(records: StarColumns): Uint32Array;
export const GPU_RECORD_WORDS = 2; export const GPU_ABSMAG_SHIFT = 16; export const GPU_COLOR_SHIFT = 23;

// starOctreeIndex now takes the table and grid; memoised on the table
export type StarOctreeIndex = { readonly childIndex: Int32Array; readonly boxOriginPc: Float64Array; readonly boxEdgePc: Float64Array };
export function starOctreeIndex(nodes: OctreeNodeTable, grid: OctreeGrid): StarOctreeIndex;
```

v1 adapter rules (spec §5.1): a leaf (`childMask === 0`) → `ownCount = recordCount`, `blobCount = 0`; an aggregate → `ownCount = 0`, `blobCount` = its subtree's real-star count (one child-before-parent scan), its single record already sits at `firstRecord`; offsets widen `<< 6`; `absMag`/`colourIndex` through `lutIndexToAbsMag` / `colorIdxToBpRp`; `chunkRef` all `NO_CHUNK_REF`; `recordOrdinalBase = [records.count]`.

- [x] Rename with the CLI: `npm run refactor -- rename src/@types/data/starCatalog/StarCatalog.d.ts#StarCatalog SkstCatalog`, then `npm run move-files -- src/@types/data/starCatalog/StarCatalog.d.ts src/@types/data/starCatalog/SkstCatalog.d.ts`; the same for `StarCatalogNode → SkstNode`; `npm run refactor -- rename src/data/starCatalog/starCatalogFormat.ts#decodeStarCatalog decodeSkstCatalog` and `encodeStarCatalog → encodeSkstCatalog`. Grep `src tools tests docs` for the four old names afterwards (string literals, test titles, `tools/stars-rs/src/compare.rs` comments stay as they are: Rust is out of scope).
- [x] Create the three `@types` files and the four `utils/star/` functions. `starOctreeIndex` loses `childMask`, `firstRecord`, `recordCount`, `subtreeCounts` (the table carries them; `blobCount` replaces `subtreeCounts`); update its two consumers (`starCutLayout.ts`, `nearestResolvableStar.ts`) only as far as compiling needs in this task — Tasks 8 and 14 rework them.
- [x] `starNodeOriginRelCamMpc` takes `(grid: OctreeGrid, morton: number, level: number, camPosMpc)` instead of a catalog and node object; update its test's call shape (expected values unchanged).
- [x] Test `starOctreeFromSkst: a v1 aggregate becomes a node whose blob is its record and whose own count is zero` (spec §9 "v1 adapter") — `buildStarOctree` over a fixture that folds into one aggregate over two leaves; assert the aggregate row has `ownCount 0`, `blobCount` = the fixture's star count, `childMask ≠ 0`, and `records.absMag[firstRecord]` equals `lutIndexToAbsMag` of the v1 aggregate's index.
- [x] Test `starOctreeFromSkst: a v1 in-leaf 10-bit offset is rescaled to the 16-bit node box` — a leaf record at raw offset `(1023, 0, 512)`; assert `records.offset` reads `(65472, 0, 32768)`.
- [x] Test `packStarGpuRecords: word layout round-trips the shader's unpack` — port `recordRepackUnpackParity.test.ts`'s TS twin of `vertex.wesl`'s decode to the new 16/16 + 16/7/6 layout; the test asserts, for hand-picked records including the max of every field, that `unpack(pack(r)) === r`. Delete `recordRepackUnpackParity.test.ts` once its parity half lives here.
- [x] `npm run typecheck:fast` passes (the renderer still compiles against `StarOctree` only after Task 9; keep `renderer.upload` typed to `StarOctree` from this task and adapt call sites minimally). Commit.

### Task 8: Cut layout and shaders: own + blob, residency, pool-absolute rows, `review: yes`

`review: yes`: TS↔WGSL contract and the cut's correctness.

**Files:** `src/layers/starCatalog/render/starCutLayout.ts`, `src/services/gpu/shaders/starCatalog/cutIo.wesl`, `cut.wesl`, `vertex.wesl`, `pickFragment.wesl` (unchanged semantics, verify only), `tests/helpers/starCatalog/referenceStarCut.ts`, `tests/helpers/starCatalog/@types/ReferenceStarCut.ts`, `tests/services/gpu/shaders/starCutLayout.parity.test.ts`, `tests/layers/starCatalog/render/starCutLayout.test.ts`, `tests/layers/starCatalog/render/cut/referenceStarCut.test.ts`

**Contract: `CutNode`, 6 words (`CUT_NODE_WORDS = 6`, stride 24 B, unchanged)**

| Word | Constant                 | Content                                                                   |
| ---- | ------------------------ | ------------------------------------------------------------------------- |
| 0    | `NODE_GRID_WORD`         | box min corner in leaf cells, `x \| y << 10 \| z << 20` (unchanged)       |
| 1    | `NODE_FIRST_RECORD_WORD` | **pool-absolute** first record: the wire value plus `indexRecords + slot·chunkCapacity` for a chunk row, unchanged for an index row |
| 2    | `NODE_BITS_WORD`         | `level \| hasBlob << 4 \| childrenResident << 5 \| ownCount << 8`         |
| 3    | `NODE_BLOB_COUNT_WORD`   | real records the blob stands for (was `subtreeCount`)                     |
| 4    | `NODE_PARENT_WORD`       | **pool-absolute** parent row; the index root names itself; a chunk's top rows name the chunk root's index row |
| 5    | `NODE_REFINE_DELTA_WORD` | `Σ_children (ownCount + hasBlob) − 1`; 0 for a childless node and for a chunk root whose chunk is absent |

No per-node slot word, no shader base arithmetic, no `slotRoot` table (user ruling, 2026-10-11): a chunk's rows are composed on the CPU at upload, where the slot is known, so the bases are folded in there and the shader reads plain indices. The index rows are never rewritten by this (their bases are zero).

Bits constants: `NODE_BLOB_BIT = 1 << LEVEL_BITS`, `NODE_RESIDENT_BIT = 1 << (LEVEL_BITS + 1)`, `OWN_COUNT_SHIFT = 8` (renamed from `RECORD_COUNT_SHIFT`). `childrenResident` is 1 on every row that is not an unresident chunk root.

**`CutUniforms` head grows to 80 bytes** (planes at word 20, `PLANES_FLOAT_INDEX = 20`): words 0–14 unchanged (`nodeCount` = pool rows), then `INDEX_NODES_U32_INDEX = 15`, `INDEX_RECORDS_U32_INDEX = 16`, `CHUNK_NODE_CAP_U32_INDEX = 17`, `CHUNK_CAPACITY_U32_INDEX = 18`, word 19 pad. `CUT_UNIFORM_BYTES` follows.

**`CutStream`** gains `isBlob: u32` (word 1; 16 B unchanged): the aggregate stream sets it, the leaf stream clears it.

**Opacity:** `OPACITY_CHANNELS = 2`, `OWN_OPACITY = 0`, `BLOB_OPACITY = 1`; row `i`'s channels at `i * 2 + c`.

**cutIo.wesl helpers:** `nodeHasBlob(bits)`, `nodeChildrenResident(bits)`, `nodeOwnCount(bits)`, `rootNode(u) = u.indexNodes − 1`. `parent` and `firstRecord` are read as they are. No new binding.

**cut.wesl predicates** (spec §3, §5.3): `wantsRefine(i) = nodeHasBlob && nodeChildrenResident && proxy ≥ thrSq`; `refines(i, cutBin)` as today over that; `pickThreshold` starts from `nodeOwnCount(root) + hasBlob(root)`; `emit`: `drawOwn = (i == root) || refines(nodes[i].parent)`, `drawBlob = drawOwn && !refines(i)`; each channel walks toward its goal by `fadeStep`; own records claim `ceil(ownCount / 8)` leaf-list blocks when the own channel is above 0, the blob pushes one agg-list entry when the blob channel is above 0. Zeroed pool rows (`ownCount 0`, no blob, `refineDelta 0`) pass through inert.

**vertex.wesl:** record index = `firstRecord + select(local, ownCount, isBlob)` (already pool-absolute); the spare-instance clip tests `local >= ownCount` for own records; the offset scales by the node box edge (`nodeEdgeCells · cellEdgeMpc`, already so) with `OFFSET_SCALE = 1 / 65536`; decode `x = w0 & 0xffff`, `y = w0 >> 16`, `z = w1 & 0xffff`, `absMagIdx = (w1 >> 16) & 0x7f`, `colorIdx = (w1 >> 23) & 0x3f`; flux multiplier `blobCount` when `isBlob`; opacity reads the channel the stream names; `out.recordIdx` is the pool-absolute record index (so `pickFragment.wesl:58` is unchanged).

**TS packers:**

```ts
export function packStarCutNodes(octree: StarOctree): Uint32Array;        // index rows; chunk roots unresident
/** chunkNodeCap rows, zero-padded; parent and firstRecord pool-absolute from nodeBase/recordBase; top rows' parent = rootRow. */
export function packStarChunkNodes(chunk: StarChunk, root: { level: number; morton: number; rootRow: number }, pool: { nodeBase: number; recordBase: number }, chunkNodeCap: number): Uint32Array;
export function chunkRootRefineDelta(chunk: StarChunk, root: { level: number; morton: number }): number; // Σ top rows (ownCount + hasBlob) − 1
export function leafListCapacity(octree: StarOctree, slots: number): number; // index blocks + slots·(chunkCapacity/8 + chunkNodeCap)
export function writeStarCutUniforms(out, octree: StarOctree, pool: { slots: number }, camPosMpc, cut): void;
```

Hard caps at pack time (spec §2.6): `grid.bits ≤ MAX_GRID_BITS`, every level `< 2^LEVEL_BITS`, every `ownCount ≤ MAX_OWN_COUNT`; the pool-wide node and record caps are checked in Task 9 where `slots` is known.

- [x] Update the parity test's `expected` map and struct checks for the new constants, the renamed words and the 80-byte head; it must fail before the WESL edit and pass after.
- [x] Update `referenceStarCut` to model the new predicates and both channels (`ReferenceStarCut.opacity` becomes `Float32Array` of 2·n; `leafEntries` from own records; `aggregates` from blobs; it runs over the pool table as packed, index rows then chunk rows). Existing membership, budget, prune, block and fade tests keep their assertions over v1-shaped fixtures (adapted through `starOctreeFromSkst`): a v1 leaf has own only, a v1 aggregate blob only, so the expected lists are unchanged.
- [x] Test `referenceStarCut: refineDelta equals the instance count a refine adds, against a brute-force cut` (spec §9) — a stratified fixture where nodes carry both own records and a blob (build it with Task 3's `stratifyOctree`, no chunks): for a camera that refines exactly one node, the instance count of the cut with that node refined minus the count without equals its packed `refineDelta`.
- [x] Test `referenceStarCut: a chunk root with an unresident chunk never refines, however near the camera` — camera inside the root's box, resident bit clear; assert the root draws own + blob and no child entries appear.
- [x] Test `referenceStarCut: a refining node keeps drawing its own records while its blob fades out` — assert own channel → 1 and blob channel → 0 over successive steps for the refined node, and its children's own channels → 1.
- [x] Test `packStarChunkNodes: top rows name the root's index row, inner rows a pool-absolute parent, every firstRecord carries the record base` — a two-level chunk fixture at `nodeBase 40, recordBase 1000, rootRow 7`; hand-computed expected words; also assert the padding rows past `nodes.count` are all zero.
- [x] `starCutLayout.test.ts`: `packs grid in LEAF cells…` keeps its assertion against the new word count; `writeStarCutUniforms` tests gain the four pool words at their indices.
- [x] Edit the three WESL files; `npm run build` (shader specifiers are invisible to `tsc`); the parity test passes. Commit.

### Task 9: Pool-sized buffers, chunk residency writes and the renderer's upload API, `review: yes`

`review: yes`: GPU resource lifetimes and the write ordering that Review Focus 5 names.

**Files:** `src/layers/starCatalog/render/starCutGpu.ts`, `src/layers/starCatalog/render/starCatalogRenderer.ts`, `src/layers/starCatalog/@types/StarCutGpu.d.ts`, `StarCutSource.d.ts`, `StarCutState.d.ts`, `StarCatalogRenderer.d.ts`, `StarCatalogPickResources.d.ts` (doc only), `src/layers/starCatalog/load/starCatalogSlot.ts`, `src/layers/starCatalog/render/cut/starSourcesInBand.ts`, `src/layers/starCatalog/load/starCatalogSourceCounts.ts` (type only), `tests/layers/starCatalog/render/starCutGpu.test.ts`, `tests/layers/starCatalog/render/starCatalogRenderer.pool.test.ts` (new)

**Contract:**

```ts
// StarCatalogRenderer gains / changes
upload(source: SourceType, octree: StarOctree, slots: number): void; // creates pool-sized buffers once per upload; slots = min(requested, octree.chunks.length)
uploadChunk(source: SourceType, slot: number, chunk: StarChunk): void;
evictChunk(source: SourceType, slot: number): void;
loadedCatalogs(): Iterable<{ source: SourceType; octree: StarOctree }>;
// StarCutGpu mirrors: upload(source, octree, slots), uploadChunk, evictChunk
export const POOL_NODE_INDEX_LIMIT = 2 ** LEAF_BLOCK_INDEX_SHIFT; // 2^22 rows pool-wide
export const POOL_RECORD_INDEX_LIMIT = 2 ** SELECTION_SOURCE_SHIFT; // 2^26 records pool-wide
```

Buffer rows (spec §5.4): `nodes`, `aggList`: `indexNodes + slots·chunkNodeCap`; `opacity`: that × `OPACITY_CHANNELS` (live and capture states each); `records` (renderer): `(indexRecords + slots·chunkCapacity) × GPU_RECORD_WORDS`; `leafList`: `leafListCapacity(octree, slots)`. `upload` throws before creating anything when a pool cap is exceeded, naming the largest `slots` that fits. `slots` is `budgets[tier].slots` capped by the chunk count, passed by `createStarCatalogSlot`'s commit from `req.tier` (`starCatalogSlot.ts:24-28`) — the slot factory gains the entry lookup it already has by `source`.

`uploadChunk` write order, all `queue.writeBuffer` outside any encode: (1) chunk rows from `packStarChunkNodes(chunk, { …root, rootRow }, { nodeBase: indexNodes + slot·chunkNodeCap, recordBase: indexRecords + slot·chunkCapacity }, chunkNodeCap)` at `nodeBase·CUT_NODE_WORDS` words; (2) packed records at `recordBase·GPU_RECORD_WORDS` words; (3) zero the slot's opacity rows in the live state and, if built, the capture state; (4) the root's index row rewritten with `NODE_RESIDENT_BIT` set and `refineDelta = chunkRootRefineDelta(...)`. `evictChunk`: the root row rewritten with the bit clear and `refineDelta 0`, then the slot's rows zeroed. The renderer keeps the packed index rows (`Uint32Array` from `packStarCutNodes`) per source to rewrite one row.

- [x] Test `upload sizes the pool from the index and the slot count` — a recording device stub (the pattern in `starCutGpu.test.ts:1-86`); an octree with 10 index rows, 100 index records, 3 chunks, `chunkNodeCap 7`, `chunkCapacity 50`, `slots 2`: assert `nodes` is `(10 + 14)·24` bytes, `opacity` `24·2·4`, `records` `(100 + 100)·8`.
- [x] Test `upload throws naming the slot count that fits when the record cap is exceeded` (Review Focus 1) — `chunkCapacity 2^25`, `slots 3`: `toThrow(/1 slot/)`.
- [x] Test `an index with no chunks gets no pool rows and still draws` (Review Focus 4) — `chunks: []`, `slots 256`: `nodes` sized to the index, `drawOf` non-null after one encode.
- [x] Test `uploadChunk writes the rows and records before the root's resident bit; evictChunk clears the bit first` (Review Focus 5) — record `writeBuffer` calls (buffer label, byte offset, length); assert the order above and that the root-row write's bits word has the resident bit.
- [x] Test `a landed chunk's opacity rows are zeroed in both the live and the capture state` — build the capture state first via `submitCapture`, then `uploadChunk`; assert two zero writes at the slot's opacity offset.
- [x] Existing `starCutGpu.test.ts` tests (`fade step`, `capture cut`, `lifecycle`) keep their assertions with `upload(source, octree, 0)`.
- [x] Implement; `starSourcesInBand.ts:21` and `starCatalogSelectionRow.ts` read `octree` from `loadedCatalogs()`; the slot factory's ready log (`starCatalogSlot.ts:31-37`) reads `nodes.count`. Tests whose stubs build `loadedCatalogs()` entries or `StarCatalog` fixtures (`starCutInputs`, `starSourcesInBand`, `produceStarCaptions`, `starCatalogPass`, `starAggregateUpsamplePass`, `sceneSStars`, `composeSelectionRows`, the two saga tests) change shape only, through `starOctreeFromSkst` where a real fixture is needed; expected values stay. Commit.

### Task 10: Perf check (advisory): v1 through the new cut

**Files:** none committed; ledger + scratchpad.

- [x] Before Task 7 lands (i.e. at the Group A → B boundary, on the Group A HEAD), run the baseline: `npm run perf -- --url http://localhost:<this worktree's port> --scenario star-field --scenario milky-way --scenario solar-system --frames 60` and `npm run perf:cpu -- --url … --scenario star-field` with the Gaia row still `format: 'skst'`; save both outputs to the scratchpad. Read the `perf` skill's interpretation rules (MERGED numbers; Apple Silicon slot sums are not additive).
- [x] After Task 9: rerun with identical flags. Compare the MERGED totals and the `star-cut` / `star-catalog` / `star-aggregates` slot medians against run noise (~0.5 ms at 60 frames); the opacity doubled, so a measurable delta is possible. **Advisory, not a stop** (user ruling, 2026-10-11): record both tables in the ledger and report the deltas to the user; a regression is flagged for a ruling, and Group C proceeds.
- [x] Eye check on v1 (no behaviour change expected): `npm run shot -- '#focus=body-sun' --url …` and `'#focus=star-…'` of a famous star from `famous_stars_meta.json`; send both shots with their deep links as a dash check. The user keeps the verdict.

## Group C: streaming

### Task 11: The format switch and the per-tier `slots`

**Files:** `src/@types/data/starCatalog/StarCatalogFormat.d.ts` (new), `SurveyStarCatalogSourceEntry.d.ts`, `StarSourceBudgets.d.ts`, `src/layers/starCatalog/sources/gaia-stars.ts`, `src/layers/starCatalog/load/starCatalogFetcher.ts`, `src/@types/loading/StarCatalogReq.d.ts` (doc), `tests/layers/starCatalog/load/starCatalogFetcher.test.ts`

**Contract:**

```ts
export type StarCatalogFormat = 'skst' | 'octree';
// SurveyStarCatalogSourceEntry gains
readonly format: StarCatalogFormat;
// StarSourceBudgets per-tier object gains
readonly slots: number;
// gaia-stars.ts: format: 'octree'; budgets small { drawBudget: 1_500_000, slots: 64 }, medium { …, slots: 128 }, large { …, slots: 256 }
```

The fetcher (`starCatalogFetcher.ts:51-57`): `'skst'` fetches `${STAR_CATALOG_DATA_PREFIX}/${binBaseName}-${tier}.bin` and returns `starOctreeFromSkst(await decodeSkstCatalog(buf))`; `'octree'` fetches `starIndexPath(binBaseName)` (no tier in the name: one bake serves every tier) and returns `starOctreeFromIndex(decodeOctreeIndex(buf))`. `Fetcher<StarOctree, StarCatalogReq>`. The `tier` doc on `StarCatalogReq` says it selects the file for `skst` and the pool size for `octree`. Starting `slots` values are first guesses for the A/B (spec §5.4: large at 256 slots ≈ 67 MB of records); the comment above `budgets` says so in one line.

- [x] Test `fetches the v2 index by base name, with no tier, when the row's format is octree` — mock the Gaia row (`vi.mock` with `importOriginal`, override `format`), assert the fetched URL ends with `star-catalog/v2/stars.bin` and the result has `chunks.length` of the fixture index.
- [x] The existing `fetches <binBaseName>-<tier>.bin and decodes it` test pins the `skst` branch with `format: 'skst'` mocked; assert the result's `chunks` is empty.
- [x] Commit.

### Task 12: The chunk stream and residency, `review: yes`

`review: yes`: a landmine memory names `SlotPool.allocate` (refuse-when-claimed-this-frame), and the write ordering of Task 9 is driven from here.

**Files:** `src/layers/starCatalog/load/starChunkStream.ts`, `src/layers/starCatalog/@types/StarChunkStream.d.ts`, `src/layers/starCatalog/@types/StarChunkRequest.d.ts` (new), `src/layers/starCatalog/@types/StarCatalogRuntime.d.ts`, `src/layers/starCatalog/load/starCatalogSlot.ts`, `src/layers/starCatalog/create.ts`, `src/layers/starCatalog/destroy.ts`, `tests/layers/starCatalog/load/starChunkStream.test.ts` (new), `tests/layers/starCatalog/create.test.ts`

**Contract:**

```ts
export type StarChunkRequest = { readonly chunkRef: number; readonly priority: number };
export type StarChunkStream = Destroyable & {
  /** One call per frame: touches resident chunks, allocates and enqueues requests in descending priority until the pool refuses. */
  update(frame: number, touched: readonly number[], requests: readonly StarChunkRequest[]): void;
  isResident(chunkRef: number): boolean;
  resident(chunkRef: number): StarChunk | null;   // the CPU copy while its slot holds it (ruling 6)
  slotOf(chunkRef: number): number | undefined;
  chunkAt(slot: number): StarChunk | null;
  inFlightCount(): number;
  /** Increments on every landing and eviction; the planner's wake and fade reset read it. */
  epoch(): number;
  fetchedBytes(): number;
};
export function createStarChunkStream(deps: {
  readonly octree: StarOctree; readonly binBaseName: string; readonly slots: number;
  readonly requestRender: () => void;
  readonly upload: (slot: number, chunk: StarChunk) => void;  // renderer.uploadChunk
  readonly evict: (slot: number) => void;                     // renderer.evictChunk
  readonly fetchChunk?: (path: string) => Promise<ArrayBuffer | null>; // default: fetch(dataUrl(path)) → arrayBuffer, null on !ok
}): StarChunkStream;
// StarCatalogRuntime gains a mutable holder the slot's commit fills and release clears
readonly chunkStreams: Map<SourceType, StarChunkStream>;
```

Built on `createTileStreamSubsystem<StarChunk, SlotPool>({ slots: new SlotPool(slots), concurrency: STAR_CHUNK_CONCURRENCY, requestRender, upload, release })` with `STAR_CHUNK_CONCURRENCY = 4` in `src/data/starChunkStream.ts` (the `SURFACE_TILE_CONCURRENCY` precedent). Keys are `String(chunkRef)`. The fetcher decodes with `decodeOctreeChunk(buf, indexHeader)` → `starColumnsOf` → `StarChunk`; a failed fetch resolves null, which the stream marks failed and never retries (Review Focus 2). The stream owns the store's evict handler (P1 rule) and forwards it to `deps.evict` after dropping its CPU copy. When `slots === 0` (`octree.chunks.length === 0`) `createStarCatalogSlot` creates no stream (Review Focus 4). `destroy.ts` destroys every stream before the renderers.

- [x] Test `update touches resident chunks and requests in descending priority until the pool refuses` (spec §9 "planner request order", the stream half) — `slots 2`, three requests with priorities 3, 9, 1 on frame 1; assert fetches were enqueued for 9 then 3 and the priority-1 request was dropped without an allocation; on frame 2 with both resident in `touched`, assert no new fetch and no eviction.
- [x] Test `a landed chunk is uploaded to its slot, counted in fetchedBytes and bumps the epoch; eviction evicts the slot and bumps it again` — stub `fetchChunk` resolving an encoded chunk fixture.
- [x] Test `a failed fetch marks the chunk failed and never re-enqueues it` (Review Focus 2) — `fetchChunk` resolving null; a second `update` requesting the same ref enqueues nothing and `inFlightCount()` is 0.
- [x] Test `an in-flight chunk evicted before landing is released, not uploaded` — allocate on frame 1, force eviction by over-requesting on frame 2 with the first key absent from `touched`, resolve the fetch; assert `upload` was never called for the evicted slot.
- [x] ~~`create.test.ts`: the runtime exposes an empty `chunkStreams` map at creation.~~ Not written: an empty map at creation fails on no real bug (`testing.md`).
- [x] Commit.

### Task 13: The CPU planner, the frame wiring and the wake vote

**Files:** `src/utils/star/planStarChunks.ts` (new), `src/layers/starCatalog/frame.ts`, `src/layers/starCatalog/@types/StarChunkPlan.d.ts` (new), `tests/utils/star/planStarChunks.test.ts` (new), `tests/layers/starCatalog/frame.test.ts`

**Contract:**

```ts
export type StarChunkPlan = { readonly requests: readonly StarChunkRequest[] /* descending priority */; readonly touched: readonly number[] };
/**
 * Walks the index from the root with the cut's own tests: frustum (every view's six planes, `cut.planes`, rebased about `cut.originMpc`, the box grown as `cut.wesl`'s `offScreen` grows it) and the refine proxy edge²/dist² ≥ thr². A chunk root the walk would refine is a request (priority = proxy) when absent, touched when resident. The walk never enters a chunk.
 */
export function planStarChunks(octree: StarOctree, index: StarOctreeIndex, cut: StarCutSpec, isResident: (chunkRef: number) => boolean): StarChunkPlan;
```

`starCatalogPlanner` (`frame.ts:20-41`): after `starCutInputs`, for every in-band source whose `chunkStreams` entry exists, `planStarChunks` then `stream.update(frameIndex, …)`; the wake vote becomes `awake = inputs !== null && (nowMs − changedAtMs < NODE_FADE_MS || inFlight > 0)`, and a change in any stream's `epoch()` since the last frame sets `changedAtMs = nowMs` (a landing chunk changes the cut without changing `sameStarCut`'s inputs). The frame index comes from a counter the planner owns.

- [x] Test `planStarChunks: requests are in descending proxy, a culled chunk is not requested, a resident chunk is touched` (spec §9) — a hand-built index with three chunk roots: one near and on-screen (resident → touched), one near and on-screen (absent → requested), one near but behind the camera (culled → neither), plus a far one below `thr` (neither); assert exactly that.
- [x] Test `planStarChunks: with no planes (more than CUT_MAX_VIEWS) nothing is culled` — `planes` empty; the behind-camera root is requested.
- [x] `frame.test.ts`: add `stays awake while a chunk is in flight` and `re-arms the fade window when a chunk lands` (stub stream with `inFlightCount` / `epoch`); the existing drift-tolerance tests keep their values.
- [x] Commit.

### Task 14: Pick, selection and the field-star sphere over the pool, `review: yes`

`review: yes`: selection state and the pick encoding.

**Files:** `src/utils/star/starRecordObject.ts` (new), `src/services/engine/helpers/resolveStarRecord.ts`, `src/services/engine/helpers/nearestResolvableStar.ts`, `src/layers/starCatalog/present/starCatalogSelectionRow.ts`, `src/layers/starCatalog/passes/fieldStarSpherePass.ts`, `src/layers/starCatalog/@types/StarCatalogRenderer.d.ts`, `src/layers/starCatalog/render/starCatalogRenderer.ts`, `src/layers/starCatalog/@types/StarResidency.d.ts` (new), `src/layers/starCatalog/load/starResidency.ts` (new), `tests/utils/star/starRecordObject.test.ts` (new), `tests/services/engine/helpers/resolveStarRecord.test.ts`, `tests/services/engine/helpers/nearestResolvableStar.test.ts`, `tests/layers/starCatalog/present/starCatalogSelectionRow.test.ts` (new), `tests/layers/starCatalog/passes/fieldStarSpherePass.test.ts`

**Contract:**

```ts
/** chunk = null for an index record. Inverse pair; both O(log chunks) over `recordOrdinalBase`. */
export function starRecordObject(octree: StarOctree, ordinal: number): { chunk: number | null; local: number } | null;
export function starRecordOrdinal(octree: StarOctree, chunk: number | null, local: number): number;
export type StarResidency = (chunkRef: number) => StarChunk | null;
export function starResidency(runtime: Pick<StarCatalogRuntime, 'chunkStreams'>, source: SourceType): StarResidency;
// renderer: pool-absolute ↔ ordinal through its own slot → chunkRef table, filled by uploadChunk (StarChunk.ref) and cleared by evictChunk; no stream argument
recordOrdinal(source: SourceType, poolIndex: number): number | null;
poolRecordIndex(source: SourceType, ordinal: number): number | null;
export function resolveStarRecord(octree: StarOctree, resident: StarResidency, ordinal: number): { positionMpc: Vec3; absMag: number; bpRp: number } | null;
export function nearestResolvableStar(octree: StarOctree, resident: StarResidency, camPosMpc: Readonly<Vec3>, searchRadiusMpc: number): { ordinal: number; positionMpc: Vec3; bpRp: number; distanceMpc: number } | null;
```

`resolveStarRecord`: the owner row is the last row with `firstRecord ≤ local` in the object's table (monotone in row order); a `local` at `firstRecord + ownCount` is the blob and resolves to null (a blob is not a star); position = node box origin + `offset / 65536 · edge` via `starNodeOriginRelCamMpc`. `nearestResolvableStar` walks the index as today, descends into a resident chunk through a chunk-local `starOctreeIndex(chunk.nodes, grid)`, skips an unresident chunk, and considers every node's own records (hoisted stars included), never blobs. `starCatalogSelectionRow`: `resolvePick` maps `pick.localIdx` through `recordOrdinal` and returns null on a miss; `encodePick` maps the ordinal through `poolRecordIndex`, null when not resident; `extractRow` returns null when `resolveStarRecord` does. `fieldStarSpherePass.ts:151,222` passes `starResidency(runtime, source)`.

- [x] Test `starRecordObject ↔ starRecordOrdinal round-trip across the index and every chunk boundary` — `recordOrdinalBase = [100, 150, 150, 400]` (an empty chunk in the middle); hand-picked ordinals 0, 99, 100, 149, 150, 399 and 400 (→ null).
- [x] `resolveStarRecord.test.ts`: keep `round-trips a packed leaf star position within quantisation` over a v1 fixture through `starOctreeFromSkst`; add `resolves a record inside a resident chunk and returns null for the same ordinal once evicted` (spec §9 "pick after eviction") and `a blob ordinal resolves to null`.
- [x] `nearestResolvableStar.test.ts`: existing four tests over v1 fixtures keep their values; add `finds a hoisted own record above leaf level` (a stratified fixture with one bright star at level 3) and `ignores stars inside an unresident chunk`.
- [x] Test `starCatalogSelectionRow: a pick raced by an eviction resolves to null, never another star` (Review Focus 3) — renderer stub whose `recordOrdinal` returns null for the picked pool index; assert `resolvePick` is null; and `encodePick returns null for an ordinal whose chunk is not resident`.
- [x] `fieldStarSpherePass.test.ts`: call-shape update only.
- [x] Commit.

### Task 15: DEV-only chunk facts at settle

**Files:** `src/layers/starCatalog/load/starChunkStream.ts` (modify)

No test: a console line behind `import.meta.env.DEV`.

- [x] When `inFlightCount()` returns to 0 after at least one landing, log once per settle: `` `[stars] ${binBaseName}: ${fetched}/${total} chunks, ${(bytes / 1e6).toFixed(1)} MB fetched, ${resident} resident` ``. This is the A/B's bytes-and-chunks readout (spec §5.6).
- [x] Commit.

## Group D: deploy, docs, the real bake and the A/B

### Task 16: Deploy rows, the chunk collector, the bulk group, `fetch-data`, `review: yes`

`review: yes`: a wrong row silently leaves chunks off R2 or uploads them raw.

**Files:** `tools/deploy/r2/dataFamilies.ts`, `tools/deploy/r2/collectStarChunks.ts` (new), `tools/deploy/syncR2.ts`, `tools/fetch/fetchPrebuiltData.ts`, `tests/tools/deploy/r2/dataFamilyOf.test.ts`, `tests/tools/deploy/r2/collectStarChunks.test.ts` (new)

**Contract:**

```ts
// DATA_FAMILIES, two new rows after `star-catalog-v1`
{ label: 'star-catalog-v2-index',  dir: 'star-catalog/v2',       fileName: /^stars\.bin$/,     transport: 'wrangler', gzipOnWire: true }
{ label: 'star-catalog-v2-chunks', dir: 'star-catalog/v2/stars', fileName: /^\d+-\d+\.bin$/,   transport: 'bulk',     gzipOnWire: true }
// tools/deploy/r2/collectStarChunks.ts — for every manifest value whose logical dir is STAR_OCTREE_DATA_PREFIX (today `stars.bin`), reads that index's header and lists its chunks under `<logical name without .bin>/`; [] when no index
export function collectStarChunks(dataDir: string): R2Upload[]; // localPath public/data/star-catalog/v2/stars/<l>-<m>.<h>.bin, r2Key data/star-catalog/v2/stars/<…>
// syncR2.ts buildGroups(): one group beside the surface-tile groups, before every manifest group
{ label: 'Star octree chunks', files: collectStarChunks(DATA_DIR), transport: { kind: 'bulk', localRoot: 'public/data/star-catalog/v2', keyRoot: 'data/star-catalog/v2' }, cacheControl: IMMUTABLE, purge: false, gzipOnWire: true }
// the roots are the epoch dir, so a second index's `<name>/` subtree rides the same group; the index objects themselves are wrangler files and never in this list
```

Why the chunk row's regex sees no hash: `logicalDataName` strips exactly eight lowercase hex characters before the extension, and `contentHash8` writes exactly that. The bulk row is never hashed, manifested or drift-guarded (`allowDataFile` is `transport === 'wrangler'`), so `buildDataManifest` leaves chunk files alone; `walkDataFiles` still walks the chunk directory for the drift guard (thousands of entries, filtered out) — acceptable, noted in DEPLOY.md. The index is written last by the bake, so an interrupted bake uploads nothing. `fetchPrebuiltData`: after the manifest files, if `star-catalog/v2/stars.bin` is among them, read its header and download every `starChunkPath` the same way (`.part` then rename); `--dry-run` lists them with HEAD sizes.

- [x] `dataFamilyOf.test.ts`: add `STARS_V2_INDEX` and `STARS_V2_CHUNKS` expectations; TRACKED rows `star-catalog/v2/stars.bin`, `star-catalog/v2/stars.a3f19c2e.bin`, `star-catalog/v2/stars/6-12345.a3f19c2e.bin`; UNTRACKED `star-catalog/v2/stars/6-12345.bin.part`, `stars/6-12345.a3f19c2e.bin` (wrong dir), `star-catalog/v1/stars.bin`.
- [x] Test `collectStarChunks lists exactly the chunks the index header names, under the stars/ dir` and `returns [] without an index` — a temp `public/data` with a manifest naming a hashed index written by `writeOctreeCatalog`.
- [x] `npm run sync-r2 -- --dry-run` (no credentials, no network) lists the index under `public/data: star-catalog-v2-index` with `gzip=true` and every chunk under `Star octree chunks` as `bulk … gzip=true`, before `data/manifest.json`. Paste three lines into the ledger. Never run a real sync from this plan.
- [x] Commit.

### Task 17: Docs follow the format

**Files:** `docs/DATA.md`, `docs/DEPLOY.md`, `docs/RENDERER.md`, `ATTRIBUTIONS.md`, `tools/stars-rs/README.md` (one line), `docs/BACKLOG.md` (verify only)

- [x] `DATA.md` "Binary formats": a row `SKOI / SKOC | ASCII | 1 | Chunked octree container: 10-byte framing + JSON header + 24 B node rows + columnar records; index per catalog, one object per chunk | octreeFormat.ts`; "`public/data/` layout": `star-catalog/v2/`: `stars.bin` + `stars/<level>-<morton>.<hash>.bin`; "Stars (Gaia DR3)": `build-stars` emits the v2 index and chunks, one bake for every tier, and the 16 GB heap note updated with Task 6's measured peak; the re-run table gains a Stars row (`fetch-gaia` / `build-stars`).
- [x] `DEPLOY.md` "R2 sync architecture": the chunk bulk group, its gzip-on-wire, that it runs before the manifests, and that old chunk objects stay in R2 after a re-bake (pruning is manual). Cache Rule paragraph: chunks are `.bin` too, so every chunk fetch is an origin hit until the rule lands.
- [x] `RENDERER.md` "Renderer quick map": one bullet for the star cut over the pool (own + blob per node, the resident bit, chunk rows composed pool-absolute at upload, two fade channels, index never rewritten). "Things that have bitten us": the three traps this plan found — residency writes never inside an encode; rows and records before the root's resident bit; a pick index is pool-absolute and only the ordinal survives a slot reuse.
- [x] `ATTRIBUTIONS.md:401-402` Gaia "Enters skymap": `npm run build-stars` → `public/data/star-catalog/v2/`.
- [x] `tools/stars-rs/README.md`: one line noting it still emits SKST v1 (`star-catalog/v1/`) and that v2 is TS-only pending ruling F.
- [x] `docs/BACKLOG.md`: confirm no chunked-octree line remains (#868 removed it); leave `Star drawBudget small-tier mobile cap` (`:169`) as is.
- [x] Commit.

### Task 18: The real bake, eye checks, perf and the A/B table

**Files:** none committed; ledger. Ask the user before the bake writes into the main checkout's `public/data`.

- [x] With the user's go: `npm run build-stars` from the main checkout (the worktree's `public/data` is a symlink; `build-data-manifest` skips a symlinked tree, so the manifest must be built where the tree is real). Confirm `public/data/star-catalog/v2/stars.<h8>.bin` and `stars/` exist and `manifest.json` names the index.
- [x] Restart this worktree's dev server (a directory created after Vite started serves HTML, not bytes).
- [ ] Eye checks (deep links, dash check, the user's verdict): `#focus=body-sun` cold (the sky before any chunk lands: blobs, then chunks fade in as the DEV log settles); a famous star `#focus=star-…` (the chunk lands, the field-star sphere resolves); hold the camera still 10 s and confirm the Network tab shows no repeat chunk requests; move away and back and confirm the chunk re-fetches only after eviction; pick a field star, move the camera until its chunk evicts, confirm the InfoCard clears instead of renaming.
- [x] Perf: `npm run perf` and `perf:cpu` at `star-field`, `milky-way`, `solar-system`, `--frames 60`, `--url` this worktree, with the row at `format: 'octree'`, then at `format: 'skst'` (edit the row, HMR), alternating A-B-A-B (the `perf` skill's paired-baseline recipe), per tier via `--compare-tiers` once each. Same `drawBudget` for both.
- [x] The A/B table (spec §5.6), one row per pose and tier: GPU ms, CPU ms, bytes on the wire to settle (index + chunks, cold, from the DEV log), chunks fetched / total, index size raw and gzipped. Put it in the ledger and summarise in the PR description.
- [x] Report the first-bake findings against spec §10: node count under pure `L(M)` (does `chunkNodeCap` or the index size argue for path compression), tiny-chunk count (does capacity splitting leave many small chunks), and whether `slots` per tier and `chunkCapacity` want a retune. These are rulings for the user, not changes in this plan.

## Nested chunks (2026-10-11)

User directive after the pruned planner walk (`dcece6c79`): the index splits into chunks too, so the object fetched before first paint, and every header, stays bounded as Gaia grows. Spec §2 (intro, §2.2, §2.3), §4.7, §5.1 to §5.3, §5.5, §8.4 and §10 carry the design; the brief is `.superpowers/sdd/2026-10-11-chunked-star-octree/nested-brief.md`. One implementer, in order; each task is one commit.

**Contract:**

```ts
type OctreeChunkRef = { readonly id: number; /* …as before… */ readonly roots: readonly number[] /* rows of the parent object */; readonly recordBase: number };
type OctreeChunkHeader = { /* …as before… */ readonly chunks: readonly OctreeChunkRef[] };
// STAT_IDS gains 'chunkCount'; a row's chunkRef is a catalog-global id in every object.
type OctreeChunkObject = { /* …as before… */ readonly parent: number | null /* chunk id, null = index */; readonly recordBase: number };
// OctreeObjects.chunks is indexed by id (breadth-first from the index, Morton order within a parent).
type StarOctree = { /* …as before, minus recordOrdinalBase… */ readonly chunks: readonly OctreeChunkRef[] /* the index's own */; readonly chunkCount: number };
type StarChunk = { readonly ref: OctreeChunkRef; readonly parent: number | null; readonly nodes; readonly records; readonly chunks: readonly OctreeChunkRef[] };
/** The object whose rows hold a chunk's roots, as the pool addresses it. */
type StarChunkHost = { readonly nodes: OctreeNodeTable; readonly nodeBase: number };
type StarResidency = { readonly chunk: (id: number) => StarChunk | null; readonly chunkOfRecord: (ordinal: number) => StarChunk | null };
class SlotPool { evict(key: string): void /* frees the slot through onEvict, as LRU recycling does */ }
function planStarChunks(octree, index, cut, resident: (id: number) => StarChunk | null, hasFailed: (id: number) => boolean, limit: number): StarChunkPlan;
StarCutGpu.uploadChunk(source, slot, chunk, host: StarChunkHost): void;
StarCutGpu.evictChunk(source, slot, chunk: StarChunk, host: StarChunkHost): void;
// The stream holds residency, so it names the parent slot; the renderer never searches for it.
StarCatalogRenderer.uploadChunk(source, slot, chunk, hostSlot: number | null): void;
StarCatalogRenderer.evictChunk(source, slot, hostSlot: number | null): void;
```

### Task N0: Prep — a root's residency words come from its host table

Behaviour-neutral. `writeRootRow` writes only `bits` and `refineDelta`, composed from the node table that holds the root (the index today); `StarCutSource.indexRows` goes. No new test: the pool test's write-order and root-row assertions already pin the words.

- [ ] Implement, `typecheck:fast`, the star render tests. Commit.

### Task N1: The bake nests

**Files:** `tools/octree/chunkOctree.ts`, `tools/octree/writeOctreeCatalog.ts`, `tools/@types/octree/OctreeChunkObject.d.ts`, `tools/@types/octree/OctreeObjects.d.ts`, `src/@types/octree/OctreeChunkRef.d.ts`, `src/@types/octree/OctreeChunkHeader.d.ts`, `src/data/octree/statIds.ts`, tests.

- [ ] Test `chunkOctree: nests until the top object fits both bounds` — a fixture that needs at least two nesting passes: the index and every chunk within both bounds; every chunk id listed by exactly one object, under rows of that object that carry its id; ids breadth-first; `recordBase` = index records + the records of every lower id.
- [ ] Test `chunkOctree: STOPs when a nesting pass finds no root` — a top over the record bound whose every internal row is over it too.
- [ ] Test `writeOctreeCatalog → decode: every object's header lists its own child refs, children written before parents` (round trip: `decodeOctreeChunk` yields `header.chunks` with global ids and `recordBase`; the index's `stats.chunkCount` is the object count; the last write is the index).
- [ ] Implement. Commit.

### Task N2: The runtime walks, lands and evicts nested chunks

**Files:** `src/@types/data/starCatalog/{StarOctree,StarChunk,StarResidency}.d.ts`, `src/layers/starCatalog/@types/StarChunkHost.d.ts` (new), `src/utils/star/starOctreeFromIndex.ts`, `src/utils/star/planStarChunks.ts`, `src/utils/cache/slotPool.ts`, `src/layers/starCatalog/load/{starChunkStream,starResidency}.ts`, `src/layers/starCatalog/render/{starCatalogRenderer,starCutGpu}.ts`, `src/services/engine/helpers/{resolveStarRecord,nearestResolvableStar}.ts`, `src/layers/starCatalog/frame.ts`; deleted: `starRecordObject`, `starRecordOrdinal`, `StarRecordObject` (and the test).

- [ ] Test `planStarChunks walks into a resident chunk and requests the chunk rooted in its rows` (and touches the resident parent once, and requests nothing under a culled root inside it).
- [ ] Test `starChunkStream: evicting a parent first evicts its resident descendants, deepest first` (the evict calls' slot order; the freed slots are reusable); and `drops a landing whose parent was evicted in flight`.
- [ ] Test `starCatalogRenderer: a nested chunk's roots are written in its parent's slot rows` (root words at `parentBase + root`; an eviction cascade writes the child's root words before the parent's).
- [ ] Test `pick ordinal round-trips through a nested chunk` (`recordOrdinal` / `poolRecordIndex` / `resolveStarRecord` via `recordBase`).
- [ ] Implement. Commit.

### Task N3: Tools walk the object tree

**Files:** `tools/deploy/r2/collectStarChunks.ts`, `tools/fetch/fetchPrebuiltData.ts`, tests.

- [ ] Test `collectStarChunks lists the chunks of every depth, read off each header`.
- [ ] Implement (`fetch-data` and the collector read only headers: `readOctreeFileHeader` off disk, else a ranged GET; `--dry-run` moves no bodies). Commit.

### Task N4: Re-bake, measure, docs

- [ ] Only after `phone-ab-report.md` exists: `npm run build-stars` from this worktree (the user's standing approval), manifest from the main checkout with this worktree's `buildDataManifest`. Report objects per depth, index rows / records / bytes (raw, gzip), chunk count, padding, largest manifest header.
- [ ] `perf:cpu` and `perf` against `dcece6c79`, A-B-A, at this worktree's `:5183`: `plan:star-catalog`, GPU frame ms at `milky-way` / `star-field` / `solar-system`, bytes and requests to settle, time to first stars cold. Neutral-or-negative halts the landing.
- [ ] `DATA.md`, `RENDERER.md`, spec §10 numbers. Commit.

## Definition of Done

**Deliverables**

- `src/data/octree/` (`octreeFormat.ts`, `columnIds.ts`, `statIds.ts`, `readOctreeHeader.ts`, `decodeOctreeIndex.ts`, `decodeOctreeChunk.ts`) and `src/@types/octree/` (13 types); `tools/octree/` (`encodeOctreeObject`, `levelForMagnitude`, `stratifyOctree`, `columnAggregate`, `chunkOctree`, `buildOctreeCatalog`, `writeOctreeCatalog`) with `tools/@types/octree/`.
- `StarOctree`, `StarColumns`, `StarChunk`; `starOctreeFromSkst`, `starOctreeFromIndex`, `starColumnsOf`, `packStarGpuRecords`, `starRecordObject` / `starRecordOrdinal`, `planStarChunks`; `SkstCatalog`, `SkstNode`, `decodeSkstCatalog`, `encodeSkstCatalog` (no unmarked v1 name remains).
- `CutNode` at 6 words with pool-absolute `parent` and `firstRecord` on chunk rows, two opacity channels, the 80-byte `CutUniforms` head; `cut.wesl` with own + blob predicates and the resident bit; `vertex.wesl` on the 16-bit box offset and pool-absolute record index.
- `StarCatalogRenderer.upload(source, octree, slots)`, `uploadChunk`, `evictChunk`, `recordOrdinal`, `poolRecordIndex`; `createStarChunkStream`; `StarCatalogRuntime.chunkStreams`.
- `SurveyStarCatalogSourceEntry.format`, `StarSourceBudgets[tier].slots`; Gaia at `format: 'octree'`.
- `buildStars` without `TIER_BUDGET_BYTES` / `buildTier`; `public/data/star-catalog/v2/stars.bin` + `stars/` from one bake.
- `DATA_FAMILIES` rows `star-catalog-v2-index` and `star-catalog-v2-chunks`; `collectStarChunks`; the `Star octree chunks` bulk group; `fetch-data` pulls chunks.
- The ledger holds the Task 6 timing checkpoint, the Task 10 neutrality tables and the Task 18 A/B table.

**Observable behaviours (the smoke)**

- `#focus=body-sun`, cold: the sky draws from the index alone (bright stars and glows), chunks fade in within a second or two, the DEV log reports the settle; held still, no further chunk requests.
- A famous-star deep link: the star resolves to a sphere once its chunk lands; the InfoCard shows the field-star row for a picked survey star and clears when that chunk is evicted.
- Switching the Gaia row to `format: 'skst'` renders as on main at the same poses.
- `npm run sync-r2 -- --dry-run` lists the index (wrangler, gzip) and every chunk (bulk, gzip) ahead of the manifest.
- The tier switch (small / medium / large) reloads the same index with a different pool size; the Network tab shows one index fetch per switch, not three files.

**Out of scope (the deferral boundary)**

- Deleting the v1 reader, `starBinCodec.ts`, `buildStarOctree.ts`, `encodeSkstCatalog` (ruling E at `/feature-done`) and `tools/stars-rs` (ruling F, Task 6's number).
- Dense cells beyond the STOP, path compression of single-record chains, sibling packing of tiny chunks, tuning `chunkCapacity` / `slots` / concurrency / `mLim` (spec §10; Task 18 reports the numbers).
- Galaxies on the octree, galaxy column ids and stats, search into non-resident chunks.
- The production `.bin` Cache Rule; R2 pruning of superseded chunks.
- A DebugPanel row for chunk facts; a runtime format toggle (the row field is the switch).
- The `famous_stars_meta.json` boot demand and the `drawBudget` small-tier cap (backlog items that stay).
