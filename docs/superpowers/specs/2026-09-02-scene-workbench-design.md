# Scene Workbench (real-3D asset lab) — design

**Status:** Draft (2026-09-02), awaiting plan

**Decisions:** every choice below is settled in
[`docs/grill-sessions/scene-workbench-2026-09-02.md`](../../grill-sessions/scene-workbench-2026-09-02.md)
(Q1–Q11 plus the refactor-ground checkpoint addendum). Q-numbers are cited where the
reasoning matters. §12 lists the decisions this spec had to make on its own.

**Companion:**
[`docs/research/2026-08-20-powers-of-ten-to-the-eye.md`](../../research/2026-08-20-powers-of-ten-to-the-eye.md)
— the data survey for the ladder this tool serves, including the licence findings,
the Mac/CUDA constraint, and the rejected alternatives (Google Photorealistic 3D
Tiles, RealityScan).

## 1. Purpose

`tools/scene-workbench` is a standalone WebGPU dev tool for **building and judging
real-3D reconstructions of one place** — the asset lab for every rung of the
powers-of-ten ladder below the Earth tile pyramid.

The ladder (research doc §"The ladder") bottoms out today at z19, the GeoDanmark
10 cm ortho band over Søndermarken — still a texture on a heightfield. Below it the
data stops being a raster: rung 1–2 is Danish open geodata as a point cloud and a
surface, rungs 3–6 are photogrammetric captures ending at a person's iris (the Eames
_Powers of Ten_ picnic homage). The research doc calls rungs 3–6 "one georeferenced
local asset stack — the renderer's first non-point, non-quad, non-tile primitive".
This tool is where that stack gets built, compared, and corrected before any of it
reaches the app.

Its identity is **comparison**: three reconstructions of the same subject — LiDAR
points, Gaussian splats, MVS textured mesh — in one viewer, in one metre frame, with
a camera-pose overlay to diagnose the reprojection when one of them comes out skewed
(Q9). That is the question the tool exists to answer and the reason it renders all
three rather than picking a winner up front.

Explicitly **not a heightfield tool**. Facades, overhangs and canopy are the point;
a displaced grid would lose exactly what distinguishes rungs 1–2 from z19.

## 2. Scope

**In scope (v1):**

- **Søndermarken group, end to end**: fetch → bake → three reconstruction layers plus
  the camera-pose overlay, on screen, in the group's local metre frame.
- **Offline recon CLIs** as thin wrappers over Mac-native open-source tools (Q1),
  in a new `tools/scene-recon/` area with fetchers in `tools/fetch/` — the
  `tools/filaments/buildFilaments.ts` DisPerSE-wrapper precedent.
- **Capture ingest CLI** (photos/video dir → ffmpeg frames → COLMAP SfM → the same
  downstream bakes), validated on a throwaway phone capture of a small object (Q5).
  The Chris path is proved before the real shoot; the code is shared with the fetched
  path.
- **Viewer**: one group at a time, layer toggles with per-asset counts, camera-pose
  frusta with click-to-project-the-photo and an opacity slider, and nudge controls
  that persist an asset's transform through a dev-server endpoint.
- **Tool-local metre-native orbit rig** composed from the existing pure camera math
  in `src/utils/camera/` (Q10).

**Architected for (not built now):** groups anchored somewhere other than Earth's
surface. `GroupAnchor` is a discriminated union whose v1 has exactly one member
(§4); a `scene` variant carrying a position in skymap's universe frame — a Hubble or
Voyager model — is the named future member. Adding it is a union case and a basis
function, no restructuring (Q3–Q4).

**Non-goals:**

- **No heightfield mode.** Not a scope cut — an anti-goal, per §1.
- **No in-tool training.** Splat training and MVS densification run offline as CLI
  steps. In-tool training was rejected at brainstorm time as a much larger build
  before first pixels.
- **No deploy target.** No `toolPages` entry, no `:build` script, no `/scene/`
  subpath. Local-only until it earns otherwise (Q11) — the famous-curator precedent.
  Its data is gitignored and would have to be R2-synced to be servable anyway.
- **No bbox picker.** Groups come from a registry file (Q2); drawing an AOI on a map
  is a UI subsystem the tool does not need to answer its question.
- **No `scene` anchor variant.** Named above, not implemented; no orbit machinery.
- **No GPU radix sort.** Splat depth sorting is a throttled CPU sort in v1 (Q8);
  popping during an orbit is accepted. The GPU sort lands only if that annoys.
- **No R2 sync and no data-manifest entry.** Baked artifacts stay local. Promoting a
  group to a shipped asset is a later, separate job (the MCPM "promote later, maybe
  never" model).
- **No mobile, touch, or non-Chromium support.** A maintainer instrument.

## 3. Ground preparation

Produced by `refactor-ground` after the grill session converged; the checkpoint is
recorded in the transcript's addendum and signed off by the user.

**Joint verdicts — growth, no change needed:**

| Touchpoint                          | Verdict                                                                                                                                                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/utils/camera/*` orbit math     | **growth** — `yawPitchToDir`, `updatePosition`, `zoomedDistance`, `orbitRadPerPixel`, `frameUp`, `imagePlaneBasis` are unit-agnostic pure functions; a metre-scale rig composes them unchanged |
| WESL per-tool root                  | **growth** — `tools/galaxy-renderer/wesl.toml` establishes the own-root pattern; this tool shares no shaders, so it needs the root without the symlink apparatus                               |
| `tools/utils/io/rawDataRegistry.ts` | **growth** — three new rows, same `RawDataEntry` shape                                                                                                                                         |
| vite / tsconfig wiring              | **growth** — `tsconfig.tools.json` already covers all of `tools/`; a new config is a new file, not a change to an old one                                                                      |
| `initGpu`                           | **growth** — already takes an options parameter (the MCPM workbench's P1); this tool passes none                                                                                               |

**The one bolt-on:** the dev-API plugin. Written naively it would copy
`tools/famous-curator/plugin/apiPlugin.ts`'s hand-rolled `readJsonBody` /
`readBinaryBody` / error→status cascade — the second special case of plumbing that
was never generic in the first place. Two prep diffs, **both already approved by the
user**, land before the feature; this spec is written against the post-prep
architecture.

### P1 — extract the dev-API HTTP plumbing (separate prep PR)

`readJsonBody` and `readBinaryBody` are defined inline in `apiPlugin.ts`
(`tools/famous-curator/plugin/apiPlugin.ts`, the two promise-wrapping collectors
immediately after `resolveRepoRoot`), alongside `sendJson` and the
`catch`-block's error→status mapping. All four are generic Node `http` plumbing with
nothing curator-specific in them.

They move to one-symbol-per-file modules under a new `tools/utils/http/`:

```ts
// tools/utils/http/readJsonBody.ts
export function readJsonBody(req: IncomingMessage): Promise<unknown>;
// tools/utils/http/readBinaryBody.ts
export function readBinaryBody(req: IncomingMessage): Promise<Buffer>;
// tools/utils/http/sendJson.ts
export function sendJson(res: ServerResponse, status: number, body: unknown): void;
```

The error→status mapping moves as a **table**, not a cascade of regexes:

```ts
// tools/utils/http/statusForError.ts
/** Ordered rules; first match wins. `undefined` → the caller's own 500 default. */
export function statusForError(err: unknown, rules: readonly ErrorStatusRule[]): number | undefined;
```

The curator keeps its own rule list (its `UnknownHostError` / `UnscrapeableError` /
`UpstreamError` classes and its `/50 MB/` size-cap match are curator policy, not
plumbing) and re-imports the four helpers. Behaviour-preserving: the existing
`apiPlugin.routing.test.ts` is the regression gate, plus a focused test per extracted
helper.

**Packaging: its own PR**, sequenced before the feature — user ruling. It touches a
shipped tool and has independent value.

### P2 — centralize the dev-port registry (separate cleanup diff)

The dev-port allocation is documented as a **comment** in five Vite configs, each
with a different subset of the truth:

- `vite.config.ts:15,69` — 5173, mentioned in an unrelated LAN-HTTPS note
- `tools/famous-curator/vite.config.ts:6-8` — 5200, "deliberately well away from 5173"
- `tools/flow-workbench/vite.config.ts:8-9` — 5300, names 5173 and 5200
- `tools/galaxy-renderer/vite.config.ts:2-3` — 5400, names nothing else
- `tools/mcpm-workbench/vite.config.ts:5-7` — 5500, the fullest list, and already
  stale the moment a sixth tool exists

Six configs would make it six restatements. One authoritative table replaces them:

```ts
// tools/utils/io/devPorts.ts
export const devPorts = {
  app: 5173,
  famousCurator: 5200,
  flowWorkbench: 5300,
  galaxyRenderer: 5400,
  mcpmWorkbench: 5500,
  sceneWorkbench: 5600,
} as const;
```

Each config imports it (`server: { port: devPorts.flowWorkbench }`) and drops its
port paragraph. This is an adjacent finding the user promoted to work; it is a **tiny
cleanup diff of its own**, not part of either PR above.

## 4. Data model

Tool-local types under `tools/scene-workbench/@types/`, one type per file, `type`
aliases only. `Vec3` and `Vec4` come from `src/@types/math/`; a quaternion is a
`Vec4` in `[x, y, z, w]` order (§12).

### Groups — the placeable container

A **group** owns a local right-handed metre frame and an anchor that maps it to the
world. Assets live inside a group and carry only a transform within its frame. This
is what makes "three reconstructions of one spot" expressible without any of them
carrying georeferencing duty (Q3–Q4).

```ts
export type GroupAnchor = {
  readonly kind: 'geodetic';
  /** WGS84. */
  readonly latDeg: number;
  readonly lonDeg: number;
  /** Height above the DVR90 vertical datum, metres — DHM's own datum, no conversion. */
  readonly heightMDvr90: number;
  /** Rotation of the group's +X from local east, degrees CCW seen from above. */
  readonly headingDeg: number;
};
```

The union has one member on purpose: the type is written as a union so the `scene`
variant is an addition rather than a rewrite. Frame convention: **+X east, +Y north,
+Z up** at the anchor before `headingDeg` is applied — ENU, the convention every
geodata tool in the pipeline already speaks.

```ts
export type SimilarityTransform = {
  /** Metres, in the group frame. */
  readonly translationM: Vec3;
  /** Group frame ← asset frame, unit quaternion `[x, y, z, w]`. */
  readonly rotation: Vec4;
  /** Uniform. Non-uniform scale would break the covariance transport in the splat renderer. */
  readonly scale: number;
};
```

### Assets

```ts
export type AssetCommon = {
  readonly id: string;
  readonly label: string;
  readonly transform: SimilarityTransform;
  readonly provenance: AssetProvenance;
};

export type AssetProvenance = {
  readonly source: 'nationalGeodataApi' | 'userPhotoCapture';
  /** ISO date of the SOURCE material (flight date, shoot date) — not the bake date. */
  readonly sourceVintage: string;
  /** Ordered; each step names the external tool and the version that produced it. */
  readonly pipeline: readonly PipelineStep[];
};

export type PipelineStep = { readonly step: string; readonly version: string };
```

Four variants, discriminated on `kind`:

```ts
export type PointCloudAsset = AssetCommon & {
  readonly kind: 'pointCloud';
  readonly pointCount: number;
  readonly artifactUrl: string; // points.bin — §5
};

export type GaussianSplatAsset = AssetCommon & {
  readonly kind: 'gaussianSplat';
  readonly splatCount: number;
  readonly shDegree: 0 | 1;
  readonly artifactUrl: string; // splats.bin — §5
};

export type MeshAsset = AssetCommon & {
  readonly kind: 'mesh';
  readonly vertexCount: number;
  readonly artifactUrl: string; // .glb
};

export type CameraPoseSetAsset = AssetCommon & {
  readonly kind: 'cameraPoseSet';
  /** Inline in the manifest — tens to low hundreds of poses, no separate fetch. */
  readonly poses: readonly PhotoPose[];
};

export type SceneAsset = PointCloudAsset | GaussianSplatAsset | MeshAsset | CameraPoseSetAsset;
```

`PhotoPose` is one photograph's full interior + exterior orientation. Skråfoto's STAC
`pers:` metadata carries all of it; COLMAP emits the same structure for captures,
which is why one type serves both paths (Q9):

```ts
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

### Registries

```ts
export type GroupRegistryEntry = {
  readonly id: string;
  readonly name: string;
  readonly manifestUrl: string;
};

export type GroupRegistry = {
  readonly formatVersion: 1;
  readonly groups: readonly GroupRegistryEntry[];
};

export type SceneManifest = {
  readonly formatVersion: 1;
  readonly groupId: string;
  readonly groupName: string;
  readonly anchor: GroupAnchor;
  readonly assets: readonly SceneAsset[];
};
```

Both are **data files, not TypeScript** — a refactor-ground ruling that overturned
the grill-time pick (transcript addendum). The group list has to be appendable by a
CLI and lives beside gitignored data; a TS registry would put half the truth in git
and half on disk. Raw _inputs_ still get proper `rawDataRegistry.ts` rows (§6) —
those are committed provenance, and the distinction is exactly that.

Equally: **one manifest per group, no per-asset sidecars.** Binaries are separate
files already, so a metadata edit never rewrites one; sidecars would add a
reconciliation layer across tens of assets for no gain. The manifest is the single
read-modify-write target for both the bake CLIs and the nudge endpoint (§7.4).

## 5. On-disk layout

```
data/raw/
  dhm/                       LAZ 1×1 km point-cloud tiles + 0.4 m DSM/DTM GeoTIFFs
    README.md                provenance, licence, API terms, tile list  (committed)
  skraafoto/                 STAC item JSON + COG crops, per photo
    README.md                                                           (committed)
  captures/<session>/        photos/ or video/, shoot notes
    README.md                                                           (committed)

public/data/geo3d/
  scenes.json                                            GroupRegistry
  groups/<groupId>/
    manifest.json                                        SceneManifest
    assets/<assetId>/
      points.bin | splats.bin | mesh.glb | mesh_*.ktx2
      images/<poseId>.jpg                                pose-overlay photos
```

`.gitignore` already covers both trees wholesale — `/data/**` with README/checksum
re-includes (`.gitignore:93-99`) and `/public/data/` (`.gitignore:109`) — so **no new
ignore rules are needed**; the committed READMEs fall out of the existing negations.

Everything under `public/data/geo3d/` is fetched through `dataUrl()`
(`src/services/loading/fetchWithProgress.ts:29`) over the shared dev `publicDir`, the
flow-workbench / MCPM pattern.

### Packed binaries

**`points.bin`** — sibling of the galaxy `.bin` style: a small header then a flat
record array, no compression (the dev server is localhost).

| Field                     | Bytes       | Notes                                          |
| ------------------------- | ----------- | ---------------------------------------------- |
| magic `'PTS3'`            | 4           |                                                |
| `formatVersion` = 1       | u32, 4      |                                                |
| `pointCount`              | u32, 4      |                                                |
| reserved                  | 4           | keeps the record array 16-byte aligned         |
| — per record, stride 16 — |             |                                                |
| `x, y, z`                 | 3 × f32, 12 | metres, asset frame                            |
| `r, g, b`                 | 3 × u8, 3   | sampled from the GeoDanmark ortho at bake time |
| `classification`          | u8, 1       | ASPRS class from the LAZ, carried through PDAL |

**`splats.bin`** — quantized 3DGS. The header selects the stride, so a deg-0 bake and
a deg-1 bake are the same reader:

| Field                                            | Bytes       | Notes                                |
| ------------------------------------------------ | ----------- | ------------------------------------ |
| magic `'SPL3'`                                   | 4           |                                      |
| `formatVersion` = 1                              | u32, 4      |                                      |
| `splatCount`                                     | u32, 4      |                                      |
| `shDegree` (0 or 1)                              | u32, 4      | selects the record stride            |
| — per record, base 28 B —                        |             |                                      |
| `x, y, z`                                        | 3 × f32, 12 | metres, asset frame                  |
| `logScale`                                       | 3 × f16, 6  | log of the Gaussian's axis lengths   |
| `rotation`                                       | 4 × i8, 4   | unit quaternion, `[x,y,z,w]`, `/127` |
| `opacity`                                        | u8, 1       | pre-sigmoid, `/255`                  |
| `dcColor`                                        | 3 × u8, 3   | SH degree-0 term                     |
| pad                                              | 2           |                                      |
| — degree-1 block, appended when `shDegree = 1` — |             |                                      |

The degree-1 block's layout is deliberately unpinned here — see §11 open question 2.

`mesh.glb` is standard glTF-binary; the browser parses only the subset the bake emits
(one buffer, one image, indexed triangles, `POSITION`/`NORMAL`/`TEXCOORD_0`). Being
externally inspectable in any glTF viewer is half the point of choosing it (Q7).

## 6. Offline pipeline

Mac-native, no CUDA (Q1). Each step is a thin `tsx` wrapper that shells out to an
installed binary, checks its version into `provenance.pipeline`, and writes into the
layout above. Missing binaries fail with an install hint, the DisPerSE-wrapper
convention (`tools/filaments/buildFilaments.ts`).

### Fetchers — `tools/fetch/`

| Script              | Source                                    | Notes                                                                                                                                        |
| ------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `fetchDhm.ts`       | Datafordeler **REST/Fildownload**, apikey | LAZ 1×1 km tiles + 0.4 m DSM/DTM GeoTIFF. Resume cache keyed by tile name.                                                                   |
| `fetchSkraafoto.ts` | Dataforsyningen **STAC API**, 24 h token  | Item search by bbox; COG **range-request crops**, not whole frames. Stores the STAC item JSON beside each crop — `pers:` is the pose source. |

Avoid WCS and WMTS on both platforms: WCS retires end-2026, the legacy WMTS
2027-01-15 (research doc, "Datafordeler transition"). The apikey REST/STAC endpoints
are the modernized ones.

**User-side prerequisite to flag in the README and the tool's empty state:** a
Datafordeler account and API key. Heavier onboarding than Dataforsyningen's
self-service 24 h skråfoto token, and the one thing that can block a fresh checkout
from running the Søndermarken bake.

### Registry rows — `tools/utils/io/rawDataRegistry.ts`

Three directory entries, `source: 'gitignored'`, each pointing at its committed
README, following `'geodanmark.dir'` (`rawDataRegistry.ts:939-955`) and
`'mcpm-workbench.dir'` (`:296-311`):

- `'dhm.dir'` → `data/raw/dhm`, `fetcher: 'tools/fetch/fetchDhm.ts'`
- `'skraafoto.dir'` → `data/raw/skraafoto`, `fetcher: 'tools/fetch/fetchSkraafoto.ts'`
- `'captures.dir'` → `data/raw/captures` — **no `fetcher` field**; the operator drops
  material here, exactly as `'mcpm-workbench.dir'` describes for browser exports

Plus the three `*.readme` file rows the `readme:` back-references point at.

### Bake CLIs — `tools/scene-recon/`

| Script             | Wraps                                                                                                                                          | Produces                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `bakeLidar.ts`     | **PDAL** — crop to the group bounds, classification filter, `colorization` against the GeoDanmark ortho                                        | `points.bin`                                                |
| `ingestCapture.ts` | **ffmpeg** (video → frames) then **COLMAP** SfM                                                                                                | a sparse model + undistorted frames in a session workdir    |
| `bakeMesh.ts`      | **COLMAP** (poses _injected_ from skråfoto `pers:` for fetched data; full SfM for captures) → **OpenMVS** densify → reconstruct → texture, CPU | `mesh.glb`                                                  |
| `bakeSplats.ts`    | **Brush** (Apache-2.0, wgpu/WGSL, trains natively on Mac) → 3DGS `.ply` → pack                                                                 | `splats.bin`                                                |
| `bakePoses.ts`     | STAC `pers:` or COLMAP output → group frame                                                                                                    | the `cameraPoseSet` asset, written inline into the manifest |

Each writes its asset entry into the group manifest by read-modify-write (§7.4's
rule applies to CLIs too). **OpenSplat with the Metal backend is the noted fallback
trainer** if Brush's Mac path disappoints; it changes only `bakeSplats.ts`'s
subprocess and its `.ply` reader, because the packed format is ours.

The capture path shares `bakeMesh.ts` and `bakeSplats.ts` unchanged — the only
divergence is whether COLMAP solves poses or is handed them. That shared downstream is
why capture ingest is in v1 rather than deferred (Q5).

## 7. Viewer architecture

`tools/scene-workbench/src/`, laid out like `tools/mcpm-workbench/src/`: `render/`,
`scene/`, `input/`, `state/<domain>/`, `store/`, `ui/`, `@types/`.

### 7.1 State — RTK + redux-saga

Mirrors `tools/mcpm-workbench`'s structure as rewritten by
`docs/superpowers/plans/completed/2026-09-01-mcpm-workbench-sagas.md` — "mechanism A":
real RTK + `redux-saga`, chosen over custom-store watchers for idiom parity with
`src/state`. Both tools stay structurally consistent — the user's explicit ask (Q6).
`react-redux` is fine here; `src/state`'s no-react-redux ESLint rule does not cover
`tools/`.

> That rewrite is on `main` as PR #651 (`aa62736d7`). Every `tools/mcpm-workbench/src/{state,store}`
> citation below describes that post-#651 tree, not the hand-rolled store it replaced.

`store/` — seven files, mirroring the MCPM tool's `store/`, itself modelled on
`src/store/`:

| File                       | Contract                                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| `createSceneStore.ts`      | `configureStore` + saga middleware; returns **`{ store, registerSagaContext }`**, not a bare store |
| `rootReducer.ts`           | `combineReducers({ registry, group, view, poses, edit })`                                          |
| `rootSaga.ts`              | `all([...])` over the five watchers                                                                |
| `sagaContext.ts`           | `type SceneSagaContext = { canvas: HTMLCanvasElement; resources: RenderResources }`                |
| `sagaContextRegistered.ts` | one `createAction`, in its own file to break the `createSceneStore → rootSaga → watchers` cycle    |
| `hooks.ts`                 | `useAppSelector` / `useAppDispatch` / `useAppStore`                                                |
| `types.ts`                 | all four types _derived_ from the above, never hand-authored                                       |

`react-redux` is imported in exactly two places: `hooks.ts` and `App.tsx`'s
`<Provider>` — the same carve-out `src/main.tsx:48` takes.

Slices live in **per-domain folders beside their sagas** (`state/group/groupSlice.ts`

- `state/group/watchGroupSaga.ts`), not a `state/slices/` bag. That is where the MCPM
  rewrite ended up after a user directive, and adopting it deliberately keeps the two
  tools navigable by the same reflex.

| Slice      | Owns                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------ |
| `registry` | `GroupRegistry` contents, selected `groupId`, load status/error                                        |
| `group`    | loaded `SceneManifest`, per-asset load status + resolved counts, error message                         |
| `view`     | per-asset visibility, orbit camera (yaw/pitch/distance/`targetM`), splat sort epoch, fps, `deviceLost` |
| `poses`    | selected `poseId`, projected-image opacity, frustum draw scale                                         |
| `edit`     | draft `SimilarityTransform` per `assetId`, dirty flag, save status                                     |

Plus `state/commands.ts`: bare `createAction` one-shots (`saveTransformRequested`,
`reloadRegistryRequested`) — commands as actions, never as monotonic token counters
in state.

**Five watcher sagas:**

| Saga                 | Effect                                                              | Job                                                                                                 |
| -------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `watchRegistrySaga`  | `takeLatest` on `sagaContextRegistered` + `reloadRegistryRequested` | fetch `scenes.json`                                                                                 |
| `watchGroupSaga`     | `takeLatest` on `groupSelected`                                     | dispose the current scene, fetch the manifest, then fetch/parse/upload each asset; cancel-on-switch |
| `watchPoseImageSaga` | `takeLatest` on `poseSelected`                                      | fetch the photo, upload the texture, dispose the previous one                                       |
| `watchSplatSortSaga` | `takeLatest` on camera actions + `delay(CAMERA_REST_MS)`            | CPU depth sort off the render path, then write the new index buffer                                 |
| `watchTransformSaga` | `takeLeading` on `saveTransformRequested`                           | `PATCH` the transform endpoint; an in-flight save ignores repeats                                   |

**The rule for what earns a saga**, carried over from the MCPM plan: rAF-cadence-coupled
work stays in the frame driver; anything triggered by a _state change or a command_,
especially anything with an `await`, becomes a saga. Each watcher above replaces a
hand-rolled concurrency guard — `takeLatest` a generation counter, `takeLeading` an
in-flight boolean, saga cancellation a `disposed` flag.

**Imperative resources never enter the store.** `RenderResources` — `{ gpu,
renderers, gpuAssets, poseTexture, epoch }` — is a mutable bag created by `Viewport`,
handed to the sagas via `sagaMiddleware.setContext`, and read by the frame driver by
reference. `epoch` increments on every dispose and is the staleness token.

> **Landmine, learned the expensive way in the MCPM rewrite:** an `epoch` check placed
> _after_ a `yield*` is dead code on cancellation — redux-saga sets `effectSettled`
> on cancel and never re-drives the generator. The working pattern is a
> continuation-side dispose from inside the promise's own `.then()`, driven by an
> `aborted` flag set in a `finally` via `yield* cancelled()`, plus the epoch compare.
> See `tools/mcpm-workbench/src/state/scene/acceptBuiltHarness.ts`; `watchGroupSaga`
> needs the same shape for every asset upload it can be cancelled mid-flight.

The frame driver reads `store.getState()` once per tick and takes one
`store.subscribe` for epoch/dirty bookkeeping. React components use
`useAppSelector`; the GPU loop never does.

### 7.2 Renderers

Tool-local WESL under `src/render/shaders/`, with the tool's own `wesl.toml` and its
own root — the galaxy-renderer pattern **without the symlinks**, because this tool
shares no shaders with the app. `initGpu` comes from `src/services/gpu/device`, as
the sibling tools do; no options are needed.

- **`lidarPointRenderer`** — instanced point splats over `points.bin`. The simplest
  of the three and the first one on screen.
- **`splatRenderer`** — instanced quads, one per Gaussian; 3D covariance transported
  by the asset transform and the view matrix, then projected to a 2D screen-space
  covariance for the quad extent and the falloff. The covariance-projection maths is
  cribbed from **Brush's Apache-2.0 WGSL kernels** — same substrate, compatible
  licence, and the trainer that produced the data (Q8).
  **Sorting v0 is a CPU sort**, run by `watchSplatSortSaga` when the camera comes to
  rest: 1–2 M splats sort in tens of milliseconds off the render path. Correct pixels
  when still, popping mid-orbit, accepted. This is skymap's first alpha-blended splat
  pass — the galaxy point renderer is additive and never needed an order.
- **`meshRenderer`** — a small `.glb` subset parser (§5) plus a textured triangle pass.
- **`poseOverlayRenderer`** — line-list frusta built from each `PhotoPose`'s intrinsics,
  plus one textured quad at the selected pose's image plane with an opacity uniform.
  Cheap, and the diagnostic the whole overlay exists for: a mesh that is subtly skewed
  shows it instantly as a photo that will not lie down on its own geometry (Q9).

Non-uniform asset scale is excluded by `SimilarityTransform` precisely because it
would make the splat covariance transport non-orthogonal.

### 7.3 Camera

A tool-local metre-native orbit rig — orbit, dolly, pan — composed from the existing
pure functions in `src/utils/camera/`: `yawPitchToDir`, `updatePosition`,
`zoomedDistance`, `orbitRadPerPixel`, `frameUp`, `imagePlaneBasis`. All six are
unit-agnostic; the app's Mpc scale lives in its callers, not in them (Q10, verified at
the ground checkpoint).

**Do not import `clampDistance`.** `src/utils/camera/clampDistance.ts` bakes Mpc
constants into the module (`MIN_DISTANCE_MPC = 1e-17`, and a surface-standoff policy
in radii sized for EOX imagery). The tool defines its own metre-scale clamp. This is
the one non-reusable file in that folder and the reason the rig is composed rather
than reused wholesale.

Input binding is thin and local (`createSceneInput`, the
`tools/mcpm-workbench/src/input/createViewportInput.ts` shape). Per the user's rider
on Q10: **any new pure orbit maths goes into one-symbol `src/utils/camera/` files with
its own test**, so the next tool inherits it rather than re-deriving it.

### 7.4 Dev API

A `configureServer` plugin at `tools/scene-workbench/plugin/apiPlugin.ts`, the
famous-curator shape: intercept `/api/*` in a Connect middleware, dispatch to route
files under `plugin/routes/`, let everything else fall through to Vite. Body parsing
and the error→status table come from `tools/utils/http/` (P1).

| Route                                                  | Job                                                                                                        |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `GET /api/health`                                      | liveness                                                                                                   |
| `PATCH /api/groups/:groupId/assets/:assetId/transform` | body = `SimilarityTransform`; read-modify-write the group manifest; responds with the updated `SceneAsset` |

One mutating route in v1. Everything else the viewer needs is a static file under the
shared `publicDir`.

**The manifest write rule** — one sentence, and it binds the CLIs equally: _always
re-read the manifest from disk immediately before writing, and write through a
temp-file + `rename`._ The dev server and a bake CLI can be running at the same time,
and the manifest is the single shared mutable file in the design. An endpoint that
cached a parsed manifest in memory would silently clobber a bake that appended an
asset while the browser was open.

### 7.5 UI

Panels in CSS modules composing shared vocabulary from
`src/components/common/shared.module.css`; `src/styles/global.css` imported once in
`main.tsx`, as the sibling tools do.

- **Group picker** — the `scenes.json` list.
- **Layer list** — one row per asset: visibility toggle, kind badge, and its count
  (`pointCount` / `splatCount` / `vertexCount` / pose count). The counts are how you
  tell at a glance that a bake produced a tenth of what it should have.
- **Pose panel** — pose list, selected pose's image opacity slider, frustum scale.
- **Nudge panel** — translation / rotation / scale for the selected asset, editing the
  `edit` slice's draft, with an explicit Save that dispatches
  `saveTransformRequested`. Draft-then-save rather than write-per-drag: a drag is
  dozens of manifest rewrites otherwise.
- **Empty state** — when `scenes.json` is absent, name the Datafordeler API-key
  prerequisite and the fetch/bake command sequence.

## 8. Build wiring

```jsonc
"scene-workbench": "vite --config tools/scene-workbench/vite.config.ts",
"scene-workbench:probe": "tsx tools/scene-workbench/probeGpuErrors.ts"
```

- `vite.config.ts`: own `root`, `publicDir: ../../public`, `envDir` at the repo root
  (without it `dataUrl()` silently falls back to same-origin `/data/`),
  `server: { port: devPorts.sceneWorkbench }` (P2), `@vitejs/plugin-react`, the
  `apiPlugin`, and `restartOnPluginChange()` ahead of it — the curator's ordering, so
  the watcher registers before any plugin file is imported.
- **No `base`, no `build.outDir`, no `toolPages` entry, no `:build` script.** Local-only
  (Q11). The curator is the precedent for a tool with none of those.
- `viteWesl({ extensions: [staticBuildExtension], weslToml: resolve(import.meta.dirname,
'wesl.toml') })`. The explicit `weslToml` is **load-bearing, not stylistic**: the
  plugin otherwise reads `<process.cwd()>/wesl.toml`, and `npm run scene-workbench`
  keeps cwd at the repo root, where the runtime's toml lives — omit it and the tool
  links against the app's shader set and never finds its own `.wesl` files.
- `wesl.toml`: `root = "src/render/shaders"`, `include = ["src/render/shaders/**/*.wesl"]`.
  No symlinks and no `resolve.alias` block — the galaxy-renderer needs both only
  because it reuses the runtime's shader families, and this tool reuses none.
- `tsconfig.tools.json` already covers all of `tools/`, so `npm run typecheck` picks
  the tool up with no change.

## 9. Testing strategy

Judged by the house question (`docs/superpowers/conventions/testing.md`): will it
fail on a real bug nothing else catches?

**Vitest (pure TS, no GPU):**

- **Manifest read-modify-write** — `applyAssetTransform(manifest, assetId, transform)`:
  the named asset's transform is replaced, every sibling asset is byte-identical,
  `formatVersion` and `anchor` survive, and an unknown `assetId` throws rather than
  appending. This is the tool's one destructive operation on the only shared mutable
  file; a silent no-op or a clobbered sibling is exactly the bug that costs a re-bake.
- **Anchor → world basis** — a `geodetic` anchor with a non-zero `headingDeg` produces
  a hand-computed ENU basis, and a point at a known metre offset lands at a
  hand-computed lat/lon/height. Sign conventions here are the classic silent error.
- **Transform composition** — asset-frame point → group frame through a
  `SimilarityTransform` with all three components non-identity, and the inverse round
  trip. The nudge UI, the pose overlay and the splat covariance all depend on one
  answer.
- **STAC `pers:` → `PhotoPose`** — one real skråfoto item JSON as a fixture, converted
  to a hand-checked pose. The camera-frame axis convention (+Z forward, +Y down) is
  the flip that produces a plausible-looking, wrong overlay.
- **Packers and parsers, round trip** — `packPoints` → `parsePoints` and `packSplats`
  → `parseSplats`, with a count that is not a power of two and a per-record value
  that varies along every field, so a stride or field-order slip is visible. `shDegree`
  0 and 1 both, since the header selects the stride.
- **`.glb` subset parser** — against a fixture emitted by `bakeMesh.ts`, asserting
  vertex count, index count and the image chunk's byte range.

**GPU probe:** `npm run scene-workbench:probe`, following
`tools/galaxy-renderer/probeGpuErrors.ts` — ephemeral-port Vite server, real Chromium
first with a headless-shell fallback, `requestDevice` monkey-patched to capture
`uncapturederror` and `device.lost`, settle frames, error drain, non-zero exit. Its
step queue loads a synthetic group exercising all four renderers once. The only
automated gate that reaches the shaders, and the new splat pass is the riskiest code
in the tool.

**Deliberately not tested:** the metre-scale distance clamp (a clamp-boundary test),
the registry rows and port table (constant restatements), the CLI wrappers' subprocess
plumbing (it is `spawn` and an exit code; a mock would assert the mock), reconstruction
quality (that is what the viewer is _for_ — the judgement is the operator's), and
anything visual.

## 10. V1 scope cut

Two deliverables gate v1, in this order:

1. **Søndermarken group end to end.** `fetchDhm` + `fetchSkraafoto` → `bakeLidar`,
   `bakeMesh`, `bakeSplats`, `bakePoses` → all four layers and the pose overlay on
   screen in one group, with working nudge-and-save.
2. **Capture ingest proven.** `ingestCapture.ts` on a throwaway phone capture of a
   small object, through `bakeMesh` and `bakeSplats`, appearing as assets in a test
   group. Proves the rungs 3–6 path before anyone is asked to lie down in a park.

**Group extent.** Søndermarken's bounds come from the existing GeoDanmark deep-band
harvest, not from a new decision. `data/raw/geodanmark/README.md:36` records the
harvest bbox as W 12.51 / S 55.662 / E 12.55 / N 55.678 (3,072 tiles, 2026-08-31),
snapped at bake time to the z19 rect `x[280352..280447]`, `y[49984..50015]`
(`README.md:38-39`) — which through `geodanmarkTileSource.ts:99-107` at
`deg = 360/2^19` covers west 12.5103759765625 → east 12.55627441406250, south
55.6561279296875 → north 55.6781005859375. That is roughly 2.5 km × 1.8 km
(`README.md:41`), the band's `z14`–`z19` span fixed by `GEODANMARK_MIN_LEVEL = 14`
(`tools/textures/buildEarthTiles.ts:111`) and `GEODANMARK_MAX_LEVEL = 19`
(`geodanmarkTileSource.ts:27`), vintage `geodanmark_2025_10cm`, forår 2025
(`geodanmarkTileSource.ts:30-34`). The group's own extent is a subset of that —
see §11.

**Walking-skeleton order within deliverable 1:** LiDAR first. It is the only layer
whose bake is a single PDAL invocation, so it puts real metres on screen and validates
the anchor, the camera rig, the manifest and the loader before either of the two
expensive reconstructions is trusted with anything.

## 11. Open questions

1. **Exact Søndermarken group extent and anchor origin.** The ortho patch above is
   ~2.5 × 1.8 km; the group wants a park-scale subset centred on the picnic spot, and
   the DHM point cloud arrives in 1 × 1 km EPSG:25832 tiles that will not align with
   it. Settle at `fetchDhm` time: which tiles, what crop bounds, and the
   `latDeg`/`lonDeg`/`heightMDvr90` of the anchor. Everything downstream is a
   translation, so a wrong first guess is cheap to correct.
2. **Brush's SH block.** The degree-1 record layout in §5 is left open because it
   depends on the column order, normalization and count Brush actually writes into its
   3DGS `.ply`. Inspect one real output before pinning it; degree 0 is enough for the
   first pixels either way.
3. **LiDAR colorization vintage.** `bakeLidar` colorizes from the GeoDanmark ortho,
   and `data/raw/geodanmark/README.md:74-81` records the vintage as an open decision —
   forår 2025 at 10 cm is leafless, sommer 2008 at 12.5 cm is leafed. For a park, the
   canopy is more of the subject than it is for a flat ortho band, so this tool may
   want the opposite answer from the Earth band. Decide once, for both.

## 12. Decisions this spec made

Beyond the grill transcript, which settles Q1–Q11 and the two prep diffs:

- **`PhotoPose`, not `CameraPose`.** `CameraPose` is already a live type in `src/`
  (the camera-pivot work); reusing the name in a tool that also has an orbit camera
  would be a reading trap for no gain.
- **A quaternion is a `Vec4` in `[x, y, z, w]` order**, not a new `Quat` alias. The
  repo has no quaternion type and this tool is not enough reason to mint one; the
  component order is documented at each field.
- **The binary headers and record layouts** in §5 (magic, `formatVersion`, strides).
  The grill settled "own packed binary"; the bytes are this spec's.
- **The slice and saga inventories**, the route table, and the `state/<domain>/`
  co-location. Mirrors the MCPM tool's shipped shape; the specific five-and-five is
  this spec's.
- **The manifest write rule** (re-read before write, temp-file + rename). The grill
  settled that the manifest is the single R-M-W target; concurrency between a running
  dev server and a running bake CLI is a consequence nobody had named.
- **The GPU probe.** Not discussed in the grill; added because it is the only
  automated gate that reaches a brand-new alpha-blended splat pass, and both sibling
  WebGPU tools already carry one.
- **LiDAR-first walking-skeleton order** within v1.
