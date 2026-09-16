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

| key (new)                | file                                                                    | size / layout                    | type, nodata                                              | px      | bounds (lon, lat °)              |
| ------------------------ | ----------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------- | ------- | -------------------------------- |
| `mola.dem463`            | `mola/Mars_MGS_MOLA_DEM_mosaic_global_463m.tif`                         | 2.1 GB, 46080×23040, strip       | Int16, −32768                                             | 463 m   | global                           |
| `viking.mdim21`          | `viking/Mars_Viking_MDIM21_ClrMosaic_global_232m.tif`                   | 12.7 GB, 92160×46080, strip, RGB | Byte, 0                                                   | 232 m   | global                           |
| `hirise.gale.dtm`        | `hirise/gale/MSL_Gale_DEM_Mosaic_1m_v3.tif`                             | 3.9 GB, LZW strip                | Float32, −32767                                           | 1 m     | 137.124–137.681, −5.099–−4.130   |
| `hirise.gale.ortho`      | `hirise/gale/MSL_Gale_HiRISE-LRGB_78quads_sharp_cog.tif`                | 1.0 GB, JPEG-YCbCr COG, RGB      | Byte, mask                                                | 0.25 m  | 137.327–137.479, −4.876–−4.555   |
| `hirise.gusev.dtm`       | `hirise/gusev/DTEEC_001513_1655_001777_1650_U01.tif`                    | 136 MB COG                       | Float32, −3.4e38                                          | 1.01 m  | 175.442–175.555, −14.677–−14.492 |
| `hirise.gusev.ortho`     | `hirise/gusev/PSP_001513_1655_RED_A_01_ORTHO.tif`                       | 696 MB COG, grey                 | UInt16, 0                                                 | 0.254 m | = DTM                            |
| `hirise.endeavour.dtm`   | `hirise/meridiani-endeavour/DTEEC_018701_1775_018846_1775_U01.tif`      | 248 MB COG                       | Float32, −3.4e38                                          | 1.01 m  | −5.445–−5.311, −2.491–−2.125     |
| `hirise.endeavour.ortho` | `hirise/meridiani-endeavour/ESP_018701_1775_RED_A_01_ORTHO.tif`         | 1.6 GB COG, grey                 | UInt16, 0 (Offset/Scale tag)                              | 0.253 m | = DTM                            |
| `hirise.eagle.dtm`       | `hirise/meridiani-landing/DTEEC_001414_1780_001612_1780_U01.tif`        | 4.8 MB COG                       | Float32, −3.4e38                                          | 1.01 m  | −5.507–−5.485, −2.065–−2.036     |
| `hirise.eagle.ortho`     | `hirise/meridiani-landing/PSP_001414_1780_RED_A_01_ORTHO.tif`           | 23 MB COG, grey                  | UInt16, 0                                                 | 0.253 m | = DTM                            |
| `hirise.jezero.zip`      | `hirise/jezero/MSR_TRN_HiRISE_soc_003_USGS_release_aug2024_mosaics.zip` | 5.5 GB, unextracted              | DTM `…DeltaGeoid_1m…` (areoid, per README) + 0.25 m ortho |         | read after extraction            |

Rover rows (`src/data/bodies/surfaceFixedSites.ts:22-55`): curiosity −4.5895, 137.4417 (inside Gale); spirit −14.5684, 175.4726 (inside Gusev); perseverance 18.4447, 77.4508 (Jezero, unverified); **opportunity −1.9462, 354.4734 (= −5.5266) — outside both Meridiani boxes** (open question O1).

## Open questions (user rulings needed before Task 4's bands are final)

- **O1 Opportunity.** Neither Meridiani DTM covers the row (Eagle crater). Options: bake both boxes anyway (Opportunity stands on MOLA z7 ground); find a HiRISE DTM over Eagle crater; or move the row.
- **O2 Site extents.** Full-extent boxes at z17 come to roughly 30k tiles per product (Gale ~8.6k, Endeavour ~8.7k, Gusev ~3.7k, Jezero ~10k est.), against spec §10's ~6k. Options: full extents, or clip each box to a fixed window around the rover.
- **O3 Jezero extraction.** Unzip the DTM (712 MB) and ortho (4.67 GB) from the zip into `data/raw/hirise/jezero/` in main.
- **O4 Base-globe colour** (decide at the eye-check, Task 6): tiles are Viking MDIM21 and the base globe is Solar System Scope's `mars-8192`, so a colour step is expected at tile engagement. Accept, or rebuild `mars-*` from MDIM21 (`tools/utils/io/textureSources.ts:42`) in this PR.

---

### Task 1: Raw-data rows and provenance

**Files:**

- Modify: `tools/utils/io/rawDataRegistry.ts` (height section near `'etopo.surface30s'`, :976+)
- Create: `data/raw/mola/README.md`, `data/raw/viking/README.md`, `data/raw/hirise/{gale,gusev,meridiani-endeavour,meridiani-landing}/README.md` (in main's `data/raw` — see step 1)
- Modify: `docs/DATA.md` (source list)

- [ ] Confirm how `rawDataPath` resolves from a linked worktree (main's `data/raw` or the worktree's). If the worktree's, stop and report; the controller decides between symlinking `data/raw/{mola,viking,hirise}` and baking from main.
- [ ] Add the keys in the table above (`kind: 'file'`, `source: 'gitignored'`, `upstream` URL, `readme` key). Use `mola.*`/`viking.*`/`hirise.*` names, not `textures.*`, so the `fetchTextures` rule (`tests/tools/utils/io/rawDataRegistry.test.ts:44-73`) does not apply. No fetchers: the files were fetched by hand; the README records the upstream URL and product ID. Jezero rows point at the extracted paths, added once O3 is ruled.
- [ ] READMEs, per `docs/DATA.md:214-222`: product, upstream, projection, sphere, **vertical reference** (areoid topography; the +6,190 m rebase is the bake's, per spec §4.3), nodata.
- [ ] No new test (registry shape is already tested). Commit.

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

- [ ] Test `geoTiffHeightSource samples a pixel centre exactly, with the offset added` — synthetic 4×2 float GeoTIFF written with sharp; a lattice point on a pixel centre returns that pixel + `offsetM` exactly. Fails on a half-pixel registration bug, which no other check catches.
- [ ] Test `geoTiffHeightSource returns NaN at no-data and outside bounds` — both the exact sentinel and −3.4e38.
- [ ] Test `geoTiffImagerySource stretches UInt16 grey to opaque RGB and leaves no-data transparent`.
- [ ] Test `readGeoTiffRgbWindow returns the window's pixels` on a synthetic 8-bit RGB TIFF (asserts channel order and the window offset).
- [ ] Probe with `tsx -e` (not a test): one 512×512 `readBox` on Viking at z7 and on the Gale ortho COG; record wall-clock in the ledger. If Viking takes > 30 s per box, report instead of continuing.
- [ ] Commit.

### Task 3: Colour for the grey HiRISE orthos

**Files:**

- Modify: `tools/textures/colourMatchedImagerySource.ts:63-80` (+ its test)

Spec §4.2: Gusev and Meridiani orthos are single-band RED; their colour comes from the global base. `colourMatchedImagerySource(primary, reference, { sigmaDeg, waterMaskPath })` already moves a primary's low frequencies onto a reference's; it takes land/water classes from a mask.

- [ ] Make `waterMaskPath` optional. With no mask every pixel is land (one class). No second wrapper.
- [ ] Check that a grey primary (R = G = B) comes out with the reference's hue below `sigmaDeg`: offsets are added per channel, so a grey input gains the reference's chroma. If the offset maths clamps chroma away, report before changing it.
- [ ] Test `colourMatchedImagerySource without a water mask gives a grey primary the reference's low-frequency colour` (flat grey primary, flat red-brown reference → output mean ≈ reference mean). Commit.

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

Site set and extents follow O1–O3. Grey stretch `[lo, hi]`: the 0.5/99.5 percentiles of a decimated read of each ortho, computed once and written into the band table as named constants with a comment saying how they were measured.

- [ ] Add the registry row. The compiler then requires `SURFACE_BODY_BAKES.mars`; `tests/data/bodies/surfaceTileShaderVariants.test.ts` covers the `''` variant.
- [ ] `MARS_SURFACE_SHADING`: `sunIrradiance` must give tiles the same brightness as the textured Mars globe (`src/services/gpu/shaders/lib/bodyLighting.wesl`, how `texturedBodyRenderer` scales sun light) so the tile hand-off does not step. Derive from that code, cite it in a comment; `roughnessBase`/`f0` for dry regolith (rough, dielectric: roughness ≈ 0.9, f0 ≈ 0.03). No new test.
- [ ] Mars `reliefM`: `[min, max]` of MOLA over the whole globe + 6,190 m (read `gdalinfo -mm` or a decimated scan; expected ≈ [−2,011, 27,431]) widened to cover the site DTMs' rebased extremes. Store where Earth's is (`sceneEarth.ts:23` pattern); `heliocentricPlanet` must accept it instead of hardcoding `[0, 0]`.
- [ ] Bake-time datum check (in `marsSurfaceBake`, printed, not a unit test): per site band, median of (DTM − MOLA) over the box at z10. A value beyond ±200 m means a datum mismatch (a sphere-relative DTM is off by kilometres) — throw.
- [ ] `dev` bands: the global band only, `maxLevel` 4, no height.
- [ ] `npm run build-surface-tiles -- --body mars --dev` into the linked `public/data` is allowed (writes `mars-tiles/` only); verify the Earth manifest mtime is unchanged. Commit.

### Task 5: Runtime — base globe at the inner bound, Mars ambient, body switch

review: yes (draw order/depth, uniforms)

**Files:**

- Modify: `src/services/engine/frame/passes/texturedBodiesPass.ts:117,128`, `src/services/engine/frame/passes/surfaceTilesPass.ts:120`
- Test: `tests/services/engine/subsystems/surfaceTileSubsystem.test.ts` (the switch test its header at :7-8 defers to F4)

- [ ] **Base globe.** `texturedBodiesPass` draws the globe at `innerBoundRadiusM` (the model scale), not `datumRadiusM`, matching `earthPass.ts:148-157`. The camera/MVP distance maths keeps whatever currency it uses today unless it is the draw radius. Bodies with `reliefM[0] = 0` are unchanged. Draw order stays (`frameOrder.ts:218-227`: surface-tiles before textured-bodies); with the globe under all terrain, the tiles win `'nearer'`. No new test: the eye-check sees a buried tile at once.
- [ ] **Ambient.** Tile ambient must equal the body's base-globe ambient: Earth keeps `state.settings.earth.ambientLight`; other bodies use the value `texturedBodyRenderer` uses (`bodyLighting.wesl:34` `AMBIENT` = 0.08). Move that value to one TS/WGSL-shared home only if one exists already; otherwise a named TS constant that cites the WGSL const. Mars must not read `settings.earth`. The branch sits where `bodyTextureSlotRegistry.ts:31,36` already makes the same Earth-vs-textured split — reuse that predicate rather than adding `bodyId === 'earth'`.
- [ ] Test `surfaceTileSubsystem stands down and refetches the manifest when the engaged body switches from earth to mars` — asserts the Earth tiles are released and `fetchSurfaceTileManifest` is called with `'mars-tiles'`. It can fail on a real stale-atlas bug.
- [ ] Commit.

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
- Gale, Jezero, Gusev (and Meridiani per O1) show HiRISE-resolution ground with no seam to the global band.
- Each rover stands on the ground after F3a is merged; the camera floor holds above Mars terrain.
- Earth is pixel-identical at the prep PR's four poses.
- Debug fly-to and `surface-lod-overlay` work on Mars.

**Deferral boundary (not this PR)**

- F3b: raycast pick, terrain horizon cap, cloud clearance.
- Global CTX (5 m) and any Mars z8+ global band.
- An areoid-true datum (oblate Mars); Mars colour calibration (backlog `2026-07-24-mars-texture-colour-calibration.md`).
- The Moon and other bodies.
