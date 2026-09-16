# Terrain F4 prep — the surface-tile stack becomes per-body — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development under the lean protocol (`docs/superpowers/conventions/sdd-execution.md`). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make Mars a data row away from terrain: every Earth-only joint in the surface-tile stack (frame gate, base level, tile draw, bake, manifest write, deploy, debug snapshot) becomes registry-driven, with Earth's picture and bake output unchanged.

**Architecture:** `SURFACE_TILE_REGISTRY` rows grow `effects` and `shading`; the frame gate and the tile pass read the row instead of naming Earth; the tile fragment splits into one shared lighting module plus one entry per effects set; the bake grows a per-body table behind `--body`, and its manifest write merges instead of replacing. No behaviour change except the manifest-merge bug fix.

**Tech Stack:** TS, WebGPU, WESL (`?static` build-time linking — no conditional compilation in this repo), Vitest, sharp, tsx tools.

**Spec:** `docs/superpowers/specs/2026-09-13-per-planet-terrain-design.md` §3.8 (this plan's ground preparation), §9 (F4).

## Global Constraints

- Worktree `.claude/worktrees/mars-terrain`, branch `worktree-mars-terrain`, one PR (draft early, `--base main`). The F4 feature is a separate later PR.
- **WebP gate:** another branch (`worktree-terrain-rgb-webp-height-tiles`) rewrites height tiles as WebP. Tasks tagged `webp-gate: yes` start only after that lands on main; merge main into this branch first. Untagged tasks may run before.
- **Shared data:** `public/data` in this worktree is a symlink to main's. Never run a real bake here (`build-surface-tiles` without `--dev` into a temp dir); an Earth bake writes main's live manifest.
- Frame files (`src/services/engine/frame/**`, incl. `passes/`) export only their own symbol — ratchet `tests/services/engine/frame/frameFilePurity.test.ts`.
- One symbol per file in `utils/` and `@types/`; `type` aliases, never `interface`; comments per `docs/superpowers/conventions/comments.md`.
- Moves/renames: `npm run move-files -- <from> <to>` (or `npm run refactor`), never `git mv` + hand edits; grep for the old path afterwards (`.wesl` `package::` imports and string literals are missed).
- WGSL: never pass a storage-buffer struct by value into a function (Adreno misreads it) — pass scalars. Textures go into shared WESL functions as parameters; `@group/@binding` declarations live only in entry files.
- Git: user identity, no Co-Authored-By trailer, no `git add -A`, prettier on touched files only.

---

### Task 1: Registry-driven frame gate and base level

**Files:**

- Modify: `src/@types/data/SurfaceTileSpec.d.ts`, `src/data/bodies/surfaceTileRegistry.ts`
- Create: `src/@types/data/SurfaceEffect.d.ts`, `src/@types/data/SurfaceTileShading.d.ts`
- Move: `src/utils/scene/earthBaseLevelForTier.ts` → `src/utils/scene/baseLevelForTier.ts`; `src/utils/scene/earthLevelFittingWidth.ts` → `src/utils/scene/levelFittingWidth.ts` (with their tests)
- Modify: `src/services/engine/frame/runFrame.ts:230-250`, `tools/textures/buildSurfaceTiles.ts:133`, `src/@types/scene/SurfaceTilePlannerParams.d.ts:17`, `src/@types/engine/subsystems/SurfaceTileSubsystem.d.ts:28`, `src/services/engine/subsystems/surfaceTileSubsystem.ts:161`, `src/data/bodies/earthTileParams.ts:9`

**Interfaces — Produces:**

```ts
export type SurfaceEffect = 'materialMap' | 'nightLights' | 'cloudShadows';
export type SurfaceTileShading = {
  readonly roughnessBase: number;
  readonly f0: number;
  readonly sunIrradiance: number;
};
export type SurfaceTileSpec = {
  readonly manifestKey: string;
  /** Fragment variant selector — see Task 5. Order-insensitive. */
  readonly effects: readonly SurfaceEffect[];
  readonly shading: SurfaceTileShading;
};
// earth row: effects ['materialMap','nightLights','cloudShadows'],
//            shading picks the three fields from EARTH_SURFACE_PARAMS (no copied literals)
export function baseLevelForTier(bodyId: SurfaceTileBodyId, tier: Tier): number;
export type SurfaceTileBodyId = keyof typeof SURFACE_TILE_REGISTRY; // exported beside the registry's type file
```

- [x] Rename with `npm run refactor` / `npm run move-files` (dry first): `earthLevelFittingWidth` → `levelFittingWidth`, `earthBaseLevelForTier` → `baseLevelForTier`; the new signature reads `BODY_TEXTURE_REGISTRY[bodyId].kinds.surface` (throw if the row has no `surface` kind — a registry row that cannot tile is a programming error).
- [x] Update every caller, including the tests at `tests/utils/scene/cutSurfaceTiles.test.ts:18`, `tests/services/engine/subsystems/surfaceTileSubsystem.test.ts:57,113`, and the bake's `BAKE_MIN_LEVEL` (pass `'earth'` for now; Task 4 makes it per-body).
- [x] In `runFrame.ts`, replace `earthPass.enabled(state, ctx, surfaceTilesView)` with a body-generic predicate carrying the same non-Earth conditions (not beyond `FOREGROUND_MAX_DISTANCE_MPC`, the body's scene data seeded). Put it in `src/utils/scene/surfaceTilesEngaged.ts` (frame-file purity). It must NOT require `state.gpu.earthRenderer`.
- [x] Test `surfaceTilesEngaged is false beyond the foreground distance` and `… true for a registry body with no earthRenderer` — the second is the joint this task creates and nothing else would catch its regression. No test for the renames (compiler).
- [x] `npm run typecheck:fast && npm test -- surfaceTile baseLevel runFrame` → green. Commit.

### Task 2: Debug snapshot names its body

**Files:**

- Modify: `src/@types/scene/SurfaceTileDebugSnapshot.d.ts`, `src/services/engine/subsystems/surfaceTileSubsystem.ts` (snapshot builder + `EMPTY_SURFACE_TILE_DEBUG_SNAPSHOT`), `src/components/DebugPanel/EarthTileAtlasSection.tsx:31,68,103,116`, `src/components/containers/EarthTileAtlasSectionContainer.tsx`

**Contract:** snapshot gains `readonly bodyId: SurfaceTileBodyId | null` (null while disengaged). The section title reads `Surface Tiles — <bodyId>`; its fly-to prop becomes `flyToLonLat(lonDeg, latDeg, body)` and passes the snapshot's `bodyId` (omit `body` when null, which keeps today's Earth default). Load the `create-component` skill before editing the component.

- [x] Implement; no new test (a routing change the compiler checks).
- [x] Commit.

### Task 3: Deploy collectors keyed by manifestKey

**Files:**

- Move/modify: `tools/deploy/r2/collectEarthTiles.ts` → `collectSurfaceTiles.ts`, `tools/deploy/r2/collectEarthTileManifest.ts` → `collectSurfaceTileManifest.ts` (with tests, via `npm run move-files`)
- Modify: `tools/deploy/syncR2.ts:16-17,88-104`, `docs/DEPLOY.md` (the Earth-tiles step names)

**Contract:**

```ts
export function collectSurfaceTiles(imagesDir: string, manifestKey: string): R2Upload[];
export function collectSurfaceTileManifest(imagesDir: string, manifestKey: string): R2Upload[];
```

`syncR2` builds one tiles group per `SURFACE_TILE_REGISTRY` row (label `Surface tiles (<key>)`), then one manifest group per row (label `Surface tile manifest (<key>)`, purge true) — every tiles group before every manifest group, and all of them before `Data manifest`. A row whose `index.txt` / `manifest.json` is absent contributes `[]` (today's collectors already return `[]` for a missing manifest — keep that for the index too).

- [x] Test `collectSurfaceTiles reads <manifestKey>/index.txt` with a temp dir holding a `mars-tiles` index — the parameter is the new behaviour. Keep the existing collector tests, retargeted.
- [x] Test `syncR2's groups list every tiles group before every manifest group` only if the group list is extracted into a pure function; otherwise no test. `sync-r2` has no dry-run flag — never run it to check this. Commit.

### Task 4: Per-body bake table and `--body` — `webp-gate: yes`

**Files:**

- Create: `tools/textures/surfaceBodies/earthSurfaceBake.ts`, `tools/textures/SurfaceBodyBake.d.ts`, `tools/textures/SurfaceBakeBand.d.ts` (beside `EarthImagerySource.d.ts` / `HeightSource.d.ts`, where the tool's types already live)
- Modify: `tools/textures/buildSurfaceTiles.ts` (constants :133-170, `bakeDeepestLevel`, `bakeCoarserLevel`, `readPriorIndex`, `printWaterDiagnostics`, `bakeAll`, `main`), `tools/textures/bakeHeightLevel.ts` if its prefix/root reach is module-level, `tests/tools/textures/buildSurfaceTiles.test.ts`, `package.json` script help if any, `docs/DATA.md` (the build-surface-tiles invocation)

**Contract:**

```ts
export type SurfaceBakeBand = {
  // today's inline bakeAll band element, unchanged fields
  readonly source: EarthImagerySource;
  readonly minLevel: number;
  readonly underfill?: EarthImagerySource;
  readonly height?: HeightSource;
  readonly heightUnderfill?: HeightSource;
  readonly flattenWater?: boolean;
};
export type SurfaceBodyBake = {
  readonly bodyId: SurfaceTileBodyId;
  /** `SURFACE_TILE_REGISTRY[bodyId].manifestKey` — read, never retyped. */
  readonly tileRoot: string;
  /** `${tileRoot}/vN` — bump on any pixel change (see today's TILE_PREFIX doc). */
  readonly tilePrefix: string;
  readonly bands: (opts: { dev: boolean }) => Promise<readonly SurfaceBakeBand[]>;
};
export async function bakeAll(
  body: Pick<SurfaceBodyBake, 'tileRoot' | 'tilePrefix'>,
  bands: readonly SurfaceBakeBand[],
  outDir: string,
  products?: ReadonlySet<SurfaceTileProduct>,
): Promise<void>;
// SURFACE_BODY_BAKES: Record<SurfaceTileBodyId, SurfaceBodyBake> in buildSurfaceTiles.ts
// CLI: `--body <id>` (default 'earth'); unknown id → throw listing the known ids
```

- [x] Move Earth's band assembly (today's `main()` :635+, `deepSource`, `devSource`, the EOX/GeoDanmark floors and colour-match sigma) into `earthSurfaceBake.ts`; `tilePrefix` stays `earth-tiles/v9` byte for byte. `BAKE_MIN_LEVEL` becomes `min over tiers of baseLevelForTier(bodyId, tier) + 1` inside the body file.
- [x] Thread `tileRoot`/`tilePrefix` through every function that read `TILE_ROOT`/`TILE_PREFIX`; delete the module constants. Rename `EarthImagerySource` → `SurfaceImagerySource` with `npm run refactor` (the interface is already body-neutral).
- [x] Rename the body-neutral geometry helpers the bake will call for Mars — `tools/utils/scene/earthTileBounds.ts`, `earthTileIndicesForBounds.ts` → `surfaceTileBounds.ts`, `surfaceTileIndicesForBounds.ts` — via `npm run move-files` + `npm run refactor rename`.
- [x] Test `bakeAll writes under the body's tileRoot` — a `--dev`-sized fake source baked with `{tileRoot: 'test-tiles', tilePrefix: 'test-tiles/v1'}` lands `test-tiles/manifest.json` and nothing under `earth-tiles/`. This is the landmine guard (a hardwired root would overwrite main's live Earth manifest).
- [x] `npm run build-surface-tiles -- --dev` into a temp `outDir` still produces the pre-change Earth tile set (diff the index against a run from main, same temp setup). SKIPPED: this worktree's `data/raw/textures/` holds only the README + checksum sidecar, not the BMNG equirect `devSource()` needs, so no bake (before or after) can run here. Commit.

### Task 5: Manifest write merges with the prior manifest — `webp-gate: yes`

**Files:**

- Create: `tools/utils/textures/mergeSurfaceTileManifest.ts`, `tests/tools/utils/textures/mergeSurfaceTileManifest.test.ts`
- Modify: `tools/textures/buildSurfaceTiles.ts` (`bakeAll` :446+, manifest write near :568-590)

**Contract:**

```ts
/** Pure. Bands match on (bounds, min, max) equality. A matched band's builtFrom
 *  is the prior's with this run's products overwritten; unmatched prior bands are
 *  kept; new bands are appended. A prior with a different `prefix` is ignored
 *  entirely (a version bump is a fresh pyramid). */
export function mergeSurfaceTileManifest(
  prior: SurfaceTileManifest | null,
  run: SurfaceTileManifest,
): SurfaceTileManifest;
```

`bakeAll` reads `<tileRoot>/manifest.json` if present (a corrupt file throws, never silently becomes `null`), merges, and writes as today — still last, still after the completeness check.

Tests (each is a silent-when-broken bug):

- [x] `an albedo-only run keeps the prior height provenance` — prior band with `{albedo, height}`, run band with `{albedo}` → merged band has both, albedo from the run.
- [x] `a run with one band keeps the other bands` — prior 3 bands, run 1 matching band → 3 bands, order of prior preserved.
- [x] `a new band is appended` and `a prior with another prefix is dropped`.
- [x] Wire into `bakeAll`; `npm test -- mergeSurfaceTileManifest buildSurfaceTiles` green. Commit.

### Task 6: Tile fragment variants keyed by the effects set — `webp-gate: yes`, `review: yes`

**Files:**

- Create: `src/services/gpu/shaders/bodies/earthSurfaceTile/surfaceLighting.wesl` (shared fns), `src/services/gpu/shaders/bodies/earthSurfaceTile/fragmentBare.wesl`, `src/data/bodies/surfaceTileShaderVariants.ts`, `src/utils/scene/surfaceEffectsKey.ts`, `src/@types/rendering/SurfaceEffectInputs.d.ts`
- Rename: `fragment.wesl` → `fragmentEarth.wesl` (update `package::` imports and the `?static` import by hand — the move tool misses both)
- Modify: `src/services/gpu/renderers/bodies/earthSurfaceTileRenderer.ts` (layout :86-125, pipeline :127, draw :189-320), `src/@types/rendering/EarthSurfaceTileRenderer.d.ts`, `src/services/engine/frame/passes/earthSurfaceTilesPass.ts`, `tests/services/gpu/shaders/constants.parity.test.ts` (reads `fragment.wesl`), and the doc references in `src/utils/scene/surfaceNormalFromHeightCell.ts`, `src/data/bodies/earthTileParams.ts`, `src/data/debug/debugOverlayRows.ts`

**Contract:**

```ts
export type SurfaceEffectInputs = {
  readonly materialMap?: { readonly view: GPUTextureView; readonly oceanRoughness: number };
  readonly nightLights?: { readonly view: GPUTextureView };
  readonly cloudShadows?: {
    readonly view: GPUTextureView;
    readonly strength: number;
    readonly shellRadius: number;
  };
};
export function surfaceEffectsKey(effects: readonly SurfaceEffect[]): string; // sorted, '+'-joined; [] → ''
export const SURFACE_TILE_SHADER_VARIANTS: Readonly<
  Record<
    string,
    {
      readonly fragment: string; // ?static source
      readonly bindings: readonly number[]; // fragment-only bindings this variant declares
    }
  >
>;
// '' → fragmentBare, bindings [5]            (albedo atlas; + 0/1/2/4 shared with the vertex stage)
// 'cloudShadows+materialMap+nightLights' → fragmentEarth, bindings [3,5,6,7,9]
// draw args: drop materialView/nightView/cloudsView/oceanRoughness/cloudShadowStrength/
//            cloudShellRadius; add `effects: readonly SurfaceEffect[]`,
//            `effectInputs: SurfaceEffectInputs`, and take roughnessBase/f0/sunIrradiance
//            from the row's `shading`.
```

Rules:

- `SurfaceTileUniforms` layout does NOT change (the bare variant ignores the effect fields; keeps the parity test and the Adreno fix intact). Unused effect fields are written as 0.
- The renderer builds one pipeline + bind-group layout per variant key lazily and caches it; the bind group is built from the variant's `bindings`. Supplying an input the variant lacks, or omitting one it needs, throws in `draw` (dev programming error).
- `surfaceLighting.wesl` holds what both entries share: atlas crossfade sample, the height-cell normal (today's `fs` body up to `n`), `resolveTileAtlasUv`, the LOD overlay. Textures pass in as parameters. `fragmentEarth.wesl` must shade pixel-identically to today's `fragment.wesl`; `fragmentBare.wesl` = `pbrDirect` with roughness `clamp(u.roughnessBase, MIN_ROUGHNESS, 1)` + ambient, no material/night/cloud terms.
- The pass reads the engaged body's row: `effects`, `shading`, and builds `effectInputs` per listed effect from `state.gpu.earthRenderer` (the only body whose maps exist today). `enabled` requires `earthRenderer` only when the row lists an effect. `ambientLight` stays `state.settings.earth.ambientLight` for every body in this PR (Mars's value is an F4 decision). The pass keeps its Earth-only `bodyId` check REMOVED — the registry is the predicate.

Tests:

- [x] `every registry row's effects key has a shader variant` — adding Mars with an unlisted combination must fail here, not at pipeline creation on a user's GPU.
- [x] `surfaceEffectsKey is order-insensitive`.
- [x] WGSL validation of both entries through the project's existing shader test path (wesl link + naga where tint is absent).
- [x] Eye-check (user, passed 2026-09-16): Earth at orbit, the terminator with night lights, a cloud shadow, and the Søndermarken z19 patch look identical to main. Commit.

### Task 7: Earth names off the generic draw path — `webp-gate: yes`

**Files:** `earthSurfaceTilesPass.ts` → `surfaceTilesPass.ts`; `earthSurfaceTileRenderer.ts` → `surfaceTileRenderer.ts`; `earthSurfaceTileLayout.ts` → `surfaceTileLayout.ts`; `EarthSurfaceTileRenderer.d.ts` → `SurfaceTileRenderer.d.ts`; shader folder `bodies/earthSurfaceTile/` → `bodies/surfaceTile/`; `EarthTileAtlasSection*` → `SurfaceTileAtlasSection*`; `state.gpu.earthSurfaceTileRenderer` → `surfaceTileRenderer`; pass `name` `'earth-surface-tiles'` → `'surface-tiles'` (`frameOrder.ts:71,220`, `tests/services/engine/frame/passes/earthPass.test.ts:631-634`, `tools/perf/` and `docs/RENDERER.md` references).

Out of scope: the `earth-tiles` manifest key, `EARTH_TILE_*` constants in `earthTileParams.ts`, debug-overlay ids (`earth-lod-overlay`, persisted settings keys), `earthPass` (the Earth base globe).

- [x] `npm run move-files -- --manifest <moves.json> --dry`, then for real; `npm run refactor rename` for the symbols; then grep for every old path and name (`package::bodies::earthSurfaceTile`, `?static` imports, `'earth-surface-tiles'`) and fix the stragglers. No new test.
- [x] `npm run typecheck && npm test` green. Commit.

### Task 8: `levelFittingWidth` takes its base width

**Files:** `src/utils/scene/levelFittingWidth.ts`, its callers (`baseLevelForTier.ts`, `tools/textures/bmngQuadrantSource.ts`, `tools/textures/equirectFileSource.ts`), `tests/utils/scene/levelFittingWidth.test.ts`

**Signature:** `levelFittingWidth(widthPx: number, baseWidthPx: number): number`. The generic name hid an Earth-only constant, `EARTH_EQUIRECT_BASE_WIDTH_PX`; callers now pass it in (Earth callers pass that constant). No behaviour change.

- [x] Update the existing test to pass the base width. Commit.

### Task 9: `utils/scene/` split into domain folders

User-ruled 2026-09-16: every group rides this PR. Pure moves via `npm run move-files -- --manifest <moves.json>` (`--dry` first); no symbol renames, no behaviour change, no new tests.

| Destination | Files (from `src/utils/scene/`) |
| --- | --- |
| `src/utils/surfaceTiles/` | balanceSurfaceCut, baseLevelForTier, cutSurfaceTiles, decodeHeightTileHeader, deepestBandLevelAt, earthTexelMetres, latticeHeightSample, latticePostGradient, levelFittingWidth, packSurfaceTileKey, patchOriginRelEyeM, patchVertexOffsetM, resolveHeightLattice, surfaceEffectsKey, surfaceNormalFromHeightCell, surfacePatchAnchor, surfacePatchIndices, surfaceTileBandFromBounds, surfaceTileBandOverlapsUv, surfaceTileBandRefineAllowed, surfaceTileCentreUv, surfaceTileColumns, surfaceTileInBand, surfaceTilePath, surfaceTileXyForUv, surfaceTilesEngaged |
| `src/utils/network/` | fetchSurfaceTileManifest |
| `src/utils/bodyTextures/` | bodySurfaceTier, bodyTextureFilename, bodyTextureSlotKey, hostBodyId, isAlphaTextureKind, isBodyTextureKey, isLinearTextureKind |
| `src/utils/meshBodies/` | isMeshBody, isMeshBodyKey, meshBodiesAttachedTo, meshBodySlabHostId, meshBodySlotKey |
| `src/utils/regions/` | regionById, regionOfBody, regionRelativeDistanceMpc, chainOverlapViolations |
| `src/utils/occlusion/` | innerBoundRadiusM, outerBoundRadiusM, nearestSphereFaceM, selectOccluderSpheresKm, subjectOccludedByBodies, sunVisibleFraction, sinSunAngularRadius |
| `src/utils/geo/` | lonLatDegToDirection, directionToLonLatDeg, surfacePointBodyFixed, parseLonLatInput |
| `src/utils/labels/` | declutterByScreenSeparation |
| `src/utils/star/` | resolvesToSphere, starSphereRangeM |

- [x] Move each file with its `tests/` mirror. Then grep `src tools tests docs .claude` for `utils/scene/<name>`, and fix string paths and doc links (frame-purity allow-list, RENDERER.md, skills). Leave history (plans/specs under `completed/`, backlog, audits) alone.
- [x] One commit per destination row, or one commit for all of them; the tree typechecks at every commit.

### Task 10: Pipeline-wide tile constants and debug ids lose `earth`

User-ruled 2026-09-16. `src/data/bodies/earthTileParams.ts` holds constants that apply to every body's pyramid, and the generic shader and debug surfaces inherited their Earth names.

**Renames**
- File: `src/data/bodies/earthTileParams.ts` → `src/data/bodies/surfaceTileParams.ts` (`npm run move-files`).
- Constants (`npm run refactor rename`):
  - `EARTH_EQUIRECT_BASE_WIDTH_PX` → `SURFACE_EQUIRECT_BASE_WIDTH_PX`
  - `EARTH_TILE_PX` → `SURFACE_TILE_PX`
  - `EARTH_TILE_ATLAS_SIDE` → `SURFACE_TILE_ATLAS_SIDE`
  - `EARTH_TILE_CONCURRENCY` → `SURFACE_TILE_CONCURRENCY`
  - `EARTH_TILE_LOD_BIAS` → `SURFACE_TILE_LOD_BIAS`
  - `EARTH_SURFACE_TILE_MESH_RESOLUTION` → `SURFACE_TILE_MESH_RESOLUTION`
  - `EARTH_TILE_CROSSFADE_MS` → `SURFACE_TILE_CROSSFADE_MS`
  - The `EARTH_TILE_*` constants re-exported or mirrored in `surfaceTileSubsystem.ts`, if any.
- WGSL copies in `bodies/surfaceTile/*.wesl`:
  - `EARTH_TILE_ATLAS_SIDE`, `EARTH_TILE_ATLAS_HALF_TEXEL` and `EARTH_TILE_PX` take the `SURFACE_` prefix.
  - `earthLodOverlayColor` → `tileLodOverlayColor`.
  - Update `tests/services/gpu/shaders/constants.parity.test.ts` to match.
- Debug ids:
  - Overlay key `'earth-lod-overlay'` → `'surface-lod-overlay'`, label "Surface LOD overlay".
  - Overlay-row section `'earth-tiles'` → `'surface-tiles'`.
  - Check how `debug.overlays` is persisted and loaded. A stored old key must be dropped or ignored, never a load error.
- `levelFittingWidth` drops the `baseWidthPx` parameter it gained in Task 8 and reads `SURFACE_EQUIRECT_BASE_WIDTH_PX` again, because the base width is pipeline-wide.

**Unchanged:** `EARTH_EQUATORIAL_CIRCUMFERENCE_M` and `earthTexelMetres` (truly Earth), the `'earth-tiles'` manifest key and R2 paths, and `earthPass`.

- [ ] Grep `src tools tests docs .claude` for every old name, id and path (outside history folders), and fix stragglers, including `.wesl` comments. No new test. Commit.

---

## Definition of Done

**Deliverables**

- `SURFACE_TILE_REGISTRY` rows carry `effects` + `shading`; `baseLevelForTier(bodyId, tier)`; `surfaceTilesEngaged`.
- `SurfaceTileDebugSnapshot.bodyId`; the debug section's fly-to carries it.
- `collectSurfaceTiles` / `collectSurfaceTileManifest` keyed by `manifestKey`, one group per registry row.
- `SURFACE_BODY_BAKES` + `--body`; no `TILE_ROOT`/`TILE_PREFIX` module constants remain.
- `mergeSurfaceTileManifest` with its four tests, wired into `bakeAll`.
- `SURFACE_TILE_SHADER_VARIANTS` with `fragmentEarth.wesl` + `fragmentBare.wesl`; draw args take `effects` + `effectInputs`.
- Generic draw path carries no `earth` in its names (Task 7 list).

**Observable behaviours (manual smoke)**

- Earth from orbit, at the terminator (night lights on), under a cloud shadow, and at Søndermarken z19: identical to main.
- Debug panel section shows `Surface Tiles — earth` while engaged; its fly-to still lands on Earth.
- `build-surface-tiles -- --dev --product albedo` into a temp dir holding a full prior manifest keeps every band's `builtFrom.height`.
- `syncR2`'s group list for today's registry names the same Earth local paths and R2 keys as main (read the built list in a test or a `tsx -e` print; never run the sync).

**Deferral boundary (F4, not this PR)**

- The `mars` registry row, Mars bake bands, MOLA/Viking/HiRISE readers, raw-data registry rows and READMEs.
- Mars shading values, Mars ambient, rebuilding `mars-8192` from MDIM21, Mars `reliefM`, the Mars base globe at the inner bound.
- Rover placement on terrain (F3a's height lookup).
- `readGeoTiffWindow` reopening the file per call; the §3.4e coarse grid (F3a).
