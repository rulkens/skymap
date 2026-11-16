# Moon surface tiles — design

Status: approved shape (ground check, ask zsQX, 2026-11-11). Worktree `moon-surface-tiles`, stacked on
the prep PR (branch `moon-surface-tiles-prep`).

## Intent

Earth and Mars stream albedo and height tiles on close approach; the Moon still draws one 8k Solar
System Scope texture (~1.3 km/px) with a normal map baked from a 5760×2880 LOLA grid (~1.9 km/px).
This change gives the Moon a global tile pyramid: the LROC WAC 100 m mosaic, de-lit against the LOLA
118 m DEM, and LOLA heights, through the per-body stack Mars already uses.

## Goals

- Albedo and height tiles z3–z7 over the whole Moon: 65,536 texels around the equator, 167 m/texel,
  height posts every 667 m.
- No Moon-specific code on the runtime path: one `SURFACE_TILE_REGISTRY` row.
- The tiles read like the base globe at hand-off: same mean colour and spread at z4.
- Before/after eye check at three poses (a mare edge, a highland crater, a high-latitude view).

## Non-goals

- Apollo landing-site boxes (LROC NAC DTMs and orthos). Ruled later (ask Wwd2); needs the Apollo
  sites as scene rows first.
- Albedo past z7. z8 (83 m) would use all of WAC but costs about four times the tiles.
- Height past the albedo levels. A band's height rides its imagery levels (`bakeAll`), so LOLA's
  118 m posts are decimated to z7's 667 m. A height-only deeper band is its own feature.
- Changing the Moon's base globe texture or normal map.
- SLDEM2015 (59 m, ±60° only). A later upgrade if the LOLA track striping shows.

## Constraints

- Sources (verified 2026-11-11, `gdalinfo`): both equirectangular, lon0 0, sphere R = 1,737,400 m.
  - `Lunar_LRO_LROC-WAC_Mosaic_global_100m_June2013.tif`: 109164×54582, Byte grey, nodata 0, 100 m.
  - `Lunar_LRO_LOLA_Global_LDEM_118m_Mar2014.tif`: 92160×46080, Int16, scale 0.5 m, nodata −32768.
  - Both ship as strip TIFFs; converted to tiled COGs (512 blocks, no overviews): WAC JPEG q95, LOLA
    `-unscale -ot Float32` DEFLATE predictor 3, so heights are metres and the reader needs no scale
    field. Originals deleted after conversion (ruled, ask zsQX); each README keeps the URL and the
    `gdal_translate` line.
- Datum: the scene's Moon is 1,737,000 m; the sources sit on the 1,737,400 m sphere, so the bake adds
  `MOON_SOURCE_SPHERE_RADIUS_M − MOON_DATUM_RADIUS_M` = +400 m, derived, never a literal.
- The WAC "morphologic" mosaic is shot at 55–75° incidence. A slope-vs-brightness fit (2026-11-11)
  puts its Sun over the equator ~72° of longitude from each point, east of it from −180° to −90° and
  west of it from −90° to +180°, so no fixed photo Sun fits: `delightedImagerySource` takes a
  `PhotoSun` union whose `subsolar` variant models this. Above ~65° latitude, hard cast shadows
  carry no detail to recover: accepted for this PR, flagged at the eye check.
- Licence: LROC WAC and LOLA are NASA products, public domain (NASA/GSFC/Arizona State University;
  NASA/GSFC LOLA team; USGS Astrogeology).
- A missing `moon-tiles/manifest.json` degrades to the base globe (`fetchSurfaceTileManifest` returns
  null), so code can merge before the owner's R2 sync.
- The owner runs every R2 write.

## Ground preparation

Checkpoint shown 2026-11-11 and signed off (ask zsQX); prep ships as its own PR first (ruled). The
greenfield cross-check agreed with the registry row, the per-body params module and an explicit
radius argument.

- **P1 — de-light takes the sphere radius from its caller.** `delightedImagerySource` imported
  `MARS_IAU_SPHERE_RADIUS_M`; it now takes `sphereRadiusM`. The radius is a body fact, not a recipe
  knob, so it stays out of `AlbedoDelight`.
- **P2 — one `WHOLE_GLOBE_BOUNDS`** in `surfaceTiles/format/data/wholeGlobeBounds.ts`, replacing five
  copies; the Moon would have been the sixth.

Growth (this PR): a `moon` registry row, `moonSurfaceParams.ts`, `reliefM` on the Moon body, a
`moonSurfaceBake.ts` plus its `SURFACE_BODY_BAKES` row, `moonAlbedoRecipe.ts`, two raw-data rows with
READMEs, a fly-to preset. R2 sync already loops the registry (`tools/deploy/syncR2.ts:121`).

Found during the design: the Oren–Nayar irradiance match in `marsSurfaceParams.ts` is a derivation
the Moon needs too. Rather than copy it, its own commit extracts it to
`src/layers/body/surfaceTiles/format/utils/orenNayarMatchedShading.ts` (roughness, f0 →
`SurfaceTileShading`), which Mars then calls.

## Data

```ts
// src/layers/body/surfaceTiles/format/data/moonSurfaceParams.ts
export const MOON_SOURCE_SPHERE_RADIUS_M = 1_737_400;
export const MOON_DATUM_RADIUS_M = 1_737_000;
export const MOON_DATUM_OFFSET_M = MOON_SOURCE_SPHERE_RADIUS_M - MOON_DATUM_RADIUS_M;
export const MOON_SPHERE_RELIEF_M = [min, max] as const; // gdalinfo -mm on the LOLA COG
export const MOON_SURFACE_SHADING: SurfaceTileShading = orenNayarMatchedShading(roughness, f0);

// surfaceTileRegistry.ts
moon: { manifestKey: 'moon-tiles', effects: [], shading: MOON_SURFACE_SHADING },
```

The Moon body (`moon.ts`) takes `datumRadiusM: MOON_DATUM_RADIUS_M` and `reliefM` =
`MOON_SPHERE_RELIEF_M` + offset, as Mars does.

### Bake

`moonSurfaceBake`: `TILE_PREFIX = 'moon-tiles/v1'`, one band from `BAKE_MIN_LEVEL` (one past the
coarsest tier base, z3) to z7: `delightedImagerySource(wac(7), lola(), MOON_WAC_DELIGHT,
MOON_WAC_GRADE, MOON_SOURCE_SPHERE_RADIUS_M)` with `height: lola()` and a constant-zero height
underfill. Dev mode: z4 albedo only, like Mars.

### Recipe

`moonAlbedoRecipe.ts`: a `subsolar` photo Sun (offset ~72°, seam at −90°); `flatten`, `tame` and
`keepIce` off, since the Moon's low-frequency brightness (maria, highlands, rays) is albedo, not
mosaic drift. The grade tints the grey WAC to the base globe: per-channel gain and offset fitted so the
graded z4 level matches the Solar System Scope texture's mean and spread at the same resolution. The
fit is a one-off measurement; its numbers and date go in the recipe's comment.

### Raw data

`lroc.wacGlobal100m` → `data/raw/lroc/…_cog.tif`, `lola.ldem118m` → `data/raw/lola/…_cog.tif`
(`kind: 'file'`, `source: 'gitignored'`, upstream URL, `readme`), READMEs per `docs/DATA.md`.
In a worktree the rasters reach `data/raw/{lroc,lola}/` as leaf symlinks to main's files beside the
tracked READMEs (the Mars F4 convention).

## Docs

`docs/DATA.md` source list; the debug fly-to presets gain a Moon entry (Copernicus).

## Measurement

Tile count and archive bytes per product, reported for the owner's sync. `npm run perf` is not
needed: no shader or per-frame code changes, and the Moon's tile working set is bounded by the same
atlas as Earth's and Mars's.

## Left to the builder

The roughness (start at Mars's 0.9), the de-light knobs past azimuth and `keepIce`, and the exact
grade fit, all judged at the eye check against the base globe.
