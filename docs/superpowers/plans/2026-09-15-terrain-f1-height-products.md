# Terrain F1 — height product: prep P2–P5, height bake, height atlas, two-product cut

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execution follows the lean protocol in `docs/superpowers/conventions/sdd-execution.md`.

**Goal:** Earth streams a second tiled product — **height**, 129-post f32 tiles in a `shgt1` format — into an `r32float` atlas beside the albedo atlas, and the quadtree walk refines only where a leaf's **own** height tile is resident. The stack that does it is body-generic (registry-driven, one engaged body), the product axis is real (`'albedo' | 'height'`), the stream and atlas are generic over payload, and the bake is idempotent and per-product. **No displacement, no shader change, no picture change**: F1 ends with height tiles resident and unread by the GPU, so F2 (displacement) is a renderer-and-shader PR over a walk that already carries everything it needs.

**Architecture:** four prep commits (P2 de-Earth, P3 product axis + manifest break, P4 generic stream/atlas, P5 idempotent per-product bake) then the feature: `heightTileFormat` + `decodeHeightTile` (`src`), `encodeHeightTile` + `HeightSource` + `bakeHeightLevel` (`tools`), `fetchHeightTile`, a second `createTileStreamSubsystem<HeightTile>` inside the surface-tile subsystem, and `cutSurfaceTiles` gaining height-gated refinement, a 2:1 balance post-pass and `edgeCoarser` bits. The height pyramid is built the way the albedo pyramid already is — deepest level resampled from **global lattice indices**, every coarser level assembled from the four children on disk with a per-product operator (albedo: 2×2 average; height: every-other-post decimation + header bounds) and the level's source as underfill where a child is missing — which is what makes the pyramid nested **across band boundaries**, not only inside a band.

**Tech Stack:** unchanged. TS + WebGPU (`queue.writeTexture` for the f32 atlas), Vitest, `sharp` for GeoTIFF windows (`raw({ depth })`), `tsx` tools.

**Spec:** [`docs/superpowers/specs/2026-09-13-per-planet-terrain-design.md`](../specs/2026-09-13-per-planet-terrain-design.md) — §3.1 (ideal shape), §3.3 joints 1–7, §3.4 b/c/f, §3.5 P2–P5, §4 (data), §5 (products, format, edge agreement, atlas), §6 items 1–2 (two products, 2:1 balance), §10, §11 (the format, edge-agreement, request-set and balance tests), §12 row F1.

**Ground preparation:** spec §3, produced by `refactor-ground` 2026-09-13. P1 (#704) and P6 (#705) are landed. P2–P5 ride this PR as separate commits (§3.6). The spec's §3.6 "sequencing conflict" is resolved: `main` is on `earth-tiles/v7` and the on-disk bake matches; this plan bumps to **v8** (the albedo path segment changes and a product is added — one prefix, one coherent bake).

## Rulings made at plan time (do not re-open; the final review checks against these)

| #   | Ruling                                                                                                                                                                                                                                                                                                                                                      | Why                                                                                                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **Strict every-other-post decimation.** Spec §3.4c's "choose among four candidates the one nearest the local mean" is dropped.                                                                                                                                                                                                                              | It contradicts §5.4.3 (`h_L(p) ≡ h_{L+1}(p)` at shared lattice points), which is the property F2's crack argument rests on. §5.4.3 wins. Fix the spec line at `/feature-done`.                                               |
| R2  | **Coarser height levels are built from children on disk**, per post: a post inside an existing child tile (any band) takes that child's post; otherwise the level's source resample. Bands bake deepest-first in one invocation.                                                                                                                            | Within a band this is pure decimation (§5.4.3). Across a band boundary (z7 global under z8 skadi) it keeps the parent nested with every child that exists, so the boundary is crack-free too — §5.4 alone does not say this. |
| R3  | **Water:** on the global (ETOPO) band, every connected component of the water mask (`textures.earthWaterMask`, sampled at lattice posts) is flattened to the **minimum elevation of its land-adjacent posts**; the largest component (the world ocean) is pinned to exactly 0. Deep bands (skadi, DHM) are hydro-flattened at source and get no water step. | Gives §4.4's outcomes — ocean flat at the datum, Dead Sea at −430, Caspian at −28, no Great-Lakes pit — with no basin list and no ocean-seed list. The bake prints named-body diagnostics (Task 9) so the user can rule.     |
| R4  | **2:1 balance and `edgeCoarser` land in F1**; `PatchInstance` stays 64 B and no `.wesl` file changes.                                                                                                                                                                                                                                                       | The walk is reworked once; F2 becomes renderer + shader only. No shader risk in this PR.                                                                                                                                     |
| R5  | **Compiled 64×32 min/max grid, `reliefM`, the CPU tile cache (`SurfaceHeightField`), and the horizon cap are F3.**                                                                                                                                                                                                                                          | No consumer in F1 → liability. The bake emits headers with subtree bounds now; the grid is a cheap re-run over headers later.                                                                                                |
| R6  | **P2 renames types and modules whose semantics become per-body**; the draw side keeps its names (`earthSurfaceTileRenderer`, `earthSurfaceTileLayout`, `shaders/bodies/earthSurfaceTile/`, `earthPass`, `EarthTileAtlasSection*`), and `src/data/bodies/earthTileParams.ts` keeps its constant names (they pair with WESL constants under a parity test).   | Renaming the draw side is F4's Mars work (a second body's pass must draw tiles). Constants that mirror WESL names would force shader edits.                                                                                  |
| R7  | **Registry has one row (earth) in F1.** The engaged-body switch path is implemented but gets its test in F4 with the Mars row.                                                                                                                                                                                                                              | A Mars row with no bake would 404 the manifest on every close approach.                                                                                                                                                      |
| R8  | **The `--only <sourceId>` bake fast-path and the per-band index files are deleted** (P5). Idempotent per-tile skipping makes them redundant.                                                                                                                                                                                                                | Deletion beats addition; `--only` existed only because a full re-bake was expensive.                                                                                                                                         |
| R9  | **Height tile row order is north-first, `j` increases southward**, matching albedo tiles (`row 0 = NORTH`). `edgeCoarser` order is `[west, east, south, north]`.                                                                                                                                                                                            | One convention for both products.                                                                                                                                                                                            |
| R10 | **Earth heights are used as metres above the datum sphere as-is** (orthometric ≈ sphere-relative); no ellipsoid or geoid term. Mars (F4) rebases per §4.3.                                                                                                                                                                                                  | Spec §2: the datum stays a sphere; today's imagery already sits on it.                                                                                                                                                       |

## Branch and PR

Branch `terrain-f1-height-products` off `main`, worktree `.claude/worktrees/terrain-f1-height-products`, one PR, drafted after dispatch 1's first commit. `public/data` is symlinked to main's; **raw data lives in main's `data/raw/`** (ETOPO, skadi, MOLA downloads were started there 2026-09-15). The bake (Task 13) runs from **main after merge**, or from this worktree with `data/raw` symlinked the same way — never a copy.

## Dispatch grouping (controller)

| Dispatch | Tasks | Model  | Why grouped                                                                           |
| -------- | ----- | ------ | ------------------------------------------------------------------------------------- |
| D1       | 1–3   | Sonnet | one mental model: the planning/streaming stack's names, registry, product axis        |
| D2       | 4–5   | Sonnet | stream/atlas generics and the bake's idempotence share no files with D1 but follow it |
| D3       | 6–9   | Opus   | the on-disk format and the bake — `review: yes` (binary format, parser)               |
| D4       | 10–12 | Opus   | the runtime: height stream, gated walk, balance — `review: yes` on 11–12 (walk maths) |
| —        | 13    | user   | acquisition + bake + eye-check                                                        |

## Global constraints

- `type` aliases only. One function per file under `src/utils/**` and `tools/utils/**`; one type per file under `src/@types/**`; filename = symbol. Deep relative imports, no barrels. `src/data/scene/heightTileFormat.ts` is a **multi-constant format file** (the `galaxyCatalogFormat.ts` precedent) and says so in its first line.
- Files under `src/services/engine/frame/` (incl. `passes/`) export only their one named symbol; the ratchet test `tests/services/engine/frame/frameFilePurity.test.ts` only ever shrinks.
- Comment budget: module header ≤ 5 lines, comment lines ≤ half the code lines. Why, never what. Byte-layout files may exceed it and must say so.
- **No `.wesl` file changes in this plan.** If a task appears to need one, stop and report.
- Every file move/rename goes through `npm run move-files -- <from> <to>` or `-- --manifest <moves.json>` (`--dry` first); symbol renames through `npm run refactor -- rename <old> <new>`. Never `git mv` + hand-edited imports. Grep for the old path afterwards (string-literal paths, `.wesl`).
- Inner loop `npm run typecheck:fast`; `tsc` is the gate. Targeted tests per touched file; CI runs the suite. `npx prettier --write` touched files. Stage by path, never `git add -A`. One commit per task, `type(scope): summary`.
- The dev server for this worktree is `npm run dev`, left running; note its port.
- Manifest, tile paths and `TILE_PREFIX` are a **CDN contract**: tiles are immutable per prefix on R2 (`docs/DEPLOY.md`), the manifest is day-cached and unversioned. The v8 bump plus the `levels → bands` break means tiles are OFF in production between merge and R2 sync (§3.4b, accepted).

---

### Task 1: P2a — rename the planning/streaming stack to `SurfaceTile*`

**Files:** move manifest (all via `npm run move-files -- --manifest`), `tests/` mirror dragged along:

| from                                                                                                                                                                                  | to                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `src/@types/data/EarthTileId.d.ts`                                                                                                                                                    | `src/@types/data/SurfaceTileId.d.ts`                     |
| `src/@types/scene/EarthTileManifest.d.ts`                                                                                                                                             | `src/@types/scene/SurfaceTileManifest.d.ts`              |
| `src/@types/scene/EarthTileBand.d.ts`                                                                                                                                                 | `src/@types/scene/SurfaceTileBand.d.ts`                  |
| `src/@types/scene/EarthTileProvenance.d.ts`                                                                                                                                           | `src/@types/scene/SurfaceTileProvenance.d.ts`            |
| `src/@types/scene/EarthTilePlannerParams.d.ts`                                                                                                                                        | `src/@types/scene/SurfaceTilePlannerParams.d.ts`         |
| `src/@types/scene/EarthTilePlan.d.ts`                                                                                                                                                 | `src/@types/scene/SurfaceTilePlan.d.ts`                  |
| `src/@types/scene/EarthTileRequest.d.ts`                                                                                                                                              | `src/@types/scene/SurfaceTileRequest.d.ts`               |
| `src/@types/scene/EarthTileDebugSnapshot.d.ts`                                                                                                                                        | `src/@types/scene/SurfaceTileDebugSnapshot.d.ts`         |
| `src/@types/engine/subsystems/EarthTileSubsystem.d.ts`                                                                                                                                | `src/@types/engine/subsystems/SurfaceTileSubsystem.d.ts` |
| `src/services/engine/subsystems/earthTileSubsystem.ts`                                                                                                                                | `src/services/engine/subsystems/surfaceTileSubsystem.ts` |
| `src/utils/network/fetchEarthTileBitmap.ts`                                                                                                                                           | `src/utils/network/fetchSurfaceTileBitmap.ts`            |
| `src/utils/scene/fetchEarthTileManifest.ts`                                                                                                                                           | `src/utils/scene/fetchSurfaceTileManifest.ts`            |
| `src/utils/scene/earthTilePath.ts`                                                                                                                                                    | `src/utils/scene/surfaceTilePath.ts`                     |
| `src/utils/scene/earthTileColumns.ts`, `earthTileBandOverlapsUv.ts`, `earthTileBandRefineAllowed.ts`, `earthTileBandRequestAllowed.ts`, `earthTileXyForUv.ts`, `earthTileCentreUv.ts` | same names with `surfaceTile` prefix                     |

Then `npm run refactor -- rename` for each type/function symbol to its new name (`EarthTileId → SurfaceTileId`, `createEarthTileSubsystem → createSurfaceTileSubsystem`, `EMPTY_EARTH_TILE_DEBUG_SNAPSHOT → EMPTY_SURFACE_TILE_DEBUG_SNAPSHOT`, `EarthTileDeps → SurfaceTileDeps`, `fetchEarthTileBitmap → fetchSurfaceTileBitmap`, `fetchEarthTileManifest → fetchSurfaceTileManifest`, `earthTilePath → surfaceTilePath`, the six helpers likewise) and the handle field `EngineSubsystemHandles.earthTiles → surfaceTiles` (`src/@types/engine/handles/EngineSubsystemHandles.d.ts:79`, `engine.ts:255,553-554`, `wireSlots.ts:145-148`, `runFrame.ts:248`, `earthPass.ts:196`, `EngineDebugHandle.d.ts:44` + `engine.ts:619-620`, `makeReconcileEffects.ts:34`, tests listed in the survey §5).

**Not renamed** (R6): `earthBaseLevelForTier`, `earthTexelMetres`, `earthLevelFittingWidth`, `earthSurfaceTier`, `src/data/bodies/earthTileParams.ts` and its constants, the renderer/layout/shader/pass/UI files.

- [ ] Write the manifest JSON in the scratchpad, `npm run move-files -- --manifest <file> --dry`, then run it.
- [ ] Symbol renames via `npm run refactor -- rename`. `git grep -n "EarthTile\|earthTile"` afterwards: the only survivors are the R6 list and `EarthTileAtlasSection*`/`earthTileParams`. Fix stragglers in string literals by hand (labels like `` `earth-${TILED_KIND}-tiles` `` become `surface-tiles-albedo` in Task 3).
- [ ] No new test — a pure rename.
- [ ] `npm run typecheck:fast`, run the moved tests, commit `refactor(tiles): P2a — rename the tile planning stack to SurfaceTile*`.

### Task 2: P2b — registry-driven, per-body, one engaged

**Files:**

- Create `src/@types/data/SurfaceTileSpec.d.ts`, `src/data/bodies/surfaceTileRegistry.ts`, `src/utils/scene/bodySurfaceTier.ts` (generalises `src/services/engine/frame/earthSurfaceTier.ts:19` by taking `bodyId`; delete `earthSurfaceTier.ts` after `npm run refactor -- refs earthSurfaceTier` shows the new util covers every caller).
- Modify `src/services/engine/subsystems/surfaceTileSubsystem.ts` (`:81` deps, `:134-192` params/manifest, `:199-214` engage, `:216-298` update), `src/utils/scene/fetchSurfaceTileManifest.ts:17-19`, `src/services/engine/frame/runFrame.ts:245-286`, `src/@types/engine/subsystems/SurfaceTileSubsystem.d.ts`, `tests/services/engine/subsystems/surfaceTileSubsystem.test.ts`.

**Contract:**

```ts
// src/@types/data/SurfaceTileSpec.d.ts
export type SurfaceTileSpec = {
  readonly manifestKey: string; // 'earth-tiles' — the folder under data/images/ holding manifest.json
  readonly circumferenceM: number; // equatorial, for texel-metre error terms
};
// src/data/bodies/surfaceTileRegistry.ts — membership IS the predicate
export const SURFACE_TILE_REGISTRY = {
  earth: { manifestKey: 'earth-tiles', circumferenceM: 40075016.686 },
} as const satisfies Partial<Record<BodyId, SurfaceTileSpec>>;
// src/utils/scene/bodySurfaceTier.ts
export function bodySurfaceTier(state: EngineState, bodyId: BodyId): Tier; // same shape as earthSurfaceTier, keyed by bodyTextureSlotKey(bodyId, 'surface')
// fetchSurfaceTileManifest(manifestKey: string): Promise<SurfaceTileManifest | null>   // url `images/${manifestKey}/manifest.json`
// SurfaceTileSubsystem
//   plannerParams(bodyId: BodyId, baseLevel: number): SurfaceTilePlannerParams | null
//   update(input: { bodyId: BodyId; plan: SurfaceTilePlan }): void   // a different bodyId than the engaged one stands the old body down (existing stand-down path) and engages the new manifest
```

`EARTH_EQUATORIAL_CIRCUMFERENCE_M` reads on the planning path (`npm run refactor -- refs EARTH_EQUATORIAL_CIRCUMFERENCE_M`) take the engaged body's `circumferenceM` — via `SurfaceTilePlannerParams` if the walk needs it, deleting the constant if nothing else reads it. `runFrame.ts:250-252` finds the slab whose `bodyId` is a key of `SURFACE_TILE_REGISTRY` (`bodyId in SURFACE_TILE_REGISTRY`), never `'earth'`. `earthPass.ts:154` stays — that is Earth's pass.

- [ ] Test (existing file): `plannerParams` requests `images/earth-tiles/manifest.json` for `bodyId: 'earth'` (URL derived from the registry, not a literal). No switch-path test (R7).
- [ ] Implement. `runFrame.ts` remains a single-export file.
- [ ] Commit `refactor(tiles): P2b — registry-driven per-body surface tiles, one engaged`.

### Task 3: P3 — `SurfaceTileProduct`, manifest `bands`, per-product path, v8

**Files:**

- Create `src/@types/data/SurfaceTileProduct.d.ts`, `src/@types/scene/SurfaceTileManifestBand.d.ts`.
- Delete `src/@types/data/EarthTileKind.d.ts` (after `refs` is empty).
- Modify `src/@types/data/SurfaceTileId.d.ts`, `src/@types/scene/SurfaceTileManifest.d.ts`, `src/@types/scene/SurfaceTilePlannerParams.d.ts` (drop `kind`), `src/utils/scene/surfaceTilePath.ts`, `src/utils/scene/fetchSurfaceTileManifest.ts:25-32` (guard), `src/utils/scene/cutSurfaceTiles.ts:33,289` (drop `kind`; requests carry `product: 'albedo'` for now), `src/services/engine/subsystems/surfaceTileSubsystem.ts:45-48,138,163-169` (`TILED_KIND` gone; stream label `surface-tiles-albedo`), `tools/textures/buildEarthTiles.ts:120-134,372,423-432` (`KIND` → `'albedo'`, manifest `bands`, `TILE_PREFIX` → `${TILE_ROOT}/v8`), `tests/utils/scene/fetchSurfaceTileManifest.test.ts:62`, `tests/tools/textures/buildEarthTiles.test.ts:394`, `docs/DATA.md:194`.

**Contract:**

```ts
export type SurfaceTileProduct = 'albedo' | 'height';
export type SurfaceTileId = {
  readonly product: SurfaceTileProduct;
  readonly z: number;
  readonly x: number;
  readonly y: number;
};
export type SurfaceTileManifestBand = {
  readonly bounds: LonLatBounds;
  readonly min: number;
  readonly max: number;
  readonly builtFrom: Partial<Record<SurfaceTileProduct, SurfaceTileProvenance>>; // one entry per baked product
};
export type SurfaceTileManifest = {
  readonly prefix: string;
  readonly tilePx: number;
  readonly bands: readonly SurfaceTileManifestBand[];
};
// surfaceTilePath(tile, prefix) → `${prefix}/${product}/${z}/${x}/${y}.webp` for albedo, `.bin` for height (a local ext record inside the util)
```

Manifest guard: `bands` must be an array of objects with numeric `min`/`max`; a `levels` key (the v7 shape) ⇒ `null`. Requests, residency maps and stream keys are keyed by the full path, so `product` is part of every key for free.

- [ ] Tests: rewrite `fetchSurfaceTileManifest.test.ts:62` as `returns null for a levels-keyed (pre-bands) manifest`; `buildEarthTiles.test.ts:394` asserts `bands[i].builtFrom.albedo` and the `albedo/` path segment.
- [ ] Implement. `git grep -n "'surface'" src/utils/scene src/services/engine/subsystems tools/textures` finds no tile-path use left (the whole-globe `TextureKind` `'surface'` elsewhere is untouched).
- [ ] Commit `refactor(tiles): P3 — SurfaceTileProduct axis, manifest bands, v8 prefix`.

### Task 4: P4 — stream + atlas generic over payload

**Files:**

- `npm run move-files -- src/services/engine/subsystems/bitmapStreamSubsystem.ts src/services/engine/subsystems/tileStreamSubsystem.ts`; same for `src/@types/engine/subsystems/BitmapStreamSubsystem.d.ts → TileStreamSubsystem.d.ts` (and the two inline types in it: `BitmapStreamFetchInput → TileStreamFetchInput`, `BitmapStreamDeps → TileStreamDeps` — the deps type moves to its own `@types` file if it is not there already).
- Modify `src/services/gpu/resources/textureAtlas.ts:151-181` (add `uploadTexels` beside `uploadBitmap`), `tests/services/gpu/resources/textureAtlas.test.ts`, `tests/services/engine/subsystems/tileStreamSubsystem.test.ts`, every `createBitmapStreamSubsystem` caller (`npm run refactor -- refs`).

**Contract:**

```ts
// TextureAtlas
uploadTexels(slotIdx: number, data: ArrayBufferView, bytesPerRow: number, rows: number): void; // queue.writeTexture at the slot origin
// tileStreamSubsystem
export type TileStreamDeps<T> = {
  device: GPUDevice; atlasSide: number; slotSide: number; format: GPUTextureFormat; label: string; concurrency?: number;
  requestRender: () => void;
  upload: (atlas: TextureAtlas, slotIdx: number, payload: T) => void;
  release: (payload: T) => void;   // called for a payload that arrives after its slot was recycled (today: bitmap.close())
};
export type TileStreamFetchInput<T> = { key: string; priority: number; fetcher: () => Promise<T | null>; onResult: (payload: T | null) => void };
export type TileStreamSubsystem<T> = Destroyable & { …unchanged…; upload(key: string, payload: T): number | null; enqueueFetch(input: TileStreamFetchInput<T>): void };
export function createTileStreamSubsystem<T>(deps: TileStreamDeps<T>): TileStreamSubsystem<T>;
```

The bitmap `upload`/`release` pair lives in two one-function utils under `src/utils/gpu/` (`uploadBitmapToAtlas`, `closeBitmap`) passed by the albedo caller; there is no `ImageBitmap` mention left in the stream module.

- [ ] Test: `uploadTexels writes at the slot's texel origin` — mock `queue.writeTexture`, assert `origin` for slot 17 of a 16-per-row atlas is `{x: slotSide, y: slotSide}` and `bytesPerRow` passes through (hand-computed, not derived from `slotUv`).
- [ ] Existing stream tests re-target the generic API with a bitmap-shaped `T`; `a bitmap arriving after its slot was recycled` (`:139`) asserts `release` was called.
- [ ] Commit `refactor(gpu): P4 — tile stream and atlas generic over payload`.

### Task 5: P5 — idempotent, per-product bake; delete `--only`

**Files:**

- `npm run move-files -- tools/textures/buildEarthTiles.ts tools/textures/buildSurfaceTiles.ts` (spec §3.1); `package.json:37` script → `build-surface-tiles`.
- Modify `buildSurfaceTiles.ts` `:146-151` (`writeTile` writes to `<path>.tmp` then renames), `:159-175` and `:203-268` (skip a tile whose output exists), `:273-342` (delete `perBandIndexPath`, `writePerBandIndex`, `stitchBandIndex`), `:344-448` (`bakeAll`: index = union of existing `index.txt` lines and baked paths, sorted; manifest written last from the **complete** band table, after asserting every band's expected tile set exists on disk for every product in the table — exit non-zero otherwise, leaving the previous manifest untouched), `:485-488` (delete `onlySourceId`), `:490-537` (CLI `--dev`, `--product albedo|height` default both, `--body earth`).
- Tests `tests/tools/textures/buildSurfaceTiles.test.ts`: delete the `--only` describe (`:425-562`); add the two below. `docs/DATA.md:188,194,210`.

- [ ] Test `a second bakeAll over the same output skips existing tiles and leaves bytes identical` (mtime unchanged on the pre-existing files).
- [ ] Test `bakeAll refuses to write the manifest while a band's tile set is incomplete` (delete one baked tile, re-run, expect a thrown error and the old manifest intact).
- [ ] Implement. The `bakeCoarserLevel` operator stays the albedo 2×2 average; Task 9 adds the height operator beside it.
- [ ] Commit `refactor(bake): P5 — idempotent per-product surface-tile bake, --only deleted`.

### Task 6: `shgt1` — height tile format, decode, encode

**review: yes** (binary format).

**Files:**

- Create `src/data/scene/heightTileFormat.ts`, `src/@types/scene/HeightTile.d.ts`, `src/utils/scene/decodeHeightTile.ts`, `tools/utils/textures/encodeHeightTile.ts`, `tests/utils/scene/decodeHeightTile.test.ts`.

**Contract** — the byte table is the format (§5.3), enforced by the test:

```
off  size        field
  0     4  u32   HEIGHT_TILE_MAGIC = 0x54474853 ('SHGT' LE)
  4     2  u16   HEIGHT_TILE_VERSION = 1
  6     2  u16   postsX = HEIGHT_POSTS_PER_TILE = 129
  8     2  u16   postsY = 129
 10     2  u16   reserved = 0
 12     4  f32   subtreeMinM
 16     4  f32   subtreeMaxM
 20     4  f32   geometricResidualM
 24  66564  f32[16641] heightM, row-major, NORTH row first, metres above datum
HEIGHT_TILE_HEADER_BYTES = 24, HEIGHT_TILE_BYTES = 66588, little-endian throughout
```

```ts
export type HeightTile = {
  readonly subtreeMinM: number;
  readonly subtreeMaxM: number;
  readonly geometricResidualM: number;
  readonly heightM: Float32Array;
};
export function decodeHeightTile(buf: ArrayBuffer, byteOffset?: number): HeightTile; // throws on bad magic/version/size, on a non-finite post, on a byteOffset not ≡ 0 mod 4 (copy instead of throw is also acceptable — pick one, document why)
export function encodeHeightTile(tile: HeightTile): Uint8Array;
```

- [ ] Tests: `round-trips a tile through encode/decode` (bit-identical `heightM`, header fields); `rejects a payload with a non-finite post` (NaN and −Infinity); `rejects a wrong magic`; `header offsets` — write bytes by hand with `DataView` at the offsets above and assert the decoded fields (this is the keep-rule "on-disk format" test).
- [ ] Commit `feat(terrain): shgt1 height tile format, decode and encode`.

### Task 7: `fetchHeightTile`

**Files:** create `src/utils/network/fetchHeightTile.ts` (mirror `fetchSurfaceTileBitmap.ts:24-43`: same deadline, `dataUrl('images/' + surfaceTilePath(tile, prefix))`, `response.arrayBuffer()` → `decodeHeightTile`, any throw → `null`).

- [ ] No test (network wrapper; decode is tested in Task 6).
- [ ] Commit `feat(terrain): fetchHeightTile`.

### Task 8: height sources and fetchers (tools)

**Files:**

- Create `tools/textures/HeightSource.d.ts`, `tools/textures/etopoHeightSource.ts`, `tools/textures/skadiHeightSource.ts`, `tools/textures/dhmTerraenHeightSource.ts`, `tools/textures/voidFilledHeightSource.ts`, `tools/utils/textures/skadiCellsForBounds.ts`, `tools/utils/textures/readGeoTiffWindow.ts`, `tools/utils/geo/lonLatToUtm32.ts`, `tools/fetch/fetchHeightSources.ts`, `data/raw/etopo/README.md`, `data/raw/skadi/README.md`, `data/raw/dhmterraen/README.md`; registry rows in `tools/utils/io/rawDataRegistry.ts` (`etopo.surface30s`, `etopo.readme`, `skadi.dir`, `skadi.readme`, `dhmterraen.dir`, `dhmterraen.readme`) per `docs/DATA.md:214-222`; `package.json` script `fetch-height`; `.sha256` sidecars once downloads finish.
- Tests: `tests/tools/utils/textures/skadiCellsForBounds.test.ts`, `tests/tools/textures/skadiHeightSource.test.ts` (fixture bytes), `tests/tools/utils/geo/lonLatToUtm32.test.ts`.

**Contract:**

```ts
export type HeightSource = {
  readonly id: string;
  readonly attribution: string;
  readonly maxLevel: number;
  readonly coverage: ReadonlyArray<LonLatBounds>;
  readonly provenance: SurfaceTileProvenance;
  /** Posts on the GLOBAL level-z lattice: post (i, j) sits at lon = −180 + i·360/(2^z·128), lat = 90 − j·180/(2^z·128).
   *  Returns nx·ny f32, row-major, north row first; NaN where the source has no data; null when the box is entirely outside coverage.
   *  Deriving source coordinates from (z, i, j) — never from a box-relative offset — is what makes two adjacent
   *  tiles agree bit-for-bit on their shared column (§5.4.2). */
  readGrid(z: number, i0: number, j0: number, nx: number, ny: number): Promise<Float32Array | null>;
  /** Native-resolution [min, max] over a lon/lat box; the header bound. */
  boundsInBox(box: LonLatBounds): Promise<readonly [number, number] | null>;
};
export function voidFilledHeightSource(primary: HeightSource, fallback: HeightSource): HeightSource; // NaN posts take the fallback
export function skadiCellsForBounds(box: LonLatBounds): string[]; // 'N55/N55E012' style, the set the fetcher pulls
export function readGeoTiffWindow(
  path: string,
  left: number,
  top: number,
  width: number,
  height: number,
): Promise<Float32Array>; // sharp .extract().raw({ depth }) — int16 or float32 in, f32 out; THROWS if sharp hands back 8-bit (never rescale)
```

- ETOPO: `data/raw/etopo/ETOPO_2022_v1_30s_N90W180_surface.tif`, 43200×21600, geographic, cell-centred at 30″; bilinear at lattice points. Registry `upstream` = the NGDC URL that answered 200 on 2026-09-15 (`https://www.ngdc.noaa.gov/mgg/global/relief/ETOPO2022/data/30s/30s_surface_elev_gtif/…`); the thredds path in the spec 404s. The water step (R3) is **not** in the source; it lives in the bake (Task 9), because it needs the whole level grid.
- skadi: `data/raw/skadi/<N55>/<N55E012>.hgt`, 3601² big-endian int16, geographic, cell edges at whole degrees, `-32768` = void → NaN. `fetchHeightSources.ts --skadi` computes the cell set from `EOX_REGIONS` (`tools/fetch/eoxRegions.ts:30`) via `skadiCellsForBounds`, resumable, gunzips in place. (47 cells were already pulled 2026-09-15 by hand; the fetcher must find them complete and skip.)
- DHM/Terræn (probed 2026-09-15, works with the existing key): Datafordeler serves the 0.4 m DTM as **1 km GeoTIFF tiles** — `https://api.datafordeler.dk/FileDownloads/GetRasterFile?FileName=DTM_1km_<northingKm>_<eastingKm>.tif&apiKey=<key>` (200, ~13 MB, bytes start `II*`; the response's `content-type` says zip and is wrong). Tile naming = the Punktsky scheme in `data/raw/dhm/README.md:100-120` (SW-corner km indices, EPSG:25832, DVR90). The key is the keychain item `skymap-datafordeler-apikey`, read in-process exactly as `tools/fetch/fetchDhm.ts` does; never print it; 401 is retryable for ~20 min after key creation. `fetchHeightSources.ts --dhm-terraen` pulls the tiles covering the Søndermarken **z14** tile rect (the z19 harvest rect `x[280352..280447] y[49984..50015]` from `data/raw/geodanmark/README.md:40` divided by 32 → z14 `x 8761..8763, y 1562`, i.e. lon 12.4805–12.5464, lat 55.6567–55.6787) into `data/raw/dhmterraen/DTM_1km_<N>_<E>.tif`. The source samples a lon/lat lattice post by projecting it to UTM32 — add `tools/utils/geo/lonLatToUtm32.ts` (forward transverse Mercator, GRS80, k0 = 0.9996, central meridian 9°E, false easting 500 km; Snyder series is enough at 1 mm) with a test that the anchor 55.67°N 12.53°E lands inside tile `6175_721` (E ∈ [721000, 722000), N ∈ [6175000, 6176000) — `data/raw/dhm/README.md:48-71`). NoData in the tiles → NaN (the band's underfill is skadi).
- The two remaining sources (DHM at z19 for Søndermarken, skadi at z13 for the EOX boxes) both reach their band's albedo ceiling natively (§4.1), so the band table's height entries are exactly the albedo table's boxes and levels.
- [ ] Tests: `skadiCellsForBounds` for the `sjaelland` box (hand-computed: `N54/N54E010`…`N56/N56E012`, 9 cells) and a box crossing 0° (`W001` and `E000` both present); `skadiHeightSource` decodes a hand-written 3601² fixture header row (a 3-post fixture is enough: assert the big-endian sign and the void → NaN).
- [ ] Commit `feat(terrain): height sources (ETOPO, skadi, DHM/Terræn) and fetcher`.

### Task 9: the height bake

**review: yes** (spec §5.4 and R2/R3 are the load-bearing bake rules).

**Files:**

- Create `tools/textures/bakeHeightLevel.ts`, `tools/utils/textures/flattenWaterComponents.ts`, `tools/utils/textures/decimateHeightGrid.ts`, `tools/utils/textures/heightTileBounds.ts`.
- Modify `tools/textures/buildSurfaceTiles.ts` (band table gains `height: HeightSource` + optional `heightUnderfill`; product loop dispatches; bands sorted by `max` descending before baking), `tests/tools/textures/bakeHeightLevel.test.ts`.

**Contract:**

```ts
export function bakeHeightLevel(input: {
  z: number;
  tiles: ReadonlyArray<{ x: number; y: number }>;
  source: HeightSource;
  underfill: HeightSource | null;
  outDir: string;
  prefix: string;
  flattenWater: boolean;
}): Promise<string[]>; // returns written tile paths
export function decimateHeightGrid(
  fine: Float32Array,
  nxFine: number,
  nyFine: number,
): Float32Array; // every other post, (nxFine+1)/2 wide — R1
export function flattenWaterComponents(
  heightM: Float32Array,
  isWater: Uint8Array,
  nx: number,
  ny: number,
): void; // in place — R3
export function heightTileBounds(
  own: Float32Array,
  children: ReadonlyArray<HeightTile | null>,
  sourceBounds: readonly [number, number] | null,
): { subtreeMinM: number; subtreeMaxM: number };
```

Rules the implementation must follow (each is a test or a reviewer check):

1. **Deepest level of a band**: `source.readGrid` over the band's tile rect **per tile row strip** (129 lattice rows × the rect width), sliced into 129² tiles; `geometricResidualM = 0`; bounds = `source.boundsInBox(tileBox)`.
2. **Coarser levels** (R2): for each tile, load the four children off disk if present (`decodeHeightTile`); every post covered by an existing child takes the child's post at `(2i, 2j)`; the rest come from `underfill ?? source` `readGrid` at level z. Bounds = `heightTileBounds(own, children, source.boundsInBox(tileBox))`. `geometricResidualM` = max over the tile of |bilinear of this level − the band's deepest grid| evaluated at the deepest lattice's points inside the tile (the spec's "finest").
3. **Water** (R3): only when `flattenWater` (the global ETOPO band), over the whole level grid before slicing: sample `textures.earthWaterMask` nearest at lattice posts, label 4-connected water components (lon wraps), set every post of a component to the minimum elevation among land posts 4-adjacent to it; the component with the most posts is set to exactly 0.
4. Every post finite before encode (`encodeHeightTile` is not lenient); the bake asserts and names the tile otherwise.
5. Band order in `buildSurfaceTiles`: by `max` descending, all bands in one invocation; global last.
6. **Diagnostics** printed at the end of the global band: min/max height inside the boxes Dead Sea (35.3–35.6E, 31.1–31.8N), Caspian (47–54E, 36–47N), Lake Superior (−92 – −84E, 46.4–49N), Black Sea (28–41E, 41–47N), plus global min/max. These feed R3's user ruling; they are not tests.

- [ ] Tests (§11), all against a synthetic analytic `HeightSource` (e.g. `h = 1000·sin(lon)·cos(2·lat)`) so nothing is downloaded: `two adjacent deepest-level tiles agree bit-for-bit on their shared column` (`Object.is` per post); `a decimated parent's posts are identical to the matching child posts` (every parent post `(i, j)` equals child `(2i mod 128, 2j mod 128)` of the covering child); `a parent's subtreeMax is ≥ every child's subtreeMax and ≥ its own max post`; `flattenWaterComponents pins the largest component to 0 and an enclosed basin to its lowest shore` (a hand-built 8×8 grid with two water blobs).
- [ ] Commit `feat(terrain): height bake — nested pyramid, water flattening, header bounds`.

### Task 10: the height stream inside the surface-tile subsystem

**Files:**

- Modify `src/data/bodies/earthTileParams.ts` (add `HEIGHT_TILE_ATLAS_SIDE = 16 * HEIGHT_POSTS_PER_TILE` = 2064 beside `EARTH_TILE_ATLAS_SIDE`), `src/services/engine/subsystems/surfaceTileSubsystem.ts` (second `createTileStreamSubsystem<HeightTile>` with `format: 'r32float'`, `slotSide: 129`, `upload: (atlas, slot, tile) => atlas.uploadTexels(slot, tile.heightM, 129 * 4, 129)`, `release: () => {}`; requests dispatched by `tile.product`; residency map already keyed by path), `src/@types/engine/subsystems/SurfaceTileSubsystem.d.ts` (`getHeightAtlasView(): GPUTextureView | null`), `src/@types/scene/SurfaceTileDebugSnapshot.d.ts` + `EarthTileAtlasSection.tsx` (one line: `height <used>/<capacity>`), `tests/services/engine/subsystems/surfaceTileSubsystem.test.ts`.

- [ ] Test: `a height request lands in the height atlas and residentSlot resolves it by product` (mock `fetchHeightTile`; assert `residentSlot({product:'height',…})` is non-null and `residentSlot({product:'albedo',…})` for the same `(z,x,y)` is null).
- [ ] Test: `stand-down releases both atlases' residency` (extend the existing stand-down test at `:439`).
- [ ] Commit `feat(terrain): height tile stream and r32float atlas`.

### Task 11: two-product cut — refinement gated on the leaf's own height tile

**review: yes** (walk correctness; the spec's §5.2 invariant).

**Files:**

- Create `src/@types/scene/ResolvedTileResidency.d.ts` (the inline shape at `SurfaceCutTile.d.ts:16-42`, extracted verbatim).
- Modify `src/@types/scene/SurfaceCutTile.d.ts`, `src/utils/scene/cutSurfaceTiles.ts` (`:213-256` refinement + emit; `:265-333` `resolveCutResidency` stays albedo-only), `src/services/gpu/renderers/bodies/earthSurfaceTileRenderer.ts:215` (`tile.resident` → `tile.albedo`), `src/services/engine/frame/passes/earthPass.ts` if it reads `resident`, `tests/utils/scene/cutSurfaceTiles.test.ts`.

**Contract:**

```ts
export type SurfaceCutTile = {
  readonly id: { z: number; x: number; y: number };
  readonly anchor: SurfacePatchAnchor;
  readonly albedo: ResolvedTileResidency; // may be an ancestor's texels (unchanged behaviour)
  readonly heightSlot: number; // this leaf's OWN (z,x,y) height tile — never an ancestor's
  readonly edgeCoarser: readonly [0 | 1, 0 | 1, 0 | 1, 0 | 1]; // [west, east, south, north] — Task 12 fills it; Task 11 emits [0,0,0,0]
};
```

Walk rules:

- A node at `z > baseLevel` may be **emitted** only if `residentSlot({ product: 'height', z, x, y })` is non-null (exact, no climb) **and** albedo resolves (climb, as today). A node failing the height check is dropped, as today's no-ancestor case is (`RENDERER.md` "absent from the cut, not a sentinel").
- A node may **refine** into its children only if screen error wants it (today's `required > z`) **and** every child that survives the frustum/horizon tests has its own height tile resident. Otherwise the node is emitted (if emittable) and the unresident visible children are **requested in both products** — requests run one level ahead of the cut (§6.1).
- Every request the walk emits for albedo is also emitted for height (same `(z,x,y)`), including the band-floor ancestor requests at `:225-226`.

- [ ] Tests (§11 + §5.2): `a leaf is never emitted without its own height tile resident` (all albedo resident, height resident only at z ≤ N → no leaf deeper than N); `refinement waits for the children's height tiles and requests them in both products` (height resident at z, not at z+1, screen error wanting z+1 → the cut holds z and `requests` contains the four children in both products); `height residency never resolves from an ancestor` (ancestor resident, own not → node absent).
- [ ] Update the existing residency tests for the `albedo` field rename.
- [ ] Commit `feat(terrain): two-product cut — refinement gated on own height residency`.

### Task 12: 2:1 balance and `edgeCoarser`

**review: yes** (rides Task 11's review).

**Files:** create `src/utils/scene/balanceSurfaceCut.ts`, `tests/utils/scene/balanceSurfaceCut.test.ts`; modify `cutSurfaceTiles.ts` (call it before the largest-first sort at `:259`).

**Contract:**

```ts
/** Coarsens leaves — never refines — until no two edge-neighbouring leaves differ by more than one level, then fills edgeCoarser.
 *  Coarsening replaces four siblings by their parent; the parent's height tile is resident by construction (it is what let the walk refine).
 *  Longitude wraps; the poles have no north/south neighbour. */
export function balanceSurfaceCut(
  cut: readonly SurfaceCutTile[],
  resolveParent: (z: number, x: number, y: number) => SurfaceCutTile | null,
): SurfaceCutTile[];
```

`resolveParent` is a closure the walk provides (it can build the parent's `SurfaceCutTile` from the residency lookups it already has). Coarsening only when the finer side's parent is emittable; a sibling culled from the cut does not block the collapse (the parent covers it — off-screen overdraw, harmless).

- [ ] Tests: `never emits edge-neighbouring leaves more than one level apart` (a hand-built cut: one z10 leaf beside a z8 leaf → the z10 leaf and its siblings collapse to z9); `edgeCoarser is set exactly on the edge facing a coarser neighbour` (a z9 leaf east of a z8 leaf → `[1,0,0,0]`); `wraps at the antimeridian` (x = 0 and x = 2^z − 1 are neighbours).
- [ ] Commit `feat(terrain): 2:1-balanced cut with edgeCoarser bits`.

### Task 13: acquisition, bake, eye-check (controller + user)

No code. Runs from **main** after merge, or from this worktree with `data/raw` symlinked to main's.

- [ ] Downloads complete: `data/raw/etopo/*.tif` = 1,585,813,987 B; 47 skadi cells present; write `.sha256` sidecars; `data/raw/mola/*.tif` (11.4 GB) is for F4 and is not used here.
- [ ] DHM/Terræn tiles fetched (`npm run fetch-height -- --dhm-terraen`, ~25 tiles, ~325 MB). If that fetch fails, the Søndermarken band bakes **later** (P5 makes that a re-run) and the manifest for now carries only the global and EOX bands — which also drops the GeoDanmark **albedo** band until then (bands are shared). State this to the user before baking; it is their call.
- [ ] Relayout: `cp -R public/data/images/earth-tiles/v7/surface public/data/images/earth-tiles/v8/albedo` (bytes identical, no re-encode), then `npm run build-surface-tiles` — albedo tiles are skipped as existing, height tiles bake, the manifest is written once both products are complete. Expect ~19.7k height tiles, ~1.3 GB (§10).
- [ ] Eye-check on this worktree's dev server: orbit (tiles engaged, picture identical to main), the 300 km fade band, Søndermarken z19 (or z13 if the DHM band is deferred), a limb view. Debug panel shows `height n/256` climbing with residency. Refinement depth reaches the band ceiling once heights land.
- [ ] Deploy note for `docs/DEPLOY.md`: R2 server-side copy `earth-tiles/v7/surface → v8/albedo`, upload `v8/height`, manifest last. The prune of v5–v7 is the existing open item.

---

## Definition of Done

**Deliverable inventory**

- `SURFACE_TILE_REGISTRY` with the Earth row; `runFrame` selects the tiled body by registry membership; no `'earth'` literal on the planning path.
- `SurfaceTileProduct`, `SurfaceTileId { product, z, x, y }`, `SurfaceTileManifest { prefix, tilePx, bands }`; `EarthTileKind` gone.
- `createTileStreamSubsystem<T>` + `TextureAtlas.uploadTexels`; no `ImageBitmap` in the stream module.
- `buildSurfaceTiles.ts` idempotent, per-product, `--only` gone; manifest written only from a complete band table.
- `heightTileFormat.ts`, `decodeHeightTile`, `encodeHeightTile`, `fetchHeightTile`, `HeightSource` + three sources, `fetchHeightSources.ts`, `bakeHeightLevel`, registry rows + READMEs.
- Height stream (`r32float`, 2064², 256 slots) inside the surface-tile subsystem; `getHeightAtlasView()`.
- `SurfaceCutTile { albedo, heightSlot, edgeCoarser }`; refinement gated on own height residency; 2:1 balance.

**Observable behaviours (manual smoke)**

- Picture identical to `main` at the four poses (no shader or record change).
- Debug panel: albedo and height residency counts both climb on approach; height count never exceeds albedo count for the same level.
- With height tiles deleted from disk, refinement stops at the base level + 0 (no patch is drawn) — the gate is real.
- Bake: a second `npm run build-surface-tiles` run over the same output finishes in seconds and rewrites nothing.

**Deferral boundary** — out of scope here, explicitly: displacement, normals, edge collapse, base-globe shrink (F2); `SurfaceHeightField`, `ceilingHeightM`, `raycast`, horizon cap, compiled min/max grid, `reliefM`, cloud clearance (F3); Mars rows, imagery and rover sites (F4); renaming the draw side (R6); the `geometricResidualM` refinement term (§6, deferred); the `tilePx` / polar-refinement / uv-conversion / "island in stars" backlog items (§3.7).
