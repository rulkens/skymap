# Terrain F4 — Mars terrain — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development under the lean protocol (`docs/superpowers/conventions/sdd-execution.md`). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Mars gets streamed albedo and height tiles: Viking + MOLA globally at z3–z7, and HiRISE ortho + DTM boxes at the rover sites, drawn through the per-body stack that #738 built.

**Architecture:** One `mars` row in `SURFACE_TILE_REGISTRY` (no effects) and one `marsSurfaceBake` entry in `SURFACE_BODY_BAKES`. Two generic GeoTIFF sources (height, imagery) replace any Mars-specific reader. The runtime changes only where Earth was special: the textured base globe moves to the inner bound, and the tile ambient stops reading Earth's slider for other bodies. Rovers standing on terrain come from F3a's height lookup, merged in last.

**Tech Stack:** TS, sharp/libvips (windowed GeoTIFF reads), tsx tools, WebGPU/WESL, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-13-per-planet-terrain-design.md` §3.8, §4.1–4.3, §9, §10. Prep: `docs/superpowers/plans/completed/2026-09-16-terrain-f4-prep.md` (its deferral list is this plan's scope).

## Global Constraints

- Worktree `.claude/worktrees/mars-terrain-feature`, branch `worktree-mars-terrain-feature`, one PR (draft early, `--base main`). **Merges only after F3a's feature PR is on main** (Task 7). Until then every Mars rover sits at the datum, ~1.5–6 km under the terrain, and the camera floor ignores terrain.
- **Shared data:** `public/data` is a symlink to main's. A `--body mars` bake writes only `public/data/images/mars-tiles/`. **Never run `--body earth` here.** After every Mars bake, check main's `public/data/images/earth-tiles/manifest.json` mtime is unchanged.
- **Datum (user ruling 2026-09-16):** heights on the wire are metres above the scene's `datumRadiusM` = 3,390,000 m. Every Mars source (MOLA, all HiRISE DTMs) is areoid-relative topography, treated as relative to the 3,396,190 m IAU sphere, so the bake adds `MARS_IAU_SPHERE_RADIUS_M − datumRadiusM` = **+6,190 m**, as a derived named constant, never a literal. Up to ~20 km of areoid error near the poles is accepted.
- Height encoding is global Terrain-RGB (`src/data/scene/heightTileFormat.ts:38-40`, −32,768 m … +1.6e6 m at 0.1 m): Mars fits, no format change.
- Raw data lives in main's `data/raw/{mola,viking,hirise/*}`, reached only through `tools/utils/io/rawDataRegistry.ts` keys. Never extract, move or download without the controller announcing it first.
- Frame files (`src/services/engine/frame/**`) export only their own symbol (ratchet `tests/services/engine/frame/frameFilePurity.test.ts`). One symbol per file in `utils/` and `@types/`; `type`, never `interface`; comments per `docs/superpowers/conventions/comments.md`.
- WGSL: never pass a storage-buffer struct by value into a function (Adreno).
- Git: user identity, no Co-Authored-By trailer, no `git add -A`, `git status` clean of unintended files before each commit, prettier on touched files only.

## Source facts (census 2026-09-17)

All rasters: equirectangular, lat_ts 0, lon0 0, sphere R = 3,396,190 m (lon = x/R, lat = y/R).

| key (new)                 | file                                                                                            | size / layout                             | type, nodata                     | px      | bounds (lon, lat °)              |
| ------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------- | ------- | -------------------------------- |
| `mola.dem463`             | `mola/Mars_MGS_MOLA_DEM_mosaic_global_463m.tif`                                                 | 2.1 GB, 46080×23040, strip                | Int16, −32768                    | 463 m   | global                           |
| `viking.mdim21`           | `viking/Mars_Viking_MDIM21_ClrMosaic_global_232m.tif`                                           | 12.7 GB, 92160×46080, strip, RGB          | Byte, 0                          | 232 m   | global                           |
| `hirise.gale.dtm`         | `hirise/gale/MSL_Gale_DEM_Mosaic_1m_v3.tif`                                                     | 3.9 GB, LZW strip                         | Float32, −32767                  | 1 m     | 137.124–137.681, −5.099–−4.130   |
| `hirise.gale.ortho`       | `hirise/gale/MSL_Gale_HiRISE-LRGB_78quads_sharp_cog.tif`                                        | 1.0 GB, JPEG-YCbCr COG, RGB               | Byte, mask                       | 0.25 m  | 137.327–137.479, −4.876–−4.555   |
| `hirise.gusev.dtm`        | `hirise/gusev/DTEEC_001513_1655_001777_1650_U01.tif`                                            | 136 MB COG                                | Float32, −3.4e38                 | 1.01 m  | 175.442–175.555, −14.677–−14.492 |
| `hirise.gusev.ortho`      | `hirise/gusev/PSP_001513_1655_RED_A_01_ORTHO.tif`                                               | 696 MB COG, grey                          | UInt16, 0                        | 0.254 m | = DTM                            |
| `hirise.endeavour.dtm`    | `hirise/meridiani-endeavour/DTEEC_018701_1775_018846_1775_U01.tif`                              | 248 MB COG                                | Float32, −3.4e38                 | 1.01 m  | −5.445–−5.311, −2.491–−2.125     |
| `hirise.endeavour.ortho`  | `hirise/meridiani-endeavour/ESP_018701_1775_RED_A_01_ORTHO.tif`                                 | 1.6 GB COG, grey                          | UInt16, 0 (Offset/Scale tag)     | 0.253 m | = DTM                            |
| _(eagle, not baked — R1)_ | `hirise/meridiani-landing/DTEEC_001414_1780_001612_1780_U01.tif`                                | 4.8 MB COG                                | Float32, −3.4e38                 | 1.01 m  | −5.507–−5.485, −2.065–−2.036     |
| _(eagle, not baked — R1)_ | `hirise/meridiani-landing/PSP_001414_1780_RED_A_01_ORTHO.tif`                                   | 23 MB COG, grey                           | UInt16, 0                        | 0.253 m | = DTM                            |
| `hirise.jezero.dtm`       | `hirise/jezero/MSR_hirise_soc_003_DTM_MOLATopography_DeltaGeoid_1m_Eqc_latTs0_lon0_Blend40.tif` | 712 MB, 19144×26816, LZW tiled 256        | Float32, −32767 (areoid, README) | 1 m     | 77.058–77.381, 18.136–18.588     |
| `hirise.jezero.ortho`     | `hirise/jezero/MSR_hirise_soc_003_Orthomosaic_0.25m_Eqc_latTs0_lon0_First_NoBlend.tif`          | 4.7 GB, 76576×107264, LZW tiled 256, grey | Byte, 0                          | 0.25 m  | = DTM                            |

Rover rows (`src/data/bodies/surfaceFixedSites.ts:22-55`): curiosity −4.5895, 137.4417 (inside Gale); spirit −14.5684, 175.4726 (inside Gusev); perseverance 18.4447, 77.4508 (landing site, ~4 km east of the Jezero box; moves per R4); opportunity −1.9462, 354.4734 (Eagle crater, outside both Meridiani DTMs; moves per R1).

## Rulings (user, 2026-09-17)

- **R1 Opportunity moves** to its final resting place in Perseverance Valley: **−2.336, 354.619 E**, the centre of HiRISE ESP_087985_1780 "Opportunity Rover Position" (uahirise.org, 2025). This is a proxy; no official lat/lon fix was found, since the PDS traverse table is site-frame only. The Eagle-crater box (`meridiani-landing`) is not baked and gets no registry row.
- **R2 Site boxes are clipped** to a 3 × 3 km window centred on each rover (`MARS_SITE_WINDOW_M = 3000`), intersected with the file's bounds, so about 550 tiles per site per product. The window is a named constant; widening it later is only a re-bake.
- **R3 Jezero extracted:** the DTM and ortho `.tif` files (plus `.xml` sidecars) sit loose in `data/raw/hirise/jezero/`; the zip stays.
- **R4 Perseverance moves** to its current position: **18.43687 N, 77.23205 E**, sol 1980 (~2026-09-14), end-of-drive RMC 91_970, from `mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints_current.json`. That position is inside the Jezero mosaic with ≥ 8.4 km margin.
- **O4 Base-globe colour** (still open; decided at the eye-check, Task 6): the tiles use Viking MDIM21 while the base globe uses Solar System Scope's `mars-8192`, so a colour step is expected when tiles engage. Either accept it, or rebuild `mars-*` from MDIM21 (`tools/utils/io/textureSources.ts:42`) in this PR.
- **C1 (controller) Raw files reach the worktree through leaf symlinks.** `rawDataPath` resolves against the cwd, so the worktree's `data/raw/{mola,viking,hirise/<site>}/` are real directories: the READMEs in them are tracked, and each raster is a symlink to the same file in main's `data/raw` (gitignored by `/data/**`). Never symlink a directory, because a tracked README can't be committed through one.
- **C2 (controller) Strip rasters were converted to tiled COGs** (a `readBox` on the 12.7 GB strip-layout Viking took 14 s against 9 ms on a tiled COG). The registry points at the converted files: `…global_463m_cog.tif` (DEFLATE), `…ClrMosaic_global_232m_cog.tif` (JPEG q95) and `MSL_Gale_DEM_Mosaic_1m_v3_cog.tif` (DEFLATE). No overviews. Each README records the `gdal_translate` line.
- **C3 (controller) Gale ortho's GDAL internal mask was extracted to its own file**, `MSL_Gale_HiRISE-LRGB_78quads_sharp_mask_cog.tif` (Byte 0/255, same grid, DEFLATE COG, `gdal_translate -b mask -of COG -co COMPRESS=DEFLATE -co BLOCKSIZE=512 -co NUM_THREADS=ALL_CPUS`), because the YCbCr-JPEG COG's mask IFD is one libvips can't open, so near-black JPEG fringe pixels came back opaque instead of transparent. `geoTiffImagerySource` takes it as an optional `maskPath`, wired only for Gale.

---

### Task 1: Raw-data rows and provenance

**Files:**

- Modify: `tools/utils/io/rawDataRegistry.ts` (height section near `'etopo.surface30s'`, :976+)
- Create: `data/raw/mola/README.md`, `data/raw/viking/README.md`, `data/raw/hirise/{gale,gusev,meridiani-endeavour,meridiani-landing}/README.md` (in main's `data/raw` — see step 1)
- Modify: `docs/DATA.md` (source list)

- [x] Confirm how `rawDataPath` resolves from a linked worktree (main's `data/raw` or the worktree's). If the worktree's, stop and report; the controller decides between symlinking `data/raw/{mola,viking,hirise}` and baking from main. — **Resolves to the worktree's own `data/raw`** (`rawDataPath` calls Node's `resolve()` on a relative path against `process.cwd()`; this worktree's `data/raw` is a real, non-symlinked directory that lacks `mola/`, `viking/`, `hirise/` entirely — even `etopo`'s real raster is absent, only its `README.md`/`.sha256` are git-tracked). STOPPED here per instruction; no symlink created. Rest of Task 1 not done — controller to decide symlink vs main-only bake.
- [x] Add the keys in the table above (`kind: 'file'`, `source: 'gitignored'`, `upstream` URL, `readme` key). Use `mola.*`/`viking.*`/`hirise.*` names, not `textures.*`, so the `fetchTextures` rule (`tests/tools/utils/io/rawDataRegistry.test.ts:44-73`) does not apply. No fetchers: the files were fetched by hand; the README records the upstream URL and product ID. Jezero rows point at the extracted `.tif` paths (R3); the header facts go in the table above once read.
- [x] READMEs, per `docs/DATA.md:214-222`: product, upstream, projection, sphere, **vertical reference** (areoid topography; the +6,190 m rebase is the bake's, per spec §4.3), nodata.
- [x] No new test (registry shape is already tested). Commit.

### Task 2: Generic GeoTIFF height and imagery sources

review: yes (binary readers, pixel registration)

**Files:**

- Create: `tools/textures/geoTiffHeightSource.ts`, `tools/textures/geoTiffImagerySource.ts`, `tools/utils/textures/readGeoTiffRgbWindow.ts`
- Test: `tests/tools/textures/geoTiffHeightSource.test.ts`, `tests/tools/textures/geoTiffImagerySource.test.ts`

**Interfaces — Produces:**

```ts
/** Equirectangular GeoTIFF on a sphere; bounds in degrees, pixel-EDGE registered. */
export type GeoTiffGrid = {
  readonly path: string;
  readonly width: number;
  readonly height: number;
  readonly bounds: LonLatBounds; // outer pixel edges
};
export function geoTiffHeightSource(opts: {
  id: string;
  attribution: string;
  provenance: /* HeightSource['provenance'] */;
  grid: GeoTiffGrid;
  nodata: number;         // exact sentinel; also any value ≤ −1e30 is no-data
  offsetM: number;        // added to every valid sample (Mars: +6,190)
  maxLevel: number;
}): HeightSource;          // readGrid → NaN outside bounds and at no-data
export function geoTiffImagerySource(opts: {
  id: string;
  attribution: string;
  provenance: /* SurfaceImagerySource['provenance'] */;
  grid: GeoTiffGrid;
  maxLevel: number;
  /** UInt16 grey only: linear stretch [lo, hi] → 0..255, replicated to RGB. */
  greyStretch?: readonly [number, number];
}): SurfaceImagerySource;  // readBox → RGBA, alpha 0 outside bounds and at no-data (0 / mask)
export function readGeoTiffRgbWindow(path: string, left: number, top: number, width: number, height: number): Promise<Uint8Array>; // RGBA
```

- `coverage` of both is `[grid.bounds]`. `maxLevel` is passed, not derived, so the band table states it.
- Read windows through sharp with `limitInputPixels: false` (as `tools/utils/textures/readGeoTiffWindow.ts:24` does for DEMs; reuse it for heights). Never load a whole raster: Viking is 12.7 GB.
- Bilinear resampling for heights, matching `etopoHeightSource`'s sampling (`tools/textures/etopoHeightSource.ts`); note ETOPO is cell-centred while these files are edge-registered: pixel `i` spans `[west + i·dx, west + (i+1)·dx]`, centre at `+0.5`.
- `boundsInBox` returns `[min, max]` of valid samples in the box (plus `offsetM`).

- [x] Test `geoTiffHeightSource samples a pixel centre exactly, with the offset added` — synthetic 4×2 float GeoTIFF written with sharp; a lattice point on a pixel centre returns that pixel + `offsetM` exactly. Fails on a half-pixel registration bug, which no other check catches. (Sharp's TIFF encoder mangles single-band float32 the same way `dhmTerraenHeightSource`'s tests found, so the fixture is hand-written bytes, not `sharp(...).tiff()`.) This test caught a real bug: the bilinear sum's `0 * NaN = NaN` poisoned an exact landing whenever an off-side neighbour was no-data; fixed with a `weighted()` helper that treats a zero weight as zero regardless of the sample.
- [x] Test `geoTiffHeightSource returns NaN at no-data and outside bounds` — both the exact sentinel and −3.4e38.
- [x] Test `geoTiffImagerySource stretches UInt16 grey to opaque RGB and leaves no-data transparent`. Found a second real bug along the way: sharp/libvips treats a UInt16 GeoTIFF as its `grey16` colourspace and silently rescales 0..65535 -> 0..255 on ANY `raw()`/`extractChannel()` output regardless of the requested `depth` (a known sharp footgun, lovell/sharp#3808) — `readGeoTiffWindow`'s `.toColourspace('b-w')` hits this for UInt16 specifically (it's a no-op relabel for the DEM formats it's actually used for). Fixed with a local `readUInt16GreyWindow` that relabels via `.toColourspace('grey16')` before `raw({depth:'ushort'})`, confirmed against a hand-written UInt16 fixture (same sharp-TIFF-encoder mangling as the float32 case).
- [x] Test `readGeoTiffRgbWindow returns the window's pixels` on a synthetic 8-bit RGB TIFF (asserts channel order and the window offset). (8-bit RGB round-trips through `sharp(...).tiff({compression:'none'})` fine — `compression: 'none'` is load-bearing, the default tiling made `extract` misread the window.)
- [x] Probe with `tsx -e` (not a test): one 512×512 `readBox` on Viking at z7 and on the Gale ortho COG; record wall-clock in the ledger. If Viking takes > 30 s per box, report instead of continuing. — Probed `readGeoTiffRgbWindow` directly (the I/O-dominant call both `readBox` paths make; the resize on top is negligible): **Viking ~13.7-14.0 s** per 512×512 window (STRIP-organized per the census table — no tiling, so a narrow window still forces full-width strip decodes; under the 30 s stop threshold but slow enough to flag for Task 6's bake-time estimate), **Gale ortho ~9 ms** (tiled JPEG-YCbCr COG, as expected).
- [x] Commit.

### Task 3: Colour for the grey HiRISE orthos

**Files:**

- Modify: `tools/textures/colourMatchedImagerySource.ts:63-80` (+ its test)

Spec §4.2: Gusev and Meridiani orthos are single-band RED; their colour comes from the global base. `colourMatchedImagerySource(primary, reference, { sigmaDeg, waterMaskPath })` already moves a primary's low frequencies onto a reference's; it takes land/water classes from a mask.

- [x] Make `waterMaskPath` optional. With no mask every pixel is land (one class). No second wrapper.
- [x] Check that a grey primary (R = G = B) comes out with the reference's hue below `sigmaDeg`: offsets are added per channel, so a grey input gains the reference's chroma. If the offset maths clamps chroma away, report before changing it. — Confirmed by the new test: a flat grey primary against a flat red-brown reference lands within 2/255 of the reference's own per-channel values (chroma intact, nothing clamped away); the per-channel offset math never special-cases grey inputs.
- [x] Test `colourMatchedImagerySource without a water mask gives a grey primary the reference's low-frequency colour` (flat grey primary, flat red-brown reference → output mean ≈ reference mean). Commit.

### Task 4: The Mars row and bake entry

review: yes (datum rebase, bake bands)

**Files:**

- Modify: `src/data/bodies/surfaceTileRegistry.ts`, `tools/textures/buildSurfaceTiles.ts:565-567`
- Create: `tools/textures/surfaceBodies/marsSurfaceBake.ts`, `src/data/bodies/marsSurfaceParams.ts` (or the existing Mars data home, if one exists)
- Modify: `src/data/bodies/scenePlanets.ts:27-32` and/or `src/data/bodies/makers/heliocentricPlanet.ts:21` (Mars `reliefM`)
- Test: `tests/tools/textures/buildSurfaceTiles.test.ts` (only if a new assertion earns it; see below)

**Interfaces — Produces:**

```ts
// surfaceTileRegistry.ts
mars: { manifestKey: 'mars-tiles', effects: [], shading: MARS_SURFACE_SHADING },
// marsSurfaceBake.ts
export const marsSurfaceBake: SurfaceBodyBake; // tileRoot = SURFACE_TILE_REGISTRY.mars.manifestKey, tilePrefix = `${tileRoot}/v1`
export const MARS_IAU_SPHERE_RADIUS_M = 3_396_190; // the sources' reference sphere
// offsetM = MARS_IAU_SPHERE_RADIUS_M − the Mars scene row's datumRadiusM (read the row, don't restate 3,390,000)
```

Bands (priority order, per `tools/textures/SurfaceBakeBand.d.ts`; no `flattenWater` anywhere):

| band      | albedo source                                           | minLevel | maxLevel | height source                                   | underfill                         |
| --------- | ------------------------------------------------------- | -------- | -------- | ----------------------------------------------- | --------------------------------- |
| global    | `viking.mdim21`                                         | base+1\* | 7        | `mola.dem463`                                   | height: `constantHeightSource(0)` |
| each site | HiRISE ortho (grey ones via Task 3, reference = Viking) | 10       | 17       | HiRISE DTM, `voidFilledHeightSource(dtm, mola)` | albedo: Viking; height: MOLA      |

\* `BAKE_MIN_LEVEL` exactly as `earthSurfaceBake.ts:48` computes it, with `'mars'`.

Sites: Gale, Jezero, Gusev, Endeavour (R1), each box = `MARS_SITE_WINDOW_M` square around the rover row's lon/lat, intersected with the DTM ∩ ortho bounds (R2); the bake throws if a rover's window is not wholly inside. The window is computed from the site rows (`SURFACE_FIXED_SITES`), never restated. Grey stretch `[lo, hi]`: the 0.5/99.5 percentiles of a decimated read of each ortho, computed once and written into the band table as named constants with a comment saying how they were measured.

- [x] Add the registry row. The compiler then requires `SURFACE_BODY_BAKES.mars`; `tests/data/bodies/surfaceTileShaderVariants.test.ts` covers the `''` variant. — The registry is now keyed `Partial<Record<BodyTextureId, …>>`: `BodyId` is the body source-row union (`earth`, `planet`, …) and has no `mars`.
- [x] `MARS_SURFACE_SHADING`: `sunIrradiance` must give tiles the same brightness as the textured Mars globe (`src/services/gpu/shaders/lib/bodyLighting.wesl`, how `texturedBodyRenderer` scales sun light) so the tile hand-off does not step. Derive from that code, cite it in a comment; `roughnessBase`/`f0` for dry regolith (rough, dielectric: roughness ≈ 0.9, f0 ≈ 0.03). No new test.
- [x] Mars `reliefM`: `[min, max]` of MOLA over the whole globe + 6,190 m (read `gdalinfo -mm` or a decimated scan; expected ≈ [−2,011, 27,431]) widened to cover the site DTMs' rebased extremes. Store where Earth's is (`sceneEarth.ts:23` pattern); `heliocentricPlanet` must accept it instead of hardcoding `[0, 0]`. — `gdalinfo -mm` on the MOLA COG: −8,201 … +21,241 m → **[−2,011, 27,431]**. The areoid extremes and `MARS_IAU_SPHERE_RADIUS_M` live in `src/data/bodies/marsSurfaceParams.ts` (the bake imports the radius from there); the Mars row rebases them; `BodySpec.reliefM` is optional.
- [x] Bake-time datum check (in `marsSurfaceBake`, printed, not a unit test): per site band, median of (DTM − MOLA) over the box at z10. A value beyond ±200 m means a datum mismatch (a sphere-relative DTM is off by kilometres) — throw. — First run: Gale −4,505 m, because sharp clamps signed Int16 to 0 on every route (and `b-w` rescales it to 8 bits), so MOLA read 0 m. `readGeoTiffWindow` now refuses 16-bit depths, and MOLA is read from a Float32 COG, `…463m_f32_cog.tif` (`-ot Float32 … PREDICTOR=3`; this amends C2). Rerun 2026-09-17: gale −10.3, jezero −12.3, gusev −2.7, endeavour −8.2 m.
- [x] Move Opportunity's row in `src/data/bodies/surfaceFixedSites.ts` to R1's lat/lon, and Perseverance's to R4's; keep the `// source` comment style of the other rows, citing where the coordinates came from. — The two rover fact texts (`planet_facts.seed.json`) no longer say "the marker shows the landing site".
- [x] Site bands are clipped by `clippedImagerySource`/`clippedHeightSource` to the window grown to whole z17 tiles. Unclipped, a childless z10 halo tile or a coarse tile's `boundsInBox` reads the whole HiRISE raster at full resolution (tens of GB for Jezero). `geoTiffHeightSource` also clamps pole rows on a pole-to-pole grid; otherwise MOLA's pole posts underfill to 0 m, a 4 km cone at each pole.
- [x] `dev` bands: the global band only, `maxLevel` 4, no height.
- [x] `npm run build-surface-tiles -- --body mars --dev` into the linked `public/data` is allowed (writes `mars-tiles/` only); verify the Earth manifest mtime is unchanged. Commit. — 2026-09-17: 128 z4 + 32 z3 tiles in 46 s; the Earth manifest mtime was unchanged.

### Task 5: Runtime — base globe at the inner bound, Mars ambient, body switch

review: yes (draw order/depth, uniforms)

**Files:**

- Modify: `src/services/engine/frame/passes/texturedBodiesPass.ts:117,128`, `src/services/engine/frame/passes/surfaceTilesPass.ts:120`
- Test: `tests/services/engine/subsystems/surfaceTileSubsystem.test.ts` (the switch test its header at :7-8 defers to F4)

- [x] **Base globe.** `texturedBodiesPass` draws the globe at `innerBoundRadiusM` (the model scale), not `datumRadiusM`, matching `earthPass.ts:148-157`. The camera/MVP distance maths keeps whatever currency it uses today unless it is the draw radius. Bodies with `reliefM[0] = 0` are unchanged. Draw order stays (`frameOrder.ts:218-227`: surface-tiles before textured-bodies); with the globe under all terrain, the tiles win `'nearer'`. No new test: the eye-check sees a buried tile at once. — The globe is ray-traced against a unit sphere, so every unit-sphere input switched together: mvp, `camPosLocal`, the altitude term, the eye-relative vp and the ring ratios. The existing pass test's Mars fixture now carries relief, so its radius assertions tell datum from inner bound.
- [x] **Ambient.** Tile ambient must equal the body's base-globe ambient: Earth keeps `state.settings.earth.ambientLight`; other bodies use the value `texturedBodyRenderer` uses (`bodyLighting.wesl:34` `AMBIENT` = 0.08). Move that value to one TS/WGSL-shared home only if one exists already; otherwise a named TS constant that cites the WGSL const. Mars must not read `settings.earth`. The branch sits where `bodyTextureSlotRegistry.ts:31,36` already makes the same Earth-vs-textured split — reuse that predicate rather than adding `bodyId === 'earth'`. — `BODY_AMBIENT_LIGHT` (`src/data/bodies/bodyAmbientLight.ts`, parity-tested against `AMBIENT`; it landed in Task 4 because `MARS_SURFACE_SHADING` derives from it). The predicate moved to `src/utils/bodyTextures/isTexturedBodyKey.ts`.
- [x] Test `surfaceTileSubsystem stands down and refetches the manifest when the engaged body switches from earth to mars` — asserts the Earth tiles are released and `fetchSurfaceTileManifest` is called with `'mars-tiles'`. It can fail on a real stale-atlas bug. — Mutation-checked: fails with the `standDown()` call removed.
- [x] Commit.

### Task 6: Full bake and eye-check (controller)

**Files:** none committed except the ledger and any constants the eye-check changes.

- [ ] Announce the bake (wall-clock and disk estimate from Task 2's probe) and run `npm run build-surface-tiles -- --body mars` in the background, global band first, then sites. Log to the SDD workspace.
- [ ] After each run: Earth manifest mtime unchanged; `mars-tiles/manifest.json` holds every band with `builtFrom` for both products; the datum check printed within ±200 m.
- [ ] Dev server on this worktree's port. User eye-check poses:
  1. Mars from orbit: Olympus Mons and Valles Marineris read in relief; no colour step at tile engagement (O4).
  2. Hellas basin close up: no base-globe patches poking through (inner bound).
  3. Each rover site at 200 m altitude via `window.__skymapPerf.dispatch(flyToLonLat({ body: 'mars', … }))`: HiRISE detail, no seam to the Viking/MOLA surround.
  4. Earth unchanged at Søndermarken and the terminator.
- [ ] Record rulings in the ledger; fold any constant changes into a commit.

### Task 7: Rovers on the terrain — **gated on F3a's feature PR landing on main**

review: yes (camera/pose)

**Files:** whatever the eye-check implicates; expected none beyond `src/data/bodies/surfaceFixedSites.ts`.

F3a routes surface-fixed site placement (`deriveBodyStates.ts:84` and `sitePointBodyFixed.ts:12`, which must agree) through `terrainHeightM`. This task only verifies that on Mars.

- [ ] Merge main into this branch; resolve conflicts in `surfaceTileSubsystem.ts`, `deriveBodyStates.ts`, `surfaceTilesPass.ts` in F3a's favour, re-applying this PR's lines.
- [ ] Eye-check with the user: each rover stands on the ground (not buried, not floating) once tiles are resident; the site camera (`siteRung.ts:124`) frames it; the camera cannot pass under Mars terrain. Note the pop while tiles load (F3a returns the datum when nothing is resident, 1.5–6 km below Mars ground) and ask whether it is acceptable.
- [ ] Any `groundOffsetM` correction goes in `MESH_ASSETS`, not in site rows. Commit.

### Task 8: Docs

**Files:** `docs/superpowers/specs/2026-09-13-per-planet-terrain-design.md` (§9, §10 amendments: sources as built, site set, tile counts), `docs/DATA.md`, `docs/DEPLOY.md` if the R2 step needs a Mars line, `docs/BACKLOG.md` (remove nothing unless an item is consumed; add rulings the user declines).

- [ ] Amend in place, marked with the ruling date. Commit.

---

## Definition of Done

**Deliverables**

- `SURFACE_TILE_REGISTRY.mars` and `SURFACE_BODY_BAKES.mars` (`marsSurfaceBake.ts`, prefix `mars-tiles/v1`).
- `geoTiffHeightSource`, `geoTiffImagerySource`, `readGeoTiffRgbWindow` with their tests; `colourMatchedImagerySource` without a mandatory mask.
- Raw-data registry rows + READMEs for MOLA, Viking and every baked HiRISE file.
- Mars `reliefM` from measured data; textured base globe at the inner bound.
- `main`'s `public/data/images/mars-tiles/` baked (not in git); R2 sync is the user's call after merge.

**Observable behaviours (manual smoke)**

- Mars from orbit shows relief at Olympus Mons / Valles Marineris; tiles engage without a hole or a brightness step.
- Hellas close up: no base-globe bleed-through.
- Gale, Jezero, Gusev and Endeavour (Opportunity) show HiRISE-resolution ground with no seam to the global band.
- Each rover stands on the ground after F3a is merged; the camera floor holds above Mars terrain.
- Earth is pixel-identical at the prep PR's four poses.
- Debug fly-to and `surface-lod-overlay` work on Mars.

**Deferral boundary (not this PR)**

- F3b: raycast pick, terrain horizon cap, cloud clearance.
- Global CTX (5 m) and any Mars z8+ global band.
- An areoid-true datum (oblate Mars); Mars colour calibration (backlog `2026-07-24-mars-texture-colour-calibration.md`).
- The Moon and other bodies.
