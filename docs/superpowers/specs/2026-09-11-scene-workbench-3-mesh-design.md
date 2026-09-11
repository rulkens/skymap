# Scene Workbench 3/4 — MVS mesh layer + camera-pose overlay — design

**Status:** Draft (2026-09-11), awaiting plans 3a (mesh) and 3b (pose overlay)

**Parent:**
[`docs/superpowers/specs/completed/2026-09-02-scene-workbench-design.md`](completed/2026-09-02-scene-workbench-design.md)
(§§1–12) — the tool's overall shape, `SceneAsset`/`GroupAnchor`/`SimilarityTransform`,
the manifest read-modify-write rule, the RTK+saga architecture. Settled design
authority: [`docs/grill-sessions/scene-workbench-2026-09-02.md`](../../grill-sessions/scene-workbench-2026-09-02.md)
(Q1 toolchain, Q7 formats, Q9 pose overlay). This spec refines only the mesh- and
pose-related sections and cites the parent by section rather than repeating it.

**As built:**
[`docs/superpowers/specs/completed/2026-09-10-scene-workbench-2-splats-design.md`](completed/2026-09-10-scene-workbench-2-splats-design.md)
and its plan — the pattern this spec mirrors (asset kind → loader row → GPU asset
union member → renderer → probe row). Written against the as-built tree on `main`
(`6eef3d89e`) plus the two in-flight branches it depends on (§3).

**Ground preparation:** produced by `refactor-ground` at a 2026-09-11 checkpoint —
four prep refactors plus a rulings list, recorded in §3, signed off by the user
("all good").

## 1. Purpose

Plans 1–2 put Søndermarken's LiDAR point cloud and a Brush-trained Gaussian-splat
field on screen in one metre frame. This plan adds the third of the tool's three
reconstructions (parent spec §1): a **textured triangle mesh** from multi-view
stereo, reconstructed by OpenMVS from the same skråfoto frames and the same injected
poses the splats were trained from, drawn as an opaque, depth-writing pass between
the LiDAR points and the blended splats.

A mesh is the reconstruction the other two are usually judged against — a hard
surface with a photo texture, no fuzz, no per-point gaps — and the one that shows
most plainly where the photogrammetric poses are wrong: a skewed pose leaves a
doubled facade or a torn roof that splats blur over. The **camera-pose overlay**
(grill Q9) is the diagnostic for exactly that failure: wireframe frusta at every
photo, click one to see that photo projected at its image plane over the
reconstructions, with an opacity slider.

The mesh ships as **plan 3a**; the overlay as **plan 3b**, sequenced after 3a
merges (§2). One spec, because the two share the pose-derivation seam (§3, P4)
and the draw-order table (§3, P2), and the overlay's design is what fixes the
`cameraPoseSet` asset's shape before 3a's union grows.

## 2. Scope

**Plan 3a (in scope now):**

- The reconstruction toolchain install and its provenance record (§6.1).
- `bakeMesh.ts` and its stages: COLMAP known-pose triangulation, OpenMVS densify →
  mesh → (optional) refine → texture, the GLB re-pack, `manifest.json` upsert
  (§6.2–6.4).
- `TexturedMeshAsset`, `MeshGpuAsset`, `readMeshGlb`/`packMeshGlb`, the
  `loadTexturedMesh` loader row, `assetCount`'s row, `texturedMeshRenderer` +
  `texturedMesh.wesl`, the draw-order row, the probe's third synthetic asset (§7).
- Prep refactors P1–P4 (§3), P1–P2 landing before 3a's first feature commit and
  P3–P4 landing after PR #685 merges, still ahead of `bakeMesh`.

**Plan 3b (specified here, planned and executed after 3a merges):**

- `CameraPoseSetAsset`, `poses.json`, `bakePoses.ts`, `poseOverlayRenderer`, the
  click-to-select pick, the projected-photo quad with its opacity slider, the
  `poses` slice and panel (§8).

**Out of scope (unchanged from the parent spec's deferrals):**

- Applying `SimilarityTransform` in any renderer (`AssetXform`, `quatToMat3`). Every
  asset this spec bakes is identity, and nothing produces a non-identity value until
  the nudge API (plan 4). The bind-group slot plan 2 reserved stays reserved. A
  consumer with no producer is the surplus `simplicity.md`/leanness flag.
- The nudge API, the dev-API plugin, the nudge panel.
- Capture ingest (plan 4).
- Non-uniform mesh decimation controls beyond the two bake flags in §6.3.

## 3. Ground preparation

Ideal-diff sketch, verdicts, and prep list from the 2026-09-11 checkpoint. The
greenfield cross-check (a fresh subagent given only the data requirements) agreed
with the sketch on the three structural points — an async loader contract, an
ordered draw table, poses as a sidecar artifact — and diverged on layout cosmetics
only (flat `<group>/<assetId>.glb` vs. the incumbent `groups/<id>/assets/<assetId>/`;
kept incumbent, two baked groups exist on disk and a splat re-bake is hours).

**Two in-flight branches this plan sequences against:**

- **PR #685 (`splat-crop-group`)** — adds the `soendermarken-crop` group (~258 × 183 m
  around Frederiksberg Slot, frames cropped to 200 mm/px), the group registry
  (`sceneGroupFromArgv`, `--group <id>` on every fetch/bake CLI,
  `tools/scene-recon/@types/SceneGroupDefinition.d.ts`), `skraafotoHarvestDir`,
  `poses/spawnCct.ts`, and rewrites `bakeSplats`'s pose loop around `frameWindow`.
  Its crop harvest is the mesh pipeline's input; its `bakeSplats` is what P3/P4
  refactor. **Nothing in this spec touches that worktree**; P3/P4 land after it merges.
- **PR #678 (mesh bodies)** — adds `@gltf-transform/core` + `functions` `4.5.0` as
  devDependencies and a main-app `MeshAsset` type. This plan adds the same pinned
  `@gltf-transform/core` devDependency if #678 has not merged first (a clean
  `package.json` merge either way) and names its own asset `TexturedMeshAsset` so the
  two never collide in a repo-wide grep.

### Prep list

| #   | Touchpoint                                                                                              | Verdict                               | Blocker (as of `6eef3d89e`)                                                                                                                           | Prep                                                                                                                                                                                                                                                                                                                                                                                          | Lands      |
| --- | ------------------------------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| P1  | `AssetLoader` is synchronous                                                                            | bolt-on                               | `tools/scene-workbench/@types/AssetLoader.d.ts:5`; `watchGroupSaga.ts:40-43` calls the loader inside the fetch continuation and accepts synchronously | `AssetLoader = (gpu, buffer) => Promise<GpuAsset>`; `loadPointCloud`/`loadGaussianSplat` become `async`; `loadAssetWorker`'s chain becomes `.then(buffer => ASSET_LOADERS[kind](gpu, buffer)).then(uploaded => acceptLoadedAsset(uploaded, resources, myEpoch, cancellation))` — the staleness check stays in a continuation, never after a `yield*` (parent spec §7.1's landmine, unchanged) | now        |
| P2  | Renderer set and draw sequence hand-written in `Viewport`'s frame body                                  | bolt-on (second special case present) | `Viewport.tsx:82-84` (three nullable lets), `:98` (null-check chain), `:143-144` (two ordered draw lines)                                             | New `src/render/sceneRenderers.ts`: `createSceneRenderers(gpu, targetFormat, cameraLayout) → SceneRenderers` owning one renderer per `GpuAsset['kind']` in a table, and `draw(pass, resources, hiddenAssetIds)` iterating `SCENE_DRAW_ORDER` (§7.4); `visibleAssetsOfKind` moves in with it. `Viewport` holds one `renderers` let. A new kind is one table row + one order entry              | now        |
| P3  | Manifest + registry write tail copied verbatim                                                          | bolt-on (second copy present)         | `bakeLidar.ts:127-139` ≡ `bakeSplats.ts:87,181-195`; `GEO3D_DIR` at `bakeLidar.ts:38` and `bakeSplats.ts:45`                                          | New `tools/scene-recon/manifest/publishAsset.ts`: `publishAsset(group, asset): Promise<void>` doing both `writeJsonAtomic` calls; new `tools/scene-recon/manifest/geo3dLayout.ts` holding `GEO3D_DIR` and the four path builders (`groupAssetDir`, `groupManifestPath`, `registryPath`, `assetArtifactUrl`). Both bakes call them                                                             | after #685 |
| P4  | STAC items → `PhotoPose[]` derivation inline in `bakeSplats`                                            | bolt-on                               | `bakeSplats.ts` pose loop (`readStacItems`, `topocentricPositionsM`, `frameWindow`, `photoPoseFromStacItem`, `assertJpegMatchesWindow`)               | New `tools/scene-recon/poses/groupPhotoPoses.ts`: `groupPhotoPoses(group, deps: { runCct }): Promise<{ poses: readonly PhotoPose[]; items: readonly SkraafotoStacItem[]; harvestDir: string }>` — `imageUrl` already folded into the harvest dir. `bakeSplats`, `bakeMesh` (3a) and `bakePoses` (3b) call it                                                                                  | after #685 |
| —   | `SceneAsset`/`GpuAsset` unions, `ASSET_LOADERS`, `assetCount`, `syntheticProbeScene`, probe ready-count | growth                                | rows / members                                                                                                                                        | none                                                                                                                                                                                                                                                                                                                                                                                          |            |

A fifth prep floated at the checkpoint — making `writeColmapModel`'s LiDAR
`points3D` seed optional — was **dropped**, and §6.2 settled it the other way
round: the seed is not merely harmless, it is the whole sparse model, so
`bakeMesh` keeps `bakeSplats`'s LiDAR-first precondition and adds observations
on top of it.

**Packaging (user ruling at the checkpoint):** P1+P2 as their own PR before 3a's
feature PR; P3+P4 as their own PR immediately after #685 merges, before 3a's
`bakeMesh` commits.

**Other rulings, binding for the rest of this spec:**

- **Poses are a sidecar artifact** (`poses.json`, §8.2), not inline in the manifest —
  a deviation from parent spec §4's `CameraPoseSetAsset.poses`. Inline would make it
  the one kind with no `artifactUrl` (a loader special case) and put ~100 × 20 numbers
  in the file every viewer fetches first.
- **`@gltf-transform/core` on both sides** — the bake's re-pack (`NodeIO`) and the
  browser reader (`WebIO`). Grill Q7's "small hand-rolled parser" predates the
  dependency PR #678 introduces; with it present a hand-rolled writer + reader is
  ~250 lines and a format test that the library already carries.
- **Draw order is a table**, opaque kinds before blended (§7.4).
- **No `DisplayPanel` section for the mesh.** The `LayerList` checkbox is the Display
  toggle; there is no per-mesh knob worth a slider yet (a mesh-opacity slider would
  need blending and would break the depth ordering the layer exists to show).

## 4. Data model delta

Tool-local types, one per file under `tools/scene-workbench/@types/`, `type` aliases
only, deep relative imports.

```ts
// tools/scene-workbench/@types/TexturedMeshAsset.d.ts — new (3a)
import type { AssetCommon } from './AssetCommon';

export type TexturedMeshAsset = AssetCommon & {
  readonly kind: 'mesh';
  readonly triangleCount: number;
  readonly artifactUrl: string; // mesh.glb — §5
};
```

```ts
// tools/scene-workbench/@types/CameraPoseSetAsset.d.ts — new (3b)
import type { AssetCommon } from './AssetCommon';

export type CameraPoseSetAsset = AssetCommon & {
  readonly kind: 'cameraPoseSet';
  readonly poseCount: number;
  readonly artifactUrl: string; // poses.json — §8.2
};
```

```ts
// tools/scene-workbench/@types/SceneAsset.d.ts — grows one member per plan
export type SceneAsset = PointCloudAsset | GaussianSplatAsset | TexturedMeshAsset; // 3a
export type SceneAsset =
  | PointCloudAsset
  | GaussianSplatAsset
  | TexturedMeshAsset
  | CameraPoseSetAsset; // 3b
```

`triangleCount`, not the parent spec's `vertexCount`: the count the layer list shows
should be the one a reviewer compares against the bake log and the decimation flag,
and OpenMVS reports faces. `PhotoPose` (plan 2, `@types/PhotoPose.d.ts`) is unchanged
and becomes the row type of `poses.json`.

`AssetProvenance` needs no new member: `source: 'nationalGeodataApi'`, pipeline
`[{ step: 'fetchSkraafoto', version: <collection> }, { step: 'colmap', version }, { step: 'openmvs', version }]`.

`SimilarityTransform` stays identity for every asset here. OpenMVS reconstructs in
the frame the injected poses are expressed in, which is the group frame, so the GLB's
coordinates are group-frame ENU metres, +Z up, and no transform is applied anywhere.

## 5. On-disk layout and `mesh.glb`

```
data/raw/skraafoto/<collection>[/<groupId>]/       harvest (plan 2 / #685)
  colmap-<groupId>/                                 Brush workdir (plan 2)
  mvs-<groupId>/                                    gitignored bake workdir (3a)
    sparse-in/{cameras,images,points3D}.txt         writeColmapModel — poses injected
    sparse-in/images/<id>.jpg                       copied frames
    dense/                                          image_undistorter workspace
    scene.mvs  scene_dense.mvs  scene_dense_mesh.ply [scene_dense_mesh_refine.ply]
    scene_dense_texture.glb + scene_dense_texture_0.png   OpenMVS's own export

public/data/geo3d/groups/<groupId>/assets/mesh/
  mesh.glb                                          the re-packed subset below
public/data/geo3d/groups/<groupId>/assets/poses/    (3b)
  poses.json                                        PhotoPose[] — §8.2
  <photoId>.jpg                                     the harvested frames, copied
```

### `mesh.glb` — the subset the viewer reads

Standard glTF 2.0 binary, written by `packMeshGlb` via `@gltf-transform/core`:

| Element   | Contents                                                                                                        |
| --------- | --------------------------------------------------------------------------------------------------------------- |
| scene     | one, one root node, no transform                                                                                |
| mesh      | one, one primitive, mode `TRIANGLES`                                                                            |
| accessors | `POSITION` `VEC3`/f32 (group-frame metres), `TEXCOORD_0` `VEC2`/f32, indices `SCALAR`/u32                       |
| material  | one, `pbrMetallicRoughness.baseColorTexture` only; the renderer draws it unlit                                  |
| image     | one, `image/jpeg`, embedded in the BIN chunk (`bufferView`), quality 90, longest edge ≤ 8192                    |
| sampler   | linear min/mag, `REPEAT` wrap (irrelevant — atlas uvs stay in [0,1])                                            |
| extras    | `asset.extras = { frame: 'group ENU metres, +Z up' }` — the one thing an external viewer cannot infer           |
| absent    | `NORMAL`, `TANGENT`, node transforms, multiple primitives/materials/textures, animation, skins, every extension |

The re-pack exists so the viewer only ever reads what this table describes.
OpenMVS's own GLB (`TextureMesh --export-type glb`, `SaveGLTF` in `libs/MVS/Mesh.h`)
is the _input_ to the re-pack, never shipped: its texture is PNG (4–10× larger for a
photo atlas), its structure is whatever that version emits, and a `--max-texture-size`
overflow silently splits it into several materials. `packMeshGlb`'s reader side
(`readMeshGlb`, §7.1) **refuses** more than one primitive or texture, naming
`--max-texture-size` as the fix — the same one-material refusal PR #678's `buildMeshes`
makes.

**Verified on the hand-run prototype export (§10 #1), before any bake completed:**
`SaveGLTF` writes scene coordinates raw — read back with `NodeIO`, the node matrix
is identity and the POSITION bbox matched the LiDAR's, +Z up. No axis conversion in
the re-pack; this table stays true.

## 6. Offline pipeline

Mac-native, CPU-only, thin `tsx` wrappers shelling to installed binaries, the
`bakeSplats.ts` injected-runner shape (`runCct`/`runBrush`) extended to
`runColmap`/`runOpenMvs`.

### 6.1 Toolchain (installed 2026-09-11, Apple M1 Max, macOS 15.7)

Recorded in `tools/scene-workbench/README.md` (a "Reconstruction toolchain" section)
— the user-facing provenance note for the two tools, with versions and the exact
build recipe:

- **COLMAP 4.2.0** — `brew install colmap` (bottle, "without GPU support": every
  `colmap` call passes `--FeatureExtraction.use_gpu 0` / `--FeatureMatching.use_gpu 0`;
  4.x renamed the `SiftExtraction`/`SiftMatching` option groups).
- **OpenMVS v2.4.0** (2026-01-20 release) — no formula; built from source:
  `git clone --branch v2.4.0 --depth 1 https://github.com/cdcseacave/openMVS.git`
  plus `git clone https://github.com/cdcseacave/VCG.git` (VCG is **not** a submodule
  of the tagged release, `-DVCG_ROOT` is mandatory); brew deps `boost cgal eigen
nanoflann libomp opencv@4` (**OpenCV 5 does not build** — its `traits.hpp` already
  specialises the `DataType<>` templates OpenMVS's `Types.inl` defines; `opencv@4`
  keg via `-DOpenCV_DIR=/opt/homebrew/opt/opencv@4/lib/cmake/opencv4`); cmake flags
  `-DOpenMVS_USE_CUDA=OFF -DOpenMVS_USE_OPENMP=ON -DOpenMVS_BUILD_VIEWER=OFF
-DCMAKE_INSTALL_PREFIX=$HOME/.local/opt/openmvs`; binaries on PATH from
  `~/.local/opt/openmvs/bin`. The README records whatever further deviations the
  build needed (Eigen 5.0.1 is installed; OpenMVS asks for ≥ 3.4 — if it fails, the
  fix and its reason go in the README, not in a patched upstream tree).

`bakeMesh` probes both before staging anything (`colmapVersion()` /
`openMvsVersion()`, the `spawnSync`-probe-then-throw shape of `brushVersion()`,
`bakeSplats.ts:322-338`), each error naming the install recipe above.

### 6.2 `tools/scene-recon/bakeMesh.ts`

```ts
export type ColmapRunner = (args: readonly string[]) => Promise<void>;
export type OpenMvsRunner = (tool: string, args: readonly string[]) => Promise<void>;

export async function bakeMesh(
  group: SceneGroupDefinition,
  deps: {
    readonly runCct: CctRunner;
    readonly runColmap: ColmapRunner;
    readonly runOpenMvs: OpenMvsRunner;
    readonly colmapVersion: () => string;
    readonly openMvsVersion: () => string;
  },
  options: {
    readonly fullRes?: boolean;
    readonly refine?: boolean;
    readonly reuseGlb?: boolean;
  } = {},
): Promise<TexturedMeshAsset>;
```

CLI: `npm run bake-mesh -- [--group <id>] [--full-res] [--refine] [--reuse-glb]`,
`sceneGroupFromArgv` (#685) picking the group.

1. **Preconditions** — the group's `points.bin` exists (`bakeSplats.ts:68-75`'s
   check, same message); the harvest has frames. Both version probes run before
   step 2 (a missing tool costs a second, not a frame copy).
2. **Sparse model** — `groupPhotoPoses(group, { runCct })` (P4), then
   `writeColmapModel({ poses, pointsBinPath, pointSampleTarget: 200_000, outDir:
'mvs-<id>/sparse-in', observations: true })`: the LiDAR cloud projected into every
   camera **is** the sparse model, with POINTS2D + TRACKs so OpenMVS can pick
   neighbour views and depth ranges. COLMAP never matches a feature — its
   `Camera::HasBogusParams` check rejects our crops outright (§10 #2).
3. **Staging transcode** — every `sparse-in/images/*.jpg` whose sharp metadata is not
   3-channel sRGB is re-written in place by `gdal_translate --config GDAL_JPEG_TO_RGB
NO -b 1 -b 2 -b 3 -of JPEG -co QUALITY=95` (plus `--config GDAL_PAM_ENABLED NO`, so no
   `.aux.xml` lands beside it). The 2025 nadir frames carry four components — raw R, G,
   B and a fourth band that libjpeg tags CMYK — which OpenCV refuses outright; sharp's
   `toColourspace('srgb')` does a real CMYK→RGB conversion instead and muddies them,
   which OpenMVS then textures with. `fetchSkraafoto` writes three bands; older
   harvests may hold four-band frames, which is what this step is for.
4. **COLMAP**, one `runColmap` call, as a format converter only:
   - `image_undistorter --image_path sparse-in/images --input_path sparse-in --output_path dense --output_type COLMAP`
     (PINHOLE cameras → a no-op resample, but it lays out the workspace
     `InterfaceCOLMAP` reads, and it applies no bogus-params check)
5. **OpenMVS**, `runOpenMvs(tool, args)` per stage, cwd = workdir:
   - `InterfaceCOLMAP -i dense -o scene.mvs --image-folder images` (`--image-folder`
     is joined onto `-i`, so `dense/images` would become `dense/dense/images`)
   - `DensifyPointCloud scene.mvs --resolution-level <1 | 0 with --full-res> --number-views 0
--remove-dmaps 1`, with every `*.dmap` in the workdir deleted first: OpenMVS caches
     depth maps by image _index_ and silently reuses stale ones, aborting mid-fusion
   - `ReconstructMesh scene_dense.mvs` (defaults: `--decimate 1`,
     `--remove-spurious 20`, `--smooth 2`) → `scene_dense_mesh.ply`
   - `RefineMesh scene_dense.mvs --mesh-file scene_dense_mesh.ply --resolution-level 1
-o scene_dense_mesh_refine.ply` **only with `--refine`** (the texture stage then
     reads that mesh)
   - `TextureMesh scene_dense.mvs --mesh-file <mesh>.ply --export-type glb
--max-texture-size 8192 --global-seam-leveling 0 --local-seam-leveling 0 -o
scene_dense_texture.glb` → that GLB **plus** a sidecar `scene_dense_texture_0.png`
     it names by URI. Both levelling passes are off because on this scene they clip
     every patch interior to an RGB-cube corner, photo pixels surviving only in the
     margins; global off with local on still clips

   Both `-o` are pinned because v2.4.0 names an output after its _input's_ stem, so
   `--refine` would otherwise move the GLB the re-pack reads.

6. **Re-pack** — `meshGlbGeometry` over a `NodeIO` document (the only IO that resolves
   the sidecar URI; it refuses > 1 primitive/texture) → `sharp` JPEG q90 on the
   texture → `packMeshGlb` → `public/data/geo3d/groups/<id>/assets/mesh/mesh.glb`.
   `--reuse-glb` starts here from the last `scene_dense_texture.glb`, carrying the
   manifest's existing `colmap`/`openmvs` version stamps forward — exactly
   `--reuse-ply`'s contract (`bakeSplats.ts:89-100`).
7. **Publish** — `publishAsset(group, asset)` (P3); asset `id: 'mesh'`, label
   `${group.name} — skråfoto MVS mesh`, `triangleCount` from the re-packed index
   count / 3, provenance per §4.

Each stage deletes its own output before running (the `rm(plyPath)` idiom,
`bakeSplats.ts:151-157`) so a stage that exits 0 without writing is caught by the
next stage's missing-input error, never by shipping a previous run's file.

### 6.3 Resolution and time budget

`--resolution-level 1` is the first-bake default: OpenMVS's own default, and ~650 ×
450 px per view is where a CPU densify of ~100 crop frames is an afternoon, not a day.
Estimates for the crop group on the M1 Max (10 cores), **to be measured in 3a's
operator task and recorded in the README, not asserted**: COLMAP ≈ 10 min, densify
≈ 30–60 min, mesh ≈ 5 min, texture ≈ 15 min; `--full-res` ≈ 3–5 h; `--refine` at
level 1 adds hours and is judged only against a first bake's visible defects.

### 6.4 `package.json`

```jsonc
"bake-mesh": "tsx tools/scene-recon/bakeMesh.ts",   // 3a
"bake-poses": "tsx tools/scene-recon/bakePoses.ts", // 3b
```

## 7. Viewer architecture — plan 3a

### 7.1 Reading and packing the GLB

```ts
// tools/scene-recon/pack/packMeshGlb.ts — Node + browser (the probe scene uses it)
export type TexturedMeshGeometry = {
  readonly positions: Float32Array; // 3 per vertex, group-frame metres
  readonly uvs: Float32Array; // 2 per vertex
  readonly indices: Uint32Array; // 3 per triangle
  readonly image: { readonly bytes: Uint8Array; readonly mimeType: 'image/jpeg' | 'image/png' };
};
export function packMeshGlb(geometry: TexturedMeshGeometry): Promise<Uint8Array>;

// tools/scene-workbench/src/scene/readMeshGlb.ts — browser + Node (bakeMesh's re-pack input)
export function readMeshGlb(buffer: ArrayBuffer): Promise<TexturedMeshGeometry>;
```

Both are `@gltf-transform/core` (`WebIO` in the reader — it fetches nothing for a
self-contained GLB, so it runs under vitest too; `NodeIO`-free by design so one
reader serves the bake and the viewer). `readMeshGlb` throws on zero or more than one
primitive, or more than one texture, or a missing `TEXCOORD_0`. Node transforms on
the path to the primitive are **applied** to the positions on read (gltf-transform's
`getWorldMatrix`), so OpenMVS's export and our own subset read the same way.

`packMeshGlb` is `async` because gltf-transform's `writeBinary` is; it stamps the
`extras.frame` note (§5).

### 7.2 Asset loading

```ts
// tools/scene-workbench/src/render/renderResources.ts — GpuAsset union member
export type MeshGpuAsset = {
  readonly kind: 'mesh';
  readonly positions: GPUBuffer; // VERTEX, f32 ×3
  readonly uvs: GPUBuffer; // VERTEX, f32 ×2
  readonly indices: GPUBuffer; // INDEX, u32
  readonly indexCount: number;
  readonly texture: GPUTexture; // rgba8unorm-srgb, one mip
  dispose(): void;
};
export type GpuAsset = LidarGpuAsset | SplatGpuAsset | MeshGpuAsset;

// tools/scene-workbench/src/render/uploadTexturedMesh.ts
export function uploadTexturedMesh(
  gpu: GpuContext,
  geometry: TexturedMeshGeometry,
  image: ImageBitmap,
): MeshGpuAsset;

// tools/scene-workbench/src/scene/loaders/loadTexturedMesh.ts — the ASSET_LOADERS['mesh'] row
export async function loadTexturedMesh(gpu: GpuContext, buffer: ArrayBuffer): Promise<MeshGpuAsset>;
```

`loadTexturedMesh` = `readMeshGlb` → `createImageBitmap(new Blob([image.bytes], { type: image.mimeType }))`
→ `uploadTexturedMesh` (`copyExternalImageToTexture`, `flipY: false` — glTF's uv
origin is the image's top-left, matching WebGPU's). The `await` is why P1 exists.

`assetCount` gains `mesh: (asset) => ({ count: asset.triangleCount, unit: 'tris' })`.

### 7.3 `texturedMeshRenderer` and `texturedMesh.wesl`

```ts
export type TexturedMeshRenderer = {
  draw(pass: GPURenderPassEncoder, assets: readonly MeshGpuAsset[]): void;
};
export function createTexturedMeshRenderer(
  gpu: GpuContext,
  targetFormat: GPUTextureFormat,
  cameraLayout: GPUBindGroupLayout,
): TexturedMeshRenderer;
```

| Group | Binding | Resource                      | Visibility | Notes                                    |
| ----- | ------- | ----------------------------- | ---------- | ---------------------------------------- |
| 0     | 0       | `SceneCamera` uniform         | vertex     | shared, unchanged (192 bytes)            |
| 1     | 0       | `texture_2d<f32>` — the atlas | fragment   | per asset, `WeakMap` cache (splat idiom) |
| 1     | 1       | `sampler` (linear, clamp)     | fragment   | one renderer-owned sampler               |
| 1     | 2       | **reserved** — `AssetXform`   |            | not built (§2)                           |

Vertex buffers: slot 0 `positions` (`float32x3`, stride 12), slot 1 `uvs`
(`float32x2`, stride 8); `setIndexBuffer(indices, 'uint32')`, `drawIndexed(indexCount)`.
Vertex stage: `cam.viewProj * vec4(positionM, 1)`, uv passed through. Fragment:
`textureSample(atlas, samp, uv)`, alpha 1 — **unlit**: the texture is the evidence
the layer exists to show, and a lighting model would add a second opinion about the
surface. `cullMode: 'none'` (MVS winding is not guaranteed), `depthWriteEnabled: true`,
`depthCompare: 'less'`, no blend. `SceneCamera` needs no new field.

### 7.4 Draw order — `sceneRenderers.ts` (P2)

```ts
export const SCENE_DRAW_ORDER: readonly GpuAsset['kind'][] = [
  'pointCloud',
  'mesh',
  'gaussianSplat',
];
export type SceneRenderers = {
  draw(
    pass: GPURenderPassEncoder,
    resources: RenderResources,
    hiddenAssetIds: readonly string[],
  ): void;
  dispose(): void;
};
export function createSceneRenderers(
  gpu: GpuContext,
  targetFormat: GPUTextureFormat,
  cameraLayout: GPUBindGroupLayout,
): SceneRenderers;
```

Opaque, depth-writing kinds first in any order (`pointCloud`, `mesh`), then the
blended, depth-testing `gaussianSplat`; 3b appends `cameraPoseSet`. The table is
exhaustive over `GpuAsset['kind']` by construction (a `Record<kind, renderer>` plus
this array; a kind missing from the array is a test failure, §9). Splats that sit
behind the mesh surface are clipped by its depth — that is the comparison, not a bug:
the two reconstructions disagreeing about where the surface is becomes visible as
splat colour vanishing under mesh texture.

### 7.5 Probe scene

`syntheticProbeScene.ts` gains a third asset, `'Probe mesh'`: a textured box (12
triangles, uvs spanning a 2 × 2 checker) packed in-page by `packMeshGlb` with a
committed 2 × 2 PNG byte constant, served as a `blob:` URL like its siblings.
`probeGpuErrors.ts`'s boot readiness assertion becomes `toHaveCount(3)`; the
name-scoped checkbox locators need no change (they name the point cloud).

## 8. Camera-pose overlay — plan 3b

### 8.1 Purpose and behaviour (grill Q9)

Every photograph the group's reconstructions were built from is drawn as a wireframe
frustum at its recovered pose. Clicking a frustum selects that photo: its JPEG is
fetched (lazily, only on select), drawn on a quad at the frustum's far plane with an
opacity slider, so the operator can slide between "the photo" and "the reconstructions
seen from the photo's own camera". Alignment error shows as parallax between the two.

### 8.2 Data

`poses.json` (`public/data/geo3d/groups/<id>/assets/poses/poses.json`):

```ts
export type PoseSetFile = { readonly formatVersion: 1; readonly poses: readonly PhotoPose[] };
```

`PhotoPose.imageUrl` is the JPEG's logical data path
(`geo3d/groups/<id>/assets/poses/<photoId>.jpg`) — the harvested (cropped, per #685)
frame copied beside the file by `bakePoses`, so the viewer serves it from
`public/data` like every other artifact and the pose describes exactly that JPEG's
pixels (plan 2 §6's downsampled-JPEG rule).

`tools/scene-recon/bakePoses.ts`: `groupPhotoPoses` (P4) → copy JPEGs → write
`poses.json` → `publishAsset` (P3) with `kind: 'cameraPoseSet'`, `id: 'poses'`,
`poseCount`, pipeline `[{ step: 'fetchSkraafoto', version: <collection> }]`. Seconds,
not hours; re-run after any harvest change.

### 8.3 GPU asset and renderer

```ts
export type PoseSetGpuAsset = {
  readonly kind: 'cameraPoseSet';
  readonly poses: readonly PhotoPose[];
  readonly frustumLines: GPUBuffer; // VERTEX, f32 ×3, 16 vertices (8 segments) per pose
  readonly lineVertexCount: number;
  /** The selected photo's texture, or null; owned here so a group switch disposes it. */
  selectedImage: { readonly poseId: string; readonly texture: GPUTexture } | null;
  dispose(): void;
};
```

`poseOverlayRenderer` (appended to `SCENE_DRAW_ORDER` last, after splats) draws two
things: the line list (`line-list` topology, one flat colour, depth-tested against the
opaque pass, not written) and — when `selectedImage` is set — the photo quad: four
vertices at the selected pose's image-plane corners at `frustumDepthM`, textured with
`selectedImage.texture`, blended with `view.poses.imageOpacity`. The quad reuses
`texturedMesh.wesl`'s vertex/fragment functions via a second pipeline that adds a
per-draw `opacity` uniform and straight-alpha blending — one shader module, two
pipelines, the splat renderer's own idiom.

Frustum geometry is CPU-built once at upload: for each pose, apex = `positionM`, the
four far corners = `positionM + R · d · [(±W/2 − cx)/f, (±H/2 − cy)/f, 1]` with
`d = frustumDepthM` (default 60 m, slider), `R` = `PhotoPose.rotation` as a matrix
(the CV convention: +Z forward, +Y down, parent spec §4). A `frustumDepthM` change
rebuilds the buffer (~100 poses × 16 vertices — trivial).

### 8.4 State, input, UI

- `posesSlice`: `{ selectedPoseId: string | null; imageOpacity: number /* 0..1, default 0.6 */; frustumDepthM: number /* default 60 */ }`.
- Click: `createSceneInput` reports a pointer-down/up pair with < 4 px travel as a
  `canvasClicked({ xPx, yPx })` command (`state/commands.ts`); a drag stays a drag.
- `pickPoseAtPx(poses, viewProj, viewportPx, px): string | null` — pure: project every
  apex, return the nearest within 12 px, else null (a miss deselects). ~100 projections
  per click, no GPU pick.
- `watchPoseSelectSaga`: on `poseSelected`, fetch the JPEG → `createImageBitmap` →
  GPU texture → set `selectedImage` on the asset (disposing the previous one) → `put` a
  bare `poseImageWritten` so the viewport redraws (the `splatOrderWritten` idiom).
- `PosePanel`: selected pose id + the two sliders; no pose list (100 rows the user
  cannot tell apart — the frustum is the affordance).

## 9. Testing strategy

Judged by `docs/superpowers/conventions/testing.md`'s one question.

**Plan 3a:**

- **`packMeshGlb` ↔ `readMeshGlb` round trip** — a hand-built two-triangle quad with
  distinct uvs per vertex, a 5-triangle index list that is not a multiple of anything
  convenient, and a tiny image byte array, asserting positions/uvs/indices equal,
  image bytes pass through untouched, `mimeType` preserved, and `extras.frame` present
  (format-contract test, the keep-rule for on-disk formats).
- **`readMeshGlb` refuses two primitives, two textures, and a missing `TEXCOORD_0`** —
  documents built in the test with gltf-transform's own API, asserting the thrown
  message names `--max-texture-size` for the texture case.
- **`readMeshGlb` applies a node transform** — a primitive under a node translated by
  `[10, 0, 0]` reads back with `+10` on every x (the OpenMVS-input contract).
- **`bakeMesh` orchestration**, `tests/tools/scene-recon/bakeMesh.test.ts` mirroring
  `bakeSplats.test.ts` (stubbed runners, tmpdir cwd, `forks` pool): the COLMAP stage
  order and flags (`use_gpu 0`, `PINHOLE`, `single_camera_per_image`); `--full-res`
  → `--resolution-level 0`; `--refine` inserts `RefineMesh` and texture reads its
  output; `--reuse-glb` runs no runner and keeps the manifest's version stamps; a
  fabricated OpenMVS GLB with two textures fails the bake with the flag hint; the
  published asset's `triangleCount` matches the fabricated geometry.
- **`assetCount` mesh row** — extend the existing test with one `mesh` asset → `tris`.
- **`SCENE_DRAW_ORDER` covers every `GpuAsset` kind exactly once** — the one table
  test that catches a kind added to the union but not to the order (`tsc` proves the
  `Record`, not the array).
- **`sceneCamera.parity.test.ts`** — unchanged (no new fields).

**Deliberately not tested:** COLMAP/OpenMVS subprocess plumbing (the CLI-wrapper
exclusion, parent spec §9); reconstruction quality (operator judgement); the WGSL
textured pass beyond the GPU probe (`npm run scene-workbench:probe` exits 0 with three
assets ready).

**Plan 3b** (contracts for its plan): `pickPoseAtPx` with hand-placed apexes;
`frustumVertices` for an identity-rotation pose (corners hand-computed from `f`, `cx`,
`cy`, `W`, `H`, `d`); `bakePoses` writes `poses.json` with `imageUrl` rewritten to the
copied path.

## 10. Settled and open questions

1. **OpenMVS GLB axis convention** (§5) — SETTLED on the hand-run prototype export:
   raw scene coordinates, identity node matrix, +Z up. The re-pack converts nothing.
2. **COLMAP cannot match our crops** — SETTLED, and it is why §6.2 has no matching
   stages. `Camera::HasBogusParams` rejects any principal point outside `[0,w]×[0,h]`,
   and a crop is a window of a much larger frame, so `cx, cy` land thousands of px
   outside it (e.g. `-3000.8, -2938.1` on a 989×180 crop). `point_triangulator` then
   skips every image and writes 0 points; no option disables the check. The poses
   themselves are right — triangulating COLMAP's own verified matches by hand under
   the model's convention gave 0.15 px median reprojection, 100 % in front — so the
   LiDAR seed replaces the whole matching pipeline rather than working around it.
3. **Time budget** (§6.3) — measured, then recorded in the README.
4. **Eigen 5.0.1 against OpenMVS's Eigen ≥ 3.4 requirement** — resolved by the build
   log before 3a's first bake; recorded either way.

## 11. Decisions this spec made

- `TexturedMeshAsset` / `triangleCount` (not the parent's `MeshAsset` / `vertexCount`).
- Poses as a sidecar artifact, not inline (§3 ruling).
- `@gltf-transform/core` on both sides, and a re-pack of OpenMVS's GLB rather than an
  OBJ reader or shipping OpenMVS's file as-is.
- Unlit mesh, `cullMode: 'none'`, opaque, no DisplayPanel section.
- Draw order as a table (`SCENE_DRAW_ORDER`), one renderer bag owned by `Viewport`.
- Prep P5 (optional `points3D`) dropped — the LiDAR seed is the sparse model
  (§6.2), not an optional initialisation.
- One spec, two plans (3a mesh, 3b overlay), 3b after 3a merges.
