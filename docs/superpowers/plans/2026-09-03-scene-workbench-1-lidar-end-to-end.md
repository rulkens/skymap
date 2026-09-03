# Scene Workbench 1/4 — LiDAR end to end

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `npm run scene-workbench` opens on port 5600 and shows Søndermarken's colorized DHM point cloud in the group's local metre frame, with orbit / dolly / pan and a working per-asset layer toggle — the whole path from `fetchDhm` through `bakeLidar` to pixels.

**Architecture:** Two halves that meet at files on disk. Offline: `tools/fetch/fetchDhm.ts` pulls LAZ tiles into `data/raw/dhm/`; `tools/scene-recon/bakeLidar.ts` drives one PDAL pipeline (crop → colorize against the GeoDanmark ortho → reproject to a metre frame at the group anchor → thin) and packs the result into `public/data/geo3d/groups/soendermarken/assets/<id>/points.bin`, then read-modify-writes `manifest.json` and `scenes.json`. Online: a Vite/React tool at `tools/scene-workbench/` with an RTK + redux-saga store shaped exactly like `tools/mcpm-workbench/src/{state,store}` (post-#651), a metre-native orbit rig composed from `src/utils/camera/`, and one WESL point-splat renderer. GPU objects never enter the store — they live in a `RenderResources` bag handed to sagas via `sagaMiddleware.setContext`.

**Tech Stack:** `@reduxjs/toolkit` 2.12, `redux-saga` 1.5 + `typed-redux-saga`, `react-redux` 9.3, Vite + `wesl-plugin`, `tsx` CLIs, PDAL + GDAL/PROJ (brew, external), Playwright (probe only). All JS deps are already in `package.json`.

**Spec:** [`docs/superpowers/specs/2026-09-02-scene-workbench-design.md`](../specs/2026-09-02-scene-workbench-design.md) (§§1–12). Settled decisions: [`docs/grill-sessions/scene-workbench-2026-09-02.md`](../../grill-sessions/scene-workbench-2026-09-02.md).

**Ground preparation:** spec §3. Two prep diffs land as their own PRs **before** this plan's first commit and are consumed here, never re-created:

- P1 — `tools/utils/http/{readJsonBody,readBinaryBody,sendJson,statusForError}.ts`. Plan 1 has no dev-API plugin (spec §7.4 is plan 3's), so it consumes nothing from P1; the sequencing still holds because plan 3 does.
- P2 — `tools/utils/io/devPorts.ts` exporting `devPorts.sceneWorkbench = 5600`. **Task 10 imports it** and writes no port comment of its own.

If either is not on `main` when execution starts, stop and land it first.

## Series map

The spec spans three subsystems; it ships as four plans, each leaving working software.

| Plan                            | Slice                                                                                                                                                                                            | Spec sections                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| **1 — LiDAR end to end (this)** | data contracts, `points.bin`, `fetchDhm`, `bakeLidar`, tool scaffold, store + two sagas, camera rig, point renderer, layer toggle, probe                                                         | §4 (groups/pointCloud), §5 (`points.bin`), §6 (fetchers + `bakeLidar`), §7.1–7.3, §7.5 (picker/layers/empty), §8, §9, §10 |
| 2 — Gaussian splats             | Brush wrapper, `.ply` → `splats.bin` packer/parser, splat renderer with covariance transport, CPU camera-rest sort via `watchSplatSortSaga`                                                      | §5 (`splats.bin`), §6 (`bakeSplats`), §7.1 (splat sort), §7.2 (splatRenderer), §11 Q2                                     |
| 3 — MVS mesh, poses, nudge      | COLMAP-known-pose → OpenMVS wrapper, `.glb` bake + subset parser, mesh renderer, pose overlay (frusta, click-to-project), `poses`/`edit` slices, `apiPlugin` + transform route, `fetchSkraafoto` | §5 (`mesh.glb`), §6 (`bakeMesh`/`bakePoses`/`fetchSkraafoto`), §7.2 (mesh + pose overlay), §7.4, §7.5 (pose/nudge panels) |
| 4 — Capture ingest              | `ingestCapture.ts` (ffmpeg → COLMAP SfM), `captures.dir` registry row, proven on a throwaway object through plans 2–3's bakes                                                                    | §2 (capture ingest), §6 (`ingestCapture`), §10 deliverable 2                                                              |

## Global constraints

- `type` aliases only, never `interface`. One type per file under `tools/scene-workbench/@types/`; one function per file under `tools/utils/**` and any `utils/` folder created here.
- `react-redux` may be imported in exactly two files: `src/store/hooks.ts` and `ui/App/App.tsx`'s `<Provider>` (mcpm's carve-out, `tools/mcpm-workbench/src/store/hooks.ts:1-12`).
- RTK reducer parameters are never named `s` / `a`.
- Every file move/rename goes through `npm run move-files -- <from> <to>` (`-- --manifest <moves.json>` for batches, `--dry` first) — never `git mv` plus hand-edited imports. See `.claude/skills/refactor/SKILL.md`.
- The Datafordeler API key is **never printed, logged, or embedded in a logged URL** (`data/raw/geodanmark/README.md:65-69`). Every error path that carries a URL redacts it.
- No `toolPages` entry, no `:build` script, no `base`/`build.outDir` in the Vite config. The tool is local-only (spec §2, Q11); the curator is the precedent.
- Suite + `npm run typecheck` green after every task; `npm run format` over touched files before each commit.
- Baked artifacts and raw LAZ stay gitignored — `/data/**` and `/public/data/` are already covered (`.gitignore:93-99,109`), and the committed READMEs fall out of the existing negations. No new ignore rules.

---

### Task 1: External prerequisites and the Søndermarken extent

No application code. This task ends with a machine that can run the bake and a committed provenance README, so no later task discovers a missing binary halfway through.

**Files:**

- Create: `data/raw/dhm/README.md` (committed — provenance, licence, service, tile list, apikey rule, datum note)

**Prerequisites to install and verify:**

- [ ] `brew install pdal` (pulls GDAL + PROJ). Verify: `pdal --version` prints ≥ 2.6, and `pdal --drivers | grep -E 'readers.las|filters.colorization|filters.sample|writers.text'` lists all four.
- [ ] Verify GDAL's VRT path: `gdalinfo --version` prints ≥ 3.8.
- [ ] Verify PROJ's topocentric projection (task 6's pipeline depends on it):
      `echo "55.67 12.53 40" | cs2cs EPSG:4326 "+proj=topocentric +lat_0=55.67 +lon_0=12.53 +h_0=40 +ellps=GRS80"`
      → three metre values, all within 0.01 of `0`.
- [ ] Verify the Datafordeler key is in the login keychain without printing it:
      `security find-generic-password -a "$USER" -s skymap-datafordeler-apikey -w | wc -c` → a non-zero count.
      The key is the same one the GeoDanmark ortho harvest used (`data/raw/geodanmark/README.md:65-69`); a Datafordeler account is a user-side prerequisite (spec §6) and cannot be scripted.
- [ ] Confirm the key is entitled to the **DHM/Punktsky Fildownload** service in the Datafordeler self-service portal (a separate subscription from the WMS one). If it is not, subscribe before continuing — this is the one step that can block a fresh checkout.

**Extent to settle (spec §11 open question 1):**

- [ ] Take the Søndermarken bbox verbatim from `data/raw/geodanmark/README.md:36` — W 12.51 / S 55.662 / E 12.55 / N 55.678 — as v1's group extent. **Flagged:** the spec wants a park-scale subset centred on the picnic spot; this whole-patch extent is the v1 answer because it is the bound the ortho actually covers, and narrowing it later is a crop-constant edit plus a re-bake, nothing else.
- [ ] Record the anchor: the bbox centre, `latDeg: 55.67`, `lonDeg: 12.53`, `headingDeg: 0` (group +X = local east). `heightMDvr90` = the DHM DTM value at that point, read once from the Datafordeler DHM/Terræn viewer or from the first fetched tile's header; write the number you read into the README with its source.
- [ ] Identify the DHM 1 km tile names covering the bbox from Datafordeler's Punktsky tile index (EPSG:25832 km-grid names, e.g. `PUNKTSKY_1km_6172_722`) and list them in the README. These become task 3's constant — settling them here is what spec §11's "settle at `fetchDhm` time" asks for.
- [ ] Write `data/raw/dhm/README.md`: service + endpoint, licence and attribution, the tile list, the apikey/keychain rule, the bbox and anchor above, and the vertical-datum note (heights are DVR90 orthometric; the bake feeds them to PROJ as if ellipsoidal, which is exact enough here because `h_0` comes from the same data and the ~36 m Danish geoid undulation cancels over a 2.5 km patch).
- [ ] Commit.

### Task 2: Tool-local types

**Files:**

- Create: `tools/scene-workbench/@types/{GroupAnchor,SimilarityTransform,AssetProvenance,PipelineStep,AssetCommon,PointCloudAsset,SceneAsset,GroupRegistryEntry,GroupRegistry,SceneManifest}.d.ts`

**Contract:** copy the type bodies from spec §4 exactly, one per file, `Vec3`/`Vec4` imported from `src/@types/math/`. Two deliberate narrowings, both to be stated in the file docblocks:

- `SceneAsset = PointCloudAsset` — a one-member union in plan 1, for the same reason `GroupAnchor` is one: plans 2–4 add `GaussianSplatAsset` / `MeshAsset` / `CameraPoseSetAsset` as union cases, not as a rewrite. `PhotoPose` arrives with plan 3's overlay; minting it now would be a type nothing constructs.
- `GroupAnchor` keeps its full `kind: 'geodetic'` shape from the spec, including `headingDeg`.

- [ ] Write the ten files. No tests: `tsc` proves every fact a runtime test could here (`docs/superpowers/conventions/testing.md`, "no runtime tests of type declarations").
- [ ] `npm run typecheck`; commit.

### Task 3: Raw-data registry row and the Søndermarken group definition

**Files:**

- Modify: `tools/utils/io/rawDataRegistry.ts`
- Create: `tools/scene-recon/groups/soendermarken.ts`

**Contract:**

Two registry entries following `'geodanmark.dir'` (`rawDataRegistry.ts:939-955`):

- `'dhm.dir'` → `data/raw/dhm`, `kind: 'directory'`, `source: 'gitignored'`, `fetcher: 'tools/fetch/fetchDhm.ts'`, `readme: 'dhm.readme'`
- `'dhm.readme'` → `data/raw/dhm/README.md`, `kind: 'file'`, `source: 'committed'`

`'skraafoto.dir'` and `'captures.dir'` (spec §6) are **deliberately not added here**: their directories have no fetcher and no reader until plans 3 and 4, and a registry row for a path nothing resolves is surplus that a reader has to check the git log to explain. Each lands in the plan that first reads it.

```ts
// tools/scene-recon/groups/soendermarken.ts
export type SceneGroupDefinition = {
  readonly id: string;
  readonly name: string;
  readonly anchor: GroupAnchor;
  /** Crop bounds, WGS84 degrees — applied before colorization, in the ortho's own frame. */
  readonly bounds: LonLatBounds;
  /** DHM 1 km tile names to fetch (task 1's list). */
  readonly dhmTiles: readonly string[];
  /** `filters.sample` radius, metres — the density cap that keeps points.bin loadable. */
  readonly minPointSpacingM: number;
  /** ASPRS classes dropped before packing (7 = low noise, 18 = high noise). */
  readonly dropClassifications: readonly number[];
};
export const SOENDERMARKEN: SceneGroupDefinition;
```

`LonLatBounds` comes from `src/@types/scene/LonLatBounds`. `minPointSpacingM: 1.0` — DHM/Punktsky is ~4–5 pts/m², so the README bbox at native density is ~20 M points ≈ 320 MB at the 16-byte stride; Poisson-thinning to ~1 pt/m² lands ~4.5 M points ≈ 72 MB, which localhost serves and a browser parses without ceremony. That arithmetic belongs in the file's docblock — it is the reason the constant exists.

- [ ] Add both registry rows and the group definition (`anchor`, `bounds`, `dhmTiles` from task 1).
- [ ] No test: the rows and the constant are registry/constant restatements (`testing.md`).
- [ ] `npm run typecheck`; commit.

### Task 4: `points.bin` — format, packer, parser

**Files:**

- Create: `tools/scene-recon/pack/pointCloudFormat.ts`, `tools/scene-recon/pack/packPoints.ts`
- Create: `tools/scene-workbench/src/scene/parsePoints.ts`
- Test: `tests/tools/scene-recon/pack/packPoints.test.ts`

**Byte layout (spec §5, verbatim — this is the contract with files already on disk):**

| Field                     | Bytes       | Notes                                               |
| ------------------------- | ----------- | --------------------------------------------------- |
| magic `'PTS3'`            | 4           | ASCII, no NUL                                       |
| `formatVersion` = 1       | u32, 4      | little-endian                                       |
| `pointCount`              | u32, 4      |                                                     |
| reserved                  | 4           | zero; keeps the record array 16-byte aligned        |
| — per record, stride 16 — |             | header is 16 bytes, so record `i` is at `16 + 16*i` |
| `x, y, z`                 | 3 × f32, 12 | metres, asset frame                                 |
| `r, g, b`                 | 3 × u8, 3   | sampled from the GeoDanmark ortho at bake time      |
| `classification`          | u8, 1       | ASPRS class from the LAZ, carried through PDAL      |

**Contract:**

```ts
// pointCloudFormat.ts
export const POINTS_MAGIC = 'PTS3';
export const POINTS_FORMAT_VERSION = 1;
export const POINTS_HEADER_BYTES = 16;
export const POINTS_RECORD_BYTES = 16;

// packPoints.ts
export type ScenePoint = {
  readonly xM: number;
  readonly yM: number;
  readonly zM: number;
  readonly r: number;
  readonly g: number;
  readonly b: number; // 0..255
  readonly classification: number; // 0..255
};
export function packPoints(points: readonly ScenePoint[]): Uint8Array;

// parsePoints.ts  (browser side)
export type ParsedPointCloud = {
  readonly pointCount: number;
  /** The record array verbatim — uploaded as an instance buffer, stride 16, no CPU copy. */
  readonly records: Uint8Array;
};
export function parsePoints(buffer: ArrayBuffer): ParsedPointCloud;
```

`parsePoints` returns a **view** onto the record array (byteOffset 16), never a re-packed copy: the GPU layout in task 14 is this layout, so a copy would exist only to be identical. It throws on a wrong magic or an unsupported `formatVersion`, and on a `pointCount` that disagrees with the buffer length — a truncated download otherwise renders as silent garbage.

- [ ] Test `packPoints → parsePoints round-trips positions, colours and classification` — 5 points (not a power of two), every field varying per record (so a stride or field-order slip shows), decoded in the test with a `DataView` written by hand, never by re-calling the packer.
- [ ] Test `parsePoints rejects a truncated buffer` and `parsePoints rejects a wrong magic`.
- [ ] Implement both; `npx vitest run tests/tools/scene-recon`; commit.

### Task 5: Ortho VRT builder

PDAL's `filters.colorization` needs a GDAL-readable raster in the points' current SRS. The GeoDanmark harvest is `<x>/<y>.jpg` on skymap's equirect grid with no georeferencing, so the bake writes a GDAL **VRT** that gives the tile rect one geotransform and points at the JPEGs in place — no re-encoding, no `gdalbuildvrt`, no world-file sidecars littering a raw-data tree.

**Files:**

- Create: `tools/scene-recon/ortho/orthoVrtXml.ts`
- Test: `tests/tools/scene-recon/ortho/orthoVrtXml.test.ts`

**Contract:**

```ts
export type OrthoVrtSpec = {
  /** `<geodanmark.dir>/19` — the level directory holding `<x>/<y>.jpg`. */
  readonly levelDir: string;
  readonly rect: TileIndexRect; // earthTileIndicesForBounds(bounds, 19, EARTH_TILE_PX)
  readonly level: number;
  readonly tilePx: number;
};
/** A GDAL VRT (EPSG:4326, plate carrée) mosaicking the rect's tiles, three bands. */
export function orthoVrtXml(spec: OrthoVrtSpec): string;
```

Geometry, from `tools/textures/geodanmarkTileSource.ts:37-41`: `deg = 360 / earthTileColumns(level, tilePx)`; the mosaic's origin is `(xMin*deg - 180, 90 - yMin*deg)`, pixel size `deg / tilePx` with a **negative** y step, raster size `(xMax-xMin+1)*tilePx × (yMax-yMin+1)*tilePx`. Each tile contributes one `<SimpleSource>` per band with `<DstRect>` at `((x-xMin)*tilePx, (y-yMin)*tilePx)`. A missing tile file is skipped, not faked — the crop simply has no colour there, and the count in the layer list is how the operator sees it.

- [ ] Test `orthoVrtXml places the mosaic origin and pixel size from the tile rect` — a 2×2 rect at level 19, `tilePx` 512, asserting the six geotransform numbers hand-computed from `deg = 360/524288` and the raster size. The north-up y-flip is exactly the axis error that produces a plausible-looking, upside-down colorization.
- [ ] Test `orthoVrtXml emits one SimpleSource per band per existing tile, at its DstRect` — fixture directory with three of the four tiles present; assert the missing one contributes nothing and one present tile's `DstRect` offsets.
- [ ] Implement; commit.

### Task 6: PDAL pipeline stages and the CSV point reader

The wrapper is testable without PDAL installed because the pipeline is **built as data** and executed by an injected runner (the `tools/filaments/buildFilaments.ts` wrapper convention, minus its `spawnSync`-at-module-scope shape).

**Files:**

- Create: `tools/scene-recon/lidar/lidarPipelineStages.ts`, `tools/scene-recon/lidar/readPdalCsv.ts`
- Test: `tests/tools/scene-recon/lidar/lidarPipelineStages.test.ts`, `tests/tools/scene-recon/lidar/readPdalCsv.test.ts`

**Contract:**

```ts
export type LidarBakeSpec = {
  readonly lazFiles: readonly string[];
  readonly bounds: LonLatBounds;
  readonly orthoVrtPath: string;
  readonly anchor: GroupAnchor;
  readonly minPointSpacingM: number;
  readonly dropClassifications: readonly number[];
  readonly outCsvPath: string;
};
export type PdalStage = Readonly<Record<string, unknown>>;
/** The `pipeline` array of a PDAL pipeline JSON, in execution order. */
export function lidarPipelineStages(spec: LidarBakeSpec): readonly PdalStage[];

// readPdalCsv.ts — streams `writers.text` output into packer records.
export function readPdalCsv(csvPath: string): AsyncIterable<ScenePoint>;
```

Stage order, and why each sits where it does:

1. `readers.las`, one per LAZ file (PDAL merges them).
2. `filters.reprojection` → `EPSG:4326`, so the crop and the ortho share one frame.
3. `filters.crop`, `bounds: "([west,east],[south,north])"` in degrees — **before** colorization, so 20 M out-of-area points are never sampled.
4. `filters.range`, `limits` excluding `spec.dropClassifications`.
5. `filters.colorization`, `raster: spec.orthoVrtPath`, `dimensions: "Red:1:1, Green:2:1, Blue:3:1"` — **scale 1**: the VRT's bands are 8-bit, so the LAS 16-bit colour dimensions carry 0–255 values and the packer stores them unshifted. Changing this scale silently darkens the cloud by 256×.
6. `filters.reprojection` → `+proj=topocentric +lat_0=<anchor.latDeg> +lon_0=<anchor.lonDeg> +h_0=<anchor.heightMDvr90> +ellps=GRS80`, i.e. ENU metres about the anchor — the group frame (`headingDeg` is 0 for this group, so no rotation stage follows; a non-zero heading would add one and is not in v1).
7. `filters.sample`, `radius: spec.minPointSpacingM` — **after** the metre reprojection; run in degrees the radius would be meaningless.
8. `writers.text`, `format: "csv"`, `order: "X,Y,Z,Red,Green,Blue,Classification"`, `keep_unspecified: false`, `filename: spec.outCsvPath`.

- [ ] Test `lidarPipelineStages orders crop and colorization before the metre reprojection` — assert the stage `type` sequence for a two-file spec.
- [ ] Test `lidarPipelineStages writes the anchor into the topocentric projection` — assert the `out_srs` string contains the spec's lat/lon/height.
- [ ] Test `lidarPipelineStages crops in the ortho's degree frame` — assert the `bounds` string against hand-written bounds.
- [ ] Test `lidarPipelineStages colorizes with scale 1` — assert the `dimensions` string. (The three above are the stage-graph contract with an external tool, the same class as a parser-vs-ReadMe test; they are not constant restatements.)
- [ ] Test `readPdalCsv yields one record per data row, skipping the header` against a five-row fixture with a non-integer Z and a 255 colour value.
- [ ] Implement; commit.

### Task 7: Atomic JSON writes — manifest and scenes.json

Spec §7.4's write rule binds the CLIs as hard as the endpoint: **re-read from disk immediately before writing, write through a temp file + `rename`.** A bake CLI and (from plan 3) a dev server both mutate `manifest.json`.

**Files:**

- Create: `tools/utils/io/writeJsonAtomic.ts`
- Create: `tools/scene-recon/manifest/upsertAsset.ts`, `tools/scene-recon/manifest/upsertGroup.ts`
- Test: `tests/tools/utils/io/writeJsonAtomic.test.ts`, `tests/tools/scene-recon/manifest/upsertAsset.test.ts`

**Contract:**

```ts
// writeJsonAtomic.ts — reads `path` (null when absent), applies `update`, writes
// `<path>.tmp` then renames over `path`. Returns what was written.
export async function writeJsonAtomic<T>(
  path: string,
  update: (current: T | null) => T,
): Promise<T>;

// upsertAsset.ts
export function upsertAsset(manifest: SceneManifest, asset: SceneAsset): SceneManifest;
// upsertGroup.ts
export function upsertGroup(registry: GroupRegistry, entry: GroupRegistryEntry): GroupRegistry;
```

`upsertAsset` replaces the entry with a matching `id` in place (order preserved) or appends; `anchor`, `groupId`, `groupName` and `formatVersion` pass through untouched; siblings are returned by reference, not rebuilt.

- [ ] Test `writeJsonAtomic passes the on-disk contents to update at call time` — write a file, call with an `update` that captures its argument, assert it saw the current contents (this is the rule's teeth: an implementation that cached a parsed manifest passes nothing and fails here).
- [ ] Test `writeJsonAtomic leaves no temp file behind` — tmpdir listing after the call.
- [ ] Test `upsertAsset replaces the named asset and leaves siblings identical` — three assets, replace the middle one, assert the other two are the same object references and `anchor`/`formatVersion` survive.
- [ ] Test `upsertAsset appends an unknown asset id`.
- [ ] Implement; commit.

### Task 8: `fetchDhm` CLI

**Files:**

- Create: `tools/utils/io/readKeychainSecret.ts`, `tools/utils/io/redactSecret.ts`
- Create: `tools/fetch/fetchDhm.ts`
- Modify: `package.json` (`"fetch-dhm": "tsx tools/fetch/fetchDhm.ts"`)
- Test: `tests/tools/utils/io/redactSecret.test.ts`

**Contract:**

```ts
// readKeychainSecret.ts — `security find-generic-password -a $USER -s <service> -w`.
// Throws with an actionable hint (naming the service) when absent; never echoes the value.
export function readKeychainSecret(service: string): string;

// redactSecret.ts — every occurrence of `secret` in `text` becomes `<redacted>`.
export function redactSecret(text: string, secret: string): string;
```

`fetchDhm.ts` reads `readKeychainSecret('skymap-datafordeler-apikey')`, downloads each tile in `SOENDERMARKEN.dhmTiles` from the Datafordeler DHM/Punktsky Fildownload REST endpoint with `apikey=<key>` as a query parameter, and writes into `rawDataPath('dhm.dir')`. A tile already on disk with a non-zero size is skipped (the resume convention of `tools/fetch/*` — no separate cache file is needed, the LAZ files themselves are the cache). A 401 is retried for up to 20 minutes with backoff before failing, because a freshly registered key propagates per gateway node (`data/raw/geodanmark/README.md:70-72`). **Every** thrown message and every progress line passes through `redactSecret` first. The exact endpoint path and query parameters come from the live Datafordeler Fildownload documentation at implementation time — they are not stable enough to pin in a plan; the key handling above is.

- [ ] Test `redactSecret removes the key from a URL and from a wrapped error message`.
- [ ] Implement the CLI; no test on the download plumbing (`spawn`/`fetch` and an exit code — a mock would assert the mock, `testing.md` / spec §9).
- [ ] Run `npm run fetch-dhm`; verify the LAZ tiles land in `data/raw/dhm/` and that re-running skips them. Commit (code only — the data is gitignored).

### Task 9: `bakeLidar` CLI

**Files:**

- Create: `tools/scene-recon/bakeLidar.ts`
- Modify: `package.json` (`"bake-lidar": "tsx tools/scene-recon/bakeLidar.ts"`)

**Contract:**

```ts
export type PdalRunner = (pipelineJsonPath: string) => Promise<void>;
/** Injected so the CLI is exercisable without PDAL; `main()` passes the spawning one. */
export async function bakeLidar(
  group: SceneGroupDefinition,
  deps: { readonly runPdal: PdalRunner; readonly pdalVersion: () => string },
): Promise<PointCloudAsset>;
```

Sequence: resolve the LAZ inputs from `rawDataPath('dhm.dir')` (fail with the `npm run fetch-dhm` hint if empty, the DisPerSE-wrapper convention at `tools/filaments/buildFilaments.ts:256-280`) → `orthoVrtXml` over `earthTileIndicesForBounds(group.bounds, 19, EARTH_TILE_PX)` into a workdir → `lidarPipelineStages` → write the pipeline JSON → `runPdal` → stream `readPdalCsv` through `packPoints` → write `public/data/geo3d/groups/<id>/assets/<assetId>/points.bin` → `writeJsonAtomic` the manifest through `upsertAsset` → `writeJsonAtomic` `public/data/geo3d/scenes.json` through `upsertGroup`. `provenance.pipeline` records `{ step: 'pdal', version: deps.pdalVersion() }` and `sourceVintage` is the DHM flight date from the group definition's README, not the bake date (spec §4).

- [ ] Implement. No new unit test: every decision it makes is already covered (tasks 4–7); what remains is orchestration plus a subprocess.
- [ ] Run `npm run bake-lidar`. Verify: `points.bin` exists with `pointCount > 1e6`, `manifest.json` and `scenes.json` parse, and re-running replaces the asset entry rather than appending a duplicate.
- [ ] Commit.

### Task 10: Tool scaffold

**Files:**

- Create: `tools/scene-workbench/{index.html,vite.config.ts,wesl.toml,tsconfig.json,README.md}`, `tools/scene-workbench/src/main.tsx`, `tools/scene-workbench/src/ui/App/App.tsx`
- Modify: `package.json` (`"scene-workbench": "vite --config tools/scene-workbench/vite.config.ts"`)
- Test: `tests/tools/scene-workbench/viteConfig.smoke.test.ts`

**Contract:**

- `vite.config.ts`: `root` = this directory, `publicDir` = `../../public`, `envDir` = repo root (without it `dataUrl()` silently falls back to same-origin `/data/`), `server: { port: devPorts.sceneWorkbench }` (P2 — and **no port comment**, the table is the truth now), plugins `[react(), viteWesl({ extensions: [staticBuildExtension], weslToml: resolve(import.meta.dirname, 'wesl.toml') })]`. Model on `tools/mcpm-workbench/vite.config.ts` but **drop** its `base`, `build.outDir` and `command === 'build'` branches: no deploy target (spec §2/§8), so there is no build mode to switch on and no `toolPages` import.
- The explicit `weslToml` is load-bearing, not stylistic — the plugin otherwise reads `<process.cwd()>/wesl.toml`, and `npm run scene-workbench` keeps cwd at the repo root where the runtime's toml lives (spec §8). Say so in the file's header.
- `wesl.toml`: `root = "src/render/shaders"`, `include = ["src/render/shaders/**/*.wesl"]`, `edition = "unstable_2025"`. No symlinks, no `resolve.alias` — this tool shares no shaders with the app (contrast `tools/mcpm-workbench/wesl.toml`, which points `root` at the runtime tree because it reuses shader families).
- `tsconfig.json`: `extends: "../../tsconfig.json"`, `include: ["src", "../../src", "../../tools/utils"]`, `"exclude": []` (empty exclude is load-bearing — see `tools/galaxy-renderer/tsconfig.json`).
- `main.tsx` imports `../../../src/styles/global.css` **once** and mounts `<App />` (mcpm's `main.tsx` verbatim in shape).
- `README.md`: what the tool is, the prerequisite chain (Datafordeler key → `npm run fetch-dhm` → `npm run bake-lidar` → `npm run scene-workbench`), and that it is local-only with no deploy.

- [ ] Add the smoke test `exports a config with port 5600 and react + wesl plugins`, mirroring `tests/tools/mcpm-workbench/viteConfig.smoke.test.ts` (it guards an import-time typo that would make the npm script fail; the wesl assertion is load-bearing because `?static` imports do not resolve without it).
- [ ] Scaffold; `npm run scene-workbench` serves a page that mounts (an empty shell is expected at this task).
- [ ] Commit.

### Task 11: Store scaffold — three slices, commands, seven store files

**Files:**

- Create: `tools/scene-workbench/src/state/registry/registrySlice.ts`, `src/state/group/groupSlice.ts`, `src/state/view/viewSlice.ts`, `src/state/commands.ts`
- Create: `tools/scene-workbench/src/store/{createSceneStore,rootReducer,rootSaga,sagaContext,sagaContextRegistered,hooks,types}.ts`
- Modify: `tools/scene-workbench/src/ui/App/App.tsx` (`<Provider>`)
- Test: `tests/tools/scene-workbench/state/{registrySlice,groupSlice,viewSlice}.test.ts`

**Contract** — the store mirrors `tools/mcpm-workbench/src/store/` file for file (spec §7.1); slices live in per-domain folders beside their sagas, never a `state/slices/` bag.

```ts
export type RegistrySlice = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  groups: readonly GroupRegistryEntry[];
  selectedGroupId: string | null;
  error: string | null;
};
export type GroupSlice = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  manifest: SceneManifest | null;
  assetStatus: Record<string, 'pending' | 'ready' | 'error'>;
  error: string | null;
};
export type SceneCamera = { yaw: number; pitch: number; distanceM: number; targetM: Vec3 };
export type ViewSlice = {
  camera: SceneCamera;
  hiddenAssetIds: readonly string[];
  fps: number;
  deviceLost: boolean;
};
// commands.ts — bare createAction one-shots, never token counters in state.
export const reloadRegistryRequested: ActionCreatorWithoutPayload;
```

`rootReducer` combines `{ registry, group, view }`. Spec §7.1's `poses` and `edit` slices arrive with plan 3's overlay and nudge panel; adding them now would be five reducers nothing dispatches. `createSceneStore` returns **`{ store, registerSagaContext }`** (`createWorkbenchStore.ts:31-50`'s shape, including the merge-then-announce ordering); `sagaContextRegistered` keeps its own file to break the `createSceneStore → rootSaga → watchers` cycle; `hooks.ts` is the only `react-redux` import besides `App.tsx`. `types.ts` derives `RootState`/`SceneStore`/`AppDispatch`/`RegisterSagaContext` from the above — never hand-authored.

`SceneSagaContext = { canvas: HTMLCanvasElement; resources: RenderResources }` (task 12 declares `RenderResources`).

Reducers: `registrySlice` — `registryLoading`, `registryLoaded`, `registryFailed`, `groupSelected`; `groupSlice` — `manifestLoaded`, `manifestFailed`, `assetStatusChanged`; `viewSlice` — `commitCameraPose`, `toggleAssetVisibility`, `setFps`, `deviceLost`.

`groupSlice` reacts to `groupSelected` (owned by `registrySlice`) through **`extraReducers`** — a same-named reducer in its own `reducers` block would create a second action type and silently drop the registry's, a trap this repo has paid for before.

Visibility is stored as `hiddenAssetIds`, not a `Record<string, boolean>`: an asset appears in the manifest before any toggle has been touched, and "absent means visible" removes the initialization step that a boolean map needs on every manifest load.

- [ ] Slice tests only where a reducer decides something: `toggleAssetVisibility adds then removes an id`, `commitCameraPose clamps pitch to the pole limit`, `groupSelected clears the previous manifest and its asset statuses`. No spread restatements.
- [ ] Wire `<Provider>`; typecheck; commit.

### Task 12: Viewport, RenderResources, and the two loading sagas

**Files:**

- Create: `tools/scene-workbench/src/render/renderResources.ts`, `src/render/uploadPointCloud.ts`
- Create: `tools/scene-workbench/src/scene/acceptLoadedAsset.ts`
- Create: `tools/scene-workbench/src/state/registry/watchRegistrySaga.ts`, `src/state/group/watchGroupSaga.ts`
- Create: `tools/scene-workbench/src/ui/Viewport/Viewport.tsx`
- Modify: `tools/scene-workbench/src/store/rootSaga.ts`
- Test: `tests/tools/scene-workbench/scene/acceptLoadedAsset.test.ts`, `tests/tools/scene-workbench/render/renderResources.test.ts`

**Contract:**

```ts
export type LidarGpuAsset = { vertexBuffer: GPUBuffer; pointCount: number };
export type RenderResources = {
  gpu: GpuContext | null;
  gpuAssets: Map<string, LidarGpuAsset>;
  depthTexture: GPUTexture | null;
  epoch: number;
};
export function createRenderResources(): RenderResources;
/** Destroys every GPU asset + the depth texture, clears the map, bumps `epoch`. `gpu` survives. */
export function disposeScene(resources: RenderResources): void;

/** Uploads a parsed record array as one instance buffer. Owns no pipeline — the
 *  renderer (task 14) draws these; the saga must not depend on it existing yet. */
export function uploadPointCloud(
  gpu: GpuContext,
  records: Uint8Array,
  pointCount: number,
): LidarGpuAsset;

export function acceptLoadedAsset(
  built: LidarGpuAsset,
  resources: Pick<RenderResources, 'epoch'>,
  myEpoch: number,
  cancellation: { readonly aborted: boolean },
): LidarGpuAsset | null;
```

**The cancellation landmine (spec §7.1, learned the expensive way in the MCPM rewrite):** an `epoch` check placed _after_ a `yield*` is dead code on cancellation — `takeLatest` unwinds the generator via `iterator.return()` and never resumes it with the resolved value. `acceptLoadedAsset` is therefore called from **inside** the fetch/upload promise's own `.then()`, with `cancellation.aborted` set synchronously in the worker's `finally` (driven by `yield* cancelled()`), plus the independent epoch compare for a dispose that happened without saga cancellation at all (unmount calls `disposeScene` directly). Copy the shape and the reasoning from `tools/mcpm-workbench/src/state/scene/acceptBuiltHarness.ts`; every per-asset upload in `watchGroupSaga` goes through it.

Sagas:

| Saga                | Effect                                                              | Job                                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `watchRegistrySaga` | `takeLatest` on `sagaContextRegistered` + `reloadRegistryRequested` | `loadDataManifest()` then fetch `dataUrl('geo3d/scenes.json')`; on success dispatch the entries and select the first group; a 404 is the empty state, not an error |
| `watchGroupSaga`    | `takeLatest` on `groupSelected`                                     | `disposeScene` → fetch the manifest → per asset: fetch `artifactUrl`, `parsePoints`, `uploadPointCloud`, `acceptLoadedAsset`, mark ready                           |

`Viewport.tsx` owns: the canvas ref, `initGpu` (from `src/services/gpu/device`, no options — spec §3), `createRenderResources`, `registerSagaContext({ canvas, resources })` on mount, `disposeScene` on unmount, and the rAF driver. The driver reads `store.getState()` **once per tick** and takes one `store.subscribe` for epoch/dirty bookkeeping; it never calls `useAppSelector`.

- [ ] Test `acceptLoadedAsset destroys and rejects a build whose epoch moved`, `… rejects an aborted build`, `… accepts a live build` (three lines, one real bug each: a leaked buffer or a resurrected dead scene).
- [ ] Test `disposeScene destroys every asset, clears the map and bumps epoch` + `disposeScene is idempotent` with stub GPU objects.
- [ ] Implement; `npm run scene-workbench` shows the layer statuses reaching `ready` (nothing is drawn until task 14).
- [ ] Commit.

### Task 13: Metre-native camera rig and input

Composed from the existing unit-agnostic pure functions (spec §7.3, Q10) with the tool's own clamp.

**Files:**

- Create: `tools/scene-workbench/src/render/sceneCameraView.ts`, `src/scene/clampSceneDistanceM.ts`, `src/input/createSceneInput.ts`
- Test: `tests/tools/scene-workbench/render/sceneCameraView.test.ts`

**Contract:**

```ts
export type SceneCameraView = {
  readonly eyeM: Vec3;
  readonly targetM: Vec3;
  readonly rightM: Vec3;
  readonly upM: Vec3;
  readonly fovYRad: number;
  readonly viewportPx: readonly [number, number];
};
export function sceneCameraView(
  camera: SceneCamera,
  viewportPx: readonly [number, number],
): SceneCameraView;

/** Metres. MIN 0.5 (nose against a leaf), MAX 5000 (the whole patch plus sky). */
export function clampSceneDistanceM(distanceM: number): number;

export type SceneInput = {
  drain(): boolean;
  getCameraPose(): SceneCamera;
  destroy(): void;
};
export function createSceneInput(deps: {
  canvas: HTMLCanvasElement;
  store: SceneStore;
  markDirty: () => void;
}): SceneInput;
```

`sceneCameraView` composes `yawPitchToDir` (eye = `targetM + distanceM · dir`), `frameUp(undefined)` (identity frame → world +Y) and `imagePlaneBasis(forward, 0, upRef)` for `rightM`/`upM`, which the pan gesture and the billboard expansion both read.

**Two of the spec's six named utilities are deliberately not imported**, and the file header says why: `zoomedDistance` and `orbitRadPerPixel` both degenerate to a constant when the pivot has no surface (`radiusMpc === null`), which is this tool's only case — and `zoomedDistance` reaches `clampDistance`, whose `MAX_DISTANCE_MPC = 30000` would read as a 30 km ceiling here, exactly the Mpc-constant leak spec §7.3 forbids. The rig uses `clampSceneDistanceM` instead. Nothing new is derived, so the Q10 rider ("new pure orbit maths goes into one-symbol `src/utils/camera/` files") does not fire in this plan.

`createSceneInput` follows `tools/mcpm-workbench/src/input/createViewportInput.ts` minus the gizmo half: `attachOrbitControls` + `createInputAggregator` from `src/`, `orbitDragDelta` from `tools/utils/camera/`, a live register committed to the store at `gestureEnd` / rest-wheel (never per move), zoom as `clampSceneDistanceM(register.distanceM * step.factor)`, pan along `rightM`/`upM` scaled by distance.

- [ ] Test `sceneCameraView places the eye and screen axes for a quarter-turn yaw` — `{ yaw: π/2, pitch: 0, distanceM: 100, targetM: [10, 0, 0] }` → `eyeM = [110, 0, 0]`, `rightM = [0, 0, -1]`, `upM = [0, 1, 0]` (hand-computed; the sign of `rightM` is the classic mirrored-pan bug).
- [ ] Test `sceneCameraView keeps the basis finite looking straight down` — pitch = +π/2 − 1e-9, assert every component is finite.
- [ ] Implement; commit.

### Task 14: LiDAR point renderer — first pixels

**Files:**

- Create: `tools/scene-workbench/src/render/shaders/lidarPoint.wesl`, `src/render/lidarPointRenderer.ts`, `src/render/writeSceneCamera.ts`
- Modify: `tools/scene-workbench/src/ui/Viewport/Viewport.tsx` (draw call in the rAF driver), `src/render/renderResources.ts` (add `lidar: LidarPointRenderer | null`, disposed with the scene)
- Test: `tests/tools/scene-workbench/render/sceneCamera.parity.test.ts`

**Vertex buffer** — the `points.bin` record array uploaded verbatim, one instance per point:

| Attribute       | Format      | Offset | Shader location |
| --------------- | ----------- | ------ | --------------- |
| `positionM`     | `float32x3` | 0      | 0               |
| `colorAndClass` | `unorm8x4`  | 12     | 1               |

Instance stride 16 = `POINTS_RECORD_BYTES`. `.w` is the ASPRS class scaled by 1/255 and is unused in v1's shader — the class filter already ran in PDAL; it rides along because dropping it would break the 16-byte alignment the format exists to keep.

**Uniform `SceneCamera` (group 0, binding 0), 112 bytes:**

| Field         | WGSL          | Bytes | Offset |
| ------------- | ------------- | ----- | ------ |
| `viewProj`    | `mat4x4<f32>` | 64    | 0      |
| `rightM`      | `vec3<f32>`   | 12    | 64     |
| `pointSizePx` | `f32`         | 4     | 76     |
| `upM`         | `vec3<f32>`   | 12    | 80     |
| `viewportH`   | `f32`         | 4     | 92     |
| `eyeM`        | `vec3<f32>`   | 12    | 96     |
| `metresPerPx` | `f32`         | 4     | 108    |

**Contract:**

```ts
export const SCENE_CAMERA_BYTES = 112;
export function writeSceneCamera(
  out: Float32Array,
  view: SceneCameraView,
  pointSizePx: number,
): void;

export type LidarPointRenderer = {
  draw(
    encoder: GPUCommandEncoder,
    target: GPUTextureView,
    depth: GPUTextureView,
    view: SceneCameraView,
    assets: readonly LidarGpuAsset[],
  ): void;
  dispose(): void;
};
export function createLidarPointRenderer(
  gpu: GpuContext,
  targetFormat: GPUTextureFormat,
): LidarPointRenderer;
```

The shader expands each instance into a screen-facing quad from `rightM`/`upM` at a constant pixel size, depth-tested (`depth24plus`, `less`), opaque — no blending, so no sort is needed (that is plan 2's problem, spec §7.2). Bind-group layouts are **explicit, never `'auto'`** (`feedback_shaders`). `viewProj` is composed on the CPU with `wgpu-matrix` from `SceneCameraView`.

- [ ] Test `SceneCamera TS↔WESL parity` mirroring `tests/tools/mcpm-workbench/render/mcpmCamera.parity.test.ts`: parse the struct out of `lidarPoint.wesl` and assert every field's float offset against the offsets `writeSceneCamera` writes, plus `SCENE_CAMERA_BYTES`. (A keep-rule test per `testing.md` — a silent offset drift is invisible until the frame stops presenting.)
- [ ] Implement the renderer, the shader, and the draw call; wire the depth texture into `RenderResources` and resize it with the canvas.
- [ ] Visual check with the operator: Søndermarken's cloud is on screen, coloured, orbit/dolly/pan respond, and the ground reads as ground rather than a plane at the wrong scale.
- [ ] Commit.

### Task 15: UI — group picker, layer list, empty state

**Files:**

- Create: `tools/scene-workbench/src/ui/GroupPicker/{GroupPicker.tsx,GroupPicker.module.css}`, `src/ui/LayerList/{LayerList.tsx,LayerList.module.css}`, `src/ui/EmptyState/{EmptyState.tsx,EmptyState.module.css}`
- Modify: `tools/scene-workbench/src/ui/App/App.tsx`

**Contract** (spec §7.5): one component per file, `function Name() {}` + `export default Name`, a top-level `.root` class, shared vocabulary via `composes` from `src/components/common/shared.module.css` — never `:global` (see `.claude/skills/create-component/SKILL.md`; `tools/mcpm-workbench/src/ui/ControlsPanel/ControlsPanel.module.css:53` is the composing precedent).

- **GroupPicker** — the `scenes.json` list; selecting dispatches `groupSelected`.
- **LayerList** — one row per asset: visibility checkbox (dispatching `toggleAssetVisibility`), a kind badge, and the asset's count (`pointCount`). The count is the point of the row: a bake that produced a tenth of what it should have is visible at a glance.
- **EmptyState** — shown when `registry.status === 'ready'` with no groups, or the fetch 404'd. Names the Datafordeler API-key prerequisite and the exact command sequence (`npm run fetch-dhm` → `npm run bake-lidar`).

- [ ] Test `LayerList toggles an asset's visibility` with `@testing-library/react` over a real store — `fireEvent.click` on the checkbox, never `fireEvent.change` (`testing.md`'s controlled-checkbox trap), asserting the store's `hiddenAssetIds`.
- [ ] Implement; verify the toggle actually removes the cloud from the frame.
- [ ] Commit.

### Task 16: GPU probe and close-out

**Files:**

- Create: `tools/scene-workbench/probeGpuErrors.ts`
- Modify: `package.json` (`"scene-workbench:probe": "tsx tools/scene-workbench/probeGpuErrors.ts"`), `tools/scene-workbench/README.md`

**Contract** (spec §9): structure copied from `tools/mcpm-workbench/probeGpuErrors.ts` — own ephemeral-port Vite server, real Chromium first with a headless-shell fallback, `requestDevice` monkey-patched to capture `uncapturederror` and `device.lost`, settle frames between steps, error drain per step, non-zero exit on any error. Its step queue must not depend on baked data: `?probe` makes `watchRegistrySaga` install a **synthetic one-group registry** with a small generated point cloud (the mcpm `?probe` synthetic-catalog pattern, read live off `window.location.search`), so the probe runs on a fresh checkout.

Steps: boot → orbit drag → dolly to the near clamp → toggle the layer off → toggle it on → resize.

- [ ] Implement the probe; `npm run scene-workbench:probe` exits 0 with no GPU errors.
- [ ] README: architecture paragraph (store shape, saga inventory, where the offline CLIs write), and the local-only note.
- [ ] Run the comment budget over every file this plan created (module header ≤ 10 lines, comment lines ≤ half the code lines).
- [ ] Full `npx vitest run tests/tools/scene-workbench tests/tools/scene-recon tests/tools/utils`, `npm run typecheck`; commit.

## Definition of Done

**Deliverable inventory**

- `tools/fetch/fetchDhm.ts`, `tools/scene-recon/{bakeLidar.ts, groups/soendermarken.ts, pack/, ortho/, lidar/, manifest/}`, `tools/utils/io/{writeJsonAtomic,readKeychainSecret,redactSecret}.ts`, `data/raw/dhm/README.md`, `dhm.dir`/`dhm.readme` registry rows.
- `tools/scene-workbench/` with `vite.config.ts` (port from `devPorts.sceneWorkbench`), `wesl.toml`, `tsconfig.json`, `README.md`, ten `@types/*.d.ts`, three slices + `commands.ts`, seven `store/` files, two watcher sagas, `renderResources.ts`, `acceptLoadedAsset.ts`, the camera rig + input, `lidarPointRenderer` + `lidarPoint.wesl`, three UI components, `probeGpuErrors.ts`.
- npm scripts: `fetch-dhm`, `bake-lidar`, `scene-workbench`, `scene-workbench:probe`.
- On disk (gitignored): `public/data/geo3d/scenes.json`, `groups/soendermarken/manifest.json`, and a `points.bin` of > 1 M points.

**Named observable behaviours** (manual smoke on :5600)

- The group picker lists Søndermarken; selecting it loads the manifest and the layer row reaches `ready` with a point count matching `points.bin`'s header.
- The cloud renders in metres: buildings stand up, the canopy has volume, colours come from the ortho rather than a uniform grey.
- Orbit drag rotates about the target, right/middle drag pans along the screen axes, wheel dollies and stops at the near clamp without inverting.
- The layer toggle removes and restores the cloud; the point count stays visible while hidden.
- With `public/data/geo3d/` absent, the empty state names the Datafordeler key and the two commands.
- Re-running `npm run bake-lidar` while the tool is open replaces the asset entry (no duplicate row after a reload).
- `npm run scene-workbench:probe` exits 0.

**Deferral boundary** — out of scope for this plan, and for a reviewer to leave alone: splats and the mesh (plans 2–3), the pose overlay, the nudge panel and the dev-API plugin (plan 3), capture ingest (plan 4), `skraafoto.dir`/`captures.dir` registry rows, the `scene` anchor variant, R2 sync, a `toolPages` entry or `:build` script, mobile/touch/non-Chromium support, and the park-scale sub-extent (spec §11 Q1 — v1 takes the whole ortho patch, task 1).
