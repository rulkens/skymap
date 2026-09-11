# Scene Workbench 2/4 — Gaussian splats — design

**Status:** Draft (2026-09-10), awaiting plan

**Parent:**
[`docs/superpowers/specs/completed/2026-09-02-scene-workbench-design.md`](completed/2026-09-02-scene-workbench-design.md)
(§§1–12) — the tool's overall shape, `SceneAsset`/`GroupAnchor`/`SimilarityTransform`,
the manifest read-modify-write rule, the RTK+saga architecture. This spec refines only
the splat-related sections and cites the parent by section rather than repeating it.

**As built:**
[`docs/superpowers/plans/completed/2026-09-03-scene-workbench-1-lidar-end-to-end.md`](completed/2026-09-03-scene-workbench-1-lidar-end-to-end.md)
("As built" + "Series map") — plan 1's actual shape, which differs from the parent
spec in several places (Z-up rig, `RenderResources` shape, PDAL stage set). This spec
is written against the as-built tree, not the parent spec's original prose.

**Ground preparation:** produced by `refactor-ground` at a 2026-09-10 checkpoint —
three prep refactors plus a binding rulings list, both recorded in §3 below and
signed off by the user.

## 1. Purpose

Plan 1 put Søndermarken's LiDAR point cloud on screen. This plan adds the second of
the tool's three reconstructions (parent spec §1): a **Gaussian-splat radiance field**
trained offline from skråfoto oblique aerial photography, rendered as a second,
alpha-blended pass over the same LiDAR points in the same metre frame.

Splats are the reconstruction that actually looks like the place — facades, canopy,
specular highlights — rather than a coloured point cloud. Getting one on screen next
to the LiDAR layer is what lets the tool answer its founding question (parent spec
§1): do two independent reconstructions of the same subject agree, and if not, which
one is skewed and why.

**Full plan 2, not the LiDAR-only "2a" shortcut** (bake isotropic splats directly
from `points.bin`, no training, no photography) — rejected at the checkpoint: it
would never test the photogrammetry pipeline (STAC → pose → COLMAP) plans 2–3 both
depend on, and it would not look like anything a splat viewer is for.

## 2. Scope

**In scope (v1):**

- `PhotoPose` (parent spec §4) and `photoPoseFromStacItem` — pulled forward from
  plan 3 because `bakeSplats` needs camera poses to seed COLMAP for Brush, regardless
  of whether the pose _overlay_ ever ships.
- `fetchSkraafoto.ts`, `bakeSplats.ts`, `splats.bin`'s packer/parser, the splat
  renderer, and the CPU depth sort (`watchSplatSortSaga`).
- The three prep refactors (§3), landing as their own PR before this plan's first
  commit.

**Out of scope (plan 3, unchanged from the parent spec):**

- The `cameraPoseSet` manifest asset and `poseOverlayRenderer` — frusta, the
  click-to-project photo, the opacity slider. `PhotoPose` exists in this plan only as
  `bakeSplats`'s internal COLMAP input; nothing constructs a `CameraPoseSetAsset`.
- The nudge API (`PATCH .../transform`, the dev-API plugin, the nudge panel).
  `SimilarityTransform` stays identity for every asset this plan bakes.
- `MeshAsset` / `meshRenderer` / `bakeMesh.ts`.
- Capture ingest (plan 4).

## 3. Ground preparation

Three refactors, all **growth, prerequisite** — each removes an assumption baked into
plan 1's LiDAR-only tree that a second asset kind cannot share. None is a bolt-on:
special-casing `gaussianSplat` around the LiDAR-shaped seams below, rather than
widening them, is exactly the thing this section exists to head off. **They have
landed**, as one separate prep PR sequenced before this plan's feature work — draft
PR #672, `refactor(scene-workbench): ground prep for the splat layer` (branch
`worktree-agent-abaf23ad1167b971d`, 4 commits) — per the user's ruling that prep work
lands before, not inside, the feature PR. The table below cites the **as-landed**
code on that branch.

| #   | Touchpoint                                          | Blocker (pre-#672 code)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Landed (PR #672)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `GpuAsset` union                                    | `LidarGpuAsset = { vertexBuffer, pointCount }` carried no `kind` tag or `dispose()`; `disposeScene` called `asset.vertexBuffer.destroy()` by field name; `gpuAssets: Map<string, LidarGpuAsset>` was closed to one shape                                                                                                                                                                                                                                                                                        | `LidarGpuAsset` gains `kind: 'pointCloud'` + `dispose()` (`renderResources.ts:8-13`); `GpuAsset = LidarGpuAsset` today, one member (`:16`) — `SplatGpuAsset` is this plan's addition to the union; `gpuAssets: Map<string, GpuAsset>`; `disposeScene` (`renderResources.ts:35-41`) and `acceptLoadedAsset` (`acceptLoadedAsset.ts:12-21`) call `.dispose()` generically, never `.vertexBuffer` by name                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2   | Per-kind loader table                               | `loadAssetWorker` hardcoded `parsePoints` + `uploadPointCloud` for every asset — harmless while `SceneAsset` was a one-member union, load-bearing the moment it isn't                                                                                                                                                                                                                                                                                                                                           | New `tools/scene-workbench/@types/AssetLoader.d.ts`: `AssetLoader = (gpu: GpuContext, buffer: ArrayBuffer) => GpuAsset`; new `scene/loaders/loadPointCloud.ts` (wraps `parsePoints`+`uploadPointCloud`) and `scene/loaders/assetLoaders.ts` exporting `ASSET_LOADERS: Record<SceneAsset['kind'], AssetLoader>` (one row, `pointCloud: loadPointCloud`); `loadAssetWorker` (`watchGroupSaga.ts`) fetches the buffer generically, then dispatches `ASSET_LOADERS[asset.kind](gpu, buffer)`                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 3   | Frame-driver-owned pass + device-lifetime renderers | `Viewport.tsx` lazily built `resources.lidar ??= createLidarPointRenderer(...)` **inside the frame closure**, rebuilt on every group switch though the pipeline never depended on the loaded group — flagged as a plan-2 concern in the as-built plan 1 note (parent spec §7.1: _"a renderer riding the same scene-lifetime bag as the GPU assets is a plan-2 un-braid, not a plan-1 concern"_); `lidarPointRenderer.draw` opened **and closed its own render pass** and owned its own camera buffer/bind group | New `src/render/sceneCameraUniform.ts` exports `createSceneCameraUniform(device) → { layout, bindGroup, write(view, pointSizePx), dispose() }` — the shared camera buffer, bind-group layout and per-frame writer. `Viewport` builds it and the renderer set **once**, right after `initGpu` resolves, disposed only on unmount (`Viewport.tsx:144-145,164`); each frame it calls `cameraUniform.write(...)` once, binds group 0 once (`Viewport.tsx:107,127`), then `lidar.draw(pass, assets)`. `lidarPointRenderer.draw` narrows to `(pass: GPURenderPassEncoder, assets: readonly LidarGpuAsset[]) => void` — no `pointSizePx` parameter, it rides the uniform now — and `createLidarPointRenderer(gpu, targetFormat, cameraLayout)` takes the camera bind-group layout at construction (`lidarPointRenderer.ts:20-24`). `RenderResources` narrows to `{ gpu, gpuAssets, depthTexture, epoch }` — the `lidar` slot is gone |

Landed in #672: `renderResources.ts`, `lidarPointRenderer.ts`, the new
`sceneCameraUniform.ts`, `ui/Viewport/Viewport.tsx`, `scene/acceptLoadedAsset.ts`,
`state/group/watchGroupSaga.ts`, the new `@types/AssetLoader.d.ts` and
`scene/loaders/{loadPointCloud,assetLoaders}.ts` (all under
`tools/scene-workbench/`), plus their tests — nothing further to do here.

**Other rulings from the checkpoint**, binding for the rest of this spec:

- Per-kind counts (`pointCount` / `splatCount`) stay on their own asset variants; one
  exhaustive `assetCount(asset)` helper (§7.2) is the single place the UI reads a
  count, never a per-kind field access at a call site.
- One shared `SceneCamera` uniform, owned by `Viewport`, bound at group 0 by **both**
  pipelines (§7.3) — not a second, splat-only uniform buffer.
- Sort runs on the main thread first (§7.4); a Worker is added only if measurement
  shows a stall past ~50 ms at 1–2 M splats.
- The header `AABB`/`byteSize`/`flags`/`maxSplats` knobs floated during design are
  **dropped** — nothing in v1 reads them, and an unread field is exactly the kind of
  surplus §8's leanness convention flags.

## 4. Data model delta

Tool-local types, one per file under `tools/scene-workbench/@types/`, `type` aliases
only, deep relative imports — unchanged conventions from the parent spec (§4) and
plan 1's as-built tree.

```ts
// tools/scene-workbench/@types/GaussianSplatAsset.d.ts — new
import type { AssetCommon } from './AssetCommon';

export type GaussianSplatAsset = AssetCommon & {
  readonly kind: 'gaussianSplat';
  readonly splatCount: number;
  readonly shDegree: 0 | 1;
  readonly artifactUrl: string; // splats.bin — §5
};
```

```ts
// tools/scene-workbench/@types/SceneAsset.d.ts — grows a second union member
import type { GaussianSplatAsset } from './GaussianSplatAsset';
import type { PointCloudAsset } from './PointCloudAsset';

export type SceneAsset = PointCloudAsset | GaussianSplatAsset;
```

```ts
// tools/scene-workbench/@types/PhotoPose.d.ts — new, parent spec §4 verbatim
import type { Vec2 } from '../../../src/@types/math/Vec2';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import type { Vec4 } from '../../../src/@types/math/Vec4';

export type PhotoPose = {
  readonly id: string;
  /** Camera centre in the group frame, metres. */
  readonly positionM: Vec3;
  /** Group frame ← camera frame (camera looks along +Z, +Y down — the CV convention). */
  readonly rotation: Vec4;
  readonly focalLengthPx: number;
  readonly principalPointPx: Vec2;
  readonly imageWidthPx: number;
  readonly imageHeightPx: number;
  readonly imageUrl: string;
};
```

`AssetProvenance.source` needs no new member: skråfoto is a national geodata API
fetch, so a splat asset's provenance is `source: 'nationalGeodataApi'` with a two-step
`pipeline` (§6).

`SimilarityTransform` is unchanged and stays identity for every asset this plan
bakes — the nudge endpoint that would ever write a non-identity value is plan 3. The
splat renderer does **not** read or apply it in v1 (§7.4): plan 3's `AssetXform`
uniform is the deferred, not-yet-built consumer.

## 5. On-disk layout and `splats.bin`

```
data/raw/
  skraafoto/<collection>/       STAC item JSON + downsampled JPEG, per photo
    README.md                                                       (committed)
    colmap-<groupId>/           gitignored bake workdir — cameras.txt, images.txt,
                                 points3D.txt, images/, final.ply (Brush's export)

public/data/geo3d/groups/<groupId>/assets/splats/
  splats.bin
```

`data/raw/skraafoto/<collection>/colmap-<groupId>/` is an **intermediate bake
workdir**, not a shipped asset — it lives under `data/raw/` (already gitignored
wholesale, parent spec §5) beside the fetched photos it's built from, not under
`public/data/geo3d/`. A re-bake overwrites it in place.

### `splats.bin` — v1 (header selects the record stride, mirrors `points.bin`)

16-byte header:

| Field               | Bytes  | Notes                                         |
| ------------------- | ------ | --------------------------------------------- |
| magic `'SPL3'`      | 4      |                                               |
| `formatVersion` = 1 | u32, 4 |                                               |
| `splatCount`        | u32, 4 |                                               |
| `shDegree` (0 or 1) | u32, 4 | selects whether the trailing block is present |

Then `splatCount` **28-byte core records**, little-endian, one per splat:

| Field      | Bytes     | Notes                                                                                                                                                                |
| ---------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `x, y, z`  | 3×f32, 12 | metres, asset frame                                                                                                                                                  |
| `rotation` | 4×i8, 4   | unit quaternion `[x,y,z,w]` / 127, `unpack4x8snorm`. Byte-offset **12** — its own u32 word, no cross-word reconstruction                                             |
| `logScale` | 3×f16, 6  | natural log of the Gaussian's axis half-lengths. `.xy` at bytes 16–19 (`unpack2x16float(w4)`); `.z` at bytes 20–21, the low half of word 5 (`unpack2x16float(w5).x`) |
| `opacity`  | u8, 1     | byte 22, within word 5. Post-sigmoid probability × 255, `unpack4x8unorm(w5).z`                                                                                       |
| pad        | 1         | byte 23 — keeps `dcColor` starting a fresh word                                                                                                                      |
| `dcColor`  | 3×u8, 3   | bytes 24–26, word 6. SH degree-0 term evaluated to RGB (`0.5 + 0.28209479 · f_dc`), × 255, `unpack4x8unorm(w6).xyz`                                                  |
| pad        | 1         | byte 27                                                                                                                                                              |

Then, **only when `shDegree = 1`**, a separate trailing block of `splatCount × 12`
bytes — never interleaved with the core records, so a degree-0 reader never has to
skip it:

| Field   | Bytes            | Notes                                                                                                                                                                                   |
| ------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fRest` | 9×i8 + 3 pad, 12 | channel-major: `R[0..2], pad`, `G[0..2], pad`, `B[0..2], pad` — three whole u32 words, each `unpack4x8snorm(word).xyz`. Value = coefficient × 127 (±1.0 range; see §10 open question 1) |

**Deviation from the ground-prep brief's field order.** The brief listed the core
record as `xyz, logScale, rotation, opacity, dcColor, pad` — byte-legal (still 28 B),
but it puts `rotation`'s 4 bytes at offset 18, split across two u32 words, which forces
a shift-and-mask reconstruction before `unpack4x8snorm` can read it. Reordering
`rotation` ahead of `logScale` (as above) gives it its own word. `dcColor` needs the
same care: naively placed at bytes 23–25 it crosses the word 5/word 6 boundary at
byte 24, the same bug in a different field. The table above fixes this by moving one
pad byte ahead of `dcColor` (byte 23) so the colour starts a fresh word (24–26) and
one pad byte trails it (27) — `opacity` and `logScale.z` share word 5 with that
leading pad byte's neighbour, `dcColor` owns word 6 outright. Same 28-byte stride,
same field set and same 2 bytes of padding as the brief's listing, just rearranged so
every packed sub-value is a single `unpack*` call on one word. **Author's call**, not
re-litigating the ruling: the stride, the header, and the field set are unchanged.

`SPLATS_MAGIC`/`SPLATS_FORMAT_VERSION`/`SPLATS_HEADER_BYTES`/`SPLATS_RECORD_BYTES`/
`SPLATS_SH1_RECORD_BYTES` live in `tools/scene-recon/pack/splatFormat.ts`, mirroring
`pointCloudFormat.ts`'s role as the shared constants both the Node packer and the
browser parser import — no drift possible between the two sides.

## 6. Offline pipeline

Mac-native, thin `tsx` wrappers shelling to installed binaries, DisPerSE-wrapper
install-hint convention (`tools/filaments/buildFilaments.ts`; `bakeLidar.ts`'s
`pdalVersion()` at `bakeLidar.ts:157-170` is the closer, in-tree precedent).

### `tools/fetch/fetchSkraafoto.ts`

`POST https://api.dataforsyningen.dk/rest/skraafoto_api/v1.0/search`, body
`{ collections: [group.skraafoto.collection], bbox: [w,s,e,n] from group.bounds, limit: 1000 }`,
header `token: <apiKey>` — `readKeychainSecret('skymap-dataforsyningen-apikey')`, the
same `execFileSync` idiom as `readKeychainSecret.ts:9-26`. `redactSecret` wraps every
logged error and URL, mirroring `fetchDhm.ts`'s `redactSecret(..., apiKey)` calls at
every catch site (`fetchDhm.ts:89-93,149,201,223`) — the token lives in a header here,
not a query string, but the same defensive default applies.

For each returned STAC item: write `<itemId>.json` verbatim, then one downsampled
JPEG via `gdal_translate /vsicurl/<data.href> -outsize <w> <h> -of JPEG <dest>.tmp`
with env `GDAL_HTTP_HEADERS="token: <apiKey>"` — **never in the URL**. `<w>,<h>` scale
the item's `proj:shape` so its **long edge is 1920 px**: `scale = 1920 / max(W, H)`.
On success, rename `.tmp` → the final path (bakeLidar's temp-file+rename idiom); on a
non-zero exit, delete the `.tmp` and record a failure for that item without aborting
the run — one bad frame must not lose the other ~300. Resume = both the `.json` and
the `.jpg` present for an item id; no separate completeness check is needed (unlike
`fetchDhm`'s LAS tiles) because a `gdal_translate` failure never leaves a renamed
file behind.

**Whole downsampled frames, not COG range-request crops — supersedes parent spec §6's
`fetchSkraafoto` row.** The parent spec called for range-request crops against the
COG; the checkpoint reversed this. A crop strategy would need to know each photo's
footprint on the ground before fetching it (a chicken-and-egg with the pose that
`photoPoseFromStacItem` derives from the same item), and Brush trains against whole
frames. GDAL reading the COG's own overview pyramid (measured: overviews down to
330×442) makes a whole-frame 1920-long-edge fetch cheap regardless.

Collection: `skraafotos2025` — the forår-2025 flight, matching the vintage the LiDAR
colorization already uses (`data/raw/geodanmark/README.md`'s vintage note, parent
spec §11 open question 3). Live-confirmed 2026-09-10 against `/collections`; 306
items over the Søndermarken bbox, single flight 2025-04-27 (70 nadir + 55–62 per
oblique direction).

**Token, not apikey.** Dataforsyningen's skråfoto self-service token (user-set
expiry, "Administrer token til webservices og API'er" on dataforsyningen.dk) is a
**separate credential** from the Datafordeler apikey `fetchDhm.ts` uses — a second
keychain entry, `skymap-dataforsyningen-apikey`, already present locally. The
README documents both this and the item-level `license: "various"` /
Aerodata+SDFE-Klimadatastyrelsen attribution (exact wording TBD, §10).

### `tools/scene-recon/groups/soendermarken.ts`

`SceneGroupDefinition` gains one field:

```ts
readonly skraafoto: { readonly collection: string };
```

set to `{ collection: 'skraafotos2025' }`.

### `tools/utils/io/rawDataRegistry.ts`

Two rows following the `'dhm.dir'`/`'dhm.readme'` pair (`rawDataRegistry.ts:959-974`):
`'skraafoto.dir'` (`data/raw/skraafoto`, `fetcher: 'tools/fetch/fetchSkraafoto.ts'`,
`readme: 'skraafoto.readme'`) and `'skraafoto.readme'`
(`data/raw/skraafoto/README.md`, committed).

### `tools/scene-recon/poses/photoPoseFromStacItem.ts`

Pure function, `(item: SkraafotoStacItem, anchor: GroupAnchor, positionM: Vec3, downsampleScale: number) => PhotoPose`,
taking the camera centre's **already-converted** group-frame position as an argument
rather than doing the PROJ conversion itself — keeps the function testable without a
subprocess.

- Reads `pers:omega/phi/kappa` (degrees → radians) and builds the rotation matrix `D`
  (rows `D1*,D2*,D3*`) per the SDFIdk/saul reference implementation (MIT,
  `modules/image.js`) — the standard photogrammetric ω/φ/κ → rotation formula. `D`'s
  row 3 is the optical axis in the survey's world (UTM32) frame.
- Converts `D` (world→camera in the UTM-grid frame) into `PhotoPose.rotation`
  (group-frame camera→world quaternion) via the existing `matrixToQuaternion`
  (`src/utils/math/matrixToQuaternion.ts`), composed with the grid-convergence
  correction `Rz(γ)` — `γ ≈ (lonDeg − 9) · sin(latDeg)`, ≈ 2.9° at Søndermarken —
  that reconciles UTM grid north with the topocentric ENU frame the group anchor
  uses. **The exact composition order and sign of `Rz(γ)` are what the fixture test
  (§9) verifies numerically**, not something this spec asserts as already correct.
- `focalLengthPx` = `pers:interior_orientation.focal_length` (mm) / `pixel_spacing`
  (mm) × `downsampleScale` — the pose must describe the **downsampled** JPEG actually
  fetched, not the full-resolution COG.
- `principalPointPx` is the **image centre plus** the calibration offset, not the
  offset alone: `(W/2 + ppx_mm/pixel_spacing, H/2 ± ppy_mm/pixel_spacing) × downsampleScale`,
  where `ppx`/`ppy` are `principal_point_offset`'s two components and `W`/`H` are the
  downsampled `outW`/`outH`. The sign on the `ppy` term follows the saul formula's
  own convention and is exactly what the fixture test (§9) checks numerically.
- `imageWidthPx`/`imageHeightPx` = the downsampled `outW`/`outH`; `imageUrl` = the
  fetched JPEG's relative path.

### `tools/scene-recon/poses/topocentricPositionsM.ts`

The camera-centre half of "same pipeline as the LiDAR bake". `pers:perspective_center`
arrives as `[E, N, H]` in EPSG:25832 + DVR90 — a projected CRS, not lon/lat.
`lidarPipelineStages.ts`'s pipeline (`:49-52`) opens with `+proj=unitconvert +xy_in=deg
+xy_out=rad` because ITS input is degrees (the LAS points are reprojected to
EPSG:4326 lon/lat before that pipeline runs, `lidarPipelineStages.ts:58`). Camera
centres start in a **projected** CRS instead, so this pipeline is shorter, not
longer: `+inv +proj=utm +zone=32 +ellps=GRS80` straight into `+proj=cart` — PROJ's
inverse UTM already emits radians, so there is **no `unitconvert` stage** here — then
the same `+proj=topocentric +lat_0=<> +lon_0=<> +h_0=<> +ellps=GRS80` tail the LiDAR
pipeline uses. `(anchor: GroupAnchor, pointsUtm: readonly Vec3[]) => Promise<Vec3[]>`,
batching every camera centre through **one** `cct` subprocess call (stdin/stdout, one
line per point) rather than one process per photo.

DVR90 orthometric heights are fed to `cart` as if ellipsoidal in **both** the LiDAR
bake and here — that is not a bug to fix, it is the same approximation applied
consistently: the ~36 m Danish geoid undulation is a shared bias between the two
reconstructions, not a misalignment between them, and it cancels when comparing LiDAR
against splats in the group frame.

**Verification, not an asserted fact:** the pipeline above needs the same sanity
check plan 1's task 1 ran for the LiDAR pipeline — round-trip the anchor's own UTM32
coordinates through it and confirm it lands at `~0,0,0` too, before trusting it on
real camera centres.

### `tools/scene-recon/splats/writeColmapModel.ts`

`(spec: { poses: readonly PhotoPose[]; pointsBinPath: string; pointSampleTarget: number; outDir: string }) => Promise<void>`.

- **`cameras.txt`** — one `PINHOLE` entry per image (`fx fy cx cy` at the downsampled
  size; `fx = fy = focalLengthPx` per `photoPoseFromStacItem`'s symmetric-camera
  convention, §7.3).
- **`images.txt`** — `qw qx qy qz tx ty tz NAME`, COLMAP's world→camera convention.
  `PhotoPose.rotation` is camera→group (parent spec §4); this file wants the inverse:
  `qw,qx,qy,qz` = the **conjugate** of `PhotoPose.rotation`, `t` = `-R_world→camera · positionM`.
- **`points3D.txt`** — a deterministic subsample (~200k, every `Nth` point,
  `N = floor(pointCount / 200_000)`) of `points.bin`, read via the **existing**
  `parsePoints.ts` (pure TS, no browser-only API — reused as-is in this Node context
  rather than writing a second reader). `RGB` from the record's own colorized bytes;
  `ERROR = 0`; empty track — Brush's COLMAP loader only uses `points3D` to seed means
  and SH-DC colour (research), it needs no observations.
- The downsampled JPEGs are copied (or symlinked) into `<outDir>/images/`, named to
  match `images.txt`'s `NAME` column — Brush's loader matches by filename suffix
  anywhere in the tree.

### `tools/scene-recon/splats/readGaussianPly.ts`

`(buffer: ArrayBuffer) => { readonly splats: readonly GaussianSplatRecord[]; readonly shDegree: 0 | 1 }`.
Reads Brush's binary little-endian export (`x y z scale_0..2 opacity rot_0..3
f_dc_0..2 [f_rest_0..N]`) and undoes Brush's own storage conventions into this
project's units — the parsing-adjacent knowledge belongs beside the parser, not in
the packer:

- `scale_0..2` stay **log** (splats.bin also stores log) — copied through.
- `opacity` is pre-sigmoid in the PLY; `readGaussianPly` applies the sigmoid, so the
  record carries a plain `0..1` probability.
- `rot_0..3` is scalar-first (`w,x,y,z`); reordered to `[x,y,z,w]` (`Vec4`, matching
  `SimilarityTransform.rotation`'s convention).
- `f_dc_0..2` is SH0-evaluated to `0..255` RGB (`0.5 + 0.28209479 · f_dc`, clamped) —
  the same formula `splats.bin`'s `dcColor` field stores (§5), computed once here.
- `f_rest_0..N` (channel-major, INRIA convention) copied through **unconverted** at
  `shDegree = 1`; only the first 3 coefficients per channel are kept, higher orders
  dropped — `packSplats` owns the final i8 quantization.

```ts
export type GaussianSplatRecord = {
  readonly xM: number;
  readonly yM: number;
  readonly zM: number;
  readonly rotation: Vec4; // [x, y, z, w]
  readonly logScale: Vec3;
  readonly opacity: number; // 0..1
  readonly dcColor: readonly [number, number, number]; // 0..255
  readonly fRest: readonly number[] | null; // 9 values (R,G,B × 3) or null at deg 0
};
```

### `tools/scene-recon/pack/packSplats.ts`

`(splats: readonly GaussianSplatRecord[], shDegree: 0 | 1) => Uint8Array`. Pure —
writes the header and quantizes every field to the §5 byte layout. Mirrors
`packPoints.ts`'s split exactly: the reader (`readGaussianPly`) does unit conversion,
the packer only does byte quantization.

### `tools/scene-recon/bakeSplats.ts`

Orchestrates, following `bakeLidar.ts`'s injected-dependency shape
(`bakeLidar.ts:50-53`, `PdalRunner`) so the CLI is testable without Brush installed.

**Precondition: `bake-lidar` has already run for this group.** `writeColmapModel`'s
`points3D` seed (below) reads `points.bin`, so a splat bake with no LiDAR asset on
disk fails fast with a clear message rather than handing Brush an empty seed.

Each fetched STAC item is typed by the new
`tools/scene-recon/@types/SkraafotoStacItem.d.ts` — only the fields this pipeline
reads: `id`, `properties['pers:*']`, `properties['proj:shape']`, `assets.data.href`.

```ts
export type BrushRunner = (colmapDir: string) => Promise<void>;

export async function bakeSplats(
  group: SceneGroupDefinition,
  deps: { readonly runBrush: BrushRunner; readonly brushVersion: () => string },
): Promise<GaussianSplatAsset>;
```

1. Read every fetched `SkraafotoStacItem` under `data/raw/skraafoto/<collection>/`;
   `topocentricPositionsM` on every `pers:perspective_center` (one batched `cct`
   call), then `photoPoseFromStacItem` per item → `PhotoPose[]`.
2. `writeColmapModel` into `data/raw/skraafoto/<collection>/colmap-<groupId>/`.
3. `deps.runBrush(colmapDir)` — spawns
   `brush-cli <colmapDir> --sh-degree 1 --total-train-iters <N> --export-path <colmapDir> --export-name final.ply --max-resolution 1920`
   (`--with-viewer` defaults `false` once a source path is given — no flag needed).
   Missing `brush-cli` fails with an install hint before spawning, the same
   `spawnSync`-probe-then-throw shape as `bakeLidar.ts`'s `pdalVersion()`
   (`bakeLidar.ts:157-170`): `rustup update && cargo install --git
https://github.com/ArthurBrussee/brush brush-cli` (CI pins Rust 1.95; the error
   names the locally-detected version so a stale toolchain is visible).
4. `readGaussianPly(<colmapDir>/final.ply)` → `packSplats` →
   `public/data/geo3d/groups/<groupId>/assets/splats/splats.bin`.
5. `nextManifest` + `upsertAsset` + `writeJsonAtomic` into `manifest.json`, and
   `upsertGroup` + `writeJsonAtomic` into `scenes.json` — the **same** helpers
   `bakeLidar.ts` already uses, unmodified: they dispatch on nothing
   asset-kind-specific.
6. `provenance.pipeline = [{ step: 'fetchSkraafoto', version: group.skraafoto.collection }, { step: 'brush-cli', version: deps.brushVersion() }]`.

`--total-train-iters` is left at Brush's own default (30000) for the first real bake
— training-time budget is an open question (§10), not a value this spec pins.
`--max-frames` / per-direction subsampling is **not built in v1**: 306 frames over
the group bbox measured fine for Brush (research), and the flag is a pure
accelerator with no correctness implication — add it only if a first real bake's
wall time is a problem.

## 7. Viewer architecture

### 7.1 Asset loading

Post-prep (§3), `ASSET_LOADERS` gains a second row:

```ts
// tools/scene-workbench/src/scene/loaders/loadGaussianSplat.ts
export function loadGaussianSplat(gpu: GpuContext, buffer: ArrayBuffer): SplatGpuAsset;

// tools/scene-workbench/src/scene/loaders/assetLoaders.ts
export const ASSET_LOADERS: Record<SceneAsset['kind'], AssetLoader> = {
  pointCloud: loadPointCloud,
  gaussianSplat: loadGaussianSplat,
};
```

`loadGaussianSplat` wraps `parseSplats` (browser-side, mirrors `parsePoints.ts`) and
the GPU upload:

```ts
// tools/scene-workbench/src/scene/parseSplats.ts
export type ParsedGaussianSplats = {
  readonly splatCount: number;
  readonly shDegree: 0 | 1;
  readonly records: Uint8Array; // view, stride 28 — uploaded verbatim
  readonly sh1: Uint8Array | null; // view, stride 12 — uploaded verbatim when shDegree=1
  readonly positionsM: Float32Array; // decoded once — the sort's per-splat read path
};
```

```ts
// tools/scene-workbench/src/render/renderResources.ts — GpuAsset union member
export type SplatGpuAsset = {
  readonly kind: 'gaussianSplat';
  readonly data: GPUBuffer; // STORAGE | COPY_DST, array<u32>, 7 words/record
  readonly sh1: GPUBuffer | null; // STORAGE | COPY_DST, array<u32>, 3 words/record
  readonly order: GPUBuffer; // VERTEX | COPY_DST, u32, instance-step attribute
  readonly positionsM: Float32Array;
  readonly splatCount: number;
  readonly shDegree: 0 | 1;
  dispose(): void;
};
export type GpuAsset = LidarGpuAsset | SplatGpuAsset;
```

`order` is initialized identity (`[0, 1, ..., splatCount-1]`) at upload time, so the
first frame draws in on-disk order before the first sort completes — never empty.

### 7.2 `assetCount` — the one dispatch site (viewSlice ruling)

```ts
// tools/scene-workbench/src/scene/assetCount.ts
export type AssetCountDisplay = { readonly count: number; readonly unit: string };

const ASSET_COUNT: {
  readonly [K in SceneAsset['kind']]: (
    asset: Extract<SceneAsset, { kind: K }>,
  ) => AssetCountDisplay;
} = {
  pointCloud: (asset) => ({ count: asset.pointCount, unit: 'pts' }),
  gaussianSplat: (asset) => ({ count: asset.splatCount, unit: 'splats' }),
};

export function assetCount(asset: SceneAsset): AssetCountDisplay;
```

Tag + table dispatch (`simplicity.md` §7's N-way form) — a third asset kind in plan 3
is a new row, not a new call-site branch. `LayerList.tsx:39` (currently
`{asset.pointCount.toLocaleString()} pts`, a field access that only ever worked
because `SceneAsset` had one member) becomes `{assetCount(asset).count.toLocaleString()} {assetCount(asset).unit}`.

### 7.3 `SceneCamera` uniform growth

Owned by `Viewport` post-prep (§3), bound at group 0 by both pipelines. Grows from
112 to 192 bytes — two new fields appended after the existing ones (every existing
float offset unchanged), padded out to the struct's 16-byte alignment:

| Field          | Type          | Float offset | Byte offset | Notes                                                                   |
| -------------- | ------------- | ------------ | ----------- | ----------------------------------------------------------------------- |
| `viewProj`     | `mat4x4<f32>` | 0            | 0           | unchanged                                                               |
| `rightM`       | `vec3<f32>`   | 16           | 64          | unchanged                                                               |
| `pointSizePx`  | `f32`         | 19           | 76          | unchanged                                                               |
| `upM`          | `vec3<f32>`   | 20           | 80          | unchanged                                                               |
| `viewportH`    | `f32`         | 23           | 92          | unchanged                                                               |
| `eyeM`         | `vec3<f32>`   | 24           | 96          | unchanged                                                               |
| `metresPerPx`  | `f32`         | 27           | 108         | unchanged                                                               |
| `view`         | `mat4x4<f32>` | 28           | 112         | **new** — plain view (no projection); camera-space covariance transport |
| `splatScale`   | `f32`         | 44           | 176         | **new** — `view.display.gaussianSplat.splatScale`                       |
| `opacityScale` | `f32`         | 45           | 180         | **new** — `view.display.gaussianSplat.opacityScale`                     |

184 bytes of fields, rounded up to `SCENE_CAMERA_BYTES = 192` (floats 46–47 are
trailing pad, unread). **No `focalPx` field** — a splat-covariance projection needs
`1 / metresPerPx` as its focal length in pixels, and `metresPerPx` is already in the
uniform (a symmetric perspective camera has `fx = fy`), so the shader computes it
inline; a derived field would be surplus. `writeSceneCamera` gains two parameters
(`splatScale`, `opacityScale`); `lidarPoint.wesl`'s `SceneCamera` struct gains the
same two fields in the same order (unread there — the parity test doesn't care which
shader reads which field, only that the layout matches).

**Field byte offsets are this spec's own choice**, not something the ground-prep
brief pinned — it named `view`/`focalPx`/`splatScale`/`opacityScale`, not their
order, and this spec additionally drops `focalPx` (above).

### 7.4 `splatRenderer` and `splat.wesl`

One render pass, shared with `lidarPointRenderer` (§3 #3): `Viewport` writes the
camera uniform once per frame, sets bind group 0 once, calls `lidar.draw(pass, ...)`
(opaque, depth-writing) then `splat.draw(pass, ...)` (blended, depth-testing only) —
back-to-front over the pass's persisted bind-group-0 state, `pass.end()` called once
by `Viewport` itself.

**Bind groups:**

| Group | Binding | Resource                         | Notes                                  |
| ----- | ------- | -------------------------------- | -------------------------------------- |
| 0     | 0       | `SceneCamera` uniform            | shared with `lidarPointRenderer`       |
| 1     | 0       | `data` storage buffer, read-only | `array<u32>`, 7 words/record           |
| 1     | 1       | `sh1` storage buffer, read-only  | deg-1 pipeline variant only            |
| 1     | 2       | **reserved (plan 3)**            | `AssetXform` uniform — not built in v1 |

**The asset `SimilarityTransform` is not applied by this renderer.** Every asset this
plan bakes is identity (§4), so there is nothing yet for a transform uniform to do;
building `quatToMat3` and a per-asset `AssetXform` binding now would be exactly the
speculative machinery the code-is-liability convention flags. Plan 3's nudge adds an
`AssetXform` uniform at group 1 binding 2 — the slot the table above reserves — and
applies it in both the vertex stage below and the sort key (§7.5).

**Two pipeline variants** (`shDegree` 0 / 1), sharing bind-group-0's layout but
differing bind-group-1's — not one pipeline with a dummy `sh1` buffer for deg-0
assets. `splatRenderer.draw` selects the variant per asset from `asset.shDegree`, the
same "header selects behaviour" idiom `splats.bin`'s own reader already uses (§5).

**Per-asset bind group 1** is owned by `splatRenderer`, not the loader: a
`WeakMap<SplatGpuAsset, GPUBindGroup>` built lazily on first draw for each asset (the
`data`/`sh1` buffers it points at already exist by then). Bind groups hold references
and need no explicit teardown; the asset's own `dispose()` (§7.1) destroys the
buffers, and the `WeakMap` entry is simply unreachable afterward. `loadGaussianSplat`
(§7.1) creates the buffers only — it never sees `splatRenderer`'s bind-group layout.

**Vertex stage.** `order` is bound as a per-instance vertex attribute (`arrayStride:
4, stepMode: 'instance', format: 'uint32'`) — the only vertex-buffer input; instance
index `i` reads `order[i]` to get the splat index `idx`, then decodes `data[idx*7 ..]`
(§5's word layout) and, at deg 1, `sh1[idx*3 ..]`. Per instance:

1. World position = `position`, then `cam.view`/`cam.viewProj` as usual (no asset
   transform — see above). The per-splat rotation quaternion is converted to `Mat3`
   inline in WGSL.
2. World covariance `Σ = Rsplat · diag(exp(2·logScale)) · Rsplatᵀ`, transported to
   camera space via `cam.view`'s upper 3×3, then to a 2D screen-space covariance via
   the projection Jacobian — focal length in pixels is `1 / cam.metresPerPx` (§7.3;
   a symmetric perspective camera has `fx = fy`, computed inline, no stored field) —
   divided by depth. The standard 3DGS EWA-splatting reduction. Quad half-extent =
   `3σ` from its eigenvalues.
3. At deg 1: evaluate the SH1 term from the view direction (eye → splat) against
   `sh1`'s three unpacked coefficient triples, added to `dcColor` before the
   fragment stage.

**Fragment stage.** Gaussian falloff `exp(-0.5 · dᵀ Σ2D⁻¹ d)` at the quad-local
offset `d`, × `opacity/255 × cam.opacityScale`, × the (possibly SH1-corrected)
colour. Blend `src-alpha`/`one-minus-src-alpha`; `depthCompare: 'less'`,
`depthWriteEnabled: false` — tests against the depth `lidarPointRenderer` already
wrote in the same pass, never overwrites it. `cam.splatScale` multiplies the projected
covariance Σ2D by `s²` (the canonical 3DGS scaling modifier); the `3σ` quad half-extent
follows from it. A size knob independent of `opacityScale`.

The covariance-projection maths is cribbed from **Brush's Apache-2.0 WGSL kernels**
(same substrate, compatible licence, the trainer that produced the data) — attribute
this in `splat.wesl`'s header per the licence, not re-derived from scratch.

### 7.5 Sort — `watchSplatSortSaga`

Main thread first (checkpoint ruling); a Worker is added only if measurement shows a
stall past ~50 ms at 1–2 M splats — not built speculatively.

```ts
// tools/scene-workbench/src/scene/sortSplatOrder.ts — pure, testable in isolation
export function sortSplatOrder(positionsM: Float32Array, eyeM: Vec3, forwardM: Vec3): Uint32Array;
```

`watchSplatSortSaga` — `takeLatest` on `commitCameraPose` (the existing
gesture-boundary commit, `viewSlice.ts:37-42`) **or** `assetStatusChanged` reaching
`'ready'` for an asset whose `manifest.assets` entry has `kind: 'gaussianSplat'` (a
`select` against `state.group.manifest`, since the action itself carries only
`assetId`/`status`). For every ready splat asset: recompute `eyeM`/`forwardM` from
`state.view.camera` via the existing `sceneCameraView` (viewport size is irrelevant
to eye/forward, so any placeholder viewport satisfies its signature), run
`sortSplatOrder`, `queue.writeBuffer(asset.order, 0, sorted)`, then `put` a bare
`splatOrderWritten(assetId)` one-shot from `state/commands.ts` (`saveTransformRequested`'s
shape) — its only job is to make `Viewport`'s existing `store.subscribe(() => dirty
= true)` fire (`Viewport.tsx:136-138`); nothing reads its payload back out of state,
because the order buffer lives in GPU memory, not Redux.

**No staleness mechanism in v1.** The sort is **synchronous** on the main thread —
no `await` between reading `positionsM` off `resources.gpuAssets` and calling
`queue.writeBuffer` — so nothing can land mid-flight for an epoch or a cancellation
flag to guard against. The saga simply reads `resources.gpuAssets` live at run time
and skips any splat asset no longer present (disposed by a group switch between the
trigger firing and the saga running). The epoch-compare-plus-cancellation idiom
`acceptLoadedAsset` needs (parent spec §7.1's landmine note) becomes necessary here
only if a Worker is introduced — that is genuinely async, and only then.

### 7.6 UI

`DisplayPanel` (`DisplayPanel.tsx`) gains a sibling `CollapsibleSection` — "Gaussian
splats" — next to "Point cloud", two `Slider`s (`splatScale`, `opacityScale`) wired
to two new `viewSlice` reducers (`setSplatScale`/`setOpacityScale`) and a grown
`display` shape: `{ pointCloud: {...}, gaussianSplat: { splatScale: number; opacityScale: number } }`,
default `{ splatScale: 1, opacityScale: 1 }`.

`LayerList` needs no structural change beyond the `assetCount` swap (§7.2) — a splat
asset renders through the same one row-per-asset list, same visibility checkbox,
same kind badge (now reading `'gaussianSplat'`).

`syntheticProbeScene.ts` gains a second, synthetic `gaussianSplat` asset —
`packSplats` is pure and runs in the browser, so the `?probe` gate needs no baked
data to exercise the second renderer, matching the existing ground-plane/box LiDAR
synthesis (`syntheticProbeScene.ts:24-72`). **This makes the probe's checkbox
selectors ambiguous**: `probeGpuErrors.ts`'s three bare `page.getByRole('checkbox')`
calls (boot's visibility wait at `probeGpuErrors.ts:221`, `layer:off` at `:257`,
`layer:on` at `:264`) match exactly one checkbox today and two once the probe scene
carries two assets — Playwright's strict mode throws on the second match. All three
become name-scoped locators (`getByRole('checkbox', { name: /lidar/i })` or
equivalent), fixed in the same change that adds the synthetic splat asset.

## 8. Build wiring

```jsonc
"fetch-skraafoto": "tsx tools/fetch/fetchSkraafoto.ts",
"bake-splats": "tsx tools/scene-recon/bakeSplats.ts",
```

Mirrors `fetch-dhm`/`bake-lidar`'s naming exactly (`package.json:70,82`). No Vite
config change: `wesl.toml`'s `include` glob (`tools/scene-workbench/wesl.toml`,
parent spec §8) already covers every `.wesl` file under `src/render/shaders/**`, so
`splat.wesl` needs no new entry.

## 9. Testing strategy

Judged by the house question (`docs/superpowers/conventions/testing.md`): will it
fail on a real bug nothing else catches?

- **`packSplats` ↔ `parseSplats` round trip**, `shDegree` 0 and 1 both (the header
  selects the stride), a splat count that isn't a power of two, and a per-record
  value varying along every field including `fRest` — mirrors
  `packPoints`/`parsePoints`'s existing round-trip test exactly (parent spec §9).
- **`readGaussianPly` against a tiny hand-built binary PLY fixture** — known
  `scale_0..2`/pre-sigmoid `opacity`/scalar-first `rot_0..3`/`f_dc` values, asserting
  the sigmoid, the SH0-to-RGB formula, and the `w,x,y,z → x,y,z,w` reorder each
  against hand-computed expectations (not the source's own formula — `testing.md`'s
  no-mirror rule).
- **`photoPoseFromStacItem` against the real 2025 item fixture** (the STAC item JSON
  from research, committed as a test fixture) — one hand-checked projection of the
  group anchor into image pixel coordinates, computed independently of
  `photoPoseFromStacItem`'s own code path, settling §6's flagged `Rz(γ)`
  composition-order question rather than leaving it asserted.
- **`writeColmapModel` text golden** — a small fixture (2 poses, ~10 points),
  asserting exact `cameras.txt`/`images.txt`/`points3D.txt` text. A
  **format-contract test** (`testing.md`'s keep-rule for fixture-byte/on-disk-format
  tests), not the discouraged "golden snapshot of presentation data" — the contract
  is with Brush's COLMAP loader, not this tool's own display formatting.
- **`assetCount` exhaustiveness** — `assetCount` on one `pointCloudAsset` and one
  `gaussianSplatAsset`, asserting `{count, unit}` against hand-picked values; `tsc`
  already proves the table exhaustive, this test is for the dispatch itself.
- **`sortSplatOrder`** — hand-placed positions at known distances from a fixed
  `eyeM`/`forwardM`, asserting far→near order. Pure function, no saga integration
  test (the plan-1 precedent keeps IO shells out of the unit suite).
- **`sceneCamera.parity.test.ts`** grows three more rows (`view`, `splatScale`,
  `opacityScale`) — same mechanism as the existing seven.

**Deliberately not tested:**

- Brush's subprocess plumbing (`spawn` + exit code) — parent spec §9's existing
  exclusion for CLI wrappers, unchanged.
- The exact SH1 i8 scale factor and Brush's reconstruction quality — an operator
  judgement, not a thing a test asserts (parent spec §9).
- The WGSL covariance/EWA-splatting maths beyond the GPU probe — no CPU-side shadow
  implementation exists to check it against; the probe's `uncapturederror` capture
  is the automated gate, visual judgement is the operator's (parent spec §1, §9).

**GPU probe** (`npm run scene-workbench:probe`) — no new steps beyond the checkbox
selector fix (§7.6): the existing `layer:off`/`layer:on`/`resize` steps already
exercise whichever assets the probe scene carries, and two assets exercise the splat
pipeline for free once `syntheticProbeScene.ts` carries one.

## 10. Open questions

1. **Exact SH1 i8 scale factor.** §5 picks a provisional ±1.0 range (127 = 1.0)
   because Brush's own deg-1 `f_rest` magnitudes are measured `< 1` in the research,
   but the real distribution is unconfirmed until a first bake produces a real
   `.ply` to inspect (parent spec §11 open question 2, carried forward, pending
   the same real artifact).
2. **Training-time budget.** `--total-train-iters` is left at Brush's default
   (30000) for the first real bake. Whether that is the right budget for a Mac-native
   single-workstation session — versus, say, a lower iteration count that trades
   quality for a same-day turnaround — is unmeasured until that bake actually runs.
3. **The ω/φ/κ → pixel sign conventions and the `Rz(γ)` composition order** (§6).
   Flagged as needing the real-fixture numerical check (§9) rather than asserted —
   this spec names the formula and the composition step, not a verified sign.
4. **Exact licence attribution wording.** The skråfoto STAC item reports
   `license: "various"` with Aerodata (producer) and SDFE/Klimadatastyrelsen
   (licensor); the precise CC/attribution text for the README belongs on
   dataforsyningen.dk/Vilkaar and hasn't been pulled yet (parent spec's README
   convention requires it before the fetcher ships, not before this spec is written).

## 11. Decisions this spec made

Beyond the checkpoint rulings (§3), which this spec treats as binding:

- **Core `splats.bin` record field order** (`rotation` before `logScale`, §5) —
  word-aligned rather than the ground-prep brief's provisional listing; same stride,
  same field set.
- **`SceneCamera`'s exact new byte offsets** (§7.3) — the brief named four fields
  (`view`, `focalPx`, `splatScale`, `opacityScale`); this spec drops `focalPx`
  (computed inline in WGSL from `metresPerPx`, since `fx = fy` for a symmetric
  perspective camera — a stored field would be surplus) and pins the layout for the
  remaining three.
- **Two splat pipeline variants (deg 0 / deg 1)**, differing only in bind group 1,
  rather than one pipeline with a dummy `sh1` buffer for deg-0 assets.
- **`writeColmapModel` reuses `parsePoints.ts`** to read `points.bin` in Node,
  rather than writing a second parser for the same format.
- **The `readGaussianPly`/`packSplats` split** — the reader undoes Brush's own
  storage conventions (sigmoid, SH0 evaluation, quaternion reorder); the packer only
  quantizes to bytes. Mirrors the existing `ScenePoint`/`packPoints` split.
- **Asset transform deferred to plan 3** (§7.4) — v1 data is all identity, so
  `quatToMat3` and the `AssetXform` uniform are not built here; the bind-group slot
  is reserved, not filled.
