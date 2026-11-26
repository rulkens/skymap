# Terrain horizon shadows: design spec

> **Status.** Draft, 2026-11-25. Owner: Alexander Rulkens. Shape signed off at the refactor-ground
> checkpoint on 2026-11-24 (encoding C4, explicit flat entries, 2×2-packed RGBA8 atlas, prep as
> its own PR).
> **Written against** main at bfff3d7d8; references re-verified at 9e7b682c2. The spike branch
> `worktree-terrain-horizon-shadow-spike` is evidence only. None of its code lands (§11).

## 1. Goal and scope

Terrain casts sun shadows on Earth, the Moon and Mars, from orbit down to the surface. Mountains
shade valleys, crater rims shade floors, and the terminator seen from orbit gets long shadows.
Shadowed ground keeps its skylight, and valleys see less sky than ridges.

**In:**
- The surface tiles of all three bodies.
- Their whole-globe base renderers: Earth's globe pipeline, and the Moon and Mars on
  `texturedBody`.
- Sky occlusion on the existing ambient term.

**Out:**
- Mesh-body shadows (rovers, landers): `docs/backlog/2026-09-12-mesh-body-shadows.md`.
- Shadows in the air (god rays, mountain shadows in haze).
- Tinting the ambient term with the sky-view LUT: backlogged
  ([`2026-11-25-terrain-ambient-sky-lut-tint.md`](../../backlog/2026-11-25-terrain-ambient-sky-lut-tint.md)).

## 2. Evidence from the spike

Branch `worktree-terrain-horizon-shadow-spike`. Offline harness and tables:
`tools/spikes/horizonShadow/` (`summary.md`, `summary-r2.md`, `summary-r3.md`).

- **Encodings** (rounds 1–2). Five sites (Copernicus, Valles Marineris, Jezero, Everest, Grand
  Canyon) × 9 sun poses, scored against an exact ray-marched reference. "Gross" errors are leaks
  or missing shadows more than one post from an edge.

  | Encoding | Gross errors | Size |
  |---|---|---|
  | C4 (16 azimuths, quarter density) | 0.39–1.07% | 0.52–1.02× the height tile |
  | E4 (8 Fourier terms, quarter density) | 0.42–2.39% | 0.24–0.52× |
  | Lossy WebP | — | 4–8× the gross error: rejected |
  | 8 azimuths | — | misses whole sunlit lobes 22.5° off-bin: rejected |

- **Runtime march: rejected.** In-app commits 25a5dcb23..97dfb90b5, at the `mars-jezero-146km`
  pose, 2800×1800: +10.2 ms GPU at 32 reads, +19.7 ms at 64.
- **Bake** (in-app commits f31ab0ebf, ef25234e7): +0.85–1.0 ms GPU at the same pose with a 4.4°
  sun. It matches March 32 at Valles, Jezero and Copernicus.
- **Full rollout** (round 3, 3,870 sampled tiles): C4 is **340 ± 7 MB** with flat tiles skipped
  at θ = 1°.

  | Body | C4 | Height | Flat tiles |
  |---|---|---|---|
  | Earth | 111 MB | 163 MB | 26% |
  | Moon | 129 MB | 251 MB | 0% |
  | Mars | 100 MB | 238 MB | 0% |

  The baker takes ≈1.06 s per tile on one thread, ≈14 CPU-hours for 46k tiles.

## 3. Data format

`'horizon'` is the fourth row of `SURFACE_TILE_PRODUCTS`
(`src/layers/body/surfaceTiles/format/data/surfaceTileProducts.ts:2`). It lives under the body's
existing versioned prefix (`earth-tiles/v11/horizon/…`) and is packed into archives like the other
three products.

- **Grid.** 33×33 posts per tile, on the same lattice as height's 129 posts decimated by 4. Post
  (0,0) is the tile's north-west corner, matching height.
- **Value.** The horizon elevation angle per post in 16 sectors, sector k centred on azimuth
  k·22.5° clockwise from local north. Each angle is one byte on a piecewise map: −3…27° over
  bytes 0–204 (0.147° steps, under the Mars sun radius), 27…90° over 205–255. The map lives in
  one data module that both the baker and the WGSL decode read; a test pins the two together.
- **Packing.** Each post is a 2×2 block of RGBA8 texels, sectors 0–15 in row-major texel order and
  then RGBA order. A tile is a 66×66 lossless WebP.
- **Flat tile.** When the tile's maximum horizon over all posts and sectors is under 1°, the
  archive index gets a **zero-length entry** and no bytes. Why 1° is safe: such a tile has no slope
  over ≈1°, so N·L ≤ sin 1° wherever the sun is that low, and extinction already darkens Earth and
  Mars there.
- **Height coupling.** The prefix pins the height build: prefixes bump only when existing bytes
  change (`tools/textures/surfaceBodies/earthSurfaceBake.ts:36-44`). Rule: any height re-bake
  re-bakes horizon over the changed area, grown by the bake's search radius (§4).
- **Manifest.** `builtFrom.horizon` per band, with the `sourceId` `derived:height`.

## 4. The bake

`tools/textures/surfaceHorizon/bakeSurfaceHorizon.ts` (types in its own `@types/`) runs after a
body's height bake and before packing:

```
npm run bake-horizon -- --body moon [--band <i>] [--workers N]
```

- **Input:** that body's height archives on local disk, read through the existing archive reader.
- **Search:**
  - Per post and sector, march outward. Each step reads the finest level that still resolves it,
    so the far field uses coarser ancestors (the multi-resolution march of
    `tools/spikes/horizonShadow/`).
  - Drop with planet curvature, d²/2R.
  - Stop once nothing can rise above the current maximum, bounded by the `subtreeMaxM` of the z3
    ancestor and its neighbours, all columns of a polar row (the height header).
  - Mars's missing z8–9 levels make the far field step from z10 straight to z7. That is
    deliberate.
- **Parallelism:** `worker_threads`, one tile per task. A tile's result depends only on the height
  archives, so the bake resumes by skipping tiles already written.
- **Output:** `horizon/<z>/<x>/<y>.webp`, or a zero-byte file for a flat tile. The packer
  (`tools/utils/textures/packSurfaceTileLevels.ts:49`) already sizes entries by `statSync`, so a
  zero-byte file becomes a zero-length entry with no packer change; a test pins it.
- **Globe images:** the same tool repacks the whole-globe `horizon` texture kind from the coarse
  C4 tiles (§7). There is no separate globe bake.

## 5. Runtime

- **Lane.** The horizon row of `SURFACE_TILE_LANE_SPECS`
  (`src/layers/body/surfaceTiles/stream/data/surfaceTileLaneSpecs.ts:24`):
  - `slotSide` 66 px;
  - `rgba8unorm`;
  - an atlas of 32 × 32 slots (2112², 17.8 MB, the same slot count as height);
  - `role: 'standalone'` (its level cap is its bands' deepest `max`);
  - fetched like height, as an `ImageBitmap` with `colorSpaceConversion: 'none'` and
    `premultiplyAlpha: 'none'` (`fetchHeightTile.ts:29-30`).
- **Upload:** `copyExternalImageToTexture` only, never canvas `getImageData` (RENDERER.md:69).
- **No data.** A zero rect means "no horizon data": the lookup skips the map and returns sun and
  sky visibility 1, so the surface draws exactly as it does without horizon. Byte 0 (−3°) is not
  enough: it still cuts the sun below −3.27° geometric elevation at the terminator. Tiles and
  globe share this one convention, and no atlas slot is reserved.
- **Residency** (one resolver for standalone products, prep 3):
  - own tile `'empty'` → zero rect, and the walk stops;
  - own tile resident → its own rect;
  - otherwise the deepest resident ancestor's sub-rect, flattened like night's. An ancestor that
    is `'empty'` → zero rect.
  - Nothing resident, or the body has no `builtFrom.horizon` → zero rect.
  - Horizon never gates the cut, and it never steers refinement.
- **Instance record.** `PatchInstance` gains `horizonRect: vec4<f32>` (origin.xy, scale.xy in
  atlas UV), after `nightRect`. The stride goes 96 → 112, and the layout test
  (`surfaceTileLayout.ts:17`) moves with it. The fragment gets it as one more flat varying.
- **Shader contract** (`src/services/gpu/shaders/lib/horizonLookup.wesl`):

  ```wgsl
  // x: visible fraction of the sun's disc at this point, 0..1.
  // y: sky-view factor on a horizontal surface, the mean over sectors of cos²(max(h, 0)).
  fn horizonVisibility(atlas: texture_2d<f32>, rect: vec4<f32>, uv: vec2<f32>,
                       sunAzimuthRad: f32, sunElevationRad: f32, sunRadiusRad: f32) -> vec2<f32>
  ```

  - Reads use `textureLoad` with manual bilinear over the four surrounding posts, one load per
    texel of each post's 2×2 block (16 per fragment, 8 on a coarse pointer, §7), shared by sun
    and sky. Each post is
    decoded to angles before interpolating: the map has a knee, so filtering bytes is wrong.
  - The sun's azimuth and elevation come from the sun direction in the fragment's local
    east/north/up frame.
  - Sun angular radius: Earth and Moon 0.267°, Mars 0.175°, a per-body uniform.
- **Bindings.** The horizon atlas is the lane row's `binding` (11, the next free slot after
  `surfaceTileShaderVariants.ts:14-18`), listed by every fragment variant, because horizon is
  unconditional and is not a `SurfaceEffect`. When the body has no horizon lane engaged, the
  pass binds a 1×1 stand-in, which no fragment reads, since every rect is then zero.

## 6. Lighting

Every surface shader composes through one helper (prep 4):

```wgsl
fn composeSurfaceLight(directLit: vec3<f32>, ambientLit: vec3<f32>,
                       sunVisibility: f32, skyVisibility: f32) -> vec3<f32>
```

- **Sun visibility** scales only the direct term. Cloud shadow (Earth) multiplies it as today.
- **Night lights** keep gating on the datum normal (RENDERER.md:75), untouched.
- **Sky visibility** scales the existing ambient term (`BODY_AMBIENT_LIGHT` on tiles; the split-out
  ambient on `texturedBody`). It doesn't change the term's colour.

## 7. The whole globe

`'horizon'` joins `TextureKind` (`src/@types/data/TextureKind.d.ts:16`):

- **Earth:** a row in `earthRenderer.ts:39-50` at binding 7 (`earth/fragment.wesl` uses 0–6),
  forced because that table is total over the kinds.
- **Moon and Mars:** a row in `texturedBodyRenderer.ts:38-41` (binding 5 is free).
- **Linear data:** `'horizon'` joins `isLinearTextureKind` (`src/utils/bodyTextures/isLinearTextureKind.ts:26`),
  the one home for that axis, which gives it the WebP name, the linear decode and `rgba8unorm`.
- **Registry:** a `kinds.horizon` tier in each body's `bodyTextureRegistry.ts` row.

| Tier | Repacked from | Posts | Packed image |
|---|---|---|---|
| small | z4 C4 tiles | 512 × 256 | 1024 × 512 |
| medium | z5 | 1024 × 512 | 2048 × 1024 |
| large | z6 | 2048 × 1024 | 4096 × 2048, 32 MB GPU |

- Until a map is committed the globe's uniform `horizonRect` is zero, so it draws as today; with
  one it is (0, 0, 1, 1). The 1×1 placeholder is only something to bind.
- Flat tiles repack as byte 0.
- The globe shaders call the same `horizonLookup` functions, with the rect set to the whole globe.
- The globe and the tiles read the same values at the hand-off, so nothing pops.
- **Phones read the sun only.** On a coarse pointer (`matchMedia('(pointer: coarse)')`, read once
  when the body Layer builds its pipelines) every pipeline linking `horizonLookup` sets its
  `HORIZON_SKY` override false: each post loads only the texels of the two sunward sectors, 8
  loads instead of 16, with the same sun and a sky term of 1. A fine pointer keeps all 16 and the
  sky term. On a OnePlus 7T at close Jezero: 16.8 ms (57.5 fps) without horizon, 21.1 ms median
  (p90 51 ms, 37.9 fps) with 16 loads, 16.8 ms (p90 18.6 ms, 55.5 fps) with 8. Desktop pays
  about 1.0 ms for 16.

## 8. Deploy and size

- **R2:** about 340 MB (Earth 111, Moon 129, Mars 100) plus the globe images, roughly 0.5 + 2 +
  8 MB per body per tier.
- **Upload:** `collectSurfaceTiles.ts:26` reads products from `builtFrom`, and the offline
  inventory and cache rules (`tools/deploy/syncR2.ts:136-152`) need no edit. Sync with
  `npm run sync-r2-secure`.
- **Per session:** horizon adds about 15–25% to a terrain session's bytes.
- **GPU:** 17.8 MB for the horizon atlas, plus the globe map.

## 9. Ground preparation

Run 2026-11-24.
- **Baseline:** `origin/main`.
- **Greenfield cross-check:** agreed on a separate product, explicit flat state, a sentinel and a
  globe repacked from the tiles.
- **Diverged** on an `rgba32uint` atlas (ruled out: it needs a non-canvas decoder, and its bytes
  are unmeasured) and on a height-build id in the horizon index (unneeded: the prefix pins the
  height build).

| # | Prep commit | Bolt-on it removes |
|---|---|---|
| 1 | `readTile` returns `TileRead = { kind: 'bytes', bytes } \| { kind: 'empty' } \| { kind: 'missing' } \| { kind: 'failed' }`; a zero-length entry reads `'empty'` without a fetch. On `'empty'` the lane records the key as empty and uploads nothing; the planner (`planSurfaceTiles.ts:83-91`) neither touches nor re-requests an empty key, so LRU reclaims the slot it was allocated (no slot-release API is added). | Today not-in-index, a 404 and a timeout all return `null`, and `null` marks the key failed for the session (`createArchiveTileSource.ts:57-83`, `services/engine/subsystems/tileStreamSubsystem.ts:94-95`). |
| 2 | Lane rows carry `role: 'gates-cut' \| 'standalone'`, `binding` and `reservedSlots?`. A standalone product's level cap is not a row field: it is the deepest `max` of its own request bands, as night's is today (`cutSurfaceTiles.ts:113-116`). `derivePlannerParams`, the renderer's bind group and the pass's draw args read the table (`Record<SurfaceTileProduct, GPUTextureView>`). | Per-product request lines (`derivePlannerParams.ts:41-58`), fixed bindings (`surfaceTileRenderer.ts:86-111`) and named atlas args (`surfaceTilesPass.ts:42-43`). Horizon would be the second copy of night's line. |
| 3 | One standalone resolver, generalised from `nightOf` (`cutSurfaceTiles.ts:326-338`). `SurfaceCutTile.night` becomes `standalone: Readonly<Record<StandaloneProduct, StandaloneRect>>`, with `StandaloneRect = { atlasUvOrigin, atlasUvScale } \| 'empty' \| null`. | One field and one resolver per product (`SurfaceCutTile.d.ts:31`); horizon would be `horizonOf` beside `nightOf`. |
| 4 | `composeSurfaceLight` in `lib/`, replacing the three copies of the lighting line (`fragmentBare.wesl:36`, `fragmentEarth.wesl:71`, `earth/fragment.wesl:136`). `texturedBody` splits `AMBIENT` out of `litShade` (`lib/bodyLighting.wesl:34-39`; `planet/fragment.wesl:54` keeps calling `litShade`). | Pasting the visibility multiply into four shaders. |

**Growth (plain additions):**
- the product row, the lane row, the path `EXT` row (`surfaceTilePath.ts:8`);
- the bake tool, `builtFrom.horizon`;
- the `TextureKind` row and its kind rows;
- `horizonLookup.wesl`, `horizonRect`;
- the packer, R2 collection and offline inventory, which are manifest-driven.

**Each prep commit is behaviour-neutral:** shots match the pre-prep shots within float rounding
(splitting `albedo * shade` into `direct + ambient` may move a pixel by one step), and the suite
stays green.

## 10. Tests

Per `testing.md`, only what can fail on a real bug:
- **Angle map:** a round-trip pins the baker's byte map to the WGSL decode constants.
- **Bake:** a synthetic heightfield (a single ridge on a sphere) has its shadow on the anti-sun
  side, at the analytic horizon angle within one byte. A flat tile writes zero bytes.
- **TileRead:** zero-length entry → `'empty'`; not in index → `'missing'`; a 404 or abort →
  `'failed'`. `'failed'` keeps today's session-long `failedKeys` rule. `'empty'` counts as
  resident, not failed, and never refetches.
- **Resolver:** an own `'empty'` stops the walk at the zero rect even when the ancestor is
  resident; a resident ancestor gives a flattened sub-rect.
- **Layout:** the `PatchInstance` 112-byte stride and the `horizonRect` offset.
- **Eye check:** shots of the five spike sites and the Moon terminator, against the spike's
  `bake-spike/*-bakeC4.jpg`, with the owner's verdict. Perf: `npm run perf` at the Jezero pose,
  low sun, against the ≈1 ms budget.

## 11. Risks and open items

- **Everest (left open by the owner).** In the spike the bake shows far more shadow than March 32,
  and March 64 doesn't move toward it. The bake's own march puts 67.5% of the band in shadow at
  that sun. Unresolved; the eye check at Everest decides whether it ships as is.
- **Moon double shadows.** The WAC albedo has cast shadows baked in above ≈65° latitude, and real
  shadows darken them again ([backlog](../../backlog/2026-11-11-moon-polar-cast-shadows.md)).
  Judged at the eye check, not fixed here.
- **Band-edge seams.** Where a detail band meets the global height data, a height step between the
  two sources gives straight shadow edges. The spike showed them at Jezero and Everest.
- **A new upload format.** This is the atlas's first data-in-RGBA payload with a 2×2 post packing.
  A wrong post-to-texel order gives plausible but wrong shadows, which is why the round-trip and
  ridge tests exist.
- **Bake time.** About 14 CPU-hours, so a height re-bake now also costs a horizon re-bake, run
  overnight on all cores.
- **The spike branch** carries the rejected march, the side storage buffer and the z4 global
  height lattice. None of it is cherry-picked; the feature is built fresh on the prepped main.

## 12. Packaging

1. **Prep PR:** commits 1–4 of §9, behaviour-neutral.
2. **Feature PR:** stacked on main after the prep merges. It holds the bake tool, the product, the
   globe kind, the shaders and the tests, plus the R2 sync of the baked horizon as the owner's
   step.
