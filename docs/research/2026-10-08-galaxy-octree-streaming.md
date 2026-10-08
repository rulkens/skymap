# Galaxy octree LOD + chunked streaming from R2 — investigation

**Date:** 2026-10-08
**Scope:** can the Gaia star-catalog octree LOD be adapted to galaxy catalogs, and can the tree be split into chunks hosted on R2 and streamed on demand, so the browser never holds a whole survey? Prompted by REGALADE (71.5 M rows, `docs/backlog/2026-10-08-regalade-wiring.md`) against today's ~2.5 M-point ceiling.
**Status:** findings + a recommended shape. Not a spec; promote via brainstorm → `refactor-ground` → spec.

---

## 1. What exists today (verified against source)

### 1.1 The star octree (SKST) — `src/data/starCatalog/starCatalogFormat.ts`

- 64 B header, 16 B nodes (`mortonIndex u32`, `level u8`, `childMask`, `firstRecord u32`, `recordCount u32`), 6 B records (3×10-bit cell offsets, 7-bit absMag LUT, 6-bit BP−RP LUT, 5 spare bits). Leaf vs aggregate is `childMask === 0`; an aggregate owns exactly one flux-weighted centroid record.
- Builder (`tools/stars/buildStarOctree.ts`, canonical port `tools/stars-rs`): quantise to a 1024³ leaf grid (`DEFAULT_MORTON_BITS = 10`), sort by Morton, fold bottom-up; subtrees with ≤ `STAR_LEAF_CAPACITY = 64` records become fat leaves (in-cell resolution halves per fold), larger ones become aggregates. Capacity only merges, never splits: a dense finest cell stays one leaf.
- Runtime cut is three compute dispatches over **every node** (`src/services/gpu/shaders/starCatalog/cut.wesl`, `src/layers/starCatalog/render/starCutGpu.ts`): refine proxy `edge² / dist²` vs `refineThreshold` (0.16, an angular-size test independent of resolution), a 1024-bin log-proxy histogram, a single-thread threshold pick against `drawBudget.typical = 1.5 M` instances, then `emit` into two `drawIndirect` lists (leaves at full res, aggregates linear into a half-res glow target) with a 250 ms per-node cross-fade. "In the cut" = parent refines and self does not, which is why one flat pass suffices.
- Hard caps that bind at galaxy scale (`src/layers/starCatalog/render/starCutLayout.ts:27-37,99-118`): grid 1024 cells/axis, level ≤ 15, **node count < 2²² = 4.19 M**, ≤ 8192 records per leaf, 26-bit pick index. `mortonEncode3` masks to 10 bits/axis.
- **Not streamable as is.** The file is one gzip stream (`starBinCodec.ts`), nodes are sorted `(level, morton)` ascending — level-major, root last — and records live in two regions (real stars in node order, then one record per aggregate). A subtree is spread over every level band and both regions; no byte range decodes on its own. Children are implicit (`(M<<3)|k`), resolved at load through a `Map` (`src/utils/star/starOctreeIndex.ts`), and the parent index the GPU needs is computed from the full table. Both tiers of the design say the same: "upload commits a catalog once", buffers "sized once to the catalog's worst case". Nothing in the repo proposes partial loading of SKST; range requests were punted app-wide (`specs/completed/2026-05-07-asset-loading-design.md:16`) and the Gaia grill parked "a single progressive-streaming file" as the tier-system redesign.

### 1.2 The galaxy path — one whole file per (source, tier)

- SKMP v9: 16 B header + **64 B/galaxy** (`galaxyCatalogFormat.ts:17-95`), no spatial order, no index. Decoded synchronously on the main thread into columns; `medianAbsMag` computed over the whole catalog at decode.
- GPU: 56 B/galaxy interleaved (`galaxyPointVertexLayout.ts`, 14 slots), one exact-size vertex buffer per source, destroyed and rebuilt on tier swap (`catalogStore.ts:220-255`); `pass.draw(3, count)`, no compute, no indirect, no cull beyond vertex-side degenerate clips. Three resident copies per galaxy (decoded columns, CPU interleaved twin for bias splices, GPU buffer) ≈ 176 B.
- Sizes on record: glade-large 102 MB raw / 55 MB gzipped; medium boot ≈ 102 MB total; large ≈ 420 MB; large-tier GPU ≈ 112–140 MB. REGALADE at 64 B/row would be 4.6 GB.
- **Identity is positional everywhere.** Pick id = `(source << 26) | instance_index` (`src/data/selectionEncoding.ts`), selection highlight compares the same packed value in the shader, InfoCard reads `runtime.catalogs` by row index, famous meta / alias index / hi-res famous key / disk-planner sticky maps are keyed by row index. A tier swap survives only because `watchTierSaga` captures durable ids (`pgc-`, `sdss-`, `pos@`, famous) and re-resolves them by a **linear scan of the resident catalog** after the count is reported.
- **Whole-catalog bake statistics:** `magOffset` = mean `magG` of the source, `medianAbsMag` for the surface-brightness amplitude (`buildPointInterleavedBuffer.ts:156-177`); Schechter/angular bias weights are spliced by full-catalog index and the HEALPix angular weights depend on the whole cloud's sky distribution.
- Demand is a boolean per source (`galaxyCatalogAssetRows.ts`); `AssetSlot` holds one value per request and replaces it on drift — it cannot hold a set of chunks.

### 1.3 Hosting — `docs/DEPLOY.md`, `tools/deploy/`

- One object per logical name, content-hashed (`<name>.<8hex>.bin`) through `manifest.json`; `allowDataFile` is a basename regex allow-list; `public/data` uploads go one `wrangler r2 object put` per file (1–2 s each), `immutable, max-age=31536000`.
- `.bin` is stored **gzip-encoded on the wire** (`shouldGzipOnWire.ts`, stars and flowfields excepted), so an HTTP Range would address compressed bytes — "one big file + Range" is off the table unless that file opts out of gzip. No Range use exists in `src/` anyway.
- Production edge-caches nothing for `.bin`/`.scfd` (`cf-cache-status: DYNAMIC`, `DEPLOY.md:80`); a Cache Rule is an outstanding manual step. Every chunk fetch would hit R2 origin until that lands.
- **The multi-object precedent is the Earth surface-tile pyramid:** `earth-tiles/v10/<product>/<z>/<x>/<y>.webp`, versioned prefix instead of hashes, rclone bulk upload (10,912 objects; per-file wrangler would take hours), an `index.txt` written last to gate the sync, 404 ⇒ "failed, never retried until evicted" instead of a coverage index.

### 1.4 Streaming substrates already in the engine

- `surfaceTileSubsystem` + `cutSurfaceTiles`: a pure per-frame quadtree walk over all views (horizon reject, frustum sphere test, refine by screen texel density, residency-agnostic — a missing leaf draws its deepest loaded ancestor) returning `{cut, requests}`; `PriorityQueue` keyed by tile with priority = screen px, `SURFACE_TILE_CONCURRENCY = 4`; fixed-slot atlas with LRU by `lastSeenFrame` that refuses allocation when every slot was claimed this frame (no evict–refetch loop); `isAnimating` while fetches are in flight.
- `galaxyAtlasSubsystem` (thumbnails, 256 slots) and `hiResFamousSubsystem` reimplement the same loop; `docs/backlog/2026-08-20-hires-famous-lru-substrate.md` already asks for one shared LRU substrate.

## 2. What carries over, what does not

| Reusable as-is or by rename | Star-specific, diverges for galaxies |
| --- | --- |
| Morton-grid bottom-up builder with fat-leaf merge | 6 B record (no room for size, PA, axis ratio, objID; 5 spare bits) |
| `mergeFluxAggregate` (flux-weighted centroid + scalars) | parsec units, heliocentric grid, 12 kpc cap, `MPC_TO_PC` conversions |
| `cut.wesl` / `cutIo.wesl`, `starCutGpu`, `starCutLayout`, camera cell+fraction split | absMag / BP−RP LUT windows duplicated in `vertex.wesl` |
| two-stream `drawIndirect` lists, half-res aggregate target + knee upsample | fixed-pixel round leaf dot; galaxies need oriented ellipses + the existing SB / Schechter / K-correction terms |
| planner + wake logic (`frame.ts`, `sameStarCut`) | near-sprite dissolve, `fieldStarSpherePass`, leaf-only pick path |
| gzip codec per object | 1024³ grid / 4.19 M node / 8192-per-leaf caps (bind at 71 M rows) |

The cut is the valuable part: it is a generic "point octree with aggregate mips under an instance budget", and nothing in it knows about stars except the record decode in the vertex stage.

## 3. Blockers for chunked loading, in order of cost

1. **File order.** SKST's level-major, two-region layout makes subtrees non-contiguous. A chunkable format writes each subtree (nodes + its leaf records + its aggregate records) as one self-contained object.
2. **Identity.** `instance_index` as the pick/selection/InfoCard key breaks the moment buffers are pooled (a non-zero `firstInstance` moves every id) or chunks come and go. `specs/2026-07-10-distant-galaxy-fading-design.md` §7 already designs the fix shape: a private permutation module exposing `resolvePick`. For chunks the durable id is `(chunkId, recordInChunk)`, and `pos@` ids resolve to a chunk arithmetically (position → Morton cell); only `pgc-`/`sdss-` need a side index.
3. **Whole-catalog bake statistics** (`magOffset`, `medianAbsMag`, HEALPix angular weights) must be computed at build and shipped in the per-source index header, or chunks brighten/dim relative to each other.
4. **Resident-set assumptions**: `nodeCount` uniform and "root is the last node" in `cut.wesl`, parent/subtree counts derived from the full table, `nearestResolvableStar` / `resolveStarRecord` walking the CPU copy, disk planners striding `[0, count)`.
5. **Hosting prerequisites**: the `.bin` Cache Rule (otherwise every chunk is an origin hit), rclone bulk transport + versioned prefix for a family of thousands of objects (the tile precedent), an `allowDataFile` group or collector for the family.

## 4. Recommended shape

**Format — `galaxy-octree/v1/<source>/`:** one **index object** holding the header (grid origin, cell edge Mpc, bake statistics, chunk level `Lc`) and the top of the tree (all nodes at level ≥ `Lc` with their aggregate records), plus one **chunk object per level-`Lc` subtree** holding that subtree's node table, aggregate records and leaf records, Morton-contiguous. A chunk is addressable as `<source>/<level>/<morton>.bin` exactly like a tile; its root's aggregate record in the index is what draws while the chunk is absent, so an unloaded subtree degrades to a glow, never a hole. Each object is gzipped whole on the wire — no Range needed. The same layout works for stars; adopting it there too is the honest "SKST v2" rather than a galaxy fork.

**Record:** keep cell-quantised positions (10-bit offsets relative to the chunk's box: ~3 kpc resolution in a 3 Mpc leaf cell over a 3000 Mpc box) and quantised magnitude / colour index / source class / log-size / axis ratio / PA in ~16–24 B; expand on the GPU in the vertex stage, which already reads records through the cut list. objID stays out of the hot record (side table per chunk, or resolved from the CPU copy of the resident chunk on pick). Exact packing is a spec decision; the point is that 64 B/row cannot ship 71 M rows (4.6 GB) and 16–24 B can (1.1–1.7 GB total, of which a session touches a few hundred MB).

**Runtime:** a `galaxyOctreeSubsystem` modelled on `surfaceTileSubsystem`, driven from `galaxyCatalogPlanner` (already a per-frame walk over all views): the planner walks the resident tree, emits `requests` for refined-but-absent chunks with priority = screen size of the chunk's box, and the subsystem owns a fixed **chunk pool** (N slots × capacity, LRU by `lastSeenFrame`, allocation refused when every slot was claimed this frame). The GPU cut runs over the resident node table (index nodes + loaded chunk node tables, parents patched at upload), so `cut.wesl` changes only in how `nodeCount`/root are supplied. The AssetSlot stays for the index object only.

**Hosting:** versioned prefix, rclone bulk sync group, `index.txt` last, chunks immutable and not hashed; the index object is small enough to stay on the hashed-manifest path. The Cache Rule lands first.

**Stage it:**
- **A — galaxy octree, whole file, GPU cut.** Port the cut to galaxies on a single index-plus-all-chunks file. Lifts the draw ceiling from ~2.5 M to the budget-limited regime (10–20 M points resident, draw cost flat) and answers DESI's deferral; no streaming yet. This is where record packing, oriented-ellipse leaves, aggregate look, bias terms and the pick indirection get solved.
- **B — chunking + streaming.** Split by `Lc`, add the subsystem and pool, resolve durable ids through chunks. REGALADE's full depth needs B; A alone cannot hold 71 M rows.

## 5. Ground preparation candidates (for `refactor-ground`)

1. Extract the shared streaming loop (planner `requests` → priority queue → fixed-slot LRU pool) out of `surfaceTileSubsystem`, which the hi-res-famous backlog item wants anyway.
2. Lift star-specific names/units out of `starCutGpu` / `starCutLayout` / `cut.wesl` (`pointCut*`), parametrise the record decode in the vertex stage, drop the `MPC_TO_PC` assumption.
3. The pick/selection permutation module from the distant-galaxy-fading spec §7 — needed by Stage A already.
4. Ship bake statistics in the catalog header (also removes the decode-time `medianAbsMag` pass).
5. `allowDataFile` / sync-group support for an object family with its own collector.

## 6. Sizing (REGALADE as the stress case)

| Quantity | Value |
| --- | --- |
| Rows | 71.5 M (2000 Mpc, ~15 % are `fRel`) |
| On disk at 16 / 24 B per record | 1.1 / 1.7 GB total |
| Chunk objects at ~1 MB each | ~1,100–1,700 (tiles: 10,912) |
| Leaf grid 1024³ over a 3000 Mpc box | ~3 Mpc cells, ~3 kpc in-cell resolution |
| Nodes at 64 records/leaf | ≥ 1.1 M leaves; whole-tree node count near the 4.19 M cap → only chunking keeps the GPU table small |
| Resident at a 100 MB GPU budget, 24 B/record | ~4 M galaxies in the pool, + index |
| Parse cost (parser measured) | ~3 µs/row ≈ 4 min for the full file |

Dense nearby cells are the open risk: a 3 Mpc cell in Virgo/Fornax may exceed the 8192-records-per-leaf cap, so either the grid goes to 12 bits/axis (Morton no longer fits 30 bits; `(level, morton)` addressing changes) or the builder learns to split dense leaves.

## 7. Open questions

1. Chunk level `Lc` and pool slot capacity: fixed-capacity slots (atlas-style, simple) vs variable-size sub-allocation (denser). Fixed slots with a records cap per chunk, splitting denser subtrees one level deeper at build, is the simpler artifact.
2. Aggregate look for galaxies: a flux-weighted blob at the centroid (as stars) vs a disc-shaped splat sized by the subtree's extent; interaction with the distance fade and SB terms.
3. Whether SDSS/2MRS keep the flat SKMP path (small, index-stable, spec-z precision) while only the all-sky baseline (GLADE → REGALADE) moves to the octree. Two point paths is a real cost; one is a bigger migration.
4. Bias correction (Schechter / HEALPix angular weights) per chunk: precompute per record at build, or drop for the octree family.
5. Search / famous / alias resolution for galaxies in non-resident chunks: fetch-on-demand of the target chunk before focus (the tier saga's capture → reload → re-resolve shape already exists).
