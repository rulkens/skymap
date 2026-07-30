# Earth surface virtual texture

**Status:** approved design, spec'd 2026-07-28. The feature shape (texture-only, tiles baked
into our own R2, camera work out of scope) was settled with the user before this spec was
written and is not re-opened here. The `refactor-ground` pass was run and approved; its
verdicts are reproduced in "Ground preparation". Everything below is written against the code
as it stands on `earth-high-res-tiles`. Two questions are deliberately left open and are
listed in "Open questions"; neither blocks the runtime work.

## Problem

Earth's day albedo is a single whole-globe equirectangular texture, capped at the `large`
tier: 8192 x 4096 (`tierToTexturePx.ts:14-23`, `bodyTextureRegistry.ts:65-75`). That is
4.89 km per texel at the equator. The fragment samples it once, at the mesh's
interpolated equirect uv (`shaders/bodies/earth/fragment.wesl:174`).

Screen texel density at the sub-camera point is roughly `h * fovY / viewportHeightPx`,
where `h` is altitude above the surface. At a 1440 px viewport and a 40 degree vertical
field of view, 4.89 km per texel is matched at `h` around 9,700 km. Below that the
surface stretches: by the time Earth fills the frame the texture is magnified several
times over and the descent ends on a soft, smeared globe. Earth is drawn at true scale
(`SCENE_EARTH.radiusKm = 6371`, `sceneEarth.ts`), so that final approach is a real part of
the experience, not a corner case.

**The forcing function: WebGPU's default `maxTextureDimension2D` is 8192.** `device.ts:86`
calls `adapter.requestDevice({ requiredFeatures })` with no `requiredLimits`, so skymap
runs on the default limits, and on a large share of devices (every current iOS device
among them) 8192 is also the adapter's hard ceiling, so raising the requested limit would
not help. A 16384-wide equirect texture cannot be allocated. "Bake a bigger texture" is
not a smaller version of this feature; it is a dead end at exactly one doubling past
today. Going further **requires** cutting the imagery into tiles and paging a bounded
subset into a physical atlas that fits inside 8192, with an indirection the fragment
consults to find where a given uv currently lives.

Nothing of the kind exists in `src/` today: there is no clipmap, virtual texture, page
table, quadtree or tile cache anywhere in the tree.

## Decisions

Settled before this spec; the reasoning is recorded here so a future reader does not
re-litigate them.

- **Texture-only.** The cube-sphere mesh stays at its fixed `CUBESPHERE_FACE_RESOLUTION =
  48` subdivision (`earthRenderer.ts:149`), six whole level-0 faces concatenated into one
  indexed mesh, about 13.8k quads. No geometry LOD, no elevation displacement, no real 3D
  relief. Earth's relief stays faked by the tangent-space normal map exactly as today.
  Real relief was considered and deferred as a possible later escalation; it is a
  different feature with a different risk profile (mesh streaming, skirts, crack fixing,
  a second depth-precision problem) and it does not need to ride this one.
- **Tiles are always served from our own R2.** Not from a third-party service, ever, at
  runtime. Both viable imagery sources are rate-limited demo endpoints or raw archive
  buckets with no CDN, no SLA and a documented history of endpoint moves breaking
  downstream consumers. Streaming from one would put the visual centrepiece of the app
  behind somebody else's uptime and somebody else's throttle, and a throttled response
  redirects to HTML, which throws inside `createImageBitmap`. We bake, we host, we serve.
- **The source abstraction lives in the build tool, not in the renderer.** Whichever
  imagery source wins, the baked pyramid is byte-identical in shape: our grid, our tile
  edge, our container, our colour space. So the runtime is source-independent by
  construction and there is **no runtime tile-provider seam**. The practical consequence
  is that all runtime work (designs 1 to 7) is unblocked by the still-open source question.
- **Surface albedo is tiled. Night, clouds and material are not.** Those keep their
  whole-globe textures. Night lights and clouds carry no fine structure worth streaming
  (Black Marble is 3 km per pixel at source), and the material map is a roughness ramp over
  an ocean mask, which is smooth by construction. Whether the *normal* map is also tiled is
  an open question, below.
- **Camera work is out of scope.** Surface-directed zoom (dollying toward a cursor-picked
  surface point rather than the planet centre) was investigated and deliberately deferred
  to a separate effort. It is named in "Non-goals" and nowhere else.

## Open questions

Two decisions are the user's to make. Both are stated with a recommendation and its cost.

### Q1. Is the normal map tiled, or does relief stay whole-globe?

**Recommendation: do not tile the normal map. Tile the surface only.**

The normal map is derived from GEBCO relief, which is 21600 x 10800 on disk
(`rawDataRegistry.ts:641-651`), about 1.85 km per pixel. Neither imagery source supplies
elevation, so nothing in this feature improves the relief source. Tiling GEBCO reaches
level 5 (16384 wide, 2.4 km per texel) against a surface pyramid at 38 m or 9.6 m per texel:
the relief would remain 60 to 250 times coarser than the colour whatever we do. The gain
over today's whole-globe 4096 normal map is one factor of four, linear.

What dropping it removes, concretely:

- One atlas (67 MB of GPU memory), one page table, one fetch queue, one `BitmapStreamSubsystem`
  instance, one set of window uniforms.
- The two-format problem entirely. With surface only, every atlas is `rgba8unorm-srgb` and
  the LINEAR-normal landmine is not in play. PREP 1 still parameterizes `format` (it is one
  constructor argument and the class needs it to be honest about what it allocates), but this
  feature would not exercise it.
- The uniform-layout growth. `EARTH_SURFACE_UNIFORM_FLOATS = 32` currently ends in exactly
  three zeroed pad slots (`packEarthSurfaceUniforms.ts:57,108`). The surface-only variant's
  three window parameters fit those pads with **zero struct growth**. Tiling the normal too
  needs three more, which means a new 16-byte row and a 144-byte struct.
- Bindings drop from five new entries to three.

The trade-off, stated plainly: high-resolution colour with unchanged low-resolution relief.
At close approach the lighting response across a mountain range will be smooth while the
colour under it is sharp. That may read acceptably, because Sentinel-2 surface reflectance
already carries real terrain shading and shadow at 10 m, so a good deal of apparent relief
is baked into the albedo. It may also read as plastic. That is a look judgement, and it is
cheap to test: the surface-only version ships first either way, and adding the normal path
later is additive (a second atlas, a second page table, a second window) with no rework of
the first.

**If the answer is "tile it too":** everything below that is written per-kind already
generalises; the parts that change are marked "(normal path)".

### Q2. Which imagery source, and how deep do we bake?

Blocked on an external answer. See "Imagery source" for the full evaluation. The runtime
does not care, so this does not gate implementation.

## Imagery source

### Sources considered

| Source | Best resolution | Licence | Verdict |
|---|---|---|---|
| **EOX s2cloudless 2016** | 9.55 m/px (z13) | CC BY 4.0 (2016 vintage only) | **Primary candidate.** Blocked on bulk access. |
| **ESA WorldCover S2 composites** | 9.28 m/px | CC BY 4.0 | **Fallback.** Available today, needs a colour grade. |
| GIBS Landsat WELD | 30.6 m/px | Public domain | Rejected on visual inspection: swath striping, poor contrast and colour. Also land-only 72N to 55S, only the 2000 epoch serves pixels, and missing data comes back as a valid all-black JPEG. |
| GIBS Blue Marble | 489 m/px | Public domain | Redundant. Its one edge was ocean and ice quality, which the existing whole-globe base texture already supplies. |
| Esri World Imagery | ~0.5 m/px | Proprietary | Licence explicitly prohibits exporting tiles; hotlinking is unlicensed. |
| Bing Maps Aerial | ~0.5 m/px | Proprietary | Free tier retired 30 June 2025. |
| Google Earth Engine | varies | Proprietary | ToS prohibit bulk export for redistribution. |

The table is decision provenance, not a menu. Everything below concerns the two candidates.

### Primary: EOX s2cloudless 2016

Cloudless Sentinel-2 mosaic, `s2cloudless` layer on `tiles.maps.eox.at`.

- **Licence is vintage-specific and only 2016 works for us.** 2016 is CC BY 4.0. 2017 is
  CC BY but has coverage holes. 2018 through 2025 are CC BY-NC-SA, and ShareAlike would
  attach to any re-hosted derivative, which is disqualifying for a JOSS-bound open repo.
- Native EPSG:4326, `WGS84` TileMatrixSet, 256 px tiles, `2^(z+1)` columns by `2^z` rows.
  Skymap's current 8192 base texture is exactly level 4 of that pyramid. Our addressing
  (design 1) is that grid.
- Real detail limit is z13, 9.55 m per texel. z14 and beyond serve, but they are pure
  upsampling.
- Oceans render as flat dark blue and ice sheets as flat white. No black no-data holes,
  which is what makes it usable without a separate cloud or gap mask.

**Blocker.** It is an explicitly rate-limited free demo service: no SLA, single Apache
origin, no CDN, no rate-limit headers, and a throttled request redirects to HTML. The old
bulk channel `s3://eox-s2maps` is dead (`NoSuchBucket`, verified including with
requester-pays). The commercial EOxCloudless product is EUR 16,000 for global coverage. An
email asking for a bulk copy of the CC BY 2016 vintage is in flight and the outcome is
unknown. Without it, pulling millions of tiles from the demo endpoint is both technically
fragile and a misuse of a service offered in good faith.

**Attribution, required verbatim:**

> EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus
> Sentinel data 2016) released under Creative Commons Attribution 4.0 International License.

### Fallback: ESA WorldCover S2 annual composites

`esa-worldcover-s2` on AWS Open Data. Public S3, no auth, no requester-pays, no rate limit,
CC BY 4.0. Nobody's permission is needed, which is the whole reason it is the fallback and
not a curiosity.

- 19,359 tiles of 1 degree, land only, 12000 x 12000, four bands of uint16 (B02/B03/B04/B08),
  deflate, EPSG:4326, 0.3 arcsec = 9.28 m per pixel, nodata 0. Years 2020 (v100) and
  2021 (v200).
- Proper COGs with overviews `[2, 4, 8, 16]`, so HTTP range reads yield 18.6 / 37.1 / 74.2 /
  148 m per pixel without downloading whole files. Those land almost exactly on our
  z12 / z11 / z10 / z9.
- **Adjacent tiles are radiometrically consistent and the 1-degree seam is invisible**
  (verified live: per-side medians differ by about 3 percent, which is ground content, not
  mismatch). **So per-tile colour matching and seam blending are not needed, and are a
  non-goal.** This is the single largest risk that turned out not to exist.
- `nodata = 0` is an exact 10 m land mask, for free. It becomes the tile alpha channel
  (design 5), so ocean and coastline come from the base texture with no mask asset.

**Its one real cost: it is raw uint16 median surface reflectance, not a rendered basemap.**
It needs one global colour grade: white balance against a blue cast, haze removal, a tone
curve, and taming speckled saturated urban pixels. One parameter set for the whole planet,
because the radiometry is already consistent. Estimated at a day or two of iteration on a
few representative degree tiles, not a subproject.

### Ceilings, storage and acquisition cost

Baked output as lossy WebP, land only, at the measured 33 KB per 512 px tile (design 7).
Object counts are for the 512 px tile edge that design 1 settles on.

| z | m/texel | matched down to | tiles (land, ~29%) | baked bytes | transient download |
|---|---|---|---|---|---|
| 9 | 153 | 300 km | 38 k | ~1.3 GB | ~30 GB |
| 10 | 76.4 | 151 km | 152 k | ~5 GB | ~120 GB |
| 11 | 38.2 | 76 km | 608 k | ~20 GB | ~500 GB |
| 12 | 19.1 | 38 km | 2.4 M | ~80 GB | ~2 TB |
| 13 | 9.55 | 19 km | 9.7 M | ~320 GB | source-dependent |

"Matched down to" is the altitude at which screen texel density equals the pyramid's, at a
1440 px viewport and a 40 degree vertical field of view. Today's base matches at 9,700 km.

**Storage is not the constraint.** R2 at 0.015 USD per GB-month with free egress puts even
320 GB at about 4.80 USD per month. Class-A writes are 4.50 USD per million, so a full z11
sync costs under 3 USD once.

**Acquisition effort is the constraint**, and it is the transient download and the sync
wall-clock, not the bill. Per the announce-big-downloads rule, the acquisition pull needs an
explicit go-ahead with the figure stated, and it is deliberately sequenced last (see
"Phases") so nothing else waits on it.

**Object count is the second constraint** and it is why the tile edge is 512 and not 256
(design 1). At z13, 9.7 M objects is already a multi-day sync; at a 256 px tile edge it would
be 39 M.

### Attribution and provenance surfaces

Whichever source lands: a `rawDataRegistry` row per source carrying the licence and the
verified-live note, a `docs/DATA.md` entry, and the attribution string in the Splash credits
paragraph (`Splash.tsx:198-233`), which is where every other CC BY source in the project is
already credited.

## Ground preparation

Ideal-diff pass run 2026-07-28; this section records its checkpoint, approved by the user.

**Growth (the seam exists, reuse as-is, no prep needed):**

- **The priority fetch queue.** `src/utils/concurrency/priorityQueue.ts` is already fully
  generic: `PriorityQueue<T>` with opaque string keys, numeric priorities, a per-instance
  concurrency limit as a defaulted constructor argument (`:65`), idempotent re-enqueue for
  in-flight keys (`:130`), `drop` (`:182`) and `drain` (`:151`). A previous author
  deliberately extracted it out of the GPU layer and de-galaxy'd it. The tile streamer
  instantiates a second one keyed on tile keys. Nothing changes in the file.
- **`earthRenderer`'s bind-group construction.** `KIND_CFG` (`earthRenderer.ts:178-195`)
  already expresses "which `TextureKind` binds where" as data, and the layout entries, the
  placeholder textures and `buildBindGroup` are all derived by iterating it
  (`:389-425`). The virtual texture adds a sibling table over the tiled subset of kinds; it
  does not fight the existing structure.
- **The two-layer texture story.** `committed` versus `placeholders` (`:348-376`) already
  encodes "whichever arrives second, the better map wins, with no ordering check". The
  virtual texture is a third layer on top of the same idea and inherits the property.
- **`loadFadeAlpha`** (`src/utils/render/disk/loadFadeAlpha.ts`) is a generic
  `(tReady, nowMs, durationMs) -> alpha` ramp. Reuse it for the per-tile arrival fade
  rather than writing a second one. Its `render/disk/` folder is a misnomer now that a
  second consumer exists; moving it to `src/utils/render/loadFadeAlpha.ts` via
  `npm run move-files` is optional adjacent cleanup, not prep.

**Bolt-on (missing joints), and the prep that creates each. Each is its own commit.**

- **PREP 1 - parameterize `TextureAtlas`.** `src/services/gpu/resources/textureAtlas.ts:27-30`
  hardwires `ATLAS_SIDE = 2048`, `SLOT_SIDE = 128`, `SLOTS_PER_ROW`, `SLOT_COUNT` as module
  constants, and `:100` hardwires `format: 'rgba8unorm-srgb'`. Those are baked into
  `initTexture` (`:95-112`), `uploadBitmap` (`:131-140`) and `slotUv` (`:224-231`). The
  Earth tile atlas needs a different slot geometry. Prep: promote
  `{ atlasSide, slotSide, format }` to constructor parameters; the existing galaxy call site
  (`galaxyAtlasSubsystem.ts:51`) passes today's values, so behaviour is unchanged. Every use
  site is inside this one class, so the change is mechanical, and the class header already
  anticipates a second consumer (`:48-52`). **`format` is included because a texture class
  that hardwires its own format is lying about what it allocates, but note that if Q1 lands
  on surface-only, this feature never passes a non-default `format`.**
- **PREP 2 - rename `GalaxyAtlasSubsystem` to `BitmapStreamSubsystem`.**
  `src/services/engine/subsystems/galaxyAtlasSubsystem.ts` is already key-generic: the
  `bitmapReady` / `bitmapFailed` `Set<string>` memoisation (`:58-61`, `:97`, `:105-119`),
  the evict-driven clearing (`:67-71`), and the caller-supplied `fetcher` / `onResult`
  hardcode nothing galaxy-specific. Its own header says "No catalog awareness" (`:11`).
  Only the NAME is a vestige, and the project's naming-correctness rule forbids Earth
  instantiating a type called `GalaxyAtlasSubsystem`. Prep:
  `npm run move-files -- src/services/engine/subsystems/galaxyAtlasSubsystem.ts src/services/engine/subsystems/bitmapStreamSubsystem.ts`
  plus the `@types` rename, then `npm run refactor -- rename` for the symbols.

**Explicitly decided: no registry change.** `BodyTextureSpec`
(`src/@types/scene/BodyTextureSpec.d.ts:29-43`) maps `(body, kind) -> Tier`, where a Tier is
only a resolution ceiling, and the whole pipeline downstream
(`bodyTextureFilename.ts:40-52` into `bodyTextureFetcher.ts:32-47`) assumes exactly one
flat whole-globe equirect file per `(body, kind, tier)`. We deliberately do NOT grow a
`layout: 'whole' | 'tiled'` discriminant into that shared registry. Thirteen other bodies
would carry a discriminant that only Earth ever sets, every consumer of the registry would
gain a branch it can never exercise, and the clamp / build-tier-set derivations
(`emittedTiersForBody`, `clampTier`) would each have to decide what a tier even means for a
tiled kind. Instead the existing whole-globe 8k `surface` and 4k `normal` textures stay
exactly as they are and become the virtual texture's far-field base, and the tile path is
a SEPARATE path that engages only on close approach. The registry keeps describing one
thing.

**Parked joint (adjacent, no action).** `cubeSphereMesh`'s `(face, level, tileX, tileY)`
addressing (`src/utils/math/cubeSphereMesh.ts:15-23,114-136`) stays dormant: today every
call is `cubeSphereMesh(face, 0, 0, 0, 48)`. It is scaffolding for the deferred geometry-LOD
path, not dead code, and this feature deliberately does not use it (see "Design 1"). Do not
clean it up.

**PR packaging.** PREP 1 and PREP 2 land as **their own PR, merged first**, before the
feature branch opens. They are behaviour-preserving refactors of shared code that other
in-flight work also touches, and holding them inside the feature PR would keep an
uncontroversial diff hostage to a feature that is waiting on an external answer.

## Design

### 1. Tile addressing

Geographic (plate carree, EPSG:4326) `z/x/y`. **The level ladder is the WGS84 / EOX one**:
level `z` is the pyramid step whose equirect width is `2^(z+1) * 256` texels, so `z = 4` is
exactly today's 8192 x 4096 base and every step doubles. `x` increases east from longitude
-180, `y` increases south from latitude +90.

**The tile edge is 512 px, not the source grid's 256.** With `tilePx = 512` the grid at level
`z` is `2^z` columns by `2^(z-1)` rows, and every tile is the exact 2x2 union of four source
tiles, so the bake is a merge and never a resample. The reason is object count: 512 quarters
it, and at z12 the difference is 2.4 M objects against 9.7 M, which is the difference between
an overnight R2 sync and a multi-day one. `tilePx` is recorded in the manifest and reaches the
runtime through it (design 8), and PREP 1 makes the atlas slot side a constructor argument, so
the runtime is parametric in it and the choice can be revisited without touching the renderer.

| z | grid | equirect | m/texel at equator |
|---|---|---|---|
| 4 | 16 x 8 | 8192 x 4096 | 4892 (equals today's base) |
| 5 | 32 x 16 | 16384 x 8192 | 2446 |
| 6 | 64 x 32 | 32768 x 16384 | 1223 |
| ... | | | |
| 11 | 2048 x 1024 | 1048576 x 524288 | 38.2 |
| 13 | 8192 x 4096 | 4194304 x 2097152 | 9.55 |

The mapping from the fragment's existing uv is exact, with no fudge factor, because
`cubeSphereMesh` already bakes `u = lon/2pi + 0.5` and `v = lat/pi + 0.5`
(`cubeSphereMesh.ts:164-166`): `u = 0` is exactly longitude -180, the west edge of column 0,
and `v = 0` is the south pole, so `tileY = floor((1 - v) * 2^(z-1))`.

**Rejected: cube-sphere face addressing.** It is the natural coordinate for the mesh and
`cubeSphereMesh` already carries the parameters. It loses on two counts. Both imagery sources
are EPSG:4326 rasters on the WGS84 ladder, so a cube-sphere bake would resample every pixel
twice (source to sphere face, then face to atlas) for no gain. And the fragment holds an
equirect uv, not a face id, so every fragment would need direction-to-face branching that
plate carree needs zero of. Its advantage is uniform tile area on the sphere, which matters
for geometry LOD, which is out of scope.

**The cost, named:** plate carree over-samples the poles. A row at 85 degrees latitude covers
roughly one eleventh the ground per texel that the equatorial row does. That is a storage cost
paid once at bake time, not a runtime cost: the planner never requests a level finer than the
screen needs, so over-sampled polar tiles are simply never fetched. It also does not apply to
the fallback source at all, since WorldCover is land-only and the high-latitude land area is
small.

**Types.**

```ts
// src/@types/data/EarthTileKind.d.ts   (one type per file)
import type { TextureKind } from './TextureKind';
/** The subset of TextureKind the virtual texture pages. Welded to the parent union so a
 *  TextureKind rename propagates. Q1 decides whether 'normal' stays in it. */
export type EarthTileKind = Extract<TextureKind, 'surface' | 'normal'>;

// src/@types/data/EarthTileId.d.ts
export type EarthTileId = {
  readonly kind: EarthTileKind;
  readonly z: number;
  readonly x: number;
  readonly y: number;
};
```

`earthTilePath(tile): string` (`src/utils/scene/earthTilePath.ts`, one symbol per file) is
the single home for `earth-tiles/<kind>/<z>/<x>/<y>.webp`, called by BOTH the build tool
and the runtime fetcher. This is the same anti-drift pattern `bodyTextureFilename` already
enforces for the whole-globe tiers (`bodyTextureFilename.ts:9-15`): a name constructed
twice is a name that eventually 404s. The runtime's tile URL is
`dataUrl('images/' + earthTilePath(tile))` and there is nothing else to it.

**Rejected: a runtime `EarthTileProvider` abstraction.** An earlier shape of this design put
the tile URL behind an injected provider so a live service could be swapped in. That seam is
now decorative: live streaming is rejected outright (see "Decisions"), so there is exactly one
implementation forever, and a one-implementation interface is a place for the shape to drift
away from the only caller. The variability that genuinely exists is *which source the pyramid
was baked from*, and that varies at build time, where design 8 puts it.

### 2. Page table

The fragment must turn `in.uv` into "which atlas slot, at which level". The representation
is **a fixed 128 x 128 `rgba8uint` indirection texture per tiled kind, covering a moving
window of the globe at the finest currently-planned level, rebuilt on the CPU whenever
residency changes.**

Byte map, one texel per window cell:

| channel | holds | range |
|---|---|---|
| R | atlas slot column | 0..7 |
| G | atlas slot row | 0..7 |
| B | level `z` of the tile occupying that cell | 5..13 |
| A | blend weight against the whole-globe base, 0..255 | 0 = base only |

**Why a window and not the whole grid.** A page table sized to the deepest level's full grid
is what a shallow pyramid can afford and a deep one cannot: at z11 it is 2048 x 1024 texels
(8.4 MB), at z13 it is 33.5 MB, and the cost that actually kills it is not the allocation but
the **rebuild**, which is a full memset plus a full `writeTexture` on every residency change,
several times a second during a descent. The window is 64 KB, so the rebuild stays in the
noise, which is what lets design 4 keep its "always rebuild, never patch" property. The window
is also the honest shape of the problem: the atlas holds 64 tiles, so at most 64 cells of any
page table are ever non-empty.

The window is anchored by three values that travel in the uniform buffer: `zWin` (the finest
level the planner currently emits), and `(winX0, winY0)`, the window's origin tile at that
level. **The window is enforced in the planner, not in the shader**: the planner clips its
quadtree walk to the window box, so a tile outside it is never requested, never resident, and
never needs representing. Ground outside the window falls back to the base texture, which is
the identity case from design 5.

Sizing: 128 cells at `zWin` is 128 tiles across, which at the altitude where `zWin` is required
is roughly 2500 km of ground, against a visible ground width of about 2000 km at that altitude.
The window therefore covers the whole visible disc including the limb, with headroom. Raising
it to 256 costs 4x of a cost that is already negligible, if the limb frontier turns out to be
visible during fast lateral motion.

**Fragment lookup, one `textureLoad`, no branch:**

```
let cols  = 1u << u32(zWin);                       // 2^z columns at the window level
let px    = u32(in.uv.x * f32(cols));
let py    = u32((1.0 - in.uv.y) * f32(cols >> 1u));
let dx    = (px + cols - winX0) % cols;            // wraps across the antimeridian
let dy    = py - winY0;                            // underflows to a huge u32 north of the window
let inWin = dx < WINDOW_SIDE && dy < WINDOW_SIDE;  // one unsigned compare covers both signs
let e     = textureLoad(pageTable, vec2u(min(dx, WINDOW_SIDE - 1u), min(dy, WINDOW_SIDE - 1u)), 0);
let tileU = fract(in.uv.x * f32(1u << e.b));
let tileV = fract((1.0 - in.uv.y) * f32(1u << (e.b - 1u)));
let slotUv = (vec2f(f32(e.r), f32(e.g))
              + clamp(vec2f(tileU, tileV), HALF_TEXEL, 1.0 - HALF_TEXEL)) * SLOT_SCALE;
let tile   = textureSampleLevel(tileAtlas, tileSampler, slotUv, 0.0);
let w      = f32(e.a) / 255.0 * tile.a * select(0.0, 1.0, inWin);
albedo     = mix(baseAlbedo, tile.rgb, w);
```

Five properties of that snippet are load-bearing.

- **`textureSampleLevel`, not `textureSample`.** The atlas has `mipLevelCount: 1`, so there
  is no level to select, and `textureSampleLevel` sidesteps WGSL's uniformity requirement
  for implicit derivatives entirely. Implicit derivatives would also be wrong: the atlas uv
  jumps discontinuously at a tile boundary, so `dpdx` there is garbage.
- **No new varying.** Everything is derived from `in.uv`, which the fragment already
  receives. The perf-budget landmine (one extra `@location` cost 1.5 ms once) is untouched.
- **The unsigned window test is branchless and covers latitude underflow**, because `py -
  winY0` wraps to a value above `WINDOW_SIDE` when the fragment is north of the window.
- **`tile.a` is the land mask** (design 5), so ocean and coastline resolve to the base with no
  separate mask texture and no extra sample.
- **`A = 0` means "no tile, sample the base"**, which is what makes the whole feature
  strictly additive.

**Rejected: a storage or uniform buffer table.** A uniform buffer caps at 64 KB and is the
wrong shape for an indexed grid. A `var<storage, read>` array works and costs the same one
binding, but it trades a `textureLoad` with free coordinate clamping for dynamic indexing into
a large array in the fragment stage, which is the shape iOS WebKit has been strictest about
(see the `texture_1d` note in `docs/RENDERER.md`). No measured difference is expected; the
tiebreak is validation risk.

**Uniforms.** `zWin`, `winX0`, `winY0` go into `EarthSurfaceUniforms`. The struct currently
ends in exactly three zeroed pad slots (`packEarthSurfaceUniforms.ts:57,108`, f32 29..31), so
the surface-only variant fits with no struct growth and no change to the 128-byte size. They
are stored as `f32` and read with `u32(...)`; every value is a small integer exactly
representable in f32. The normal path would need a fourth 16-byte row.

**Bindings.** Earth's explicit bind-group layout (`earthRenderer.ts:389-408`) uses 0
(uniform), 1 (sampler), 2..6 (the five maps). Surface-only adds three entries:

| binding | resource |
|---|---|
| 7 | surface page table, `texture_2d<u32>` |
| 8 | surface tile atlas, `texture_2d<f32>` (`rgba8unorm-srgb`) |
| 9 | tile sampler (linear, `clamp-to-edge` on both axes, no mipmap filter) |

(Normal path: two more, a `texture_2d<u32>` page table and an `rgba8unorm` LINEAR atlas.
Normal maps must never be `-srgb`; `isLinearTextureKind` is already the single home for that
axis (`earthRenderer.ts:364`, `:501`, `:555`; `bodyTextureFilename.ts:48`;
`bodyTextureFetcher.ts:43`) and it must drive the atlas format through PREP 1's `format`
argument. Two atlases rather than one, because one texture has one format. Two page tables
rather than one array texture, because the two kinds have different deepest levels and
independently planned residency, so folding them would mean teaching one window two ladders.)

That is at most 9 sampled textures and 2 samplers per fragment stage, against defaults of 16
and 16. The layout stays explicit, never `layout: 'auto'` (the auto-layout trap).

### 3. Level selection: a CPU planner

A pure function, run once per frame on the CPU:

```ts
// src/utils/scene/planEarthTiles.ts   (one symbol per file)
export function planEarthTiles(input: {
  readonly kind: EarthTileKind;
  /** Camera position in Earth's local frame, body-radii units (what camPosLocal returns). */
  readonly camPosLocal: Readonly<Vec3>;
  /** Earth's orientation-free local frame is the sampling frame; uv is frame-fixed. */
  readonly viewProjLocal: Readonly<Mat4>;
  readonly viewportPx: Readonly<Vec2>;
  readonly minLevel: number;   // the level at which the base texture is already as good
  readonly maxLevel: number;   // the manifest's deepest baked level for this kind
  readonly windowSide: number; // page-table window edge, in tiles at the finest level
}): EarthTilePlan;

// src/@types/scene/EarthTilePlan.d.ts
export type EarthTilePlan = {
  /** Finest level any leaf uses; the window's level. */
  readonly zWin: number;
  /** Window origin tile at zWin. */
  readonly winX0: number;
  readonly winY0: number;
  readonly requests: readonly EarthTileRequest[];
};

// src/@types/scene/EarthTileRequest.d.ts
export type EarthTileRequest = {
  readonly tile: EarthTileId;
  /** Projected on-screen extent of the tile patch, px. Doubles as fetch priority. */
  readonly screenPx: number;
};
```

The algorithm is a quadtree refinement over the tile grid, descending from `minLevel`:

1. Reject a patch whose four corners are all on the far hemisphere (`dot(corner,
   camPosLocal) < 1`, the horizon condition on the unit sphere).
2. Reject a patch whose projected bounding box misses the viewport.
3. Compute the patch's projected extent in pixels; the required level is
   `z + ceil(log2(screenPx / tilePx))`, clamped to `[minLevel, maxLevel]`.
4. Descend while `required > z`; otherwise emit the patch as a leaf.
5. Reject a leaf that falls outside the window box (design 2). The window is derived first,
   from the sub-camera point and the deepest required level found in step 3.

**Why CPU-side and not shader feedback.** GPU feedback (the fragment writes the tile ids it
wanted into a buffer, the CPU reads them back next frame) is the textbook virtual-texturing
approach and is exact: it accounts for occlusion and for the real derivatives. It loses
here for three reasons. It needs a readback, which is a `mapAsync` round trip plus at least
one frame of latency, on a renderer that is render-on-demand and often not running a
continuous frame loop. It needs either a second pass or a storage write from the fragment
stage, which is fresh iOS validation surface for a body that is the visual centrepiece
(`docs/RENDERER.md`: a bad shader freezes the whole canvas with no thrown error). And its
advantage is precision about occlusion, which for a single convex sphere with no
self-occlusion beyond the horizon is worth approximately nothing: the conservative CPU
estimate is very nearly exact. The CPU planner is also pure, which makes it the one
genuinely testable surface in the feature (see "Testing").

**Where it runs.** A new `earthTileSubsystem`, driven from `runFrame.ts` beside the existing
disk-planner drive site (`runFrame.ts:527-545`), gated on the same two handles
`earthLayer.enabled` checks plus an engage distance. The planner is skipped entirely when
Earth is beyond the engage distance, so the common case (anywhere outside the inner solar
system) costs one comparison.

**Engage distance.** The virtual texture engages when the required level exceeds `minLevel`,
which is a statement about screen texel density, not a hand-authored distance. Deriving it
from the same formula the planner uses keeps one rule rather than two. Concretely: engage
when Earth's apparent diameter exceeds the base texture's own width in screen pixels
(8192 px of texture across the visible hemisphere), which is the point at which the base
starts magnifying.

### 4. Residency

- The planner's leaves are walked in `screenPx` order. For each, `atlas.allocate(tileKey,
  frameCounter)` (`textureAtlas.ts:158-198`, LRU by `lastSeenFrame`). Present keys are
  touched, so visible tiles stay alive.
- If the key is neither ready nor failed, `enqueueFetch` on a per-kind
  `BitmapStreamSubsystem` (PREP 2) whose `PriorityQueue` is constructed with its own
  concurrency limit. `priority: screenPx`, which is the queue's natural
  largest-on-screen-first pop (`priorityQueue.ts:238-251`) with no negation, matching the
  thumbnail queue's reading rather than the asset queue's.
- Concurrency: `EARTH_TILE_CONCURRENCY = 4`, matching the thumbnail queue's reasoning
  (`maxConcurrentFetches.ts`): many small streaming fetches during flight, not a handful of
  big one-shot boot fetches. Tiles are about 33 KB each.
- **Eviction is LRU inside `TextureAtlas`, and the page table is DERIVED from the resident
  set, never incrementally patched.** After any residency change, `buildEarthPageTable(
  resident, plan)` produces the whole 64 KB `Uint8Array` from scratch and it is uploaded.
  This is the un-braiding that makes the "eviction granularity must match slot granularity"
  landmine unreachable: one atlas slot holds exactly one tile, the atlas slot map is the
  single authoritative home for residency, and the page table is a pure projection of it.
  A stale texel pointing at a recycled slot cannot exist, because no texel survives a
  rebuild.
- **Interaction with the whole-globe base.** The existing `earth-8192.jpg` and
  `earth-normal-4096.webp` stay exactly as they are, fetched by the existing proximity-gated
  `bodyTextures` slot family (`assetWiring.ts:211-233`, load radius about 0.4 AU per
  `bodyTextureLoadRadius.ts:60-64`), committed through `setMap` (`earthRenderer.ts:486-535`),
  and bound at bindings 2 and 5. They are the level-4 (surface) and level-3 (normal) floor.
  The virtual texture never replaces them and never evicts them.

**Fill order matters and is free.** `buildEarthPageTable` writes resident tiles in
INCREASING `z`, so a fine tile overwrites its coarse ancestor's cells and every cell ends
up naming the finest resident ancestor covering it. No search, no per-cell loop over
levels.

### 5. Graceful degradation

This is a first-class requirement, and it is satisfied by four mechanisms that compose,
not by a special case:

1. **Nothing resident is the identity case.** `A = 0` in every page-table cell means the
   fragment's `mix` weight is 0 and it renders bit-identically to today. Frame one of the
   descent, a failed manifest fetch, ground outside the window, a device where the atlas
   allocation fails: all degrade to exactly the current picture. There is no hole state.
2. **A coarse resident ancestor covers a fine tile that has not arrived.** Because the page
   table names the finest resident ancestor (design 4), an area whose level-11 tile is still
   in flight samples its level-8 tile if that is what is resident. The refinement is
   progressive from the base upward, which is also the order the planner requests in, since
   it descends the quadtree.
3. **Ocean, ice and no-data resolve to the base, per pixel, through tile alpha.** Both
   candidate sources are land-oriented; the fallback is land-only with an exact `nodata = 0`
   mask at 10 m. That mask becomes the tile's alpha channel at bake time, so a coastal tile
   blends its land pixels over the base's ocean at the true coastline instead of at a tile
   boundary. Fully-ocean tiles are simply never emitted, never listed in the manifest, and
   never requested. This is why "the base texture supplies ocean and ice" is a mechanism and
   not a hope.
4. **No pop on first arrival.** The `A` channel carries a per-cell blend weight against
   the base, ramped by `loadFadeAlpha(readyMs, nowMs, EARTH_TILE_FADE_MS)` with
   `EARTH_TILE_FADE_MS = 400` (the same duration the thumbnail crossfade uses,
   `texturedDiskSubsystem.ts:50`). The page table is rebuilt while any tile is mid-fade,
   which is also what keeps the render-on-demand loop ticking through the fade.

**Named limitation, accepted.** A level-N-to-level-N+1 handoff (a fine tile replacing an
already-resident coarse one) is a hard step, not a crossfade: the `A` weight is already 1
and only the RGB slot pointer changes. It reads as a sharpness step at a moving tile
boundary, which is how every clipmap and virtual texture looks. Crossfading it properly
would mean the page table naming BOTH the fine slot and its coarse ancestor
(`rgba16uint`, still one `textureLoad`) and the fragment taking a second
`textureSampleLevel` on every Earth pixel, which is a full-screen cost paid permanently to
smooth a transient. Rejected for now; if the step reads badly in the visual pass, that is
the escalation, and it should be gated on a `npm run perf` measurement rather than taken on
faith.

### 6. Budgets

**The level cap comes from the source and from acquisition effort, not from a storage budget.**
See "Imagery source" for the ladder and its costs. The runtime reads the cap from the manifest
and clamps to it, so re-baking deeper is a data change, not a code change.

**Floors.** Surface tiles start at z = 5, because z = 4 is exactly the 8192 base. (Normal path:
starts at z = 4, because z = 3 is exactly the 4096 normal base.) Levels at or below the base
are never baked and never requested: the base already is that image.

**Bytes per pixel, anchored on measured files rather than guessed.** `earth-8192.jpg` is
3,549,759 bytes over 33.55 Mpx = 0.106 B/px at JPEG quality 80. `earth-normal-4096.webp` is
1,876,964 bytes over 8.39 Mpx = 0.224 B/px lossless. WebP quality 82 runs about 25 percent
under JPEG at matched quality; per-tile container headers, the alpha channel, and lost
cross-tile prediction give that back and more, so **0.125 B/px, about 33 KB per 512 px tile,**
is the working estimate, and it is what the "Imagery source" table is built on.

**GPU memory.** One `4096 x 4096` atlas with `mipLevelCount: 1`, 64 slots of 512 px, 67.1 MB,
plus a 64 KB page table, allocated lazily when the virtual texture first engages and never
before. (Normal path: 134 MB total.)

Sixty-four slots against a working set of roughly 20 to 40 tiles: a 2560 x 1440 viewport is
14 tile-areas of screen, and the planner's per-patch level selection means the limb is
covered by coarser (hence fewer) tiles than the sub-camera point. The headroom absorbs
level transitions during motion, which is the same reasoning behind the galaxy atlas's 256
slots.

Earth already binds five whole-globe maps (8k surface, 8k night, 8k clouds, 4k material, 4k
normal, each with a mip chain), which is the budget the atlas is measured against. A
worthwhile follow-up lever, out of scope here, is dropping the whole-globe surface to the
`medium` tier once the virtual texture is engaged, which would pay the atlas back and then
some; it is out of scope because it braids the tier clamp with virtual-texture residency.

### 7. Tile format, colour space, and seams

- **Surface tiles: lossy WebP, quality 82, sRGB, with an alpha channel.** WebP over JPEG
  because JPEG has no alpha and the alpha channel is the land mask (design 5), because at
  hundreds of thousands of objects a 25 percent saving is real money in sync time, and because
  the repo already ships WebP for the famous thumbnails and the body atlas. Decoded with the
  default managed path (`createImageBitmap(blob)`) and uploaded into an `rgba8unorm-srgb`
  atlas, so the hardware de-gammas on read exactly as the whole-globe surface does today.
  Alpha is `premultiplyAlpha: 'none'`; the shader multiplies it into the blend weight itself.
- **(Normal path) normal tiles: LOSSLESS WebP, LINEAR.** Chroma subsampling and an sRGB
  assumption would corrupt packed numeric channels along coastlines, which is the argument
  `bodyTextureFilename.ts:25-38` already makes for the whole-globe normal map. Decoded with
  `colorSpaceConversion: 'none'` (the branch `bodyTextureFetcher.ts:43-45` already takes for
  linear kinds) and uploaded into an `rgba8unorm` atlas. **Never `-srgb`.**
- **Upload orientation.** Tiles are north-first (row 0 is the tile's north edge), so they
  upload with `flipY: false`, and the shader's within-tile `v` is computed from `1 - v_mesh`
  accordingly. This differs from `setMap`'s `flipY: true` (`earthRenderer.ts:519`) because
  that flip exists to reconcile a whole-globe image's north-first rows with the mesh's
  south-first `v`; here the reconciliation happens in the tile-index arithmetic instead, in
  one place, rather than being spread across every upload.

**Seams: a half-texel clamp inside the slot, no gutters.**

Bilinear filtering at a slot's edge reaches one texel outside it, into whatever unrelated
tile occupies the neighbouring slot. The fix is `clamp(tileUv, 0.5/512, 1 - 0.5/512)` before
converting to atlas coordinates, which replicates the tile's own edge texel instead of
bleeding a stranger's.

**Rejected: baked gutters.** Padding each tile with a border of true neighbouring content is
the standard virtual-texturing answer and it makes cross-seam filtering exact. It loses
because synthesizing borders at upload time from resident neighbours would braid each slot's
CONTENTS to its neighbours' LIFETIMES, so evicting one slot would require repairing up to four
others. That is precisely the shape the "eviction granularity must match slot granularity"
landmine warns about, and design 4 is built to make it unreachable. Baking the gutters into
the files instead avoids the lifetime braid but inflates every tile by 0.8 percent in pixels
and, worse, breaks the exact 2x2-merge relationship with the source grid that makes the bake a
copy rather than a resample.

**The residual error is half a texel at each tile seam.** At the planner's target density
that is half a screen pixel, which is below the noise floor of a compressed photograph. It
grows visible only under heavy magnification, at which point the whole surface is already
soft for a different reason.

**No mips inside the atlas, deliberately.** A mip chain over an atlas blends across slot
boundaries, which is the classic virtual-texture artefact, and gutters wide enough to fix
it grow with every mip level. They are not needed: the page table's per-cell LEVEL is the
level-of-detail mechanism, and a coarser resident tile IS the lower mip. Minification
aliasing is bounded because the planner never requests a level FINER than one texel per
pixel; the only failure mode is magnification (blur), which is what happens past the cap.

### 8. Build, deploy, and the manifest

**`tools/textures/buildEarthTiles.ts`, its own tool, not folded into `buildTextures`.** The
existing per-tier loop resizes one source per `(body, kind, tier)`
(`buildTextures.ts:441-462`); tiling is a different shape, it needs inputs a normal
contributor will not have on disk, and it runs for hours. Folding it in would make
`npm run build-textures` fail or silently skip for everyone without the extra raws. The
drift argument that justified emitting the boot atlas inside `buildTextures`
(`writeBodyAtlas.ts` header) does not transfer, because these tiles derive from a
DIFFERENT source than the whole-globe tiers, so re-curating one cannot silently stale the
other.

**The source seam, and it lives here.**

```ts
// tools/@types/EarthImagerySource.d.ts   (one type per file)
export type EarthImagerySource = {
  readonly id: string;
  /** Verbatim attribution text the licence requires, surfaced in the Splash credits. */
  readonly attribution: string;
  /** Deepest pyramid level with real (non-upsampled) detail. */
  readonly maxLevel: number;
  /** Sample a lon/lat box into an RGBA raster of exactly widthPx x heightPx, graded and
   *  sRGB-encoded, alpha 0 where the source has no land data. Null when the box is
   *  entirely outside coverage, so the caller emits no tile at all. */
  readBox(
    box: LonLatBox,
    widthPx: number,
    heightPx: number,
  ): Promise<Uint8Array | null>;
};
```

Two implementations, one per candidate. The EOX one is an HTTP tile fetcher plus a 2x2 merge
(its tiles align with ours exactly, so `readBox` never resamples at a level the source serves).
The WorldCover one is a COG range reader: pick the overview level whose resolution is nearest
above the request, range-read the relevant COG tiles, apply the global colour grade, and take
`nodata = 0` as alpha. `sharp` (already a dependency, 0.34.5) does the resampling and the WebP
encode; the COG reader needs a TIFF parser, which the repo does not have today, and no AWS SDK
is needed because the bucket is public and plain `Range` requests work.

**The grade is part of the WorldCover source, not a pipeline stage.** One global parameter set
applied inside `readBox`, because the whole point of the verified radiometric consistency is
that there is nothing per-tile to decide. Making it a separate stage would invite per-tile
parameters back in.

**Build order, which is also the memory-bounding trick:** the deepest level is produced first,
degree tile by degree tile, streamed to disk; every coarser level is then a 2x2 average of four
tiles from the level above. Nothing ever holds a whole-globe raster, which at z11 would be 1.6
TB in memory.

**Development input, so the runtime is not blocked.** The BMNG file already on disk
(`textures.nasaBmng`, 21600 x 10800) bakes an exact, non-upscaled z5 pyramid: 512 tiles, no
download, real imagery, correct addressing. That is the fixture the runtime is built and
visually verified against (see "Phases"), which is why the acquisition can be sequenced last.

**The manifest.** `public/data/images/earth-tiles/manifest.json`, fetched once when the
virtual texture first engages:

```ts
// src/@types/scene/EarthTileManifest.d.ts
export type EarthTileManifest = {
  readonly tilePx: number;
  readonly levels: Readonly<Record<EarthTileKind, { readonly min: number; readonly max: number }>>;
  /** Source id + attribution + vintage, so a stale or mis-licensed bake is diagnosable. */
  readonly builtFrom: Readonly<Record<EarthTileKind, string>>;
};
```

**Rejected: committed codegen** (the `bodyAtlas.generated.ts` / `famousStars.generated.ts`
pattern). It wins when the fact is needed at boot and a round trip would cost latency, which
is why the body atlas took it. Here the virtual texture engages only on close approach, so a
fetch costs nothing, and re-baking a deeper pyramid would otherwise require a code deploy for
a data change. A missing or unparseable manifest degrades to base-only, which is the identity
case from design 5.

**Sparse coverage lives in the manifest's neighbourhood, not in the fetch path.** Land-only
sources mean most tiles do not exist. The runtime does not need a coverage index to avoid
404s: the planner requests, a 404 marks the key failed in `BitmapStreamSubsystem`'s
`bitmapFailed` set, and it is never re-requested. That is the same retry-storm guard the
thumbnail path already relies on, and it costs one cheap request per absent tile per session
rather than a coverage bitmap the client must download and keep in sync with the bake.

**Deploy.** `tools/deploy/collectTextureImages.ts` does a single non-recursive `readdirSync`
of `public/data/images/textures/` (`:36-46`), by explicit design ("safer than a recursive
walk"). The tile tree is nested `z/x/y` and holds hundreds of thousands of objects, so it
needs a sibling collector, `collectEarthTiles`, that walks a bake-emitted index rather than
the filesystem, so a half-finished bake cannot upload a partial pyramid that the runtime then
treats as complete. Same `{ localPath, r2Key }` shape as the existing collectors, so `syncR2`'s
inner loop is unchanged, but the sync must be resumable at this object count. `docs/DEPLOY.md`
gains the `build-earth-tiles` step and the resume note.

## Testing

Per `docs/superpowers/conventions/testing.md`, every test below is judged by "will this ever
fail on a real bug that no other test or compiler check catches". The **pure tile math,
level selection, window derivation and page-table projection are the genuinely testable
surface**; everything touching a GPU, a codec, or a network is not, and is covered by the
visual pass instead.

1. **Tile-address round trip.** For a spread of tiles across levels 5 to 13,
   `tileForUv(centreUvOf(t)) === t`. A round trip, not a mirror: the two directions are
   independent formulas, and an off-by-one in either (the `1 - v` flip and the `2^(z-1)` row
   count are the obvious candidates) samples the wrong latitude band, which on a globe reads
   as "the texture is subtly wrong" rather than as an obvious break.
2. **Level from texel density, against a hand-computed anchor.** One case worked out on
   paper (a stated altitude, field of view and viewport giving a stated ground metres per
   pixel, hence a stated level), plus monotonicity: halving the altitude raises the required
   level by exactly one. A wrong exponent here either starves the atlas or thrashes it, and
   is invisible on screen except as vague blurriness.
3. **The planner clamps to the manifest's `maxLevel`.** One assertion. Without it, a shallower
   pyramid draws a sustained 404 storm on every close approach.
4. **The planner rejects the far hemisphere.** A nadir-facing plan contains the sub-camera
   tile at the deepest level and contains no tile whose patch lies entirely behind the
   horizon. This is a real behavioural property (roughly half the fetches, and half the
   atlas, ride on it) and no compiler check reaches it.
5. **The plan's window contains every emitted leaf, including across the antimeridian.**
   A plan centred at longitude 180 must emit leaves on both sides and every one must map
   into `[0, windowSide)` after the wrapping subtraction. The wrap is the one place the
   window arithmetic can be wrong in a way that shows only in the Pacific.
6. **The page table names the finest resident ancestor.** Given a resident set holding a
   coarse tile and one of its fine descendants, the cells under the descendant name the
   FINE slot and its sibling cells name the COARSE slot. This single property IS the
   graceful-degradation mechanism from design 5; if it regresses you get holes or
   wrong-area sampling.
7. **A rebuilt page table never names an evicted slot.** After `allocate` evicts, rebuilding
   yields no cell pointing at the recycled slot. A regression test by construction against
   the "eviction granularity must match slot granularity" landmine.
8. **`packEarthSurfaceUniforms` byte offsets.** The existing test
   (`tests/utils/gpu/packEarthSurfaceUniforms.test.ts`) extends to the window fields. This is
   a keep-rule test per `testing.md`: a WGSL/TS layout contract whose breakage is invisible
   until iOS silently drops the frame.

**Repairs, not new tests:**

- `tests/services/gpu/resources/textureAtlas.test.ts` constructs `new TextureAtlas(device)`.
  PREP 1's defaults keep it green; construct explicitly where the geometry is the subject.
- PREP 2's rename drags `tests/services/engine/subsystems/galaxyAtlasSubsystem.test.ts`
  along automatically via `npm run move-files`; only the symbol names inside change.

**Nothing else earns a test.** The level caps, the tile edge and the WebP quality are
constants, and a test would restate them. `earthTilePath`'s output string is the same.
`EarthImagerySource` conformance is a compiler check. The colour grade is judged by eye on
real imagery, not by an assertion. Atlas pixel correctness, sRGB versus linear decode, seam
appearance and fade timing all need a GPU and an eye, and belong to the visual pass. The
manifest's shape is enforced by its type at the one parse site.

## Verification

**`npm run perf` before and after, in this worktree, with `--url http://localhost:<port>`
read off THIS server's `Local:` line.** Read the `perf` skill first. Two questions only:

1. Does the extra fragment work (one `textureLoad`, one `textureSampleLevel`, one `mix`)
   move the Earth draw when Earth fills the frame? Earth is drawn into the opaque near-field
   foreground target and can cover the whole viewport, so this is a full-screen fragment
   cost, which is exactly the regime `docs/RENDERER.md` and the perf notes say to be careful
   in.
2. Does the extra atlas move anything through memory pressure?

Manual, in Chrome DevTools, with cold-cache discipline:

- Descend to Earth from a cold load and watch the Network tab: tiles arrive
  largest-on-screen-first, at most 4 concurrently, and stop arriving when the camera stops.
- The surface refines progressively and does not pop against the base (the fade), and there
  is never a hole or a black tile.
- Coastlines: the land/ocean transition must fall on the true coastline, not on a tile
  boundary, and ocean must keep the base texture's appearance.
- Tile seams: look along a terminator and along a coastline at high magnification, which is
  where a half-texel clamp error or a wrong `flipY` would show.
- The window frontier: pan hard sideways at low altitude and check that the far limb dropping
  to base resolution is not an obvious moving edge.
- Colour: the graded imagery must sit against the whole-globe base without a visible tonal
  step at the frontier where tiles end. This is the fallback source's main risk and it is a
  grade-parameter judgement, not a code bug.
- Turn the camera away and back: the atlas must not thrash (watch for a sustained fetch
  stream while stationary, which means the planner is oscillating at a level boundary).
- **iOS.** A bad shader freezes the whole canvas silently. Check the descent on a real
  device before merging.

## Non-goals

Explicitly out of scope. Each is a deliberate exclusion, not an oversight.

- **Live tile streaming from a third-party service.** Rejected in "Decisions". No SLA, no
  CDN, throttled responses that redirect to HTML, and a documented history of endpoint moves
  breaking downstream consumers.
- **A runtime tile-provider abstraction.** Rejected in design 1. One implementation forever
  does not earn an interface; the variability is at build time.
- **Per-tile radiometric matching and seam blending.** Verified unnecessary for the fallback
  source (adjacent 1-degree tiles differ by about 3 percent, which is ground content).
- **Ocean, ice and cloud imagery from the tile source.** The whole-globe base supplies them,
  and tile alpha is the mechanism (design 5).
- **Geometry LOD.** The mesh stays at its fixed subdivision. `cubeSphereMesh`'s
  `(face, level, tileX, tileY)` addressing stays dormant scaffolding.
- **Elevation displacement / real 3D relief.** Relief stays faked by the normal map. This is
  the named possible escalation, later, if the flat-limb silhouette becomes the thing that
  breaks the illusion.
- **Camera surface-directed zoom.** Dollying toward a cursor-picked surface point instead of
  the planet centre. Investigated and deferred to its own effort; without it, very close
  approaches still orbit the centre.
- **Tiling night, clouds or material.** They keep their whole-globe textures.
- **Other bodies.** The Moon and Mars have sources that would support this, but nothing here
  is generalised across bodies and the `bodyTextureRegistry` deliberately learns nothing about
  tiling.
- **GPU feedback-buffer residency.** Rejected in design 3.
- **Dropping the whole-globe surface to `medium` while the virtual texture is engaged.** The
  obvious way to pay back the atlas memory; out of scope because it braids the tier clamp
  with virtual-texture residency.
- **A client-side coverage index for land-only sources.** A 404 marking a key failed is
  enough (design 8).

## Phases

Outline only. The detailed TDD task list is a separate later artifact. The ordering puts the
large acquisition **last**, so nothing waits on the open source question.

- **PREP 1** - parameterize `TextureAtlas` with `{ atlasSide, slotSide, format }`. Own commit.
- **PREP 2** - `GalaxyAtlasSubsystem` to `BitmapStreamSubsystem` via `npm run move-files`.
  Own commit. PREP 1 and PREP 2 ship as their own PR, merged before the feature branch opens.
- **Phase A** - pure tile math: the `@types`, `earthTilePath`, tile/uv conversion,
  `planEarthTiles` including window derivation, `buildEarthPageTable`. No GPU, no network,
  fully unit-tested. This is where tests 1 to 7 land.
- **Phase B** - the development pyramid: `buildEarthTiles` with a trivial "existing equirect
  file" source, producing a real z5 pyramid from the BMNG file already on disk. 512 tiles, no
  download. Verify one level visually as flat files before wiring anything.
- **Phase C** - the runtime: `earthTileSubsystem`, the atlas, the page-table texture, the
  fetch queue, the `runFrame` drive site, the manifest fetch.
- **Phase D** - the shader and renderer: the new bindings, the window uniforms and their
  parity test, the page-table lookup, the base `mix`, the fade. Meticulous WESL pass, single
  quotes in comments, `?static` imports, visual verification with a tint probe before trusting
  it. **At the end of Phase D the feature is complete and visibly working at z5**, which is
  where the Q1 look judgement can also be made.
- **Phase E** - the real source: whichever of EOX or WorldCover the answer to Q2 selects. The
  `EarthImagerySource` implementation, the colour grade iteration, the registry rows and
  licence notes, the attribution in the Splash credits. Gated on an explicit go-ahead for the
  download, with its size stated.
- **Phase F** - `collectEarthTiles`, the resumable R2 sync, `docs/DEPLOY.md`, and the perf
  pass.

## Corrections to the record

Verified against the code and against the live upstream while writing this spec.

1. **`packEarthSurfaceUniforms` has exactly three free pad slots** (`:57`, `:108`, f32 29..31),
   which is exactly what the surface-only window needs. This was not known when the shape was
   sketched and it is what makes the uniform change free rather than a struct-size change with
   a matching WESL edit. It is also a real argument in Q1.
2. **`PriorityQueue`'s concurrency limit is already a constructor argument**, defaulting to
   `MAX_CONCURRENT_FETCHES` (`priorityQueue.ts:65`). The boot-load-priority work landed that
   change. So "reuse as-is" is even more true than the ground-preparation pass recorded: no
   per-instance limit prep is needed either.
3. **Line references shifted by the boot-load-priority feature**, which landed
   `setPlaceholderMap` into `earthRenderer.ts` after the ground-preparation pass took its
   numbers. Corrected here: `CUBESPHERE_FACE_RESOLUTION` is `:149`, the face concatenation is
   `concatCubeSphereFaces` at `:201-257` called at `:286`, the no-runtime-LOD note is
   `:141-148`, the pipeline is `:437-482`, `setMap` is `:486-535`, the bind group is built at
   `:412-425`. In the shader, the albedo sample is `fragment.wesl:174` (not `:173`), material
   `:175`, normal `:183`, night `:238`. `TextureAtlas`'s `initTexture` is `:95-112` and
   `uploadBitmap` `:131-140`. The claims themselves all held.
4. **`earthRenderer` already has a placeholder layer with exactly the arrival-order property
   this feature wants.** `committed` versus `placeholders` (`:348-376`, `:532`, `:598`) means
   neither setter can free the other's texture. The virtual texture is a third layer above
   both and inherits the same discipline: it never writes either map, it only changes what
   the fragment blends on top.
5. **The deploy collector cannot see a nested tree.** `collectTextureImages`
   (`collectTextureImages.ts:36-46`) is a deliberate single-level `readdirSync`. This was not
   in the ground-preparation pass and is a real piece of missing joint; it is folded into
   Phase F as `collectEarthTiles`, index-driven rather than filesystem-driven.
6. **A land/water mask raw source already exists** (`rawDataRegistry.ts:620-626`,
   `world.watermask.21600x10800.png`, land 255 / water 0, feeding the material map). It is
   1.85 km per pixel, so it is useless as a coastline mask at 10 to 40 m and is NOT the
   mechanism in design 5. It is noted because it is the obvious wrong answer to reach for.
   The fallback source's `nodata = 0` is an exact 10 m mask; the primary source has none and
   would need one, which is a point against it beyond the access blocker.
7. **The build tool has `sharp` (0.34.5) but no TIFF/COG reader and no AWS SDK.** The COG
   path needs a TIFF parser added; it does not need an AWS SDK, because the bucket is public
   and plain HTTP `Range` requests reach it.
