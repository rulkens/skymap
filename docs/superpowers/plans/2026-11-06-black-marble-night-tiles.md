# Black Marble night tiles — plan

Spec: [`2026-11-06-black-marble-night-tiles-design.md`](../specs/2026-11-06-black-marble-night-tiles-design.md).
Branch `worktree-black-marble-night-tiles`, one PR, prep commits first (ruled yCdN).

**Strategy.** Six behaviour-neutral prep commits make "product" a table everywhere it is
branched on today, then night lands as rows plus one rect. Tools prep and runtime prep touch
disjoint files. The bake and the measurements run from the controller after the code lands.

Run notes for the controller:
- The worktree's `data/raw/` holds only committed READMEs. Fetch and bake with the main checkout
  as cwd and this worktree's scripts, so the raw files land in main (a worktree removal would
  delete them) and the bake writes `public/data/images/` there:
  `cd /Users/rulkens/Development/js/skymap && npx tsx <wt>/tools/textures/buildSurfaceTiles.ts --product night`.
- The perf gate runs (the owner's brief asked for it). One plan, one PR, so no parallelism.

---

## Prep

### Task 1: One product enumeration (P1)

**Files:** `src/layers/body/surfaceTiles/format/data/surfaceTileProducts.ts` (new),
`src/layers/body/surfaceTiles/format/@types/SurfaceTileProduct.d.ts`,
`tools/textures/buildSurfaceTiles.ts`

```ts
export const SURFACE_TILE_PRODUCTS = ['albedo', 'height'] as const;
export type SurfaceTileProduct = (typeof SURFACE_TILE_PRODUCTS)[number];
```

`bakeAll`'s default `products` (`buildSurfaceTiles.ts:423`), `main`'s default (`:612`) and
`productFlag`'s validation (`:586`, error message lists the array) read `SURFACE_TILE_PRODUCTS`.
No new test: a type sweep.

### Task 2: The imagery bake takes its product (P2)

**Files:** `tools/textures/buildSurfaceTiles.ts`, `tests/tools/textures/buildSurfaceTiles.test.ts`

Delete the module constant `PRODUCT` (`:126`). `bakeDeepestLevel` and `bakeCoarserLevel` take
`product: SurfaceTileProduct` (as the first parameter after the source/level args, implementer's
choice of position, positional like today) and use it in every `surfaceTilePath` call
(`:181`, `:237`, `:253`). `bakeAll` passes `'albedo'` and stamps `builtFrom.albedo` literally.
Existing tests' calls gain `'albedo'`. No new test.

### Task 3: Rename the quadrant reader (P5)

**Files:** `tools/textures/bmngQuadrantSource.ts` → `tools/textures/quadrantImagerySource.ts`,
`tests/tools/textures/bmngQuadrantSource.test.ts` (dragged), `tools/textures/surfaceBodies/earthSurfaceBake.ts`,
`tools/utils/io/bmngQuadrantKeys.ts`, `tests/helpers/conventions/inlineTypeFiles.ts`

```bash
# renames the symbol everywhere AND the file + its tests/ mirror (filename = export name)
npm run refactor -- rename tools/textures/bmngQuadrantSource.ts#bmngQuadrantSource quadrantImagerySource
npm run refactor -- rename tools/textures/quadrantImagerySource.ts#BmngQuadrant ImageryQuadrant --no-file-rename
```

Never `git mv` or hand-edited imports. Then fix the module header's first lines and the three `bmngQuadrantSource:` error-message
prefixes by hand, and grep for leftovers: `grep -rn "bmngQuadrantSource\|BmngQuadrant\b" src tools tests docs/*.md`.
The header keeps explaining the BMNG quadrant layout; add one line that Black Marble publishes
the same layout. No new test.

### Task 4: One stream lane per product (P3)

**Files:** `src/layers/body/surfaceTiles/stream/subsystems/surfaceTileStream.ts`,
`src/layers/body/surfaceTiles/stream/@types/SurfaceTileLaneSpec.d.ts` (new),
`src/layers/body/surfaceTiles/stream/@types/SurfaceTilePayload.d.ts` (new),
`src/layers/body/surfaceTiles/stream/data/surfaceTileLaneSpecs.ts` (new),
`src/layers/body/surfaceTiles/stream/@types/SurfaceTileStream.d.ts`,
`src/layers/body/surfaceTiles/stream/load/fetchSurfaceTileBitmap.ts`,
`src/layers/body/surfaceTiles/stream/load/fetchHeightTile.ts` (only if its return shape must change),
`src/layers/body/surfaceTiles/patch/passes/surfaceTilesPass.ts`,
`tests/layers/body/surfaceTiles/stream/subsystems/surfaceTileStream.test.ts`,
`tests/layers/body/earth/passes/earthPass.test.ts`

```ts
export type SurfaceTilePayload = {
  readonly bitmap: ImageBitmap;
  readonly subtreeRangeM: ResidentSurfaceTile['subtreeRangeM'];
  readonly gridCodes: ResidentSurfaceTile['gridCodes'];
};
export type SurfaceTileLaneSpec = {
  readonly label: string;               // 'surface-tiles-albedo' | 'surface-tiles-height'
  readonly atlasSide: number;
  readonly slotSide: number;
  readonly format: GPUTextureFormat;
  readonly fetch: (tile: SurfaceTileId, source: SurfaceTileSource) => Promise<SurfaceTilePayload | null>;
};
export const SURFACE_TILE_LANE_SPECS: Readonly<Record<SurfaceTileProduct, SurfaceTileLaneSpec>>;
// SurfaceTileStream
getAtlasView(product: SurfaceTileProduct): GPUTextureView | null; // replaces getAtlasView() + getHeightAtlasView()
```

| product | atlasSide                 | slotSide                | format            | fetch                                  |
| ------- | ------------------------- | ----------------------- | ----------------- | -------------------------------------- |
| albedo  | `SURFACE_TILE_ATLAS_SIDE` | `SURFACE_TILE_PX`       | `rgba8unorm-srgb` | `fetchSurfaceTileBitmap`, wrapped      |
| height  | `HEIGHT_TILE_ATLAS_SIDE`  | `HEIGHT_POSTS_PER_TILE` | `rgba8unorm`      | `fetchHeightTile`, mapped to a payload |

- `atlas` holds `lanes: Partial<Record<SurfaceTileProduct, Lane>>`, a lane being one
  `TileStreamSubsystem<SurfaceTilePayload, TextureAtlas>` plus its resident map. At engage build a
  lane for each product some manifest band's `builtFrom` names (`collectSurfaceTiles.ts:26` reads
  the set the same way).
- `apply`, `residentSlot`, `isInFlight`, `hasFailed`, `inFlightCount`, `heightQueryAt` and the
  evict handlers index the lane by `tile.product`; no `isHeight` remains. Upload and release use
  `payload.bitmap`; the resident record copies `subtreeRangeM`/`gridCodes` from the payload.
- `debugStats` reads `lanes.albedo` for levels/pending/capacity and `lanes.height` for its counts,
  exactly today's numbers. The pending-level map stays albedo's.
- `engage`'s `tilePx` argument goes if nothing else reads it (`derivePlannerParams` already
  pins `tilePx === SURFACE_TILE_PX`).
- Keep the `SURFACE_TILE_CONCURRENCY` per lane, as today.

Tests: existing stream tests updated for `getAtlasView('albedo' | 'height')`. No new test
(behaviour-neutral; the manifest-driven lane set gets its test in Task 7).

### Task 5: Requests loop over each product's own bands (P4)

**Files:** `src/layers/body/surfaceTiles/plan/@types/SurfaceTilePlannerParams.d.ts`,
`src/layers/body/surfaceTiles/plan/subsystems/derivePlannerParams.ts`,
`src/layers/body/surfaceTiles/plan/subsystems/cutSurfaceTiles.ts`, test fixtures that build
`SurfaceTilePlannerParams` or call `cutSurfaceTiles` by hand (find with
`grep -rln "lodBias:" tests`)

```ts
readonly requestBands: Readonly<Record<SurfaceTileProduct, readonly SurfaceTileBand[]>>;
```

- `derivePlannerParams` builds, per product `p`, the bands whose `builtFrom[p]` is set, floored
  and clamped exactly as `bands` is today. Albedo and height keep today's rule (a band needs
  BOTH built): `requestBands.albedo`, `requestBands.height` and `bands` are the one list object.
- `cutSurfaceTiles` takes `requestBands` as an input beside `bands`; `request()` (`:298`) loops
  over `SURFACE_TILE_PRODUCTS` and pushes `{ product, z, x, y }` when
  `surfaceTileInBand(requestBands[product], tilePx, z, x, y)`. Both call sites of `request()`
  drop their own `surfaceTileInBand(bands, …)` guard, which the loop now holds per product.
- Refinement (`surfaceTileBandRefineAllowed`, `maxTileLevel`, `balanceSurfaceCut`) reads `bands`
  only, unchanged.

Tests: `cutSurfaceTiles.test.ts:642`'s product list reads `SURFACE_TILE_PRODUCTS`. No new test.

### Task 6: `writePatchInstance` takes a record of vector words (P6) — review: yes

**Files:** `src/layers/body/surfaceTiles/patch/@types/PatchInstanceWords.d.ts` (new),
`src/layers/body/surfaceTiles/patch/render/surfaceTileLayout.ts`,
`src/layers/body/surfaceTiles/patch/render/surfaceTileRenderer.ts`,
`src/layers/body/surfaceTiles/stream/@types/ResolvedTileResidency.d.ts`,
`src/layers/body/surfaceTiles/plan/@types/SurfaceCutTile.d.ts`,
`src/layers/body/surfaceTiles/plan/subsystems/cutSurfaceTiles.ts`,
`src/layers/body/surfaceTiles/plan/subsystems/resolveHeightLattice.ts` (if it builds `originPosts`),
`tests/layers/body/surfaceTiles/patch/render/surfaceTileLayout.test.ts`

```ts
export type PatchInstanceWords = {
  readonly originRelEyeM: Readonly<Vec3>;
  readonly fadeWeight: number;
  readonly anchor: SurfacePatchAnchor;
  readonly albedoRect: Readonly<Vec4>;     // (origin.x, origin.y, scale.x, scale.y)
  readonly fallbackRect: Readonly<Vec4>;
  readonly heightSlotOrigin: Readonly<Vec2>;
  readonly edgeCoarser: number;            // pre-packed bits
  readonly heightCells: number;
};
export function writePatchInstance(view: DataView, base: number, words: PatchInstanceWords): void;
```

- Byte offsets unchanged (80 B, table at `surfaceTileLayout.ts:13-23`).
- `ResolvedTileResidency.atlasUvOrigin`/`atlasUvScale` (and `fallback`'s) and
  `SurfaceCutTile.height.originPosts` become `Readonly<Vec2>` (`src/@types/math/Vec2.d.ts`); no
  raw `[number, number]` tuples left in those three types. Check `ResidentLookupResult` in
  `cutSurfaceTiles.ts:18` and `ResidentSlot` the same way.
- The renderer builds one `PatchInstanceWords` per tile.

Test: `surfaceTileLayout.test.ts` keeps its per-field offset assertions, now written through the
record. No new test.

---

## Feature

### Task 7: The night product, lane and request bands

**Files:** `src/layers/body/surfaceTiles/format/data/surfaceTileProducts.ts`,
`src/layers/body/surfaceTiles/format/utils/surfaceTilePath.ts`,
`src/layers/body/surfaceTiles/format/data/surfaceTileParams.ts`,
`src/layers/body/surfaceTiles/stream/data/surfaceTileLaneSpecs.ts`,
`tests/layers/body/surfaceTiles/stream/subsystems/surfaceTileStream.test.ts`,
`tests/layers/body/surfaceTiles/plan/subsystems/derivePlannerParams.test.ts`

- `SURFACE_TILE_PRODUCTS = ['albedo', 'height', 'night']`; `EXT.night = 'webp'`.
- `NIGHT_TILE_ATLAS_SIDE = 4096` in `surfaceTileParams.ts` (64 slots of 512, 64 MB), with a
  one-line why (z≤7 tiles only; a z13 view needs a handful of z7 ancestors).
- Lane row: `{ label: 'surface-tiles-night', atlasSide: NIGHT_TILE_ATLAS_SIDE, slotSide: SURFACE_TILE_PX, format: 'rgba8unorm-srgb', fetch: <albedo's> }`.

Tests:
- `surfaceTileStream`: "builds no night atlas when the manifest names no night product" —
  engage on a manifest whose bands' `builtFrom` has only albedo + height →
  `getAtlasView('night')` is `null`, `getAtlasView('albedo')` is not; and one whose global band
  adds `night` → `getAtlasView('night')` is not `null`.
- `derivePlannerParams`: "night request bands are the bands that built night, and refinement
  ignores them" — a manifest with a z3–z7 band (albedo + height + night) and a z8–z13 band
  (albedo + height) → `requestBands.night` has one band `{min: max(3, base+1), max: 7}`,
  `bands` has both, `requestBands.albedo === bands`.

### Task 8: The cut resolves each leaf's night rect

**Files:** `src/layers/body/surfaceTiles/plan/@types/SurfaceCutTile.d.ts`,
`src/layers/body/surfaceTiles/plan/subsystems/cutSurfaceTiles.ts`,
`tests/layers/body/surfaceTiles/plan/subsystems/cutSurfaceTiles.test.ts`

```ts
readonly night: Pick<ResolvedTileResidency, 'atlasUvOrigin' | 'atlasUvScale'> | null;
```

- `nightMax` = the deepest `max` in `requestBands.night`, computed once per call (`-1` when
  empty → every leaf's `night` is `null`, no climb).
- Per leaf: `deepestResidentAncestor({ product: 'night', z: min(z, nightMax), x: x >> d0, y: y >> d0 }, baseLevel, residentSlot)`
  with `d0 = z - min(z, nightMax)`, then `flattenAtlasRect(found, d0 + levelDelta, x, y)`.
- A leaf with no night rect is still pushed; only albedo + height residency gate the cut.

Tests:
- "a z13 leaf draws its z7 ancestor's night sub-rect" — night resident only at z7 tile
  `(x >> 6, y >> 6)` with origin `[0.25, 0.5]`, scale `[1/16, 1/16]`; leaf `(z13, x, y)` →
  `night.atlasUvScale` is `[1/16/64, 1/16/64]` and the origin is offset by the leaf's low 6 bits
  of `x`/`y` times that scale.
- "night never asks for a tile below the night bands" — no request with `product: 'night'` and
  `z > 7`; requests for z≤7 in-band tiles include night.
- "a leaf with no resident night is still drawn" — albedo + height resident, no night →
  the leaf is in `cut` with `night: null`.

### Task 9: Night reaches the fragment — review: yes

**Files:** `src/layers/body/surfaceTiles/patch/@types/PatchInstanceWords.d.ts`,
`src/layers/body/surfaceTiles/patch/render/surfaceTileLayout.ts`,
`src/layers/body/surfaceTiles/patch/render/surfaceTileRenderer.ts`,
`src/layers/body/surfaceTiles/patch/render/surfaceTileShaderVariants.ts`,
`src/layers/body/surfaceTiles/patch/@types/SurfaceEffectInputs.d.ts`,
`src/layers/body/surfaceTiles/patch/passes/surfaceTilesPass.ts`,
`src/services/gpu/shaders/bodies/surfaceTile/io.wesl`,
`src/services/gpu/shaders/bodies/surfaceTile/vertex.wesl`,
`src/services/gpu/shaders/bodies/surfaceTile/surfaceLighting.wesl`,
`src/services/gpu/shaders/bodies/surfaceTile/fragmentEarth.wesl`,
`tests/layers/body/surfaceTiles/patch/render/surfaceTileLayout.test.ts`,
`tests/services/gpu/shaders/constants.parity.test.ts`

`PatchInstance`, 96 B (stride must stay a multiple of 16):

| offset | size | field                       |
| -----: | ---: | --------------------------- |
|      0 |   12 | `originRelEyeM`             |
|     12 |    4 | `fadeWeight`                |
|     16 |   16 | `lon0/lat0/dLon/dLatRad`    |
|     32 |   16 | `albedoRect`                |
|     48 |   16 | `fallbackRect`              |
|     64 |   16 | `nightRect` (new)           |
|     80 |    8 | `heightSlotOrigin`          |
|     88 |    4 | `edgeCoarser`               |
|     92 |    4 | `heightCells`               |

- `PatchInstanceWords.nightRect: Readonly<Vec4>`; the renderer writes `[0, 0, 0, 0]` for
  `night === null`. `PATCH_INSTANCE_BYTES = 96`; both header comments (io.wesl, layout) updated.
- `VSOut` gains `@location(11) @interpolate(flat) nightRect: vec4<f32>`; `vertex.wesl` forwards it.
- `surfaceLighting.wesl`: `resolveTileAtlasUv(origin, scale, uv, halfTexel)`;
  `const NIGHT_TILE_ATLAS_SIDE: f32 = 4096.0;` mirrored beside `SURFACE_TILE_ATLAS_SIDE`, its
  half-texel beside the albedo one; `tileAlbedo` passes the albedo half-texel.
- `fragmentEarth.wesl`: `@group(0) @binding(10) var nightAtlas: texture_2d<f32>;`

  ```wgsl
  let globalNight = textureSample(nightTexture, baseSampler, equirectUv).rgb;
  let tileNight = textureSampleLevel(nightAtlas, atlasSampler,
      resolveTileAtlasUv(in.nightRect.xy, in.nightRect.zw, in.uv, NIGHT_TILE_ATLAS_HALF_TEXEL), 0.0).rgb;
  let nightColour = select(globalNight, tileNight, in.nightRect.z > 0.0);
  ```
  Both samples stay unconditional (the global one needs uniform control flow). The emissive
  term below is unchanged. Comments single-quoted (WESL).
- Variant row: `'cloudShadows+materialMap+nightLights': { fragment: fragmentEarth, bindings: [3, 5, 6, 7, 9, 10] }`;
  binding 10 is `{ visibility: FRAGMENT, texture: { sampleType: 'float' } }`, resource
  `nightLights.atlasView`.
- `SurfaceEffectInputs.nightLights: { view; atlasView }`. The pass sets
  `atlasView: stream.getAtlasView('night') ?? <the global night view>`, with a one-line why: no
  night lane means every rect is zero-scale, so the stand-in is bound but never read.

Tests:
- Layout: per-field offsets for all nine fields at 96 B, written through the record
  (`nightRect` words at 64..79, `heightSlotOrigin` at 80).
- Parity: `NIGHT_TILE_ATLAS_SIDE` (TS ↔ `surfaceLighting.wesl`), following the existing
  `SURFACE_TILE_ATLAS_SIDE` row at `constants.parity.test.ts:274`.

### Task 10: Black Marble raw data and fetch

**Files:** `tools/utils/io/rawDataRegistry.ts`, `tools/utils/io/blackMarbleQuadrantKeys.ts` (new),
`tools/fetch/fetchTextures.ts`, `data/raw/textures/README.md`

- Eight rows `textures.blackMarbleQuadrant{A1,A2,B1,B2,C1,C2,D1,D2}`:
  `path: data/raw/textures/BlackMarble_2016_<Q>.jpg`, gitignored, upstream
  `https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/144000/144898/BlackMarble_2016_<Q>.jpg`,
  description with the lon/lat span (as the BMNG rows), "21600x21600 JPG, 500 m", the credit
  "NASA Earth Observatory / NASA Goddard Space Flight Center, Suomi NPP VIIRS", fetcher, readme.
- `textures.earthNight.upstream` moves to the same host (`…/144898/BlackMarble_2016_3km.jpg`).
- `BLACK_MARBLE_QUADRANT_KEYS` shaped like `bmngQuadrantKeys.ts` (`satisfies Record<ImageryQuadrant, RawDataKey>`).
- `fetchTextures.ts`: the quadrant list covers both key sets; `BLACK_MARBLE_QUADRANTS_APPROX_MB = 250`
  joins `FULL_FETCH_APPROX_MB`.
- README: the eight files, sizes, and a sha256 per file once fetched (the controller fills the
  hashes after Task 13's fetch).

No new test (registry rows and a list).

### Task 11: The bake bakes night

**Files:** `tools/textures/@types/SurfaceBakeBand.d.ts`, `tools/textures/buildSurfaceTiles.ts`,
`tools/textures/surfaceBodies/earthSurfaceBake.ts`, `tests/tools/textures/buildSurfaceTiles.test.ts`

- `SurfaceBakeBand.night?: SurfaceImagerySource`.
- `bakeAll`, after the height block: when `night !== undefined && products.has('night')`, throw
  if `night.maxLevel !== source.maxLevel` (message like the height one at `:491`), then
  `bakeDeepestLevel(night, uvBands, maxLevel, …, 'night')` and `bakeCoarserLevel` per level
  with `'night'`, no underfill, `deepSource: night`. Progress lines say "night tiles".
  `builtFrom.night` is stamped only then.
- Earth's global band: `night: await blackMarbleSource()`, built by `quadrantImagerySource` with
  `id: 'nasa-black-marble-2016-quadrants'`, `vintage: '2016'`, attribution
  `NASA Black Marble 2016 night lights (credit NASA Earth Observatory / NASA Goddard Space Flight Center, Suomi NPP VIIRS).`,
  quadrant paths from `BLACK_MARBLE_QUADRANT_KEYS`. Not in `--dev`.

Test: "a night-only run bakes night tiles and keeps the other products' provenance" — a prior
manifest + index from an albedo + height run over a tiny fake band (the test file's existing
fixtures), then `bakeAll(…, new Set(['night']))` with the band's `night` set to a fake source →
`night/<z>/<x>/<y>.webp` exists for every albedo tile of the band, the manifest band's `builtFrom`
has `albedo`, `height` and `night`, and the albedo files are byte-identical to before.

### Task 12: Docs and backlog

**Files:** `docs/DATA.md`, `docs/RENDERER.md`, `docs/DEPLOY.md`, `docs/BACKLOG.md`,
`docs/backlog/2026-11-06-night-lights-from-eox-structure.md` (new)

- DATA.md, surface tile section: night is a third product over the global band, z3–z7, from
  Black Marble 2016 500 m; sizes from Task 14. Archives paragraph: the rule becomes
  "**No published file ever changes**: changed or added tiles in a product's level mean a new
  prefix, because one added tile shifts every offset after it; a new product's archives are new
  files and may join a published prefix." Refresh-order row unchanged except Black Marble rides
  `fetch-textures`.
- RENDERER.md, "The surface tile walk resolves TWO products": three products; night is requested
  from its own bands, never steers refinement, and a leaf with no resident night shows the global
  texture through a zero-scale rect.
- DEPLOY.md "Earth tile versioning": same rule wording if it repeats the old one.
- Backlog line: `**Night lights from EOX structure below z7** \`needs-design\` — a spike to shape z8+ night detail from the day tiles. → [details](…)`;
  the detail file (≤ 15 lines): idea, why Black Marble stops at z7 (500 m source), risk (inventing
  lights), how to judge it (Copenhagen at 50 km).

---

## Run (controller)

### Task 13: Fetch and perf-before

- Announce the ~250 MB download, then fetch only the eight Black Marble files into main's
  `data/raw/textures/` (cwd main, this worktree's `fetchTextures.ts`; if it has no subset flag,
  `curl` the eight upstream URLs from the registry). Record sha256 into the README (Task 10).
- `npm run perf` before: a dev server on a scratch checkout of `main`
  (`git worktree add --detach`), scenario `earth-surface`, `--url` that server.

### Task 14: Bake and measure

- Hash every `earth-tiles/v11/{albedo,height}/z*.{idx,p*.pack}` (sha256) before.
- `buildSurfaceTiles.ts --product night` (cwd main). Then re-hash: every albedo/height archive
  must be unchanged; any difference halts for the owner's ruling. `git status` in main must show
  no tracked change from `buildSiteGroundHeights`.
- Report: night tile count per level, night archive bytes (z3–z7) beside albedo's for the same
  levels, and the R2 sync size (night `.idx` + `.pack` + `manifest.json`).

### Task 15: Perf-after and eye check

- `npm run perf` after, same scenario and settings.
- Shots, before (scratch main server) and after (this branch's server), `#focus=body-earth` with
  a night-side `t` (local night over Denmark): Copenhagen at ~50 km and ~500 km, Europe at
  ~3,000 km. Show each pair as one dash check.

### Task 16: Close out

`/feature-done`, deletion audit, PR. The owner syncs R2 and merges.

---

## Definition of Done

**Deliverables**
- `SURFACE_TILE_PRODUCTS` with `night`; `SURFACE_TILE_LANE_SPECS` with three rows;
  `getAtlasView(product)`; `requestBands`; `SurfaceCutTile.night`; `PatchInstanceWords`;
  `PatchInstance` at 96 B with `nightRect`; binding 10 in the Earth variant;
  `quadrantImagerySource`; `BLACK_MARBLE_QUADRANT_KEYS` and eight registry rows;
  `SurfaceBakeBand.night`.
- `earth-tiles/v11/night/z{3..7}.idx` + parts in main's `public/data`, `manifest.json`'s global
  band naming `night`; albedo and height archives hash-identical to before.
- DATA.md, RENDERER.md (and DEPLOY.md if needed) updated; backlog item + detail file for the
  EOX-structure spike.

**Observable behaviours**
- Copenhagen at night, ~50 km: city lights resolve to the z7 tile's detail (street-grid scale
  blobs at ~600 m), not the global texture's ~5 km blur.
- Copenhagen at night, ~500 km, and Europe at ~3,000 km: same brightness and colour as before at
  a glance, sharper.
- Day side: no night lights anywhere (the datum-normal gate unchanged).
- Mars at Jezero: unchanged.
- Perf `earth-surface` within noise of before.
- Numbers reported: night archive bytes, R2 sync size, perf before/after.

**Deferral boundary**
- Night detail below z7 (backlogged spike), a night crossfade, day-side fetch skipping, the R2
  sync itself (the owner's).
