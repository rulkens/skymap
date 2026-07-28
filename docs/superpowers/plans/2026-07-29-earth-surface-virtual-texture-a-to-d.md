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
   is the single home: the engage gate is `plan.zWin > minLevel`, read off the plan the
   planner already produced. Test 2's altitude anchor is asserted against `planEarthTiles`
   directly.

## Definition of done

- [ ] `npm run typecheck` clean (src + tools).
- [ ] `npm test` green, with tests 1 to 8 from the spec's "Testing" section present.
- [ ] Descending to Earth visibly sharpens the surface past the base texture's limit, with
      no hole, no black tile and no pop.
- [ ] Turning the camera away and back does not thrash the atlas.
- [ ] Checked on a real iOS device (a bad shader freezes the canvas with no thrown error).
- [ ] `entanglement-radar` run over the finished diff (task D7).
- [ ] `docs/RENDERER.md` gains the virtual texture in its renderer map.

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

- [ ] Add the two `@types` files. One type per file, no barrel.
- [ ] Add `earthTileParams.ts` with the table above.
- [ ] Add `earthTilePath.ts`.
- [ ] **No test.** Per `testing.md` and the spec's "Nothing else earns a test", a test over
      `earthTilePath`'s output string restates the format, and a test over the constants
      restates the table. The anti-drift guarantee comes from there being one caller-shared
      function, not from an assertion.
- [ ] `npm run typecheck`. Commit.

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

- [ ] **Spec test 1 — tile-address round trip.** `tests/utils/scene/earthTileXyForUv.test.ts`:
      for a spread of tiles across z = 5..13 including the four corners of each level and the
      antimeridian column, assert
      `earthTileXyForUv(earthTileCentreUv([x, y], z, 512), z, 512)` deep-equals `[x, y]`.
      This catches an off-by-one in either the `1 - v` flip or the `cols / 2` row count, both
      of which read on a globe as "the texture is subtly wrong" rather than as a break.
- [ ] Add one assertion in `earthTexelMetres.test.ts` anchoring z = 4 to 4892 m/texel, which
      is the spec's own "equals today's base" claim and the anchor the whole ladder hangs on.
      Nothing else in that file.
- [ ] `npm test -- earthTile`. Commit.

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

- [ ] **Spec test 2 — level from texel density, hand-computed anchor.** A nadir-facing camera
      at a stated altitude, `fovY = 40°`, viewport 1440 px. Assert the plan's `zWin` equals
      the level worked out on paper from
      `groundMetresPerPixel = h * 2 * tan(fovY / 2) / viewportHeightPx` against
      `earthTexelMetres(z)`. **Put the arithmetic in the test's comment**, so a future reader
      can re-derive it rather than trusting the number. Then assert monotonicity: halving the
      altitude raises `zWin` by exactly one, over at least three consecutive halvings.
      A wrong exponent here starves or thrashes the atlas and is invisible on screen except
      as vague blurriness.
- [ ] **Spec test 3 — clamp to `maxLevel`.** One assertion: with `maxLevel: 5` and a camera
      low enough to want z11, no request exceeds z5. Without it, a shallower pyramid draws a
      sustained 404 storm on every close approach.
- [ ] **Spec test 4 — the far hemisphere is rejected.** A nadir plan contains the sub-camera
      tile at `zWin`, and contains no tile whose four corners all satisfy
      `dot(corner, camPosLocal) < 1`. Roughly half the fetches and half the atlas ride on
      this and no compiler check reaches it.
- [ ] Implement steps 1 to 4. Keep it pure — no clock, no module state.
- [ ] `npm test -- planEarthTiles`. Commit.

### Task A4: the window, and the antimeridian (spec test 5)

**Files:** `src/utils/scene/planEarthTiles.ts` (modify), its test (modify).

The window is derived first, from the sub-camera point and the deepest level step 3 found,
then step 5 rejects any leaf outside the `EARTH_TILE_WINDOW_SIDE` box. Enforced in the
planner, never in the shader (spec design 2): a tile outside the window is never requested,
never resident, and never needs representing.

The wrapping subtraction the fragment will mirror is `dx = (px + cols - winX0) % cols`.

- [ ] **Spec test 5 — the window contains every emitted leaf, across the antimeridian.**
      A plan centred at longitude 180 must emit leaves on **both** sides of the seam, and
      every emitted leaf must map into `[0, windowSide)` after the wrapping subtraction.
      Assert the both-sides part explicitly — a window that silently emitted nothing west of
      the seam would pass a naive containment check. This is the one place the window
      arithmetic can be wrong in a way that shows only in the Pacific.
- [ ] Implement window derivation + step 5.
- [ ] `npm test -- planEarthTiles`. Commit.

### Task A5: `buildEarthPageTable` (spec tests 6, 7)

**Files:** `src/utils/scene/buildEarthPageTable.ts` (new),
`tests/utils/scene/buildEarthPageTable.test.ts` (new).

**Signature:**

```ts
buildEarthPageTable(input: {
  /** tile key -> atlas slot index, the atlas's authoritative resident set. */
  readonly resident: ReadonlyMap<string, number>;
  readonly plan: EarthTilePlan;
  readonly slotsPerRow: number;
  readonly windowSide: number;
  /** tile key -> blend weight 0..1 (the load fade); absent means 1. */
  readonly weight: ReadonlyMap<string, number>;
}): Uint8Array;   // windowSide * windowSide * 4, RGBA8UI
```

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

- [ ] **Spec test 6 — the finest resident ancestor wins.** Given a resident set holding a
      coarse tile and ONE of its four fine descendants, assert the cells under the descendant
      name the FINE slot and its sibling cells name the COARSE slot. This single property IS
      the graceful-degradation mechanism of design 5; if it regresses you get holes or
      wrong-area sampling.
- [ ] **Spec test 7 — a rebuilt table never names an evicted slot.** Drive a real
      `TextureAtlas` (constructed with the Earth geometry, no `initTexture`, so no GPU) past
      full so `allocate` evicts, rebuild, and assert no cell points at the recycled slot.
      A regression test by construction against the named landmine.
- [ ] Assert `A === 0` everywhere for an empty resident set — the identity case that makes
      the feature strictly additive. One line, and it is the thing every degradation path
      collapses to.
- [ ] Implement.
- [ ] `npm test -- buildEarthPageTable`. Commit.

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

- [ ] Add both `.d.ts` files, one type each.
- [ ] Implement `equirectFileSource` against `textures.nasaBmng` (21600 × 10800,
      `rawDataRegistry.ts:597-607`). `readBox` extracts the lon/lat box with `sharp` (already
      a dependency at 0.34.5) and resizes to the requested pixel size. Alpha is 255
      everywhere — BMNG has no no-data. Return `null` never, since coverage is global.
- [ ] `maxLevel: 5`. z5's equirect width is `512 << 5 = 16384`, which is under 21600, so the
      pyramid is a genuine downsample and never an upscale. z6 would be 32768 and would be
      inventing detail.
- [ ] **No test.** `EarthImagerySource` conformance is a compiler check and the pixels are
      judged by eye in task B2.
- [ ] `npm run typecheck`. Commit.

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

- [ ] Add `"build-earth-tiles": "tsx tools/textures/buildEarthTiles.ts"` to `package.json`.
- [ ] Implement. Surface tiles are lossy WebP quality 82, sRGB, **with** an alpha channel
      (design 7) even though BMNG's alpha is uniformly 255 — the channel's presence is what
      Phase C and D are built against.
- [ ] `flipY: false` orientation: row 0 of every tile is its NORTH edge. The reconciliation
      with the mesh's south-first `v` happens in the tile-index arithmetic (task A2), in one
      place, not per upload.
- [ ] Run it. 512 tiles at z5, no network.
- [ ] **Visual check before wiring anything:** open a handful of tiles as flat files —
      one mid-latitude, one polar, one spanning the antimeridian — and confirm they are the
      right patch of Earth the right way up. A wrong flip caught here costs a minute; caught
      in Phase D it looks like a shader bug.
- [ ] **No test.** No GPU, no assertion worth making; the output is judged by eye.
- [ ] Commit. Do NOT commit the emitted tiles — confirm `public/data/images/earth-tiles/` is
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

- [ ] Add the type and the fetcher.
- [ ] **No test.** The shape is enforced by its type at the one parse site; the null-on-failure
      path is exercised by the identity case, which task A5 already asserts.
- [ ] `npm run typecheck`. Commit.

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

- [ ] `PriorityQueue` is constructed with `EARTH_TILE_CONCURRENCY`. Note that
      `bitmapStreamSubsystem.ts:73` currently does `new PriorityQueue()` with no argument;
      the limit must reach it, so `BitmapStreamDeps` gains an optional `concurrency` field
      rather than the tile subsystem reaching around the seam.
- [ ] Wire `setEvictHandler` to drop the evicted key's `bitmapReadyTime` entry, the same way
      `texturedDiskSubsystem` does.
- [ ] Implement lazy allocation on first engage, and `destroy()`.
- [ ] **No test.** Every line of it is GPU, network or clock. The arithmetic it calls is
      already covered by Phase A.
- [ ] `npm run typecheck`. Commit.

### Task C3: the drive site and the engage gate

**Files:** `src/services/engine/frame/runFrame.ts` (modify),
`src/services/engine/state/*` (wire the subsystem in alongside the existing ones).

Drive it beside the existing disk-planner drive site (`runFrame.ts:503-549`), which is the
established home for per-frame CPU planners.

**Engage gate, one rule (see "Corrections" above):** run `planEarthTiles`; engage when
`plan.zWin > minLevel`. Before Earth is close enough for that to be true the planner's own
early rejections make it cheap, and the whole block is skipped when the Earth layer is
disabled — so the common case (anywhere outside the inner solar system) costs one comparison.

- [ ] Add the drive site, gated on the same handles `earthLayer.enabled` checks.
- [ ] Wake rules: a landed tile wakes the loop via `BitmapStreamSubsystem`'s existing
      `requestRender`, and a mid-fade tile keeps it ticking through the fade. Subsystems
      never wake themselves (`project_render_wake_consolidation`) — surface the vote, let
      `shouldKeepTicking` decide, exactly as `prepareStarCut` does at `runFrame.ts:561-574`.
- [ ] **Verify with no shader change:** descend to Earth in the dev server, watch the Network
      tab. Tiles must arrive largest-on-screen-first, at most 4 concurrently, and **stop**
      when the camera stops. A sustained stream while stationary means the planner is
      oscillating at a level boundary — fix that here, before the shader can mask it.
- [ ] Commit.

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

- [ ] Extend the module header's byte-layout table — it is the single source of truth for
      this struct and a layout comment that lies is worse than none.
- [ ] **Spec test 8 — byte offsets.** Extend the existing test to assert the three new fields
      land at f32 29..31 and that the length is still 32. This is a keep-rule test per
      `testing.md`: a WGSL/TS layout drift is invisible until iOS silently drops the frame.
- [ ] Update the WGSL struct's trailing pad to the three named fields, same order.
- [ ] `npm test -- packEarthSurfaceUniforms`. Commit.

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

- [ ] Add the layout entries, the placeholders, and a `setTileResources(pageTable, atlas)`
      that rebuilds the bind group, mirroring `setMap`'s rebuild at `:532-534`.
- [ ] **No test.** GPU resource wiring; the visual pass covers it.
- [ ] `npm run typecheck`. Commit.

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

- [ ] Meticulous WESL pass. **Single quotes in comments, never backticks** (they are a parse
      error). `?static` imports. Read the whole file before editing.
- [ ] **Tint probe before trusting it.** False-colour the page table's `B` channel (level) to
      screen and confirm the level bands move sensibly with altitude, then false-colour `A`
      and confirm it is 0 outside the window and 1 under resident tiles. Do this BEFORE
      wiring the real `mix` — a wrong window is invisible in the final image and obvious in
      false colour (`feedback_shader_tint_probe`).
- [ ] Wire the real `mix(baseAlbedo, tile.rgb, w)`.
- [ ] Commit.

### Task D4: the fade

**Files:** `src/services/engine/subsystems/earthTileSubsystem.ts` (modify).

The `A` channel carries the per-cell blend weight, ramped by `loadFadeAlpha` over
`EARTH_TILE_FADE_MS = 400` — the same duration the thumbnail crossfade uses
(`texturedDiskSubsystem.ts:50`). The page table is rebuilt every frame while any tile is
mid-fade, which is also what keeps the render-on-demand loop ticking through it.

- [ ] Implement the per-tile fade weight into the page-table rebuild.
- [ ] **Named limitation, do not try to fix it here:** a z→z+1 handoff is a hard sharpness
      step, not a crossfade, because `A` is already 1 and only the slot pointer changes.
      That is how every clipmap looks. If it reads badly in D6, the escalation is spec
      design 5's `rgba16uint` two-slot table, gated on an `npm run perf` measurement.
- [ ] Commit.

### Task D5: docs

**Files:** `docs/RENDERER.md` (modify).

- [ ] Add the virtual texture to the renderer map: the subsystem, the page table, the atlas,
      and the one landmine worth writing down — that the page table is rebuilt whole and
      never patched, and why.
- [ ] Commit.

### Task D6: the visual pass

No code by default. Run the spec's "Verification" list, in Chrome DevTools with cold-cache
discipline, then on a real iOS device.

- [ ] The surface refines progressively past the base texture's limit and does not pop.
- [ ] No hole, no black tile, ever.
- [ ] Tile seams along a terminator and along a coastline at high magnification — this is
      where a half-texel clamp error or a wrong `flipY` shows.
- [ ] The window frontier: pan hard sideways at low altitude; the far limb dropping to base
      resolution must not be an obvious moving edge.
- [ ] Turn away and back: no atlas thrash.
- [ ] **iOS on a real device.** A bad shader freezes the whole canvas with no thrown error.
- [ ] **Answer Q1 here.** With the surface sharp at z5 and relief still whole-globe, judge
      whether the lighting reads plastic against the sharp colour. Record the answer in the
      spec's Q1 section either way — a deferred question that never gets written down
      becomes a re-litigation later.

### Task D7: entanglement radar

- [ ] Run the `entanglement-radar` skill over the full A-to-D diff. Specific things to point
      it at: whether the page table ended up braided to anything other than the atlas's
      resident set, whether the engage gate stayed one rule or grew a second, and whether
      `EarthTileKind` being a one-member union in practice has leaked "surface" assumptions
      into places the normal path would have to unpick.
- [ ] Act on what it finds, or record why not.

---

## Not in this plan

- **Phase E** — the real imagery source, the colour grade, the registry rows, the Splash
  attribution. Gated on Q2 and on an explicit go-ahead for the download with its size stated.
- **Phase F** — `collectEarthTiles`, the resumable R2 sync, `docs/DEPLOY.md`, the perf pass.
- Everything in the spec's "Non-goals", which includes camera surface-directed zoom, geometry
  LOD, elevation displacement, and tiling night/clouds/material.
