# Scene Workbench 3a/4 — MVS textured mesh layer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** an opaque, textured triangle mesh reconstructed by OpenMVS from the skråfoto frames draws between the LiDAR points and the blended splats, in the same metre frame — the whole path from a COLMAP known-pose model through OpenMVS to a re-packed `mesh.glb`, loaded through the existing per-kind loader table and drawn from an ordered renderer table.

**Architecture:** Same two-halves shape as plans 1–2. Offline: `tools/scene-recon/bakeMesh.ts` derives the group's photo poses (`groupPhotoPoses`), stages a known-pose COLMAP model (`writeColmapModel`, unchanged), runs `colmap` feature/match/triangulate/undistort and the OpenMVS chain (`InterfaceCOLMAP` → `DensifyPointCloud` → `ReconstructMesh` → [`RefineMesh`] → `TextureMesh --export-type glb`), then re-packs OpenMVS's GLB into the viewer's subset (`readMeshGlb` → JPEG → `packMeshGlb`) and publishes the asset (`publishAsset`). Online: a third `SceneAsset` kind (`mesh`) flows through the now-async `ASSET_LOADERS` table into a `MeshGpuAsset`; `texturedMeshRenderer` draws it unlit, depth-writing, from `sceneRenderers`'s ordered table between the point cloud and the splats.

**Tech Stack:** as plans 1–2, plus `@gltf-transform/core` 4.5.0 (devDependency, shared with PR #678), COLMAP 4.2.0 (brew, no GPU) and OpenMVS v2.4.0 (built from source — spec §6.1), PROJ's `cct`.

**Spec:** [`docs/superpowers/specs/completed/2026-09-11-scene-workbench-3-mesh-design.md`](../specs/2026-09-11-scene-workbench-3-mesh-design.md) §§1–7, 9–11 (§8 is plan 3b). Parent: [`specs/completed/2026-09-02-scene-workbench-design.md`](../specs/completed/2026-09-02-scene-workbench-design.md). As-built precedent: [`plans/completed/2026-09-10-scene-workbench-2-splats.md`](completed/2026-09-10-scene-workbench-2-splats.md).

**Ground preparation:** spec §3 — four preps, **none landed yet**. P1+P2 are tasks 1–2 of this plan on their own branch/PR; P3+P4 are tasks 7–8 on a branch stacked on PR #685 (`splat-crop-group`), whose worktree this plan never touches. Packaging per the user's checkpoint ruling: prep as separate PRs.

## Branches and PRs

Four branches, merged in this order by the user (squash-merge each; later ones are rebased by the executor after each merge):

| Branch                      | Base                         | PR                 | Tasks      |
| --------------------------- | ---------------------------- | ------------------ | ---------- |
| `scene-workbench-mesh-prep` | `origin/main`                | prep A (new)       | 1, 2       |
| `scene-workbench-mesh`      | `scene-workbench-mesh-prep`  | #686 (open, draft) | 3, 4, 5, 6 |
| `scene-workbench-bake-prep` | `splat-crop-group` (PR #685) | prep B (new)       | 7, 8       |
| `scene-workbench-mesh-bake` | `scene-workbench-bake-prep`  | bake (new)         | 9, 10, 11  |

Task 9 needs task 3's two files; they are cherry-picked onto the bake branch and drop out on the post-merge rebase (same patch id).

## Parallelism map

Implementers run in parallel in their own worktrees (the user's ruling: as many as possible), each cherry-picked onto its execution branch; reviewers pipeline per `sdd-execution.md`. File sets within a wave are disjoint.

| Wave | Tasks (parallel)  | Waits on                                                       |
| ---- | ----------------- | -------------------------------------------------------------- |
| 1    | 1, 2, 3, 7        | —                                                              |
| 2    | 4, 8              | 4 ← 2, 3 · 8 ← 7                                               |
| 3    | 5, 9              | 5 ← 1, 4 · 9 ← 3, 8 (+ OpenMVS on PATH for its operator check) |
| 4    | 6                 | 5                                                              |
| 5    | 10 (operator), 11 | 6, 9, #685's crop harvest complete                             |

## Global constraints

- `type` aliases only, never `interface`. One type per file under `tools/scene-workbench/@types/` and `tools/scene-recon/@types/`; one function per file under `tools/utils/**` and `tools/scene-recon/**` (a `pack/*.ts` module may export its record type beside its one function, as `packSplats.ts` does).
- RTK reducer parameters are never named `s` / `a`.
- Every file move/rename goes through `npm run move-files -- <from> <to>` (`--dry` first), never `git mv` plus hand-edited imports. No task below moves a file.
- No WGSL backticks, no brace-list imports, imports hoisted to the top, `package::` prefix — `.claude/skills/wesl-shaders/SKILL.md`.
- Suite + `npm run typecheck` green after every task; `npm run format` over touched files only, before each commit. Commits end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Never `git add -A`; never `git stash`.
- Comment budget: module header ≤ 10 lines, comment lines ≤ half the code lines. Why, never what.
- Baked artifacts stay gitignored (`data/raw/**`, `/public/data/**`). `data/raw/skraafoto/<collection>[/<group>]/mvs-<groupId>/` is a workdir, never committed.
- Secrets: nothing in this plan touches the skråfoto token — every input is already on disk. If a task finds itself needing it, stop and report.
- Byte/field tables and bind-group tables below are copied from spec §5/§7 — the literal contract.

---

### Task 1: async `AssetLoader` (prep P1)

**Branch:** `scene-workbench-mesh-prep`

**Files:**

- Modify: `tools/scene-workbench/@types/AssetLoader.d.ts`
- Modify: `tools/scene-workbench/src/scene/loaders/loadPointCloud.ts`, `tools/scene-workbench/src/scene/loaders/loadGaussianSplat.ts`
- Modify: `tools/scene-workbench/src/state/group/watchGroupSaga.ts:31-44`

**Interfaces:**

- Produces: `export type AssetLoader = (gpu: GpuContext, buffer: ArrayBuffer) => Promise<GpuAsset>;` — task 5's `loadTexturedMesh` is the first loader that actually awaits.

Both existing loaders become `async` functions with unchanged bodies. `loadAssetWorker`'s promise chain becomes fetch → `arrayBuffer()` → `ASSET_LOADERS[asset.kind](gpu, buffer)` → `acceptLoadedAsset(uploaded, resources, myEpoch, cancellation)`, each in its own `.then` — the staleness check must stay inside the continuation chain, never after the saga's `yield*` (`acceptLoadedAsset.ts`'s header explains why; do not restate it in the saga).

**No new test** — the loaders' bodies are unchanged and the saga is an IO shell (parent spec §9's exclusion; plan 1 precedent). `tests/tools/scene-workbench/scene/acceptLoadedAsset.test.ts` still covers the staleness contract.

- [x] Change the type, the two loaders, and the saga chain.
- [x] `npx vitest run tests/tools/scene-workbench`; `npm run typecheck`; `npm run format` on the four files; commit as `refactor(scene-workbench): async AssetLoader contract`.

### Task 2: `sceneRenderers` — ordered renderer table (prep P2)

**Branch:** `scene-workbench-mesh-prep`

**Files:**

- Create: `tools/scene-workbench/src/render/sceneRenderers.ts`
- Modify: `tools/scene-workbench/src/ui/Viewport/Viewport.tsx` (`:56-68` `visibleAssetsOfKind` moves out; `:82-84,98,140-145,152-153,163` collapse to one `renderers` let)
- Test: `tests/tools/scene-workbench/render/sceneRenderers.test.ts`

**Interfaces:**

- Consumes: `createLidarPointRenderer(gpu, format, cameraLayout)`, `createSplatRenderer(gpu, format, cameraLayout)` (unchanged), `RenderResources`.
- Produces:

```ts
export const SCENE_DRAW_ORDER: readonly GpuAsset['kind'][] = ['pointCloud', 'gaussianSplat'];
export type SceneRenderers = {
  draw(
    pass: GPURenderPassEncoder,
    resources: RenderResources,
    hiddenAssetIds: readonly string[],
  ): void;
};
export function createSceneRenderers(
  gpu: GpuContext,
  targetFormat: GPUTextureFormat,
  cameraLayout: GPUBindGroupLayout,
): SceneRenderers;
```

Internally one `Record<GpuAsset['kind'], { draw(pass, assets) }>` (the `assetCount.ts` mapped-type idiom, `assetCount.ts:8-16`) built once from the two renderer factories; `draw` walks `SCENE_DRAW_ORDER`, filtering `resources.gpuAssets` per kind with the moved `visibleAssetsOfKind`. Opaque kinds first, blended last — task 4 inserts `'mesh'` between them. `Viewport` builds the bag right after `initGpu` beside `cameraUniform`, calls `renderers.draw(pass, resources, hidden)` after `setBindGroup(0, …)`, and no longer names any renderer.

- [x] Test `SCENE_DRAW_ORDER names every GpuAsset kind exactly once` — build a `Record<GpuAsset['kind'], true>` literal in the test (so `tsc` fails when the union grows without the test growing), assert `SCENE_DRAW_ORDER` sorted equals `Object.keys(record)` sorted and has no duplicates. This is the one thing `tsc` can't check: the array's coverage.
- [x] Test `SCENE_DRAW_ORDER draws every opaque kind before gaussianSplat` — assert `indexOf('gaussianSplat') === SCENE_DRAW_ORDER.length - 1` (the blend-over-depth contract; a future overlay kind appended after splats will need this test amended, on purpose).
- [x] Implement `sceneRenderers.ts`; rewire `Viewport.tsx`.
- [x] `npx vitest run tests/tools/scene-workbench`; `npm run typecheck`; `npm run format`; commit as `refactor(scene-workbench): sceneRenderers — one ordered renderer table`.
- [x] Executor: `npm run scene-workbench:probe` on the prep branch must still exit 0 (two assets) before the prep PR is marked ready.

### Task 3: `packMeshGlb` / `readMeshGlb` + the gltf-transform devDependency

**Branch:** `scene-workbench-mesh`

**Files:**

- Modify: `package.json` (devDependencies: `"@gltf-transform/core": "4.5.0"` — the exact pin PR #678 uses; `npm install` updates `package-lock.json`)
- Create: `tools/scene-recon/pack/packMeshGlb.ts`
- Create: `tools/scene-workbench/src/scene/readMeshGlb.ts`
- Test: `tests/tools/scene-recon/pack/packMeshGlb.test.ts`

**Interfaces (spec §7.1, verbatim):**

```ts
// tools/scene-recon/pack/packMeshGlb.ts
export type TexturedMeshGeometry = {
  readonly positions: Float32Array; // 3 per vertex, group-frame metres
  readonly uvs: Float32Array; // 2 per vertex
  readonly indices: Uint32Array; // 3 per triangle
  readonly image: { readonly bytes: Uint8Array; readonly mimeType: 'image/jpeg' | 'image/png' };
};
export function packMeshGlb(geometry: TexturedMeshGeometry): Promise<Uint8Array>;

// tools/scene-workbench/src/scene/readMeshGlb.ts
export function readMeshGlb(buffer: ArrayBuffer): Promise<TexturedMeshGeometry>;
```

`packMeshGlb` writes the spec §5 subset with `Document` + `NodeIO.writeBinary`: one scene/node/mesh/primitive, `POSITION`/`TEXCOORD_0`/u32 indices, one material with `baseColorTexture`, one embedded image, linear/clamp sampler, and `root.getAsset().extras = { frame: 'group ENU metres, +Z up' }`. `readMeshGlb` uses `WebIO` (no fetch for a self-contained GLB — it runs under vitest and in the browser alike), applies the primitive's node world matrix to positions on read, and throws — naming `--max-texture-size` in the texture case — on 0 or > 1 primitives, > 1 texture, or a missing `TEXCOORD_0`. Both live where their siblings do (`packSplats.ts` / `parseSplats.ts`).

- [x] `npm install --save-dev @gltf-transform/core@4.5.0` (this worktree's `node_modules` is a symlink to the main checkout's, which already holds 4.5.0 from PR #678 — expect a lockfile diff only).
- [x] Test `packMeshGlb → readMeshGlb round-trips geometry, image bytes and the frame note` — a hand-built 4-vertex quad with distinct uvs per vertex, `indices = [0,1,2, 0,2,3]`, a 12-byte fake `image/png` byte array; assert `positions`/`uvs`/`indices` deep-equal, `image.bytes` byte-equal and `mimeType` preserved, and that the written GLB's `asset.extras.frame` is the spec string (read via gltf-transform in the test — a format-contract test, not a mirror).
- [x] Test `readMeshGlb applies a node transform` — build a document in the test with the quad under a node translated `[10, 0, 0]`; assert every read `x` is the source `x + 10`.
- [x] Test `readMeshGlb refuses two primitives`, `…refuses two textures` (assert the message contains `--max-texture-size`), `…refuses a primitive without TEXCOORD_0` — documents built with gltf-transform's API in the test.
- [x] Implement both.
- [x] `npx vitest run tests/tools/scene-recon/pack`; `npm run typecheck`; `npm run format`; commit `package.json`, `package-lock.json`, the two sources and the test as `feat(scene-recon): packMeshGlb + readMeshGlb — the mesh.glb subset`.

### Task 4: `MeshGpuAsset` + `texturedMeshRenderer` + `texturedMesh.wesl` + draw-order row

**Branch:** `scene-workbench-mesh` (after tasks 2, 3 are on the branch)

**Files:**

- Modify: `tools/scene-workbench/src/render/renderResources.ts` (add `MeshGpuAsset`, grow `GpuAsset`)
- Create: `tools/scene-workbench/src/render/uploadTexturedMesh.ts`
- Create: `tools/scene-workbench/src/render/texturedMeshRenderer.ts`, `tools/scene-workbench/src/render/shaders/texturedMesh.wesl`
- Modify: `tools/scene-workbench/src/render/sceneRenderers.ts` (row + order entry)
- Modify: `tests/tools/scene-workbench/render/sceneRenderers.test.ts` (the `Record` literal gains `mesh: true`)

**Interfaces (spec §7.2–7.4, verbatim):**

```ts
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

export function uploadTexturedMesh(
  gpu: GpuContext,
  geometry: TexturedMeshGeometry,
  image: ImageBitmap,
): MeshGpuAsset;

export type TexturedMeshRenderer = {
  draw(pass: GPURenderPassEncoder, assets: readonly MeshGpuAsset[]): void;
};
export function createTexturedMeshRenderer(
  gpu: GpuContext,
  targetFormat: GPUTextureFormat,
  cameraLayout: GPUBindGroupLayout,
): TexturedMeshRenderer;

export const SCENE_DRAW_ORDER: readonly GpuAsset['kind'][] = [
  'pointCloud',
  'mesh',
  'gaussianSplat',
];
```

| Group | Binding | Resource                      | Visibility | Notes                                                                                  |
| ----- | ------- | ----------------------------- | ---------- | -------------------------------------------------------------------------------------- |
| 0     | 0       | `SceneCamera` uniform         | vertex     | shared, unchanged — `import package::lib::sceneCamera::SceneCamera`                    |
| 1     | 0       | `texture_2d<f32>` — the atlas | fragment   | per asset, `WeakMap<MeshGpuAsset, GPUBindGroup>` (the `splatRenderer.ts:80-100` idiom) |
| 1     | 1       | `sampler` (linear, clamp)     | fragment   | one renderer-owned sampler                                                             |
| 1     | 2       | reserved — `AssetXform`       |            | not built                                                                              |

Vertex buffers: slot 0 `positions` (`float32x3`, stride 12), slot 1 `uvs` (`float32x2`, stride 8); `setIndexBuffer(indices, 'uint32')`, `drawIndexed(indexCount)`. Vertex: `cam.viewProj * vec4(positionM, 1)`, uv through. Fragment: `textureSample(atlas, samp, uv)`, alpha 1, unlit. Pipeline: `cullMode: 'none'`, `depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' }`, no blend. `uploadTexturedMesh` uploads the bitmap with `copyExternalImageToTexture` and `flipY: false` (glTF's uv origin is the image's top-left, as WebGPU's is — the inverse of the whole-globe uploads `docs/RENDERER.md` describes). `dispose` destroys the three buffers and the texture.

**No new automated test** beyond the `Record` growth — spec §9's WGSL exclusion; the probe (task 6) is the gate.

- [x] Grow `renderResources.ts`; write `uploadTexturedMesh.ts`, `texturedMesh.wesl` (header ≤ 10 lines: the unlit choice, the `flipY` contract), `texturedMeshRenderer.ts`; add the row and order entry; grow the test's `Record`.
- [x] `npx vitest run tests/tools/scene-workbench/render`; `npm run typecheck`; `npm run format`; commit as `feat(scene-workbench): texturedMeshRenderer — unlit, depth-writing mesh pass`.

### Task 5: `TexturedMeshAsset` + loader row + `assetCount` row

**Branch:** `scene-workbench-mesh` (after tasks 1, 4)

**Files:**

- Create: `tools/scene-workbench/@types/TexturedMeshAsset.d.ts`
- Modify: `tools/scene-workbench/@types/SceneAsset.d.ts`
- Create: `tools/scene-workbench/src/scene/loaders/loadTexturedMesh.ts`
- Modify: `tools/scene-workbench/src/scene/loaders/assetLoaders.ts`, `tools/scene-workbench/src/scene/assetCount.ts`
- Test: extend `tests/tools/scene-workbench/scene/assetCount.test.ts` and `tests/tools/scene-workbench/ui/LayerList.test.tsx`

**Interfaces (spec §4, §7.2, verbatim):**

```ts
export type TexturedMeshAsset = AssetCommon & {
  readonly kind: 'mesh';
  readonly triangleCount: number;
  readonly artifactUrl: string; // mesh.glb
};
export type SceneAsset = PointCloudAsset | GaussianSplatAsset | TexturedMeshAsset;

export async function loadTexturedMesh(gpu: GpuContext, buffer: ArrayBuffer): Promise<MeshGpuAsset>;
// = readMeshGlb → createImageBitmap(new Blob([image.bytes], { type: image.mimeType })) → uploadTexturedMesh
```

`ASSET_LOADERS` gains `mesh: loadTexturedMesh`; `ASSET_COUNT` gains `mesh: (asset) => ({ count: asset.triangleCount, unit: 'tris' })`. `SceneAsset.d.ts`'s header comment drops the "plans 3–4 add `MeshAsset`" line (it names a type that now has a different name).

- [x] Test `assetCount reports tris for a mesh asset` — one hand-built `TexturedMeshAsset` with `triangleCount: 1_234`, assert `{ count: 1234, unit: 'tris' }`.
- [x] Test `LayerList shows a mesh asset's count in tris` — manifest with one `mesh` asset (`triangleCount: 42_000`), assert the row text includes `42,000 tris`.
- [x] Implement.
- [x] `npx vitest run tests/tools/scene-workbench`; `npm run typecheck`; `npm run format`; commit as `feat(scene-workbench): TexturedMeshAsset — type, loader row, count row`.

### Task 6: probe scene mesh asset

**Branch:** `scene-workbench-mesh` (after task 5)

**Files:**

- Modify: `tools/scene-workbench/src/scene/syntheticProbeScene.ts`, `tools/scene-workbench/probeGpuErrors.ts:221-225`

A third synthetic asset, label `'Probe mesh'`: a textured box (12 triangles, 8 vertices — or 24 if uvs must differ per face, implementer's call), uvs spanning `[0,1]²`, packed in-page by `packMeshGlb` (async — `syntheticProbeScene` grows an `await`; check its call site in `watchRegistrySaga`/the `?probe` gate and thread the promise, do not block) with a committed 2 × 2 PNG byte constant (a hand-written 4-pixel checker; ~70 bytes as a `Uint8Array` literal — cite the PNG chunk layout in one comment line). Served as a `blob:` URL like its siblings (`syntheticProbeScene.ts:85-89`). `probeGpuErrors.ts`'s boot readiness assertion becomes `toHaveCount(3)`; the name-scoped checkbox locators stay.

- [x] Add the asset; bump the count.
- [x] `npm run scene-workbench:probe` (start the dev server on a free port if 5600 is taken — `PORT`/`--port` per `probeGpuErrors.ts`'s own header; **never** kill a running `:5600`) — must exit 0 with three assets ready, no GPU/page/console errors.
- [x] `npm run format`; commit as `test(scene-workbench): synthetic textured mesh in the GPU probe scene`.

### Task 7: `geo3dLayout` + `publishAsset` (prep P3)

**Branch:** `scene-workbench-bake-prep` (base: `splat-crop-group` HEAD, PR #685 — branch from its commits, never from or into its worktree)

**Files:**

- Create: `tools/scene-recon/manifest/geo3dLayout.ts`, `tools/scene-recon/manifest/publishAsset.ts`
- Modify: `tools/scene-recon/bakeLidar.ts:38,109,127-139`, `tools/scene-recon/bakeSplats.ts` (its `GEO3D_DIR`, `manifestPath`, `assetDir`, and the two `writeJsonAtomic` calls — line numbers differ on #685's branch; find them by the strings)
- Test: `tests/tools/scene-recon/manifest/publishAsset.test.ts`

**Interfaces:**

```ts
// geo3dLayout.ts — layout constants, the splatFormat.ts kind of module
export const GEO3D_DIR = 'public/data/geo3d';
export function groupAssetDir(groupId: string, assetId: string): string; // join(GEO3D_DIR, 'groups', groupId, 'assets', assetId)
export function groupManifestPath(groupId: string): string;
export function registryPath(): string;
export function assetArtifactUrl(groupId: string, assetId: string, fileName: string): string; // `geo3d/groups/${groupId}/assets/${assetId}/${fileName}`

// publishAsset.ts
export function publishAsset(group: SceneGroupDefinition, asset: SceneAsset): Promise<void>;
// = writeJsonAtomic(manifest, current => nextManifest(current, group, asset)) then
//   writeJsonAtomic(registry, current => upsertGroup(current ?? { formatVersion: 1, groups: [] }, { id, name, manifestUrl }))
```

Both bakes call these and lose their private copies. Behaviour is byte-identical — `tests/tools/scene-recon/bakeSplats.test.ts` must stay green untouched.

- [x] Test `publishAsset upserts the asset into the group manifest and the group into scenes.json` — tmpdir cwd (the `bakeSplats.test.ts` `forks`-pool pattern), a hand-built `pointCloud` asset, assert both files parse and carry it; call twice with a changed `label` and assert one asset, one group.
- [x] Implement; rewire both bakes.
- [x] `npx vitest run tests/tools/scene-recon`; `npm run typecheck`; `npm run format`; commit as `refactor(scene-recon): publishAsset + geo3dLayout — one manifest/registry write path`.

### Task 8: `groupPhotoPoses` (prep P4)

**Branch:** `scene-workbench-bake-prep` (after task 7)

**Files:**

- Create: `tools/scene-recon/poses/groupPhotoPoses.ts`
- Modify: `tools/scene-recon/bakeSplats.ts` (the `readStacItems` + `topocentricPositionsM` + `frameWindow` + `photoPoseFromStacItem` + `assertJpegMatchesWindow` block moves out)

**Interfaces (spec §3 P4, verbatim):**

```ts
export function groupPhotoPoses(
  group: SceneGroupDefinition,
  deps: { readonly runCct: CctRunner },
): Promise<{
  readonly poses: readonly PhotoPose[]; // imageUrl already folded into harvestDir
  readonly items: readonly SkraafotoStacItem[]; // the ones that produced a pose, same order
  readonly harvestDir: string;
}>;
```

Errors keep their current messages (no harvest → the `fetch-skraafoto --group` hint; no frame sees the bounds; a JPEG whose size no longer matches its window). `bakeSplats` keeps its `reusePly` branch exactly (poses are only derived when training).

**No new unit test** — the block is moved, not changed; `bakeSplats.test.ts` (which exercises the staged `images/`, the frame filter and the JPEG check through `bakeSplats`) is the regression net and must stay green untouched.

- [x] Move the block; rewire `bakeSplats`.
- [x] `npx vitest run tests/tools/scene-recon`; `npm run typecheck`; `npm run format`; commit as `refactor(scene-recon): groupPhotoPoses — pose derivation out of bakeSplats`.

### Task 9: `bakeMesh` orchestration + npm script

**Branch:** `scene-workbench-mesh-bake` (base: `scene-workbench-bake-prep` after task 8; task 3's commit cherry-picked on top)

**Files:**

- Create: `tools/scene-recon/bakeMesh.ts`, `tools/scene-recon/pack/meshGlbGeometry.ts` (the reader half `readMeshGlb` and the bake share)
- Modify: `package.json` (`"bake-mesh": "tsx tools/scene-recon/bakeMesh.ts"`, beside `bake-splats`), `tools/scene-recon/splats/writeColmapModel.ts` (opt-in `observations`), `tools/scene-workbench/src/scene/readMeshGlb.ts`
- Test: `tests/tools/scene-recon/bakeMesh.test.ts`, `tests/tools/scene-recon/splats/writeColmapModel.test.ts`

**Interfaces (spec §6.2, verbatim):**

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

Stages, in order, cwd-relative to `workDir = join(harvestDir, 'mvs-<group.id>')` (spec §5 layout, §6.2 steps — the argv lists are the contract):

1. Preconditions: `points.bin` exists (`bakeSplats`'s message); both version probes.
2. `groupPhotoPoses` → `writeColmapModel({ poses, pointsBinPath, pointSampleTarget: 200_000, outDir: 'sparse-in', observations: true })` — the LiDAR cloud projected into every camera is the sparse model; COLMAP never matches (spec §10 #2).
3. Staging transcode: every `sparse-in/images/*.jpg` that sharp reports as not 3-channel sRGB is re-written in place by `gdal_translate --config GDAL_JPEG_TO_RGB NO --config GDAL_PAM_ENABLED NO -b 1 -b 2 -b 3 -of JPEG -co QUALITY=95` — the 2025 nadir frames' four components are raw bands libjpeg tags CMYK, and converting them as CMYK (what sharp does) muddies the frame.
4. `runColmap` ×1: `['image_undistorter', '--image_path', 'sparse-in/images', '--input_path', 'sparse-in', '--output_path', 'dense', '--output_type', 'COLMAP']`.
5. `runOpenMvs`: `('InterfaceCOLMAP', ['-i', 'dense', '-o', 'scene.mvs', '--image-folder', 'images'])`; `('DensifyPointCloud', ['scene.mvs', '--resolution-level', '0', '--number-views', '0', '--remove-dmaps', '1'])`, preceded by deleting every `*.dmap` in the workdir (OpenMVS reuses depth-map caches by image index); `('ReconstructMesh', ['scene_dense.mvs'])` → `scene_dense_mesh.ply`; `('RefineMesh', ['scene_dense.mvs', '--mesh-file', 'scene_dense_mesh.ply', '--resolution-level', '1', '-o', 'scene_dense_mesh_refine.ply'])`; `('TextureMesh', ['scene_dense.mvs', '--mesh-file', 'scene_dense_mesh_refine.ply', '--export-type', 'glb', '--max-texture-size', '8192', '--global-seam-leveling', '0', '--local-seam-leveling', '0', '--empty-color', '4210752', '-o', 'scene_dense_texture.glb'])` (seam levelling clips patch interiors to RGB-cube corners on this scene; `--empty-color` 0x404040 keeps uncovered faces from OpenMVS's default orange) → that GLB plus its sidecar `scene_dense_texture_0.png`. Both `-o` are pinned: v2.4.0 names an output after its _input's_ stem.
6. Re-pack: `meshGlbGeometry` over a `NodeIO` document (only NodeIO resolves the sidecar URI; it refuses > 1 primitive/texture) → `sharp(image.bytes).jpeg({ quality: 90 }).toBuffer()` (resize to 8192 longest edge only if larger) → `packMeshGlb` → `groupAssetDir(group.id, 'mesh')/mesh.glb`. `--reuse-glb` starts here from the existing `scene_dense_texture.glb`, carrying the manifest's stored `colmap`/`openmvs` stamps forward (the `manifestBrushVersion` idiom, `bakeSplats.ts`).
7. `publishAsset(group, asset)`: `id: 'mesh'`, label `${group.name} — skråfoto MVS mesh`, identity transform, provenance `{ source: 'nationalGeodataApi', sourceVintage: items[0].properties.datetime.slice(0,10), pipeline: [{ step: 'fetchSkraafoto', version: group.skraafoto.collection }, { step: 'colmap', version }, { step: 'openmvs', version }] }`, `triangleCount = indices.length / 3`, `artifactUrl = assetArtifactUrl(group.id, 'mesh', 'mesh.glb')`.

Every stage `rm -f`s its own output before running (the `bakeSplats.ts` `rm(plyPath)` idiom). `main()` wires `spawnCct` (#685), a `spawn('colmap', args, { cwd: workDir })` runner, a `spawn(tool, args, { cwd: workDir })` runner with `PATH` untouched (the README says where OpenMVS installs), and the two version probes (`colmap -h` first line, `DensifyPointCloud -h` banner) with install hints quoting spec §6.1. Flags: `--group` via `sceneGroupFromArgv`, `--full-res`, `--refine`, `--reuse-glb`.

- [x] Test `bakeMesh runs the COLMAP and OpenMVS stages in order with the pinned flags` — stubbed runners recording `(tool, args)`; fake `runOpenMvs` writes, under the `-o` it was given, a `packMeshGlb`-built GLB whose atlas is an **external** `scene_dense_texture_0.png` (so the re-pack's URI resolution is exercised); assert the exact argv sequence above, level `1`, no `RefineMesh`.
- [x] Test `runs the COLMAP and OpenMVS stages in order with the pinned flags` — the one argv-sequence assertion covers the level-0 densify, the `RefineMesh` stage and `TextureMesh` reading the refined ply.
- [x] Test `re-reads the staged four-band frames band-wise and leaves the rest alone` — one four-band and one three-band harvest JPEG built with `sharp`; assert the `gdal_translate` argv for the four-band frame only, that its staged copy holds the tool's output, and that the three-band copy's bytes are untouched.
- [x] Test `--reuse-glb runs no runner and keeps the manifest's version stamps` — pre-seed the workdir GLB + sidecar and a manifest with `openmvs: 'x.y.z'`; assert zero runner calls and the published pipeline still says `x.y.z`.
- [x] Test `a two-texture OpenMVS export fails the bake naming --max-texture-size` — the fake writes a two-material GLB; assert rejection message.
- [x] Test `the published asset's triangleCount matches the exported geometry` — 12-triangle fake → `triangleCount === 12`, `artifactUrl === 'geo3d/groups/<id>/assets/mesh/mesh.glb'`, `mesh.glb` exists and `readMeshGlb` reads it back with `image.mimeType === 'image/jpeg'`.
- [x] Implement `bakeMesh.ts` + the script.
- [x] `npx vitest run tests/tools/scene-recon`; `npm run typecheck`; `npm run format`; commit as `feat(scene-recon): bakeMesh — LiDAR-seeded sparse model, OpenMVS without COLMAP matching`.

### Task 10 (OPERATOR): toolchain record, first crop-group bake, visual check

**Branch:** `scene-workbench-mesh-bake` (README commit) — no other code changes.

- [x] Confirm `colmap -h` and `DensifyPointCloud -h` run; record both versions and the exact build recipe (spec §6.1 plus whatever the build log needed — nanoflann, VCG clone, `opencv@4`, the `out/` build dir) in a "Reconstruction toolchain" section of `tools/scene-workbench/README.md`, with the PATH line.
- [x] Confirm #685's crop harvest is complete (`data/raw/skraafoto/skraafotos2025/soendermarken-crop/` — ~100 `.json`/`.jpg` pairs, the fetcher's own `ok/total` line) and the crop group's `points.bin` exists (`npm run bake-lidar -- --group soendermarken-crop` if not — minutes).
- [x] `npm run bake-mesh -- --group soendermarken-crop`. Record wall-clock per stage, `triangleCount`, texture size, and `mesh.glb` size in the README (spec §6.3's estimates are replaced by measurements). Nothing matches features any more, so a thin or holed mesh is a densify/seed question — report, don't improvise.
- [x] Open the workbench on a free port (never kill a running `:5600`), select `soendermarken-crop`. Named observable behaviours, attested by the user:
  - The mesh lands on the LiDAR cloud — same ground, same facades — not on its side (spec §10 #1).
  - Textured, unlit: the atlas reads as the photos, no shading gradient.
  - Toggling the mesh layer in `LayerList` removes/restores it; LiDAR and splats unaffected; splats behind mesh surfaces are clipped by its depth.
  - No console GPU validation errors.
- [x] Commit the README as `docs(scene-workbench): reconstruction toolchain + first mesh bake record`.

### Task 11: wrap-up

- [x] Executor: deletion audit over all four branches' diffs (`deletion-audit` skill), findings applied per `leanness.md`; `comment-audit` over touched code files.
- [x] Executor: `/feature-done` on the bake branch once the other three PRs are merged; ledger archived per `sdd-execution.md` Rule 3; plan + spec moved to `completed/` (spec stays until plan 3b ships — note that in the move commit).

## Definition of Done

**Deliverable inventory**

- Prep A: `@types/AssetLoader.d.ts` (async), `src/render/sceneRenderers.ts` + test, the two async loaders, the rewired saga and `Viewport`.
- Feature (#686): `package.json` devDependency, `tools/scene-recon/pack/packMeshGlb.ts`, `tools/scene-workbench/src/scene/readMeshGlb.ts`, `@types/TexturedMeshAsset.d.ts`, grown `SceneAsset.d.ts`/`renderResources.ts`/`assetLoaders.ts`/`assetCount.ts`/`sceneRenderers.ts`, `src/render/{uploadTexturedMesh,texturedMeshRenderer}.ts`, `shaders/texturedMesh.wesl`, `src/scene/loaders/loadTexturedMesh.ts`, the probe scene + probe script changes, their tests.
- Prep B: `tools/scene-recon/manifest/{geo3dLayout,publishAsset}.ts` + test, `poses/groupPhotoPoses.ts`, both bakes rewired.
- Bake: `tools/scene-recon/bakeMesh.ts` + test, `bake-mesh` npm script, README toolchain + bake record.
- On disk (gitignored): `data/raw/skraafoto/skraafotos2025/soendermarken-crop/mvs-soendermarken-crop/`, `public/data/geo3d/groups/soendermarken-crop/assets/mesh/mesh.glb`, a manifest with a `mesh` asset.

**Named observable behaviours** — task 10's list, attested by the user on the crop group.

**Gates** — `npm run typecheck` + full `npm test` green on every branch; `npm run scene-workbench:probe` exits 0 with three assets; deletion-audit findings applied; `/feature-done` run.

**Deferral boundary** — plan 3b (poses: `CameraPoseSetAsset`, `poses.json`, `bakePoses`, `poseOverlayRenderer`, the pick, the `poses` slice/panel); `AssetXform`/`quatToMat3`/any transform application; the nudge API; any DisplayPanel section for the mesh; decimation knobs beyond `--full-res`/`--refine`.

---

## Self-review

**Spec coverage:** §3 P1→T1, P2→T2, P3→T7, P4→T8; §4→T5 (+T4 for the GPU union); §5→T3 (subset), T9 (layout); §6.1→T10; §6.2–6.4→T9; §7.1→T3; §7.2→T4/T5; §7.3→T4; §7.4→T2/T4; §7.5→T6; §9→distributed; §10→T10; §11→carried in the contracts. §8 is plan 3b by design.

**Placeholders:** none; two "implementer's call" points (box vertex count in T6, the refine output stem in T9) name the decision and where to record it.

**Type consistency:** `TexturedMeshGeometry` (T3) is what `uploadTexturedMesh` (T4), `loadTexturedMesh` (T5), `syntheticProbeScene` (T6) and `bakeMesh` (T9) all consume; `MeshGpuAsset` (T4) is what `loadTexturedMesh` returns; `TexturedMeshAsset` (T5) is what `bakeMesh` returns; `SCENE_DRAW_ORDER` grows in T4 exactly where T2 said it would.

**Author's calls, flagged:** four branches instead of the brief's "branch + draft PR" — the user's prep-as-separate-PR ruling plus the #685 dependency force it; task 3 is cherry-picked onto the bake branch rather than duplicated; `packMeshGlb` is `async` (gltf-transform's writer is) where plan 2's packers were sync.
