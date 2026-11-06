# Black Marble night tiles — design

Status: approved shape (ground check, ask yCdN, 2026-11-06). Worktree `black-marble-night-tiles`.

## Intent

Earth's day side is tiled down to EOX's 9.55 m/px, but its night lights come from one global
texture, `textures.earthNight`: the 13500×6750 Black Marble 2016 3 km file, capped at 8192 wide
by the texture build (`tools/textures/tiersFittingSourceWidth.ts`), about 4.9 km/px. Every surface
tile samples it (`surfaceTilesPass.ts:67` → binding 7), so the tour's night rise over Copenhagen
shows blurred lights. This change bakes NASA Black Marble 2016 at 500 m into Earth's tile pyramid
as a third product, `night`, at z3–z7, the same depth Blue Marble reaches.

## Goals

- Night lights at z7 (65536 texels around the equator, ~611 m/texel) across the whole Earth.
- A tile deeper than z7 draws its z7 ancestor's night texels through a sub-rect.
- With no night tile resident, a patch shows today's global night texture, so a cold start, an
  old manifest and Mars all look as they do now.
- Before and after `npm run perf`; a before/after eye check at three night poses.
- Measured night archive bytes and the R2 sync size, reported before the owner's sync.

## Non-goals

- Street-level night structure below z7 borrowed from the EOX day tiles. Backlogged as a spike.
- A crossfade when a night tile lands. Height has none either; the albedo crossfade stays as is.
- Skipping night fetches on the day side. Mostly-black tiles are small; revisit only if the
  loadtime or perf numbers say so.
- Changing the whole-globe night texture, the base globe shader, or Mars.

## Constraints

- Source (verified 2026-11-06): eight 21600×21600 JPEGs `BlackMarble_2016_{A,B,C,D}{1,2}.jpg` under
  `https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/144000/144898/`
  (A1 200, 30,825,698 B; D2 200, 14,400,257 B). Same quadrant layout as Blue Marble: columns A–D
  west to east in 90° steps from −180, row 1 north, row 2 south. ~250 MB total.
- Licence: NASA media guidelines; credit NASA Earth Observatory / NASA Goddard Space Flight
  Center, Suomi NPP VIIRS (today's `textures.earthNight` wording).
- Ruled (yCdN): night archives go under the live `earth-tiles/v11` prefix. They are new files;
  no published file changes, and `manifest.json` sits at `earth-tiles/`, outside the prefix.
  The DATA.md rule is restated as **no published file ever changes**, which is what rclone's
  `--immutable` enforces. Re-packing albedo and height must reproduce their archives byte for
  byte (the packer is deterministic); the plan checks the hashes.
- The owner runs every R2 write.
- Deployed code ignores `builtFrom.night` (`derivePlannerParams` checks only albedo and height),
  so old and new code read the same manifest.
- Ruled: one PR, prep commits first.

## Ground preparation

The `refactor-ground` checkpoint was shown 2026-11-06 and signed off (ask yCdN). 14 touchpoints,
4 bolt-ons, so 4 prep commits, plus the rename the owner took (P5) and the patch-instance record
the owner asked for mid-design (P6). The greenfield cross-check agreed on a per-product lane table,
per-band `builtFrom`, and a sentinel rect with a whole-globe fallback.

**Prep, in order (each its own commit, behaviour-neutral):**

- **P1 — one product enumeration.** `SURFACE_TILE_PRODUCTS = ['albedo', 'height'] as const` in
  `format/data/surfaceTileProducts.ts`; `SurfaceTileProduct` becomes
  `(typeof SURFACE_TILE_PRODUCTS)[number]`. The bake's default product set
  (`buildSurfaceTiles.ts:423`, `:612`) and `--product` validation (`:586`) read it.
- **P2 — the imagery bake takes its product.** `bakeDeepestLevel` and `bakeCoarserLevel` gain a
  `product` parameter in place of the module constant `PRODUCT = 'albedo'` (`:126`).
- **P3 — one stream lane per product.** `surfaceTileStream`'s two hard-wired lanes and its
  `isHeight` branches (`:196`, `:253`, `:258`) become a table of lanes keyed by product, each
  built from a `SurfaceTileLaneSpec` row. `getAtlasView()` + `getHeightAtlasView()` become
  `getAtlasView(product)`.
- **P4 — requests loop over each product's own bands.** `SurfaceTilePlannerParams` gains
  `requestBands`; `cutSurfaceTiles`' `request()` (`:298`) loops over it instead of pushing
  albedo and height by hand. `bands` stays the refinement list.
- **P5 — rename `bmngQuadrantSource` → `quadrantImagerySource`** (move-files + refactor rename),
  since Black Marble reads through it too.
- **P6 — `writePatchInstance` takes a record.** Its 22 positional numbers become one
  `PatchInstanceWords` record of `Vec2`/`Vec3`/`Vec4` words, so night's rect is a field, not four
  more positions; the cut types feeding it move off raw tuples onto the same aliases.

**Growth (plain additions after the prep):** `'night'` in the product array and the `EXT` map;
the night lane row; `night?` on `SurfaceBakeBand`; Black Marble's registry rows, quadrant keys and
fetch list; the cut leaf's `night` rect; `nightRect` in `PatchInstance`; binding 10 in the Earth
variant; `nightLights.atlasView`. The packer and `collectSurfaceTiles` already walk whatever
products the manifest names.

**Rejected:**
- A third `nightStream` beside the two lanes: a third branch at every site.
- `nightBands` on the planner params: a field only night reads.
- Requests from a post-pass over drawn leaves (greenfield's pick): the walk already requests
  every in-band ancestor on its way down, so a z13 leaf's z7 night ancestor is requested anyway.
- `jobs: { product, source }[]` per bake band (greenfield): ruled out in yCdN; it rewrites both body
  bakes around a union for one row.
- Pinning the 32 z3 night tiles so an ancestor always exists: z3 is ~10 km/px, coarser than the
  global texture, and costs a boot fetch.
- A v12 prefix: re-uploads ~600 MB of unchanged albedo and height (ruled in yCdN).

## Data

### Products

```ts
// src/layers/body/surfaceTiles/format/data/surfaceTileProducts.ts
export const SURFACE_TILE_PRODUCTS = ['albedo', 'height', 'night'] as const;
// src/layers/body/surfaceTiles/format/@types/SurfaceTileProduct.d.ts
export type SurfaceTileProduct = (typeof SURFACE_TILE_PRODUCTS)[number];
```

`surfaceTilePath`'s `EXT` gains `night: 'webp'`. Night tiles are lossy WebP at the albedo quality,
RGB with an opaque alpha (Black Marble has no no-data).

### Manifest

No type change. The global band's `builtFrom` gains `night`:

```json
"builtFrom": { "albedo": {…}, "height": {…}, "night": { "sourceId": "nasa-black-marble-2016-quadrants", "attribution": "…", "vintage": "2016" } }
```

### Bake band

```ts
// tools/textures/@types/SurfaceBakeBand.d.ts
readonly night?: SurfaceImagerySource; // baked over this band's own levels, no underfill
```

Earth's global band sets `night: quadrantImagerySource({ id: 'nasa-black-marble-2016-quadrants',
… quadrantPaths: from BLACK_MARBLE_QUADRANT_KEYS })`. The source's `maxLevel` must equal the band's
(z7; `levelFittingWidth(86400)`); `bakeAll` throws otherwise, as it does for height. Night bakes
with the same two functions as albedo (`product: 'night'`), deepest level from the source, coarser
levels as 2×2 averages read back off disk. `builtFrom.night` is stamped only when `products` has
`night`. `--product night` bakes night alone onto an existing tree; `mergeSurfaceTileManifest`
keeps the other products' provenance.

### Raw data

- `tools/utils/io/blackMarbleQuadrantKeys.ts`: `BLACK_MARBLE_QUADRANT_KEYS`, shaped like
  `BMNG_QUADRANT_KEYS` (`satisfies Record<BmngQuadrant, RawDataKey>`, with the quadrant type
  renamed by P5 to `ImageryQuadrant`).
- Eight `rawDataRegistry` rows `textures.blackMarbleQuadrant{A1…D2}` →
  `data/raw/textures/BlackMarble_2016_<Q>.jpg`, gitignored, upstream on the
  `assets.science.nasa.gov` host. `textures.earthNight`'s upstream moves to that host too
  (`eoimages.gsfc.nasa.gov` hangs).
- `fetchTextures.ts` adds the eight to its quadrant list and ~250 MB to `FULL_FETCH_APPROX_MB`
  (it already refuses the full pull without `--confirm`). `data/raw/textures/README.md` gains the
  files and checksums.

## Runtime

### Lanes (P3, then one row)

```ts
// src/layers/body/surfaceTiles/stream/@types/SurfaceTileLaneSpec.d.ts
export type SurfaceTileLaneSpec = {
  readonly label: string;
  readonly atlasSide: number;
  readonly slotSide: number;
  readonly format: GPUTextureFormat;
  /** Fetch + decode one tile; `null` when absent or unreadable. Never throws. */
  readonly fetch: (tile: SurfaceTileId, source: SurfaceTileSource) => Promise<SurfaceTilePayload | null>;
};
// SurfaceTilePayload: { bitmap: ImageBitmap; subtreeRangeM: ResidentSurfaceTile['subtreeRangeM'];
//                       gridCodes: ResidentSurfaceTile['gridCodes'] }
```

`SURFACE_TILE_LANE_SPECS: Readonly<Record<SurfaceTileProduct, SurfaceTileLaneSpec>>` in
`stream/data/`:

| product | atlasSide | slotSide | format            | fetch                                 |
| ------- | --------: | -------: | ----------------- | ------------------------------------- |
| albedo  |      8192 |      512 | `rgba8unorm-srgb` | `fetchSurfaceTileBitmap` → payload     |
| height  | 32 × 129  |      129 | `rgba8unorm`      | `fetchHeightTile` → payload            |
| night   |      4096 |      512 | `rgba8unorm-srgb` | `fetchSurfaceTileBitmap` → payload     |

`slotSide` 512 is `SURFACE_TILE_PX`: `derivePlannerParams` already rejects any other manifest
`tilePx`. `requestBands.albedo`, `requestBands.height` and `bands` are the same derived list
object, built once, so they cannot drift.

- At engage the stream builds a lane for each product some manifest band's `builtFrom` names, so
  Mars and an old Earth manifest allocate no night atlas. Night: 64 slots, 64 MB.
- Upload and release go through `payload.bitmap`; the resident record takes `subtreeRangeM` and
  `gridCodes` from the payload (null for albedo and night).
- `getAtlasView(product)` is `null` when the product has no lane or nothing is engaged.
- The debug stats keep reporting the albedo lane (`lanes.albedo`), and the height counts as today.

### Planner (P4, then data)

```ts
// SurfaceTilePlannerParams
readonly bands: readonly SurfaceTileBand[];          // refinement, unchanged
readonly requestBands: Readonly<Record<SurfaceTileProduct, readonly SurfaceTileBand[]>>;
```

`derivePlannerParams` builds `requestBands[p]` from the bands whose `builtFrom[p]` is set, floored
the same way as `bands` (`max(band.min, baseLevel + 1)`). Albedo and height get exactly today's
`bands` (both must be built, as today). `request()` pushes one request per product whose
`requestBands[p]` claims the tile (`surfaceTileInBand`). Refinement still reads `bands` alone.

### Cut leaf

```ts
// SurfaceCutTile
readonly night: Pick<ResolvedTileResidency, 'atlasUvOrigin' | 'atlasUvScale'> | null;
```

Resolved with `deepestResidentAncestor` on product `night`, starting at `min(z, nightMax)` where
`nightMax` is the deepest `requestBands.night` level (so a z13 leaf does not probe z13…z8), then
`flattenAtlasRect` with the full level delta from the leaf. `null` when no ancestor is resident or
the body has no night bands. A missing night rect never drops a leaf from the cut.

### GPU instance (P6, then the field)

`PatchInstance` grows from 80 to 96 bytes:

| offset | size | field              | note                                          |
| -----: | ---: | ------------------ | --------------------------------------------- |
|      0 |   12 | `originRelEyeM`    | unchanged                                     |
|     12 |    4 | `fadeWeight`       | unchanged                                     |
|     16 |   16 | `lon0/lat0/dLon/dLatRad` | unchanged                               |
|     32 |   16 | `albedoRect`       | unchanged                                     |
|     48 |   16 | `fallbackRect`     | unchanged                                     |
|     64 |   16 | `nightRect`        | new; (origin.xy, scale.xy); scale 0 = no tile |
|     80 |    8 | `heightSlotOrigin` | moved from 64                                 |
|     88 |    4 | `edgeCoarser`      | moved from 72                                 |
|     92 |    4 | `heightCells`      | moved from 76                                 |

The vec4s stay before the vec2u, as today. `VSOut` gains `@location(11) @interpolate(flat)
nightRect: vec4<f32>`. P6's record:

```ts
// src/layers/body/surfaceTiles/patch/@types/PatchInstanceWords.d.ts
export type PatchInstanceWords = {
  readonly originRelEyeM: Readonly<Vec3>;
  readonly fadeWeight: number;
  readonly anchor: SurfacePatchAnchor;                 // lon0Rad, lat0Rad, dLonRad, dLatRad
  readonly albedoRect: Readonly<Vec4>;                 // (origin.xy, scale.xy)
  readonly fallbackRect: Readonly<Vec4>;
  readonly heightSlotOrigin: Readonly<Vec2>;
  readonly edgeCoarser: number;
  readonly heightCells: number;
};
export function writePatchInstance(view: DataView, base: number, words: PatchInstanceWords): void;
```

The vector words use `Vec2`/`Vec3`/`Vec4` (`src/@types/math/`), never raw tuples (simplicity.md's
contract). P6 also moves the raw tuples on the path that feeds the record onto those aliases:
`ResolvedTileResidency`'s `atlasUvOrigin`/`atlasUvScale` (and its `fallback`'s) and
`SurfaceCutTile.height.originPosts` become `Readonly<Vec2>`; the night rect then picks the same
types. The feature adds `nightRect: Readonly<Vec4>` to the record. One record per patch per frame (a few hundred), so the
allocation is noise beside the draw.

### Shader

- `fragmentEarth.wesl` gains `@binding(10) nightAtlas: texture_2d<f32>`, sampled with
  `atlasSampler` and `textureSampleLevel(…, 0.0)` through `resolveTileAtlasUv`, which takes the
  atlas's half-texel as a parameter (the night atlas is 4096, the albedo atlas 8192).
  `NIGHT_TILE_ATLAS_SIDE = 4096` lives in `surfaceTileParams.ts` (the lane row reads it) and is
  mirrored into `surfaceLighting.wesl` beside `SURFACE_TILE_ATLAS_SIDE`, with a row in
  `constants.parity.test.ts`, the pattern that constant already follows.
- `nightColour = select(globalNight, tileNight, in.nightRect.z > 0.0)`, both sampled
  unconditionally (the global sample needs uniform control flow for its derivatives).
- The variant row becomes `bindings: [3, 5, 6, 7, 9, 10]`; the bare variant is unchanged.
- `SurfaceEffectInputs.nightLights` gains `atlasView`. The pass passes
  `stream.getAtlasView('night') ?? the global night view`: with no lane every rect is zero-scale,
  so the stand-in is bound but never read, and the renderer needs no placeholder texture.
- The emissive term, `nightLights()` and its datum-normal gate are unchanged.

## Docs

- `docs/DATA.md`: the night product in the surface tile section (source, levels, sizes); the
  prefix rule restated as "no published file ever changes"; the refresh-order row adds Black
  Marble to `fetch-textures`.
- `docs/RENDERER.md`: the surface tile walk resolves three products; night is an overlay that
  never steers refinement; the zero-scale rect falls back to the global texture.
- `docs/DEPLOY.md`: the "Earth tile versioning" wording, if it repeats the old rule.
- Backlog: the EOX-structure night spike, with a short detail file.

## Measurement

- `npm run perf` on main and on the branch, scenario `earth-surface`, this worktree's `--url`.
  Expected: neutral within noise (one more sample per fragment, 16 more bytes per patch).
- Night bytes: the sum of `night/z*.idx` + `.pack` for z3–z7, beside albedo's 133 MB for the same
  levels. The R2 sync size is the night archive files plus `manifest.json`, reported before the
  owner syncs; albedo and height archives must hash unchanged.
- Eye check, before (main) and after (branch), `#focus=body-earth` with a night-side `t`: over
  Copenhagen at ~50 km and ~500 km, over Europe at ~3,000 km.

## Left to the builder

- Test placement and names, within testing.md. They must cover: the lane table builds a night lane
  only when the manifest names night; `requestBands` per product (night only inside z3–z7, never
  steering refinement); a z13 leaf resolving its z7 night ancestor's sub-rect; the 96-byte layout's
  per-field offsets; `bakeAll` baking night with `--product night` and keeping albedo/height
  provenance.
- Where `nightMax` is computed (once per plan, not per leaf).
