# Moon surface tiles — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development under the lean protocol (`docs/superpowers/conventions/sdd-execution.md`). Steps use checkbox (`- [ ]`) syntax.

**Goal:** the Moon streams LROC WAC albedo and LOLA height tiles at z3–z7 through the per-body stack Mars uses.

**Architecture:** one `moon` row in `SURFACE_TILE_REGISTRY` (no effects), one `moonSurfaceBake` row in `SURFACE_BODY_BAKES`, a `moonSurfaceParams.ts` shared by the body row and the bake. No runtime code changes.

**Spec:** `docs/superpowers/specs/2026-11-11-moon-surface-tiles-design.md`. Prep: PR on branch `moon-surface-tiles-prep` (de-light takes `sphereRadiusM`; `WHOLE_GLOBE_BOUNDS`); this branch is stacked on it.

## Global Constraints

- Worktree `.claude/worktrees/moon-surface-tiles`, branch `worktree-moon-surface-tiles`, PR `--base moon-surface-tiles-prep`.
- **Shared data:** `public/data` is a symlink to main's. A `--body moon` bake writes only `public/data/images/moon-tiles/`. **Never run `--body earth` or `--body mars` here.**
- Raw rasters live in main's `data/raw/{lroc,lola}/`; this worktree reaches them through leaf symlinks beside tracked READMEs (never a directory symlink).
- Sources: `lroc/Lunar_LRO_LROC-WAC_Mosaic_global_100m_June2013_cog.tif` (109164×54582 Byte grey, nodata 0, JPEG q95 COG, 1,578,655,534 B) and `lola/Lunar_LRO_LOLA_Global_LDEM_118m_Mar2014_cog.tif` (92160×46080 Float32 metres, nodata −32768, DEFLATE COG, 3,681,705,749 B). Both equirectangular, lon0 0, sphere 1,737,400 m, edges exactly ±180/±90. LOLA `gdalinfo -mm` on the COG: **−9,128.5 … +10,781.5 m**. Originals (5,959,263,751 B and 8,494,203,833 B, fetched 2026-11-11) deleted after conversion.
- One symbol per file in `utils/`, `@types/`; `type`, never `interface`; comments per `docs/superpowers/conventions/comments.md`.
- Git: explicit `git add <paths>`, no Co-Authored-By trailer, prettier on touched files only.

---

### Task 1: Raw-data rows and provenance

**Files:** Modify `tools/utils/io/rawDataRegistry.ts` (beside `'mola.dem463'`, :1410). Create `data/raw/lroc/README.md`, `data/raw/lola/README.md`. Modify `docs/DATA.md` (new "Moon surface sources" beside "Mars surface sources", :243).

- [x] Keys `lroc.wacGlobal100m`, `lroc.readme`, `lola.ldem118m`, `lola.readme`, shaped like the `mola.*` rows.
- [x] READMEs modelled on `data/raw/mola/README.md` and `data/raw/viking/README.md`: product, upstream URL, fetched date, baked COG size, licence, grid, vertical reference (LOLA heights relative to the 1,737,400 m sphere; the +400 m rebase is the bake's), the `gdal_translate` lines:
      `gdal_translate -of COG -co BLOCKSIZE=512 -co OVERVIEWS=NONE -co COMPRESS=JPEG -co QUALITY=95 -co NUM_THREADS=ALL_CPUS` (WAC) and `gdal_translate -of COG -unscale -ot Float32 -co BLOCKSIZE=512 -co OVERVIEWS=NONE -co COMPRESS=DEFLATE -co PREDICTOR=3 -co NUM_THREADS=ALL_CPUS` (LOLA; scale 0.5 m applied, and sharp cannot read signed 16-bit). Note the WAC's 55–75° incidence and Sun from the west.
- [x] Leaf symlinks in this worktree's `data/raw/{lroc,lola}/` to main's COGs. No new test. Commit.

### Task 2: Oren–Nayar shading match as a helper

**Files:** Create `src/layers/body/surfaceTiles/format/utils/orenNayarMatchedShading.ts`, `tests/layers/body/surfaceTiles/format/utils/orenNayarMatchedShading.test.ts`. Modify `src/layers/body/surfaceTiles/format/data/marsSurfaceParams.ts`.

```ts
export function orenNayarMatchedShading(roughness: number, f0: number): SurfaceTileShading;
```

- [x] Move the derivation (and its comment) out of `marsSurfaceParams.ts`; `MARS_SURFACE_SHADING = orenNayarMatchedShading(MARS_ROUGHNESS, 0.03)`, same numbers.
- [x] Test: for two roughnesses, `sunIrradiance * A / PI === 1 - BODY_AMBIENT_LIGHT` with `A` from the Oren–Nayar formula. Commit.

### Task 3: Moon params, body row, registry row, preset

**Files:** Create `src/layers/body/surfaceTiles/format/data/moonSurfaceParams.ts`. Modify `src/layers/body/bodies/moons/earthMars/moon.ts`, `src/layers/body/surfaceTiles/format/data/surfaceTileRegistry.ts`, `src/layers/body/surfaceTiles/debug/ui/flyToPresets.ts`.

```ts
export const MOON_SOURCE_SPHERE_RADIUS_M = 1_737_400;
export const MOON_DATUM_RADIUS_M = 1_737_000;
export const MOON_DATUM_OFFSET_M = MOON_SOURCE_SPHERE_RADIUS_M - MOON_DATUM_RADIUS_M;
export const MOON_SPHERE_RELIEF_M = [-9_128.5, 10_781.5] as const;
export const MOON_SURFACE_SHADING: SurfaceTileShading;
```

- [x] `moon.ts`: `datumRadiusM: MOON_DATUM_RADIUS_M`, `reliefM` = relief + offset (as `mars.ts`).
- [x] Registry row `moon: { manifestKey: 'moon-tiles', effects: [], shading: MOON_SURFACE_SHADING }`.
- [x] A Moon fly-to preset (Copernicus, 9.62° N, 20.08° W) in the shape the Mars ones use.
- [x] `npm run typecheck`; the compiler names `SURFACE_BODY_BAKES` as missing `moon` — Task 4 fills it, so land Tasks 3 and 4 in one dispatch. Run the tests touching the registry (`tests/layers/body/surfaceTiles/`). Commit.

### Task 4: Moon bake and recipe

**Files:** Create `tools/textures/surfaceBodies/moonSurfaceBake.ts`, `tools/textures/surfaceBodies/moonAlbedoRecipe.ts`. Modify `tools/textures/buildSurfaceTiles.ts` (`SURFACE_BODY_BAKES`, :631).

- [x] `moonSurfaceBake` per the spec's Bake section: prefix `moon-tiles/v1`, `BAKE_MIN_LEVEL` computed as in `marsSurfaceBake`, global max z7, dev max z4; WAC via `geoTiffImagerySource` (grey Byte reads as RGBA through `readGeoTiffRgbWindow`), LOLA via `geoTiffHeightSource` with `offsetM: MOON_DATUM_OFFSET_M`; `delightedImagerySource(..., MOON_SOURCE_SPHERE_RADIUS_M)`; height underfill `constantHeightSource(0)`. Grids use `WHOLE_GLOBE_BOUNDS`.
- [x] `moonAlbedoRecipe.ts`: `MOON_WAC_DELIGHT` (photo Sun az 270, el 25, `keepIce: 0`, other knobs starting from Mars's) and `MOON_WAC_GRADE` (identity until Task 5's fit).
- [x] Dev bake smoke: `npm run build-surface-tiles -- --body moon --dev`; check tiles land under `public/data/images/moon-tiles/v1/` and main's `earth-tiles/` and `mars-tiles/` manifests are untouched (mtime). Commit.

### Task 5: Grade fit, full bake, eye check

- [x] Fit `MOON_WAC_GRADE`: per channel, gain/offset so the graded, de-lit z4 level matches the Solar System Scope 8k Moon's mean and standard deviation (both at z4, valid pixels only, |lat| < 60°). Record numbers + date in the recipe comment. Commit.
- [x] Full bake (`--body moon`, background). Report tile counts and archive bytes per product.
- [x] Eye check with `npm run shot` at three poses (mare edge, highland crater, ~70° latitude), before (main) and after; tune roughness / de-light knobs if the hand-off from the base globe pops. Re-bake under the same prefix only before any publish.

### Task 6: Docs and close-out

- [x] `docs/DATA.md` Moon section (Task 1) final; backlog the two adjacent findings (`marsSurfaceBake` re-inlines `marsGlobalRasters`' grids; polar cast shadows in WAC) as `docs/backlog/` detail files with index lines.
- [x] `/feature-done`; plan + spec to `*/completed/`. PR stacked on the prep PR.
