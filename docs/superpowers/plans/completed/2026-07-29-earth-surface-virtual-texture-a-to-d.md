# Earth surface virtual texture — Phases A to D

**Spec:** [`docs/superpowers/specs/2026-07-28-earth-surface-virtual-texture.md`](../specs/2026-07-28-earth-surface-virtual-texture.md).
Read it first; this plan does not restate its rationale, and every "why" question a task
raises is answered there by design number.

**Branch:** `feat/earth-surface-virtual-texture`, off `main` at `a70b17fd`.
PREP 1 and PREP 2 already merged (PR #514). The spec merged as PR #515.

**Scope: Phases A to D only.** At the end of task D6 the feature is complete and visibly
working against a z5 pyramid baked from a file already on disk — no download, no external
service, no answer needed to either open question. Phase E (the real imagery source) and
Phase F (deploy + perf) are a separate plan, written once Q2 resolves.

**Q1 is answered by NOT asking it yet.** Every task below is the surface-only variant. The
normal path is additive (a second atlas, a second page table, a second window, three more
uniform floats) and reworks nothing here. The look judgement gets made on the working build
at D6, which is the cheapest place to make it.

## Strategy

Phase A is pure functions with no GPU, no network and no clock — it is the whole testable
surface of the feature and it lands first, fully tested, so that everything after it is
wiring rather than arithmetic. Phase B produces real tile files from real imagery so Phase C
has something to fetch. Phase C wires residency without touching a shader, and can be
verified by watching the Network tab before a single pixel changes. Phase D changes pixels
last, which is the only part where a mistake costs a silent iOS canvas freeze.

Two conventions carry unusual weight here and are called out per task rather than assumed:

- **One symbol per file in `src/utils/`, one type per file in `src/@types/`.** The tile math
  is a dozen small functions; each gets its own file named for its export.
- **Meticulous WESL** (see the feedback in `MEMORY.md`). Phase D slows down, uses single
  quotes in comments, imports `?static`, and verifies with a tint probe before trusting the
  lookup.

### Corrections to the spec, folded in here

1. **There is no `tools/@types/` directory.** Tools types live beside their consumer
   (`tools/utils/image/LuminanceAsAlphaOptions.d.ts`, `tools/utils/cli/FlagSchema.d.ts`).
   `EarthImagerySource.d.ts` therefore lands at `tools/textures/EarthImagerySource.d.ts`,
   not the path the spec's design 8 gives.
2. **The spec's screen-density formula is the small-angle approximation.** Design 3 and the
   problem statement write `h * fovY / viewportHeightPx`. The exact form is
   `h * 2 * tan(fovY / 2) / viewportHeightPx`, which is what reproduces the spec's own
   anchor (4892 m/texel matched at h ≈ 9700 km, 40°, 1440 px — the approximation gives
   4702 m and the exact form gives 4903 m). Task A3 uses the exact form.
3. **One ladder, not two.** The spec states the engage gate in altitude terms and the
   planner's refinement in projected-extent terms. Those are the same rule seen from two
   ends, and implementing both would be two places to get the exponent wrong. `planEarthTiles`
   is the single home: the engage gate is `plan.zWin > baseLevel`, read off the plan the
   planner already produced. Test 2's altitude anchor is asserted against `planEarthTiles`
   directly.
4. **One ladder, but two floors on it.** The base level (`EARTH_TILE_BASE_LEVEL`, z4 — the
   density the whole-globe 8192×4096 equirect already delivers) and the shallowest baked
   level (`EARTH_TILE_MIN_LEVEL`, z5 — the shallowest level with tile files) are distinct
   numbers, and the planner takes both: it walks from `baseLevel`, clamps `required` between
   `baseLevel` and `maxTileLevel`, and emits a request only for a leaf at `minTileLevel` or
   deeper. `zWin` is therefore the finest level the walk reached, floored at `baseLevel`, so
   an all-base view reports `zWin === baseLevel` with no requests. A single floor cannot
   carry both facts: rooting the walk at the shallowest baked level makes
   `zWin >= minTileLevel` true of every plan, so the gate can never fire and no tile is ever
   fetched at any altitude.
5. **Neither floor is a constant, and correction 4's two names are gone.** Found by the D7
   radar: `EARTH_TILE_BASE_LEVEL` derived the base level from `tierToTexturePx('large')`,
   which is Earth's registry CEILING rather than the tier a session runs at. `tierSlice`
   defaults to `'medium'` = 4096 = **z3**, so on a default session the planner believed the
   base delivered a level it did not have — the gate stood down one level early and the
   handoff put a z3 base under a z5 tile, a 4x linear jump where one level of softening
   (`EARTH_TILE_LOD_BIAS`) was the entire budget. On `'small'` it is three levels and 8x.

   Both constants are deleted. `earthBaseLevelForTier(tier)` returns 2/3/4 by integer shift
   (never `Math.log2`, whose one-ulp error at an exact power of two would make every `z` in
   the walk fractional), clamped to the registry ceiling first so it describes the file
   actually fetched. The tier comes from `earthSurfaceTier(state)`, which reads the asset
   slot's committed request rather than the app-wide setting, because `lastRequest()` alone
   reports the tier being FETCHED — only `state().kind === 'ready'` paired with that request
   names the image on the GPU. The bake floor moved into `buildEarthTiles` as
   `BAKE_MIN_LEVEL`, its only remaining reader; leaving it in `earthTileParams` would have
   made a `data/ -> utils/ -> data/` cycle whose correctness depended on declaration order.

   The runtime floor is `Math.max(levels.min, baseLevel + 1)`, NOT bare `levels.min`. This
   is what makes the planned shallow bake work per tier rather than globally: with a manifest
   advertising `min: 3`, a `small` session floors at 3, `medium` at 4 and `large` at 5, so
   each tier requests exactly the levels its own base does not already cover and no session
   fetches tiles that add nothing. The earlier `Math.max(EARTH_TILE_MIN_LEVEL, levels.min)`
   would have clamped every session back to 5 and made a shallow bake silently inert.

## Definition of done

- [x] `npm run typecheck` clean (src + tools).
- [x] `npm test` green, with tests 1 to 8 from the spec's "Testing" section present.
- [x] Descending to Earth visibly sharpens the surface past the base texture's limit, with
      no hole, no black tile and no pop.
- [x] Turning the camera away and back does not thrash the atlas.
- [x] Checked on a real iOS device (a bad shader freezes the canvas with no thrown error).
- [x] `entanglement-radar` run over the finished diff (task D7).
- [x] `docs/RENDERER.md` gains the virtual texture in its renderer map.

---

## Phase A — pure tile math

No GPU, no network, no clock. This is where spec tests 1 to 7 land.

### Task A1: tile identity types, constants and the path builder

**Files:** `src/@types/data/EarthTileKind.d.ts` (new), `src/@types/data/EarthTileId.d.ts`
(new), `src/data/bodies/earthTileParams.ts` (new), `src/utils/scene/earthTilePath.ts` (new).

Types verbatim from spec design 1:

```ts
// src/@types/data/EarthTileKind.d.ts
import type { TextureKind } from './TextureKind';
export type EarthTileKind = Extract<TextureKind, 'surface' | 'normal'>;

// src/@types/data/EarthTileId.d.ts
export type EarthTileId = {
  readonly kind: EarthTileKind;
  readonly z: number;
  readonly x: number;
  readonly y: number;
};
```

`EarthTileKind` stays welded to `TextureKind` via `Extract` even though only `'surface'` is
reachable this phase — that is what makes Q1 a one-word edit rather than a type rewrite.

`earthTileParams.ts` is the constants home, sited beside `earthSurfaceParams.ts` and
`cloudShellParams.ts`. It exports, with the spec section each value comes from in a comment:

| constant                           | value        | source                                                                                              |
| ---------------------------------- | ------------ | --------------------------------------------------------------------------------------------------- |
| `EARTH_EQUIRECT_BASE_WIDTH_PX`     | 512          | design 1 — equirect width at z = 0, so `width(z) = 512 << z` and z = 4 is exactly today's 8192 base |
| `EARTH_TILE_PX`                    | 512          | design 1 — the default; the manifest's `tilePx` overrides it at runtime                             |
| `EARTH_TILE_MIN_LEVEL`             | 5            | design 6 — z = 4 IS the base texture                                                                |
| `EARTH_TILE_WINDOW_SIDE`           | 128          | design 2                                                                                            |
| `EARTH_TILE_ATLAS_SIDE`            | 4096         | design 6                                                                                            |
| `EARTH_TILE_CONCURRENCY`           | 4            | design 4                                                                                            |
| `EARTH_TILE_FADE_MS`               | 400          | design 5                                                                                            |
| `EARTH_EQUATORIAL_CIRCUMFERENCE_M` | 40075016.686 | WGS84                                                                                               |

**Signature:** `earthTilePath(tile: EarthTileId): string` → `earth-tiles/<kind>/<z>/<x>/<y>.webp`.

Called by BOTH `buildEarthTiles` (task B2) and the runtime fetcher (task C3); this is the
anti-drift pattern `bodyTextureFilename.ts:9-15` already enforces.

- [x] Add the two `@types` files. One type per file, no barrel.
- [x] Add `earthTileParams.ts` with the table above.
- [x] Add `earthTilePath.ts`.
- [x] **No test.** Per `testing.md` and the spec's "Nothing else earns a test", a test over
      `earthTilePath`'s output string restates the format, and a test over the constants
      restates the table. The anti-drift guarantee comes from there being one caller-shared
      function, not from an assertion.
- [x] `npm run typecheck`. Commit.

### Task A2: the grid, uv↔tile conversion, and the round trip (spec test 1)

**Files:** `src/utils/scene/earthTileColumns.ts` (new), `src/utils/scene/earthTexelMetres.ts`
(new), `src/utils/scene/earthTileXyForUv.ts` (new), `src/utils/scene/earthTileCentreUv.ts`
(new), plus one test file per function under `tests/utils/scene/`.

**Signatures:**

```ts
earthTileColumns(z: number, tilePx: number): number   // (512 << z) / tilePx; rows = cols / 2
earthTexelMetres(z: number): number                   // circumference / (512 << z)
earthTileXyForUv(uv: Readonly<Vec2>, z: number, tilePx: number): Vec2   // [x, y]
earthTileCentreUv(xy: Readonly<Vec2>, z: number, tilePx: number): Vec2  // [u, v]
```

`Vec2`, never a raw number tuple.

The two conversions are the flip's only home, and they are independent formulas rather than
one expressed through the other — which is what makes the round trip a real test:

- `x = floor(u * cols)`, `u_centre = (x + 0.5) / cols`
- `y = floor((1 - v) * rows)`, `v_centre = 1 - (y + 0.5) / rows`

The `1 - v` is because the mesh's `v = 0` is the **south** pole (`cubeSphereMesh.ts:164-166`,
and `fragment.wesl:156-158` documents the same convention) while tile `y = 0` is the north
edge. `u = 0` is exactly longitude -180, so no prime-meridian offset enters here; the
`TEXTURE_PRIME_MERIDIAN_U` 0.5 is already baked into the mesh's vertex `u`.

- [x] **Spec test 1 — tile-address round trip.** `tests/utils/scene/earthTileXyForUv.test.ts`:
      for a spread of tiles across z = 5..13 including the four corners of each level and the
      antimeridian column, assert
      `earthTileXyForUv(earthTileCentreUv([x, y], z, 512), z, 512)` deep-equals `[x, y]`.
      This catches an off-by-one in either the `1 - v` flip or the `cols / 2` row count, both
      of which read on a globe as "the texture is subtly wrong" rather than as a break.
- [x] Add one assertion in `earthTexelMetres.test.ts` anchoring z = 4 to 4892 m/texel, which
      is the spec's own "equals today's base" claim and the anchor the whole ladder hangs on.
      Nothing else in that file.
- [x] `npm test -- earthTile`. Commit.

### Task A3: `planEarthTiles` — horizon, frustum, level selection (spec tests 2, 3, 4)

**Files:** `src/@types/scene/EarthTilePlan.d.ts` (new),
`src/@types/scene/EarthTileRequest.d.ts` (new), `src/utils/scene/planEarthTiles.ts` (new),
`tests/utils/scene/planEarthTiles.test.ts` (new).

Types and the input signature verbatim from spec design 3. The algorithm is its five
numbered steps; steps 1 to 4 land here, step 5 (the window clip) in task A4, so `zWin`,
`winX0` and `winY0` may be computed but are not yet asserted.

The level rule, stated once so the exponent has one home:

> A patch at level `z` whose projected on-screen extent is `screenPx` needs level
> `z + ceil(log2(screenPx / tilePx))`, clamped to `[minLevel, maxLevel]`.

- [x] **Spec test 2 — level from texel density, hand-computed anchor.** A nadir-facing camera
      at a stated altitude, `fovY = 40°`, viewport 1440 px. Assert the plan's `zWin` equals
      the level worked out on paper from
      `groundMetresPerPixel = h * 2 * tan(fovY / 2) / viewportHeightPx` against
      `earthTexelMetres(z)`. **Put the arithmetic in the test's comment**, so a future reader
      can re-derive it rather than trusting the number. Then assert monotonicity: halving the
      altitude raises `zWin` by exactly one, over at least three consecutive halvings.
      A wrong exponent here starves or thrashes the atlas and is invisible on screen except
      as vague blurriness.
- [x] **Spec test 3 — clamp to `maxLevel`.** One assertion: with `maxLevel: 5` and a camera
      low enough to want z11, no request exceeds z5. Without it, a shallower pyramid draws a
      sustained 404 storm on every close approach.
- [x] **Spec test 4 — the far hemisphere is rejected.** A nadir plan contains the sub-camera
      tile at `zWin`, and contains no tile whose four corners all satisfy
      `dot(corner, camPosLocal) < 1`. Roughly half the fetches and half the atlas ride on
      this and no compiler check reaches it.
- [x] Implement steps 1 to 4. Keep it pure — no clock, no module state.
- [x] `npm test -- planEarthTiles`. Commit.

### Task A4: the window, and the antimeridian (spec test 5)

**Files:** `src/utils/scene/planEarthTiles.ts` (modify), its test (modify).

The window is derived first, from the sub-camera point and the deepest level step 3 found,
then step 5 rejects any leaf outside the `EARTH_TILE_WINDOW_SIDE` box. Enforced in the
planner, never in the shader (spec design 2): a tile outside the window is never requested,
never resident, and never needs representing.

The wrapping subtraction the fragment will mirror is `dx = (px + cols - winX0) % cols`.

- [x] **Spec test 5 — the window contains every emitted leaf, across the antimeridian.**
      A plan centred at longitude 180 must emit leaves on **both** sides of the seam, and
      every emitted leaf must map into `[0, windowSide)` after the wrapping subtraction.
      Assert the both-sides part explicitly — a window that silently emitted nothing west of
      the seam would pass a naive containment check. This is the one place the window
      arithmetic can be wrong in a way that shows only in the Pacific.
- [x] Implement window derivation + step 5.
- [x] `npm test -- planEarthTiles`. Commit.

### Task A5: `buildEarthPageTable` (spec tests 6, 7)

**Files:** `src/@types/scene/EarthResidentTile.d.ts` (new),
`src/utils/scene/buildEarthPageTable.ts` (new),
`tests/utils/scene/buildEarthPageTable.test.ts` (new).

**Signature:**

```ts
// src/@types/scene/EarthResidentTile.d.ts
export type EarthResidentTile = {
  readonly tile: EarthTileId;
  /** Index of the atlas slot holding this tile's bitmap. */
  readonly slot: number;
  /** Blend weight against the whole-globe base, 0..1 — the load fade. */
  readonly weight: number;
};

buildEarthPageTable(input: {
  /** Every tile currently in the atlas, in any order. */
  readonly resident: readonly EarthResidentTile[];
  readonly plan: EarthTilePlan;
  readonly slotsPerRow: number;
  readonly windowSide: number;
  readonly tilePx: number;
}): Uint8Array;   // windowSide * windowSide * 4, RGBA8UI
```

One structured list, not a key-to-slot map plus a parallel key-to-weight map. Residency
keyed by `earthTilePath(tile)` would force this function to INVERT that string to recover
`(z, x, y)` — an inverse that should not exist, because the subsystem calling it holds the
`EarthTileId`, the slot and the fade stamp in full and formats the key itself. Two parallel
maps that must agree is the same smell seen from the other side.

Byte map per texel, verbatim from spec design 2:

| channel | holds                                     | range         |
| ------- | ----------------------------------------- | ------------- |
| R       | atlas slot column                         | 0..7          |
| G       | atlas slot row                            | 0..7          |
| B       | level `z` of the tile occupying that cell | 5..13         |
| A       | blend weight against the base, 0..255     | 0 = base only |

Two properties are the whole point of this function:

- **Always rebuilt from scratch, never patched.** The atlas slot map is the single
  authoritative home for residency and this is a pure projection of it. That is what makes
  the "eviction granularity must match slot granularity" landmine unreachable.
- **Written in INCREASING `z`**, so a fine tile overwrites its coarse ancestor's cells and
  every cell ends up naming the finest resident ancestor. No search, no per-cell level loop.

A third case neither the spec nor the first draft of this plan named: **a resident tile
FINER than `plan.zWin` is unrepresentable and must be skipped.** It is reachable — the
camera climbing lowers `zWin` while the atlas still holds deeper tiles from the frames
before — and `1 << (zWin - z)` with a negative shift is JavaScript's shift-mod-32, so it
would produce a garbage span rather than an obvious error. Naming such a tile would also
make most of the cell sample the wrong ground, since the fragment derives its within-tile
uv from the level in `B`. It waits for the window to deepen again, or for the LRU.

- [x] **Spec test 6 — the finest resident ancestor wins.** Given a resident set holding a
      coarse tile and ONE of its four fine descendants, assert the cells under the descendant
      name the FINE slot and its sibling cells name the COARSE slot. This single property IS
      the graceful-degradation mechanism of design 5; if it regresses you get holes or
      wrong-area sampling.
- [x] **Spec test 7 — a rebuilt table never names an evicted slot.** Drive a real
      `TextureAtlas` (constructed with the Earth geometry, no `initTexture`, so no GPU) past
      full so `allocate` evicts, rebuild, and assert no cell points at the recycled slot.
      A regression test by construction against the named landmine.
- [x] Assert `A === 0` everywhere for an empty resident set — the identity case that makes
      the feature strictly additive. One line, and it is the thing every degradation path
      collapses to.
- [x] Implement.
- [x] `npm test -- buildEarthPageTable`. Commit.

---

## Phase B — the development pyramid

Real tiles from real imagery, no download. This is what unblocks Phases C and D from the
open source question.

### Task B1: the imagery-source seam and its equirect-file implementation

**Files:** `tools/textures/EarthImagerySource.d.ts` (new — **not** `tools/@types/`, see
"Corrections" above), `tools/textures/LonLatBox.d.ts` (new),
`tools/textures/equirectFileSource.ts` (new).

`EarthImagerySource` verbatim from spec design 8. `equirectFileSource(rawKey)` implements it
over an equirect file on disk, reading through `rawDataPath()` — **never** a literal
`data/raw/...` string.

- [x] Add both `.d.ts` files, one type each.
- [x] Implement `equirectFileSource` against `textures.nasaBmng` (21600 × 10800,
      `rawDataRegistry.ts:597-607`). `readBox` extracts the lon/lat box with `sharp` (already
      a dependency at 0.34.5) and resizes to the requested pixel size. Alpha is 255
      everywhere — BMNG has no no-data. Return `null` never, since coverage is global.
- [x] `maxLevel: 5`. z5's equirect width is `512 << 5 = 16384`, which is under 21600, so the
      pyramid is a genuine downsample and never an upscale. z6 would be 32768 and would be
      inventing detail.
- [x] **No test.** `EarthImagerySource` conformance is a compiler check and the pixels are
      judged by eye in task B2.
- [x] `npm run typecheck`. Commit.

### Task B2: `buildEarthTiles`

**Files:** `tools/textures/buildEarthTiles.ts` (new), `package.json` (modify).

Its own tool, **not** folded into `buildTextures` (spec design 8): it needs inputs a normal
contributor will not have on disk and it eventually runs for hours, so folding it in would
make `npm run build-textures` fail for everyone.

Emits, under `public/data/images/`:

- `earth-tiles/surface/<z>/<x>/<y>.webp` — paths from `earthTilePath`, the same function the
  runtime fetches through.
- `earth-tiles/manifest.json` — shape from spec design 8's `EarthTileManifest`.
- `earth-tiles/index.txt` — one relative path per emitted tile. Phase F's `collectEarthTiles`
  walks this rather than the filesystem, so a half-finished bake cannot upload a partial
  pyramid the runtime then treats as complete. Emitted now, while the emit site is being
  written, because retrofitting it later means re-baking.

Build order is deepest-level-first, then each coarser level a 2×2 average of the level above
— the trick that stops anything holding a whole-globe raster. At z5 it is irrelevant; write
it correctly anyway, because Phase E is where it matters and Phase E should not be rewriting
this loop.

- [x] Add `"build-earth-tiles": "tsx tools/textures/buildEarthTiles.ts"` to `package.json`.
- [x] Implement. Surface tiles are lossy WebP quality 82, sRGB, **with** an alpha channel
      (design 7) even though BMNG's alpha is uniformly 255 — the channel's presence is what
      Phase C and D are built against.
- [x] `flipY: false` orientation: row 0 of every tile is its NORTH edge. The reconciliation
      with the mesh's south-first `v` happens in the tile-index arithmetic (task A2), in one
      place, not per upload.
- [x] Run it. 512 tiles at z5, no network.
- [x] **Visual check before wiring anything:** open a handful of tiles as flat files —
      one mid-latitude, one polar, one spanning the antimeridian — and confirm they are the
      right patch of Earth the right way up. A wrong flip caught here costs a minute; caught
      in Phase D it looks like a shader bug.
- [x] **No test.** No GPU, no assertion worth making; the output is judged by eye.
- [x] Commit. Do NOT commit the emitted tiles — confirm `public/data/images/earth-tiles/` is
      gitignored first, and add it if not.

---

## Phase C — the runtime

Residency and fetching, no shader change. Verifiable in the Network tab before a single
pixel moves.

### Task C1: the manifest

**Files:** `src/@types/scene/EarthTileManifest.d.ts` (new),
`src/utils/scene/fetchEarthTileManifest.ts` (new).

**Signature:** `fetchEarthTileManifest(): Promise<EarthTileManifest | null>` — `null` on any
failure (missing, 404, unparseable). Fetched once, when the virtual texture first engages,
through `dataUrl()` (`src/services/loading/fetchWithProgress.ts:24`).

Not committed codegen (spec design 8): the virtual texture engages only on close approach so
a round trip costs nothing, and re-baking deeper must be a data change, not a code deploy.

**Two corrections from the Phase B bake, both load-bearing:**

1. **`levels` and `builtFrom` must be `Partial<Record<EarthTileKind, …>>`, not total.**
   `EarthTileKind` is `'surface' | 'normal'`, and a surface-only bake cannot satisfy a total
   `Record` without inventing a `normal` range. The emitted manifest carries `surface` only,
   so a total type would have the runtime read `manifest.levels.normal` as defined when it is
   absent. Q1 answering "tile the normal too" adds a key; it does not change the type.
2. **A fully-opaque WebP has no alpha plane on disk.** libwebp drops it, and there is no
   option to force it, so the BMNG tiles report `channels: 3, hasAlpha: false` even though
   they were encoded from a 4-channel raster. Harmless — `createImageBitmap` plus an
   `rgba8unorm-srgb` upload yields alpha 1 regardless, so the shader's `tile.a` land-mask
   contract holds — but **nothing in Phase C or D may assert 4 channels** on the file or on
   the decoded bitmap. Phase E's land-only sources carry real transparency and keep the plane.

- [x] Add the type and the fetcher.
- [x] **No test.** The shape is enforced by its type at the one parse site; the null-on-failure
      path is exercised by the identity case, which task A5 already asserts.
- [x] `npm run typecheck`. Commit.

`EarthTileManifest` is the ONE type, imported by both the emit site (`buildEarthTiles`) and the
parse site. A second local shape on the tools side is what let the two disagree about `Partial`
in the first place; a manifest type that only one end imports is not a contract.

### Task C2: `earthTileSubsystem`

**Files:** `src/@types/engine/subsystems/EarthTileSubsystem.d.ts` (new),
`src/services/engine/subsystems/earthTileSubsystem.ts` (new).

Owns, per tiled kind: one `createBitmapStreamSubsystem` (PREP 2 — `atlasSide: 4096`,
`slotSide: 512`, `format: 'rgba8unorm-srgb'`, `label: 'earth-surface-tiles'`), one
`windowSide × windowSide` `rgba8uint` page-table texture, the `bitmapReadyTime` map that
drives the fade, and the manifest once fetched.

Per frame, given a plan:

1. Walk leaves in `screenPx` order; `allocate(tileKey, frame)` each, so visible tiles stay
   alive under LRU.
2. For a key neither ready nor failed, `enqueueFetch` with `priority: screenPx` — the
   queue's natural largest-on-screen-first pop (`priorityQueue.ts:238-251`), no negation.
3. On any residency change, rebuild the whole page table via `buildEarthPageTable` and
   `writeTexture` it. 64 KB, so the rebuild stays in the noise; this is what buys the
   never-patch property.
4. Fade weights from `loadFadeAlpha(readyMs, nowMs, EARTH_TILE_FADE_MS)`
   (`src/utils/render/disk/loadFadeAlpha.ts`) — reuse, do not write a second ramp.

Two things this subsystem must NOT do: allocate anything before the virtual texture first
engages (67 MB held for a session that never approaches Earth is not acceptable), and touch
the whole-globe `committed` / `placeholders` maps in `earthRenderer` (`:348-376`). It is a
third layer above both and it only changes what the fragment blends on top.

- [x] `PriorityQueue` is constructed with `EARTH_TILE_CONCURRENCY`. Note that
      `bitmapStreamSubsystem.ts:73` currently does `new PriorityQueue()` with no argument;
      the limit must reach it, so `BitmapStreamDeps` gains an optional `concurrency` field
      rather than the tile subsystem reaching around the seam.
- [x] Wire `setEvictHandler` to drop the evicted key's `bitmapReadyTime` entry, the same way
      `texturedDiskSubsystem` does.
- [x] Implement lazy allocation on first engage, and `destroy()`.
- [x] **No test.** Every line of it is GPU, network or clock. The arithmetic it calls is
      already covered by Phase A. (One test WAS added, to
      `tests/services/engine/subsystems/bitmapStreamSubsystem.test.ts`, for the new
      `concurrency` pass-through — observable through the public API with no mocks.)
- [x] `npm run typecheck`. Commit.

**Three findings this task settled, which C3 and Phase D inherit:**

1. **The engage gate is circular as the plan states it.** `plan.zWin > minLevel` needs
   `minLevel`, which comes from a manifest the plan says is fetched "when the virtual texture
   first engages" — the gate waiting on its own answer. Split into two lazinesses: the
   **manifest** fetch starts on the first `plannerParams()` call, i.e. whenever the Earth layer
   is drawable (one small JSON); the **67 MB atlas + page table** are still allocated only by
   the first `update()`, which is the real engage. The budget constraint is honoured; the
   plan's manifest-timing sentence is not literally.
2. **`isAnimating()` must be ORed into `shouldKeepTicking` even when NOT engaged**, because it
   returns true while the manifest is in flight. The subsystem deliberately does not
   `requestRender()` on manifest arrival (subsystems never wake themselves), so a vote read
   only inside the engage branch leaves a stationary camera dormant until the next input — and
   it presents as a silently failed manifest fetch.
3. **`isFailed` is checked BEFORE `allocate`**, deviating from `texturedDiskSubsystem`'s order.
   A land-only pyramid means most of the grid legitimately 404s, and allocating for a failed
   key would hold a slot _and_ refresh its LRU stamp every frame — a descent over ocean could
   pin all 64 slots on tiles that will never have pixels.

**Known leak, pre-existing, not fixed here:** `destroy()` cannot release the atlas.
`TextureAtlas` has no `destroy()` and `BitmapStreamSubsystem.destroy()` only clears its sets,
so the 67 MB GPUTexture lives until device teardown — `engine.ts:785`'s "galaxyAtlas releases
its GPU texture last" comment is not true today. Adding `TextureAtlas.destroy()` changes shared
teardown semantics for the galaxy atlas and risks a destroyed texture still referenced by a
renderer bind group, so it wants its own decision rather than a drive-by. This subsystem
releases only what it owns (the page-table texture).

### Task C3: the drive site and the engage gate

**Files:** `src/services/engine/frame/runFrame.ts` (modify),
`src/services/engine/state/*` (wire the subsystem in alongside the existing ones).

Drive it beside the existing disk-planner drive site (`runFrame.ts:503-549`), which is the
established home for per-frame CPU planners.

**Engage gate, one rule (see "Corrections" above):** run `planEarthTiles`; engage when
`plan.zWin > minLevel`. Before Earth is close enough for that to be true the planner's own
early rejections make it cheap, and the whole block is skipped when the Earth layer is
disabled — so the common case (anywhere outside the inner solar system) costs one comparison.

- [x] Add the drive site, gated on the same handles `earthLayer.enabled` checks.
- [x] Wake rules: a landed tile wakes the loop via `BitmapStreamSubsystem`'s existing
      `requestRender`, and a mid-fade tile keeps it ticking through the fade. Subsystems
      never wake themselves (`project_render_wake_consolidation`) — surface the vote, let
      `shouldKeepTicking` decide, exactly as `prepareStarCut` does at `runFrame.ts:561-574`.
- [x] **Verify with no shader change:** descend to Earth in the dev server, watch the Network
      tab. Tiles must arrive largest-on-screen-first, at most 4 concurrently, and **stop**
      when the camera stops. A sustained stream while stationary means the planner is
      oscillating at a level boundary — fix that here, before the shader can mask it.
- [x] Commit.

**This checkpoint earned its place — it caught two bugs no test reached, both of the same
shape: a contract stated in one place and never honoured in another.**

1. **The engage gate could never fire.** It compared `plan.zWin` against a floor the
   planner guaranteed it would meet. Fixed by splitting `baseLevel` from `minTileLevel`
   (see Corrections item 4).
2. **`TextureAtlas.allocate` evicted a slot claimed earlier in the SAME frame.** Its LRU
   scan uses a strict `<`, so once every slot carries the current frame stamp the winner
   stays index 0 and each over-budget request evicts it again. Every eviction clears
   `bitmapReady`, so the next frame refetched the key: ~2600 requests/second from a
   stationary camera. `BitmapStreamSubsystem`'s type already documented the `null` return
   and BOTH consumers already guarded on it — the guards were dead code, so the galaxy
   thumbnail path carried the same latent loop and had simply never exceeded its budget.

**Peak demand is at the ENGAGE transition, not at close approach** — a sphere at distance
has near-uniform texel density, so the whole visible cap refines one level at once.
Measured against the 64-slot atlas: 29 tiles at 1440x900 @1x, 64 at 2560x1440 @1x, 107 on
a 14" MBP, 149 at 5K. Every retina viewport overshoots. Over-budget now degrades
gracefully (requests arrive largest-first, so the biggest tiles win the slots and the rest
fall back to the base), but that is a visible resolution boundary mid-screen at the engage
altitude — **judge it at D6, and revisit `EARTH_TILE_ATLAS_SIDE` if it reads badly.** The
spec sized the atlas from close-approach demand, which is the wrong end of the curve.

**Known, deferred, not blocking:** the camera scrolls through the planet's surface
(`clampDistance`'s floor is global and sits ~0.49 body radii from Earth's centre). Costs
the ability to dwell at low altitude and turn, which is exactly the D6 gesture. Backlogged
as `docs/backlog/2026-07-29-per-body-zoom-floor.md`.

---

## Phase D — the shader and the renderer

Pixels change here. Slow down.

### Task D1: the window uniforms (spec test 8)

**Files:** `src/utils/gpu/packEarthSurfaceUniforms.ts` (modify),
`tests/utils/gpu/packEarthSurfaceUniforms.test.ts` (modify),
`src/services/gpu/shaders/lib/sphere.wesl` (modify — the WGSL struct).

`zWin`, `winX0`, `winY0` go into f32 **29, 30, 31**, which are exactly the three zeroed pad
slots the struct already ends in (`packEarthSurfaceUniforms.ts:57,108`). `EARTH_SURFACE_UNIFORM_FLOATS`
stays 32 and the struct stays 128 bytes. Stored as `f32`, read with `u32(...)`; every value
is a small integer exactly representable in f32.

- [x] Extend the module header's byte-layout table — it is the single source of truth for
      this struct and a layout comment that lies is worse than none.
- [x] **Spec test 8 — byte offsets.** Extend the existing test to assert the three new fields
      land at f32 29..31 and that the length is still 32. This is a keep-rule test per
      `testing.md`: a WGSL/TS layout drift is invisible until iOS silently drops the frame.
- [x] Update the WGSL struct's trailing pad to the three named fields, same order.
- [x] `npm test -- packEarthSurfaceUniforms`. Commit.

### Task D2: the bindings

**Files:** `src/services/gpu/renderers/bodies/earthRenderer.ts` (modify).

Three new entries on the explicit layout (`:389-408`), never `layout: 'auto'` (the
auto-layout trap):

| binding | resource                                                               |
| ------- | ---------------------------------------------------------------------- |
| 7       | surface page table, `texture_2d<u32>`                                  |
| 8       | surface tile atlas, `texture_2d<f32>`, `rgba8unorm-srgb`               |
| 9       | tile sampler — linear, `clamp-to-edge` both axes, **no** mipmap filter |

That is 9 sampled textures and 2 samplers against defaults of 16 and 16.

The bind group must be buildable **before** the virtual texture engages, since the layout is
fixed at pipeline creation. So bindings 7 and 8 need 1×1 placeholders in the same
`placeholders` spirit as `:359-373`: an all-zero `rgba8uint` page table (A = 0 ⇒ base only,
the identity case) and a 1×1 atlas. `KIND_CFG` is a `TextureKind` table and these are not
texture kinds, so they are siblings of it, not rows in it — do not widen `KIND_CFG` to carry
things `setMap` can never be called with.

- [x] Add the layout entries, the placeholders, and a `setTileResources(pageTable, atlas)`
      that rebuilds the bind group, mirroring `setMap`'s rebuild at `:532-534`.
- [x] **No test.** GPU resource wiring; the visual pass covers it.
- [x] `npm run typecheck`. Commit.

### Task D3: the fragment lookup

**Files:** `src/services/gpu/shaders/bodies/earth/fragment.wesl` (modify).

The albedo sample at `:174` is the ONE surface sample — night (`:238`), material (`:175`) and
normal (`:183`) are untouched. The lookup is spec design 2's snippet; it is contract, so
match its shape, and five of its properties are load-bearing and must survive review:

- `textureSampleLevel`, **never** `textureSample`. `mipLevelCount` is 1 so there is no level
  to select, it sidesteps WGSL's uniformity requirement for implicit derivatives, and
  implicit derivatives would be wrong anyway — atlas uv jumps discontinuously at a slot
  boundary, so `dpdx` there is garbage.
- **No new varying.** Everything derives from `in.uv`, which the fragment already receives.
  An extra `@location` cost 1.5 ms once (`feedback_varying_count_is_a_perf_budget`).
- The unsigned window test is branchless and covers latitude underflow, because `py - winY0`
  wraps above `WINDOW_SIDE` north of the window.
- `tile.a` is the land mask, so ocean resolves to the base with no separate mask texture and
  no extra sample.
- `A = 0` means "sample the base", which is what makes the whole feature strictly additive.

Half-texel clamp inside the slot, no gutters: `clamp(tileUv, 0.5/512, 1 - 0.5/512)` before
converting to atlas coordinates, so bilinear at a slot edge replicates the tile's own edge
texel instead of bleeding a stranger's.

**One trap in the spec's snippet, found during A5.** It opens with
`let cols = 1u << u32(zWin)`, which is the column count only when `tilePx == 512` — the
ladder's `(512 << z) / tilePx` cancels at exactly that tile edge and nowhere else. The TS
side is parametric in `tilePx` and reads it from the manifest, so a re-bake at a different
tile edge would silently desync the shader from the planner: same uv, different cell.
Resolve it one of two ways, and say which in the commit — either carry `tilePx` (or the
column count) into the uniforms alongside the window, or drop `tilePx` from the manifest and
make 512 a fixed property of the format. Do not leave both stories in the tree.

- [x] Meticulous WESL pass. **Single quotes in comments, never backticks** (they are a parse
      error). `?static` imports. Read the whole file before editing.
- [x] **Tint probe before trusting it.** False-colour the page table's `B` channel (level) to
      screen and confirm the level bands move sensibly with altitude, then false-colour `A`
      and confirm it is 0 outside the window and 1 under resident tiles. Do this BEFORE
      wiring the real `mix` — a wrong window is invisible in the final image and obvious in
      false colour (`feedback_shader_tint_probe`).
      **The probe stays in the tree** behind `TILE_DEBUG`, reset to `0u`. What it found is
      recorded in the open-decision section below.
- [x] Wire the real `mix(baseAlbedo, tile.rgb, w)`.
- [x] Commit.

### Task D4: the fade

**Files:** `src/services/engine/subsystems/earthTileSubsystem.ts` (modify).

The `A` channel carries the per-cell blend weight, ramped by `loadFadeAlpha` over
`EARTH_TILE_FADE_MS = 400` — the same duration the thumbnail crossfade uses
(`texturedDiskSubsystem.ts:50`). The page table is rebuilt every frame while any tile is
mid-fade, which is also what keeps the render-on-demand loop ticking through it.

- [x] Implement the per-tile fade weight into the page-table rebuild.
- [x] **Named limitation, do not try to fix it here:** a z→z+1 handoff is a hard sharpness
      step, not a crossfade, because `A` is already 1 and only the slot pointer changes.
      That is how every clipmap looks. If it reads badly in D6, the escalation is spec
      design 5's `rgba16uint` two-slot table, gated on an `npm run perf` measurement.
- [x] Commit. **Landed with D3, not separately:** the weight channel had to be real for the
      `mix` to be, so `loadFadeAlpha` went in alongside the lookup rather than after it.
      `uploadPageTable` projects it (`earthTileSubsystem.ts:292`) and `isFading` holds the
      render-on-demand loop open through the ramp.

### Task D5: docs

**Files:** `docs/RENDERER.md` (modify).

- [x] Add the virtual texture to the renderer map: the subsystem, the page table, the atlas,
      and the one landmine worth writing down — that the page table is rebuilt whole and
      never patched, and why.
      Six landmines in the end, not one. The unplanned find: `RENDERER.md` had **no**
      orientation note at all, so the `flipY: true` whole-globe upload and the `flipY: false`
      shared-atlas upload were undocumented rather than mis-documented. Both are right for
      their consumer; the reconciliation is CPU-side in the tile-index arithmetic.
- [x] Commit.

### OPEN DECISION, gating D6: the atlas is over-subscribed

**Found by the first probe session, D3.** In `TILE_DEBUG = 1u` the resident cap shows
magenta (= level 5, correct) with **black cells scattered through it**. Those are not
missing files — all 512 z5 tiles exist, BMNG carries bathymetry so ocean tiles are real
imagery. They are the atlas slot budget: the view wants ~107 tiles on a 14" MBP, the atlas
holds 64, and the 43 that do not fit fall back to the base.

**Why it is worse than a transition artifact.** Tile demand tracks SCREEN PIXELS, not
altitude — roughly 3x the screen's pixel count in texels, since tiles are only partly on
screen and the sphere is curved. As the camera descends the visible cap shrinks and the
level deepens proportionally, so the count stays roughly constant. Today's one-level
pyramid hides this outside 6000-9000 km; a deep pyramid would show it at every altitude.

```
atlas 4096^2 = 16.8 Mtexels = 64 slots
14" MBP      = 107 tiles wanted = 28 Mtexels   (~1.7x over)
5K           = 149 tiles wanted = 39 Mtexels   (~2.3x over)
```

At the engage altitude the whole visible cap wants the SAME level at once (uniform texel
density at distance), so largest-first priority cannot help and the dropped tiles land
arbitrarily. Lower down, perspective spreads the sizes and refusals land near the horizon
where the fallback barely shows.

**Options as first framed:**

1. **Cap refinement to what fits** — refine to the finest level whose tile count fits the
   atlas. Degrades in whole steps rather than in patches. With today's pyramid it reduces
   to "stay on base until it fits" (no improvement 6000-9000 km); with a deep pyramid it
   gives z7-everywhere instead of z8-with-holes. Costs no memory.
2. **`EARTH_TILE_ATLAS_SIDE` 4096 -> 8192** — 256 slots, full coverage, 268 MB against the
   spec's 67 MB budget. 8192 is the max texture dimension on every current device
   including iOS, so there is no step beyond it, and exhausting mobile memory drops the
   context rather than slowing the frame.
3. **Defer to Phase E** — judge coverage against real imagery instead of a placeholder.
   Costs: D6 reads around a known artifact, which is where a real bug hides behind an
   expected one.
4. **Size to the device** — 8192 where there is headroom, 4096 where there is not. Avoids
   the mobile risk; two visual behaviours to reason about, and WebGPU does not expose a
   headroom signal directly.

### What the research found

Two surveys, one over the virtual-texturing literature (id Tech 5, Unreal, Unity, the
clipmap paper) and one over the globe renderers (CesiumJS at `25741aac`, osgEarth `86d01c14`,
both WorldWinds), read from primary sources and engine source rather than summaries.

**1. The global LOD clamp is the standard response, and it is a hysteretic dial, not a
gate.** Option 1 was the right instinct in the wrong form. Four independent systems ship it:

| System    | Name                             | Behaviour                                                                    |
| --------- | -------------------------------- | ---------------------------------------------------------------------------- |
| id Tech 5 | dynamic feedback LOD bias        | high/low water marks on resident-page count                                  |
| Unreal    | `bEnableResidencyMipMapBias`     | per-pool bias, max across pools applied to ALL VT sampling                   |
| Unity SVT | automatic mipmap bias            | monitors cache usage, raises bias when it fills                              |
| CesiumJS  | `memoryAdjustedScreenSpaceError` | `*= 1.02` per pass over budget, `/= 1.02` under, floored at the user's value |

The canonical statement is a slide title: van Waveren, _id Tech 5 Challenges_ (SIGGRAPH 2009,
Beyond Programmable Shading), slide 15 "Virtual Texturing - Thrashing", whose fix reads
"with virtual texturing, you can globally adjust feedback LOD bias until working set fits".
Its two illustrations are labelled "1024 Physical Pages" and **"64 Physical Pages"**, so the
blurry example is literally this atlas's slot count. Mechanism verbatim, _Software Virtual
Textures_ (2012) §3.5 "Oversubscription": track resident pages seen in the previous frame's
feedback, increment the bias above a high water mark, decrement below a low water mark, clamp
non-negative — "backs off of detail, without thrashing, for views where enough detail cannot
be supplied, but then adds the detail back as soon as the system is not strained".

**2. Today's behaviour is what Unreal documents as the bug**, not as a degradation mode: an
oversubscribed pool "will drop data for visible tiles. This leads to unwanted IO and screen
flickering". Ours is gentler than theirs on two counts — requests are sorted largest-on-screen
first so refusals land on the smallest patches rather than at random, and the fallback is a
real base texture rather than nothing — but "uniformly one level softer" beats "sharp with
holes", which is the entire reason all four systems added the bias.

**3. The bytes are unremarkable; the granularity is the outlier.** 67 MB sits on Unreal's
documented 64 MB default pool and above RAGE's entire 40 MB budget; 268 MB would still be
below Cesium's 512 MiB default and well below Unity's ~700 MB at 1080p. So option 2 is not
extravagant by the standards of the field. What IS unusual is the slot size:

```
RAGE / id Tech 5   1024 pages x 128^2  = 14.7 Mtexels
this atlas           64 slots x 512^2  = 16.8 Mtexels
```

Same texel budget, allocation quantum 16x coarser. Every primary source that discusses tile
size lands on 128 or 256; Unreal's SVT default is 128. **But cutting tile size adds no texel
capacity** — it only removes whole-tile waste — so it cannot close a 2.3x shortfall alone.
Against van Waveren's 4x-the-viewport rule of thumb, 16.8 Mtexels is ~3.4x a 5 Mpixel retina
viewport, i.e. below the floor before any waste. The shortfall is structural, not tuning.

**4. The level rule sits at the most aggressive point on the curve.**
`ceil(log2(screenPx / tilePx))` targets at least one texel per pixel. Cesium's shipped imagery
chain (`Globe SSE = 2` x `heightmapTerrainQuality = 0.25` x `errorRatio = 1.0`) works out to
roughly one texel per TWO pixels, deliberately. One level of bias is ~4x fewer tiles.

The two rules are the same rule at different constants, which is worth writing down because it
means the SSE literature transfers wholesale. `distance * 2 * tan(fovy/2)` is the world-space
frustum height at that depth, so Cesium's `error = geometricError * H / (distance * sseDenom)`
is just geometric error expressed in pixels; with error halving per level, solving
`GE_L <= tau * metresPerPixel` gives `L >= log2(GE_0 / metresPerPixel) - log2(tau)`, the mip
formula with a `-log2(tau)` bias. Cesium's `maximumScreenSpaceError = 16` is therefore four
levels coarser than 1:1.

**5. Correction to this section's own reasoning above.** The claim that the whole visible cap
wants one level at once is true of the geometry but was used to argue the wrong thing. Under
per-tile refinement the whole-globe view costs a couple of tiles, not a capful, and
`planEarthTiles` already refines per tile rather than picking one global level, so this plan
does not have the bug that framing implies. Simulating Cesium's rule against this pyramid:
2 tiles at 51,200 km, 16 at 6,400 km, 40 at 400 km. Peak demand is at LOW altitude, and the
count falls again only because the pyramid runs out of levels.

The real worst case is specific to plate carrée and was found by accident: **a camera over a
pole selects ~17x the tiles it selects over the equator** (704 vs 40 at 100 km in that
simulation), because all `2^(z+1)` longitude columns converge there and every one of them is
an oversampled sliver that passes an isotropic error test. osgEarth defends against this by
name — `restrictPolarSubdivision`, default `true`, ramping a minimum tile aspect ratio from
0.1 at level 6 and killing refinement outside the band, "progressively starting at about
+/- 72 degrees latitude". Cesium does NOT, for geographic tiling schemes. The window clip
masks it at z5, where the whole 32x16 grid IS the window; it is real at Phase E depth.

**6. Two mechanisms worth copying later, both already half-present here.** Every system
pins the coarsest level so there is always something to sample — the unconditional base
texture is a stronger version of that. And every system resolves residency at SAMPLE time by
walking up to the nearest resident coarser ancestor (van Waveren §3.1; Gaia Sky's globe VT
loops up through levels in the shader). This tree has exactly one ancestor, the base, which is
sufficient at one level deep and not at Phase E depth. Also: van Waveren §5.2 evicts
finest-mip-first and only then LRU within a level; `TextureAtlas` is flat LRU.

### Recommendation

**Option 1, in its dial form, and nothing else in this PR.** Add the level bias as one
constant threaded into `planEarthTiles` — the local spelling of `maximumScreenSpaceError` —
set one level coarser than 1:1. It is the sanctioned mechanism, it costs no memory, it makes
the working set fit the current atlas (~107 tiles wanted becomes ~27 against 64 slots), and
it converts the artifact the probe found from patches into a uniform softening.

Superseded, with reasons:

- **Option 2 (8192 atlas)** — not extravagant, but it spends 200 MB to buy what one constant
  buys for free, and it would still be below the 4x rule at 5K. Revisit only if D6 shows the
  bias costs visible sharpness.
- **Option 3 (defer to Phase E)** — rejected for the reason already stated: a known artifact
  is where a real bug hides.
- **Option 4 (size to the device)** — moot while option 1 makes 4096 sufficient.
- **The static bias, not the servo.** A hysteretic controller is the documented escalation and
  is warranted when a deep pyramid makes demand swing; at one level deep there is nothing for
  it to track. Say so in the commit so the escalation path is on the record.
- **Tile size 512 -> 256 (or 128)** — the strongest finding against current shape, and now an
  explicit **Phase E decision** rather than a vague revisit, because Phase E rebakes the
  pyramid from real imagery anyway. Choosing the tile edge then costs one bake; choosing it now
  costs two. See the addendum below for how strong this finding got.

Backlog rather than this PR: the polar refinement clamp, intermediate-ancestor fallback in the
page table, finest-mip-first eviction.

### Addendum: Unreal's actual engine source

The second survey came back with engine source rather than docs, verified against public 5.1.0
and 5.3.2 mirrors. Three things it changes.

**The single most useful number found.** UE's shipped default pool
(`BaseEngine.ini`, one entry, no format filter, so it applies to every format a project does
not override):

```ini
[/Script/Engine.VirtualTexturePoolConfig]
+Pools=(SizeInMegabyte=64, bAllowSizeScale=False, bEnableResidencyMipMapBias=True)
```

resolves, for an uncompressed 32bpp format, to a **4080x4080 physical texture holding 900
tiles at 63.5 MB**. That is this atlas: same texture edge to within rounding, same memory,
**14x the slots.** It is the cleanest available confirmation that the bytes here are normal and
the granularity is not.

**Tile size 512 is an outlier by 4x in every direction, and that is the number to change
first.** Hardware sparse-texture pages are a fixed 64 KB, which is 128x128 at 32bpp on every
vendor's GPU; and every shipping software VT surveyed picked the same neighbourhood — RAGE 128,
UE SVT 128, UE RVT 256, Unity SVT 128. Nothing found anywhere uses 512. Note also how UE
handles the same 8192 ceiling this plan is up against: it **drops tile count rather than
tiling into multiple textures**, with a source comment conceding that texture-array slices
would be the better answer and it just uses the maximum size for now.

**Unreal ships the global clamp ON by default**, which Epic's own documentation obscures by
framing it as opt-in for projects that rarely oversubscribe. `bEnableResidencyMipMapBias=True`
is in the shipped default pool. And its controller is proportional with a zero-width dead band
rather than hysteretic, `VirtualTexturePhysicalSpace.cpp`, with constants worth copying if the
static bias ever needs to become a servo:

- **Back off at 95% occupancy** (`r.VT.Residency.UpperBound = 0.95`), not at 100%. Waiting for
  full is waiting too long.
- **Deliberately glacial:** rate 0.2 against a 5% overshoot is 0.01 mips/frame, roughly 100
  frames to gain one level. Cesium's 1.02 multiplicative step is the same choice. Both engines
  picked slow over responsive, presumably because a fast servo oscillates visibly.
- **Cap the bias** (`MaxMipMapBias = 4`).
- **"Visible" is time-windowed**, not instantaneous — pages touched within the last
  `r.VT.PageFreeThreshold = 60` frames.
- **A futility kill switch:** if pinned pages alone exceed 65% of the pool the bias is forced
  to zero, because a bias that cannot possibly help should not be applied. Not relevant here
  while the base texture is a separate resource rather than pinned slots, and relevant the
  moment that changes.

One caution carried over: the bias lands in the **request path**, not at sample time, which is
where this plan would put it too, and in UE one pool's pressure blurs every virtual texture in
the frame (scoping via `ResidencyMipMapBiasGroup` only arrived in 5.7).

**Sources:** [van Waveren, _Software Virtual Textures_
(2012)](https://mrelusive.com/publications/papers/Software-Virtual-Textures.pdf) §3.1, §3.5,
§5.2 · [van Waveren, _id Tech 5 Challenges_ (SIGGRAPH 2009)](https://mrl.cs.vsb.cz/people/gaura/agu/05-JP_id_Tech_5_Challenges.pdf) slide 15 ·
[Mittring, _Advanced Virtual Texture Topics_ (SIGGRAPH 2008)](https://advances.realtimerendering.com/s2008/SIGGRAPH%202008%20-%20Advanced%20virtual%20texture%20topics.pdf)
· [Epic, _Virtual Texture Memory
Pools_](https://dev.epicgames.com/documentation/en-us/unreal-engine/virtual-texture-memory-pools-in-unreal-engine)
· [Unity, _Cache Management for Virtual
Texturing_](https://docs.unity3d.com/2021.3/Documentation/Manual/svt-cache-management.html) ·
CesiumJS `Cesium3DTileset.js`, `Cesium3DTilesetTraversal.js`, `QuadtreePrimitive.js`,
`TileReplacementQueue.js`, `ImageryLayer.js` · osgEarth `SelectionInfo.cpp`, `TileNode.cpp`,
`Unloader.cpp` · [Tanner et al., _The Clipmap_ (SIGGRAPH
'98)](https://notkyon.moe/vt/Clipmap.pdf) §7.3-7.4 `MaxTextureLOD` ·
[Sagristà, _Sparse Virtual Textures_ (Gaia Sky, 2023)](https://tonisagrista.com/blog/2023/sparse-virtual-textures/)

### Task D6: the visual pass

No code by default. Run the spec's "Verification" list, in Chrome DevTools with cold-cache
discipline, then on a real iOS device.

- [x] The surface refines progressively past the base texture's limit and does not pop.
- [x] No hole, no black tile, ever.
- [x] Tile seams along a terminator and along a coastline at high magnification — this is
      where a half-texel clamp error or a wrong `flipY` shows.
- [x] The window frontier: pan hard sideways at low altitude; the far limb dropping to base
      resolution must not be an obvious moving edge.
- [x] Turn away and back: no atlas thrash.
- [x] **iOS on a real device.** A bad shader freezes the whole canvas with no thrown error.
- [x] **Answer Q1 here.** With the surface sharp at z5 and relief still whole-globe, judge
      whether the lighting reads plastic against the sharp colour. Record the answer in the
      spec's Q1 section either way — a deferred question that never gets written down
      becomes a re-litigation later.

### Task D7: entanglement radar

- [x] Run the `entanglement-radar` skill over the full A-to-D diff. Specific things to point
      it at: whether the page table ended up braided to anything other than the atlas's
      resident set, whether the engage gate stayed one rule or grew a second, and whether
      `EarthTileKind` being a one-member union in practice has leaked "surface" assumptions
      into places the normal path would have to unpick.
- [x] Act on what it finds, or record why not.

---

## Not in this plan

- **Phase E** — the real imagery source, the colour grade, the registry rows, the Splash
  attribution. Gated on Q2 and on an explicit go-ahead for the download with its size stated.
- **Phase F** — `collectEarthTiles`, the resumable R2 sync, `docs/DEPLOY.md`, the perf pass.
- Everything in the spec's "Non-goals", which includes camera surface-directed zoom, geometry
  LOD, elevation displacement, and tiling night/clouds/material.

---

## D6 diagnosis log — 2026-07-30

The visual pass against the real August z5-to-z7 pyramid. Recorded because three of these
cost real time and two are unresolved.

### The probe, and how to read it

`TILE_DEBUG` in `fragment.wesl` is at `0u` and the tree is clean. It was flipped to `1u` for
the diagnosis below and flipped back; the parity guard added in the same session asserts `0u`,
so `npm test` fails by exactly one assertion whenever the probe is left on. That guard is the
reason a probe can no longer ship by accident.

Hue map for mode 1, coarse to fine: z3 yellow, z4 cyan, z5 magenta, z6 green, z7 blue, black
means no tile named. Mode 2 maps the weight channel red-to-green instead.

The unresolved item below wants the probe on again. Flipping it is one character and the
guard tells you when you forget.

### Resolved: the dev server was serving HTML for z6 and z7

Not a code bug. See [[reference_vite_serves_html_for_new_public_dirs]]. A server started
before the bake never saw the new `surface/6/` and `surface/7/` directories and answered with
the SPA fallback at status 200, so `createImageBitmap` failed and nothing deeper than z5 ever
became resident. Presented as "all tiles the same size" and "falls back to base on approach".
The fix is restarting the server; the lesson is to check `content_type`, not the status.

### Resolved: the addressing chain is correct

Transcribed the fragment's lookup in TS against the real `planEarthTiles` and
`buildEarthPageTable` at six altitudes, checking that the tile each uv lands on is the tile
covering that uv at the level the cell claims. **Zero mismatches at every altitude.** So
planner, page table and shader agree, and neither the span logic nor the window arithmetic is
at fault.

One earlier run of that probe reported 63 mismatches. That was the probe's own bug: it
assigned `slot: i % 64`, so with 196 requests three tiles shared each slot and the reverse
lookup was ambiguous. Worth remembering that a probe needs verifying as much as the code.

Also worth remembering: an earlier "verification" compared mean RGB per tile across levels
and passed. **Mean RGB is invariant under a flip**, so that check could not have caught the
bug it was written to rule out. Comparing against an independent reference (the whole-globe
equirect, RMSE as-is vs v-flipped) is the honest form, though it is noisy at shallow levels
because the reference is itself a heavy downsample.

### ROOT CAUSE, needs fixing: the planner emits only leaves

Confirmed by the same probe. Request mix by altitude:

```
1727 km  zWin=5  6 requests  [z5:6]
1500 km  zWin=6 13 requests  [z5:1 z6:12]   <- a handoff carries two levels
1200 km  zWin=6 10 requests  [z6:10]
```

Nothing ever requests a tile's ANCESTORS, so a cell whose finer tile is in flight has nothing
resident between it and the whole-globe base. `buildEarthPageTable`'s docstring claims a cell
"keeps sampling its level-8 ancestor" while a finer tile loads, and its increasing-`z` sort
order is built to make that work, but the ancestor is never fetched, so the claim is false as
shipped.

This is one cause behind two user reports: black tiles between layers (probe mode) and detail
dropping to base on approach (normal mode). Every descent crosses a handoff.

Filed this morning as `docs/backlog/2026-07-30-earth-tile-page-table-ancestor-fallback.md`
tagged `deferred`, on the reasoning that one level of fallback was enough until Phase E
deepened the pyramid. **That tag is wrong** — three levels is already enough to make it
visible on every descent. Re-tag and fix: have the planner emit each leaf's ancestor chain
down to the session floor, which is about a third more requests since the ancestors are a
geometric series.

### RESOLVED: "z5 and z6 seem to render tiles from z7" — the coarsening never averaged

The report was right and the runtime was innocent. `bakeCoarserLevel` produced every coarse
tile as a 1:1 COPY of its north-west child rather than the 2 x 2 average of four, so a z6
tile painted its NW z7 child's pixels over four times the ground and a z5 tile over sixteen.
That is also the earlier "tiles are in the wrong locations at z6 and z5"; one cause, two
reports. z7 was correct throughout because it bakes straight from the source and never
enters the coarsening path.

The mechanism is `sharp`, not arithmetic: it composites over the ALREADY-PROCESSED image, so
the `.composite(four 512s at offsets 0/512).resize(512, 512)` chain shrank the 1024 canvas
FIRST and then laid the children down. The one at offset (0,0) covered the whole shrunk
canvas 1:1; the three at offset 512 fell outside a 512-wide canvas and libvips clipped them.
Nothing errored, and sharp's own guard could not catch it — it rejects an overlay LARGER than
the base, and 512 is not larger than 512.

Confirmed two ways before touching anything: an isolated repro of the exact call shape with
four solid colours returned the NW colour in all four quadrants, and on disk `z5/16/10` sat
0.011 mean-abs-diff per channel from `z7/64/40` sampled at 1:1 against 0.676 from the correct
average.

Fixed by shrinking each child to `tilePx / 2` in its own pipeline and compositing the four at
`tilePx / 2` offsets, so no `resize` sits in the composite pipeline at all — structurally
immune rather than merely reordered. Pinned by `tests/tools/textures/buildEarthTiles.test.ts`,
whose two cases both fail on the old implementation: quadrant colours, and the coastal case
where a parent missing its NW child used to come out entirely transparent.

Two lessons worth carrying, both about the verification rather than the bug:

- **The geographic check that cleared these levels earlier could not have caught it.** The NW
  child covers the parent's north-west corner, so "does the coastline look like Siberia" is
  true of the wrong pixels too. Detecting a scale error needs a quadrant-vs-quadrant pixel
  comparison against distinct known colours, which is what the new test does.
- **Verifying the addressing chain proved the wrong layer.** The transcription that found zero
  mismatches was correct and remains correct: the page table names the right tile, the shader
  resolves the right slot. The pixels inside that tile were wrong, which no amount of
  addressing arithmetic can see.

### Q1 (tile the normal map?) — still NO, for a better reason than cost

The visual pass PASSED on desktop 2026-07-30. Asked where the lighting fails against the
sharpened albedo, the user localised it: **"mostly apparent in the shorelines."**

At a shoreline three maps disagree about resolution. Albedo is now 611 m/texel (z7); the
`normal` and `material` maps are both bound at tier `medium` (4096 = **9.8 km/texel**), so
they are **16x coarser than the albedo they are shading**.

**There are two candidate causes and they are not the same fix.** The `material` map's `.g`
is an ocean mask selecting `oceanRoughness` over land micro-roughness — a large specular
step, smeared over ~10 km against a sharp coast. The `normal` map's relief is the other.
Guessing between them is the [[multiple sufficient causes]] trap: fix one, and if it was the
other the symptom is unchanged. Diagnostic before spending anything — force a constant
roughness and look at a coastline, then restore it and flatten the normal instead. Two
one-line shader probes of the `TILE_DEBUG` kind.

**Tiling the normal map cannot close the gap with the sources on disk.** Both maps are
source-capped, not just tier-capped:

- `gebco_08_rev_elev_21600x10800.png` — the elevation the normal is Sobel-baked from
- `world.watermask.21600x10800.png` — the NASA water mask behind the ocean channel

Both are 21600 px wide = **1.86 km/texel**. A tile pyramid from a 21600-wide source tops out
at z5 (`512 * 2^z <= 21600`), i.e. 2.45 km/texel — still 4x short of z7 albedo. So tiling
buys a second atlas, the LINEAR-format trap, two more bindings and uniform growth, and STILL
does not match. Matching would need new sources (SRTM-class elevation, a finer water mask),
which is a data problem, not a rendering one.

**The cheap gain, if the diagnostic points at either map:** `medium` -> `large` on both, one
registry line each, halving the error to 4.89 km/texel — the sources carry 2.6x more than
that needs. The catch is VRAM: an 8192 RGBA texture is 268 MB on the GPU and Earth already
binds three (surface, night, clouds), so this is ~536 MB more. That, rather than the
registry comment's "a normal map downsamples cleanly, so 4k is the useful ceiling", is
probably the real constraint — worth confirming, because a stated reason that is not the
operative one will mislead the next person to weigh it.

### Still owed

- A pass on a real iOS device. Never done, and this branch touched the Earth fragment —
  where a bad shader freezes the canvas with no thrown error.
- `EARTH_TILE_LOD_BIAS` is 1, which displays every tile at 2x magnification. It was adopted
  to hold demand inside the atlas, and the measurement above says demand was never the
  problem at this depth: bias 0 would be visibly 2x sharper between ~240 and ~950 km for an
  estimated ~44 tiles at 1600x900. Demand scales with screen AREA, so measure at the real
  window size first — a 2560x1440 window would be ~128 and genuinely over capacity.
- `glade-points` logged "Maximum update depth exceeded" (a React update loop) with
  `finalAttempt: 2` during the 2026-07-30 visual session, so that catalog likely failed to
  load. Cause unknown; nothing in this branch is on the React loading path, but the
  heartbeat change (3000 -> 500 ms) is the only nearby suspect and reverting it is the way to
  settle causality.
- The eight quadrant symlinks in this worktree's `data/raw/textures/` point at main's copies.
