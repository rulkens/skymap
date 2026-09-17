# Scene-workbench mesh outline crop

Spec: [`2026-09-17-workbench-outline-crop-design.md`](../specs/2026-09-17-workbench-outline-crop-design.md).
Branch `worktree-sondermarken-mesh-z-clip`, draft PR #746. One PR: Task 1 (prep P1) is its own
commit, first; every later task commits on top.

Authored while the user was AFK, with the whole feature authorized. Decisions the spec left open,
or where this plan departs from it, are recorded inline as
`Ruling: <decision> — <why> — <cost if wrong>` and collected in [Rulings](#rulings).

## Dispatch groups

Consecutive, by cognitive locality; one worktree, Sonnet implementers, CI as the gate, one
whole-branch review at the end, plus one mid-branch review per `review: yes` task
([`sdd-execution.md`](../conventions/sdd-execution.md)).

| Group | Tasks | Theme                                                                 |
| ----- | ----- | --------------------------------------------------------------------- |
| A     | 1–3   | Camera: P1 projection as data, the orthographic row, screen ↔ mesh XY |
| B     | 4–11  | Node crop pipeline: ring maths, clipping, `crop-mesh` CLI             |
| C     | 12–15 | Outline endpoint, `outline` slice + saga, GPU preview mask            |
| D     | 16–19 | Draw-mode overlay, corner editing input, layer-row UI, README         |

B depends on nothing in A and may run in parallel with it; C needs B's Task 4 (types, path helper)
and Task 5 (`normalizeRing`); D needs A and C.

**No perf gate.** Ruling: skip `npm run perf` — the workbench is a local dev tool outside the
harness, and nothing here touches `src/` render paths — cost if wrong: none measurable; the app's
frame is untouched.

**Visual checks are not tasks.** The user is AFK; every visual check is a DoD line marked
"user, at review", never a blocking step.

## Standing rules for every task

- `type` aliases, never `interface`; one symbol per file in `utils/` and `@types/`; deep relative
  imports, no barrels. Workbench shared types go in `tools/scene-workbench/@types/`, crop types in
  `tools/scene-recon/@types/`.
- Comments per [`comments.md`](../conventions/comments.md): why, not what; module header ≤ 5 lines;
  comment lines ≤ half the code lines.
- Tests mirror the source tree: `tools/scene-workbench/X` → `tests/tools/scene-workbench/X`,
  `tools/scene-recon/X` → `tests/tools/scene-recon/X`. Tests only for behaviour that can fail on a
  real bug ([`testing.md`](../conventions/testing.md)); no type restatements, no mirror tests.
- Root vitest cannot link this tool's WESL: any test importing a renderer `vi.mock`s it
  (`tests/tools/scene-workbench/render/sceneRenderers.test.ts:21-33` is the pattern). Shader
  behaviour is verified visually by the user.
- `npx prettier --write` only the files a task touched. Stage by path, never `-A`. No
  `Co-Authored-By` trailer.
- `Vec2`/`Vec3`/`Vec4` come from `src/@types/math/`.

---

## Group A — camera

### Task 1: P1 — projection as data (no behaviour change)

**Files:** `tools/scene-workbench/@types/CameraProjection.d.ts` (new),
`tools/scene-workbench/@types/CameraProjectionRow.d.ts` (new),
`tools/scene-workbench/src/render/cameraProjections.ts` (new),
`tools/scene-workbench/src/render/sceneCameraView.ts`,
`tools/scene-workbench/src/render/writeSceneCamera.ts`,
`tests/tools/scene-workbench/render/sceneCameraView.test.ts`,
`tests/tools/scene-workbench/render/sceneCamera.parity.test.ts` (only if a fixture view needs the new field)
**review: yes** — camera maths.

Today perspective is hardcoded three times: `FOV_Y_RAD` (`sceneCameraView.ts:21,52`), the matrix
and `NEAR_M`/`FAR_M` (`writeSceneCamera.ts:16-17,36`), and `metresPerPx` (`:46`). Make the
projection one row of a table keyed by kind, perspective only.

**Contract:**

```ts
// @types/CameraProjection.d.ts — P1 has the perspective variant only
export type CameraProjection = {
  readonly kind: 'perspective';
  readonly fovYRad: number;
  readonly nearM: number;
  readonly farM: number;
};

// @types/CameraProjectionRow.d.ts
export type CameraProjectionRow<P extends CameraProjection> = {
  /** Resolves the pose into what a frame draws; `projection` in the result is of this row's kind. */
  view(camera: SceneCamera, viewportPx: readonly [number, number]): SceneCameraView;
  /** wgpu-matrix convention: destination last, depth mapped to [0, 1]. */
  matrix(projection: P, aspect: number, dst: Float32Array): Float32Array;
  /** Metres per pixel per unit of clip `w` — the shader multiplies by `w`. */
  metresPerPx(projection: P, viewportHeightPx: number): number;
};

// render/cameraProjections.ts
export const CAMERA_PROJECTIONS: {
  readonly [K in CameraProjection['kind']]: CameraProjectionRow<
    Extract<CameraProjection, { kind: K }>
  >;
};
```

`SceneCameraView` (`sceneCameraView.ts:29-36`) replaces `fovYRad: number` with
`projection: CameraProjection`. `sceneCameraView(camera, viewportPx)` keeps its signature and
becomes a one-line dispatch to `CAMERA_PROJECTIONS['perspective'].view` (Task 2 swaps the literal
for the pose's field). The perspective row's `view` is today's body (`sceneCameraView.ts:42-52`)
moved verbatim; its projection is `{ fovYRad: π/4, nearM: 0.5, farM: 5000 }`.
`writeSceneCamera` reads `matrix` and `metresPerPx` from the row for `view.projection.kind`
(the dispatch cast pattern is `sceneRenderers.ts:74-80`) and keeps every byte offset.

- [x] Before touching anything, write a scratch script (scratchpad, not committed) that prints
      `writeSceneCamera`'s 47 floats for two poses (default pose; yaw 1.2, pitch −0.8, distance
      37, target [5, −3, 2]) at viewport [1280, 720]. Re-run it after the refactor; the outputs
      must be bit-identical.
      Ruling: the P1 guard is a scratch golden diff, not a committed test — a committed golden
      matrix is a change-detector that breaks on any FOV tweak (`testing.md`), and the parity test
      already pins the layout — cost if wrong: a later perspective regression is caught only by
      the existing `sceneCameraView` tests and the user's eyes.
- [x] Update `sceneCameraView.test.ts` for the renamed field; no new test (plumbing).
- [x] `npm test -- scene-workbench` and `npm run typecheck` green.
- [x] Commit: `refactor(scene-workbench): camera projection as data (P1)`.

### Task 2: the orthographic row and the pose's projection

**Files:** `tools/scene-workbench/@types/CameraProjection.d.ts`,
`tools/scene-workbench/src/render/cameraProjections.ts`,
`tools/scene-workbench/src/render/sceneCameraView.ts`,
`tools/scene-workbench/src/state/view/viewSlice.ts`,
`tools/scene-workbench/src/input/createSceneInput.ts`,
`tests/tools/scene-workbench/render/cameraProjections.test.ts` (new),
`tests/tools/scene-workbench/state/viewSlice.test.ts`
**review: yes** — camera maths.

**Contract:**

```ts
// CameraProjection gains
| { readonly kind: 'orthographic'; readonly halfHeightM: number; readonly nearM: number; readonly farM: number };

// viewSlice.ts
export type SceneCamera = {
  yaw: number; pitch: number; distanceM: number; targetM: Vec3;
  projection: CameraProjection['kind'];
};
```

Default pose `projection: 'perspective'`. `sceneCameraView` dispatches on `camera.projection`.

**Orthographic row, `view`:**

- `halfHeightM = distanceM · tan(π/8)` — the perspective view's half-height at its target
  distance, so entering draw mode keeps the scale on screen, and the existing wheel zoom (which
  scales `distanceM`, `createSceneInput.ts:112`) scales `halfHeightM` with no new input path.
  Ruling: `distanceM` doubles as the orthographic zoom register instead of a separate
  `halfHeightM` pose field — one register, one zoom path, seeding is the identity — cost if wrong:
  the orthographic scale is tied to the perspective FOV constant; changing that FOV silently
  rescales draw mode.
- `forward` is exactly `(0, 0, −1)`; `eyeM = targetM + (0, 0, ORTHO_EYE_ABOVE_TARGET_M)` with
  `ORTHO_EYE_ABOVE_TARGET_M = 1000`, `nearM = 1`, `farM = 2000`. Pitch is ignored.
  Ruling: a fixed standoff instead of bracketing the group's `boundsM` Z — the view function has
  no bounds, the scenes are tens of metres tall against a ±1000 m slab, and depth24 over 2 km is
  sub-millimetre — cost if wrong: a scene taller than ~1 km clips in draw mode.
- `upM` = the horizontal component of the perspective view's forward at the same yaw
  (unit, Z = 0); `rightM = forward × upM`, which must equal the perspective view's `rightM` at the
  same yaw. **Build the basis directly; do not route through `yawPitchToDir`/`imagePlaneBasis`
  with pitch ±π/2** — `lookAt` degenerates straight down (`viewSlice.ts:28-30`). `mat4.lookAt`
  with this horizontal `upM` is fine.
- `matrix`: `mat4.ortho(−h·aspect, h·aspect, −h, h, near, far, dst)`; `metresPerPx`:
  `2·halfHeightM / viewportHeightPx` (clip `w` is 1).

**Input and state:**

- `createSceneInput.ts`: `register`, `currentPose` and the adoption block copy `projection`. In
  `applyDragStep` (`:75-93`), an orthographic register treats every drag mode as pan (same `k`).
  Ruling: orthographic pan keeps the perspective pan rate rather than exact under-cursor
  tracking — smallest diff, same feel as today — cost if wrong: the ground slides slightly
  under the cursor while panning in draw mode.
- `viewSlice.ts`: `commitCameraPose` stores `projection`; `frameCamera` resets it to
  `'perspective'`, so a group switch never opens in orthographic.

**Tests** (`cameraProjections.test.ts`):

- [x] `orthographic view looks exactly down -Z` — `eyeM − targetM` is `(0, 0, +1000)` exactly
      (`toBe`, not `toBeCloseTo`, on X and Y) for yaw 0.7 and pitch 0.35.
- [x] `orthographic right matches perspective right at the same yaw` — yaw 2.1; element-wise close.
- [x] `orthographic screen corner unprojects to target ± halfHeight·aspect` — write the uniform
      with `writeSceneCamera` at viewport [1600, 900], invert `viewProj` with `mat4.inverse`,
      unproject NDC (1, 1, 0.5); expect `targetM + rightM·h·(16/9) + upM·h` in X and Y, with
      `h = distanceM · tan(π/8)` computed from literals in the test.
- [x] `viewSlice.test.ts`: `frameCamera resets the projection to perspective`.
- [x] `npm test -- scene-workbench` green; commit.

### Task 3: screen ↔ mesh-local XY

**Files:** `tools/scene-workbench/src/scene/pxToGroupXY.ts`,
`tools/scene-workbench/src/scene/groupXYToPx.ts`,
`tools/scene-workbench/src/scene/assetToGroupM.ts`,
`tools/scene-workbench/src/scene/groupToAssetXY.ts`,
`tools/scene-workbench/src/scene/isZOnlyRotation.ts` (all new), matching tests under
`tests/tools/scene-workbench/scene/`
**review: yes** — pose maths.

Draw mode maps a click to mesh-local metres and projects corners back to pixels (hit-testing,
overlay). An orthographic view with a horizontal basis is affine, so no matrix inverse is needed.

**Signatures** (all take CSS pixels, origin top-left, +y down; `view` must be orthographic and
built from the canvas's CSS size — throw otherwise):

```ts
export function pxToGroupXY(view: SceneCameraView, px: Vec2): Vec2;
export function groupXYToPx(view: SceneCameraView, xyM: Vec2): Vec2;
export function assetToGroupM(transform: SimilarityTransform, pM: Vec3): Vec3; // scale, rotate, translate
export function groupToAssetXY(transform: SimilarityTransform, xyM: Vec2): Vec2; // inverse; Z-only rotation assumed
export function isZOnlyRotation(rotation: Vec4): boolean; // |x|, |y| < 1e-9
```

Reuse `src/utils/math/rotateVec3ByQuat.ts`; inverse rotation is the conjugate.

- [x] `pxToGroupXY maps the top-right pixel to target + right·h·aspect + up·h` — viewport
      [800, 400], literal expected numbers.
- [x] `groupXYToPx inverts pxToGroupXY` at yaw 0.9 for three pixels.
- [x] `groupToAssetXY undoes a 90° Z rotation, scale 2 and translation` — literal expected point.
- [x] `isZOnlyRotation rejects a tilt about X`. No test for the identity case.
- [x] Commit.

---

## Group B — Node crop pipeline

All pure functions live one per file under `tools/scene-recon/crop/`, tests under
`tests/tools/scene-recon/crop/`.

### Task 4: foundations — dependency, types, path, gitignore

**Files:** `package.json`, `package-lock.json`, `.gitignore`,
`tools/scene-workbench/@types/MeshOutline.d.ts` (new),
`tools/scene-recon/@types/HalfPlane2.d.ts` (new), `tools/scene-recon/@types/ClipVertex.d.ts` (new),
`tools/scene-recon/@types/CropMeshReport.d.ts` (new), `tools/scene-recon/manifest/geo3dLayout.ts`

**Contracts:**

```ts
// tools/scene-workbench/@types/MeshOutline.d.ts
/** Mesh-local metres (before the asset transform). Open, CCW, ≥ 3 corners, simple. */
export type MeshOutline = { readonly formatVersion: 1; readonly ringM: readonly Vec2[] };

// tools/scene-recon/@types/HalfPlane2.d.ts — inside ⇔ normal·p − offset ≥ 0; normal is unit, inward
export type HalfPlane2 = { readonly normal: Vec2; readonly offset: number };

// tools/scene-recon/@types/ClipVertex.d.ts
/** `key` names the vertex for welding: a source vertex is `v<index>`; a cut vertex is
 *  `<lower key>|<higher key>|<plane key>`, so two triangles cutting a shared edge agree. */
export type ClipVertex = { readonly positionM: Vec3; readonly uv: Vec2; readonly key: string };

// tools/scene-recon/@types/CropMeshReport.d.ts
export type CropMeshReport = {
  readonly asset: TexturedMeshAsset;
  readonly sourceTriangles: number;
  readonly uvCoverage: number; // 0..1
};

// geo3dLayout.ts
export const GEO3D_SOURCE_DIR = 'data/geo3d';
export function meshOutlinePath(groupId: string, assetId: string): string; // data/geo3d/<groupId>/<assetId>.outline.json
```

- [x] `npm install earcut`; add `@types/earcut` as a devDependency only if the installed version
      ships no `.d.ts`.
- [x] **`.gitignore` landmine:** `/data/**` is ignored (`.gitignore:94`), so the spec's committed
      outline would silently never reach git. Add `!/data/geo3d/**/*.outline.json` beside the
      existing negations (`:95-97`) and verify with
      `git check-ignore -v data/geo3d/g/mesh.outline.json` (must print nothing).
- [x] Place `meshOutlinePath` in `geo3dLayout.ts`; update its module header, which today says every
      path is under `public/data/`. No tests (types, a path join, config).
- [x] Commit.

### Task 5: `normalizeRing`

**Files:** `tools/scene-recon/crop/normalizeRing.ts`, `tests/tools/scene-recon/crop/normalizeRing.test.ts`

**Signature:** `export function normalizeRing(ringM: readonly Vec2[]): Vec2[]`

**Behaviour:** drops a closing corner equal to the first; rejects non-finite coordinates, fewer
than 3 distinct corners, zero signed area, and any pair of non-adjacent edges that intersect
(O(n²) is fine); returns the ring counter-clockwise (reverse when the shoelace area is negative).
Throws `Error` with a human-readable message on rejection — the endpoint returns it as the 400
body.

- [x] `normalizeRing reverses a clockwise ring`.
- [x] `normalizeRing drops a repeated closing corner`.
- [x] `normalizeRing rejects fewer than three corners`.
- [x] `normalizeRing rejects a bow-tie` — `[[0,0],[1,1],[1,0],[0,1]]`.
- [x] Commit.

### Task 6: `insideRing`

**Files:** `tools/scene-recon/crop/insideRing.ts`, `tests/tools/scene-recon/crop/insideRing.test.ts`

**Signature:** `export function insideRing(p: Vec2, ringM: readonly Vec2[]): boolean`

**Behaviour:** even-odd crossing with the half-open rule `(yi > py) !== (yj > py)`, so a ray through
a corner counts once. **This exact rule is what Task 15's WGSL `insideMask` must repeat**; the
two are the same algorithm by contract (spec §4.5). Fewer than 3 corners → `true`.

- [x] `insideRing puts a point in a concave notch outside` — a U shape, point in the notch.
- [x] `insideRing counts a ray through a corner once` — diamond `[[0,-1],[1,0],[0,1],[-1,0]]`,
      point `[0.5, 0]` inside, `[-2, 0]` outside.
- [x] Commit.

### Task 7: `triangulateOutline`

**Files:** `tools/scene-recon/crop/triangulateOutline.ts`,
`tests/tools/scene-recon/crop/triangulateOutline.test.ts`

**Signature:** `export function triangulateOutline(ringM: readonly Vec2[]): HalfPlane2[][]`

**Behaviour:** `earcut` over the flattened CCW ring; each output triangle becomes three inward
half-planes (re-orient each triangle CCW before deriving normals — do not trust earcut's winding).

- [x] `triangulateOutline covers an L-shape without its notch` — sample a 20×20 grid over the
      L's bbox; a sample is in some piece (all three planes ≥ −1e-9) iff `insideRing` says inside
      (skip samples within 1e-6 of an edge).
- [x] Commit.

### Task 8: `clipPolygonByHalfPlane`

**Files:** `tools/scene-recon/crop/clipPolygonByHalfPlane.ts`,
`tests/tools/scene-recon/crop/clipPolygonByHalfPlane.test.ts`

**Signature:**
`export function clipPolygonByHalfPlane(polygon: readonly ClipVertex[], plane: HalfPlane2, planeKey: string): ClipVertex[]`

**Behaviour:** one Sutherland–Hodgman pass. Signed distance from XY only; a cut vertex lerps
`positionM` (all three components) and `uv` at `t = dA / (dA − dB)`. Vertices exactly on the
plane (d = 0) are inside and never produce a cut vertex. Cut-vertex key per `ClipVertex`'s doc,
with the two endpoint keys ordered lexically.

- [x] `clipPolygonByHalfPlane cuts a vertical triangle and interpolates Z and UV` — triangle
      `(−1,0,0) uv(0,0)`, `(1,0,0) uv(1,0)`, `(1,0,10) uv(1,1)` against plane x ≥ 0; expect the
      cut vertices at `(0,0,0) uv(0.5,0)` and `(0,0,5) uv(0.5,0.5)` (literals).
- [x] `clipPolygonByHalfPlane gives a shared edge the same cut key from either winding` —
      clip `[a, b, c]` and `[b, a, d]` against one plane; the cut on edge ab has one key.
- [x] Commit.

### Task 9: `cropMeshGeometry`

**Files:** `tools/scene-recon/crop/cropMeshGeometry.ts`, `tools/scene-recon/crop/segmentsTouch.ts`,
`tests/tools/scene-recon/crop/cropMeshGeometry.test.ts`
**review: yes** — index/vertex buffer construction, welding.

**Signatures:**

```ts
export function segmentsTouch(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean; // inclusive (review fix)
export function cropMeshGeometry(
  geometry: TexturedMeshGeometry,
  ringM: readonly Vec2[],
  pieces: readonly HalfPlane2[][],
): TexturedMeshGeometry;
```

Ruling: `cropMeshGeometry` takes the ring beside the pieces (spec §4.6 lists only the pieces) —
the fast path and bbox reject need the ring itself — cost if wrong: none; the caller already
holds both.

**Behaviour, per triangle:**

1. XY bbox entirely outside the ring's bbox → drop.
2. **Fast path:** all three corners `insideRing` and no triangle edge `segmentsTouch` any ring
   edge → keep the triangle with its original indices, untouched.
3. Otherwise, for each piece `k`, clip the triangle's `ClipVertex[]` (keys `v<i>`) by its three
   planes (plane key `${k}:${j}`); fan-triangulate each result with ≥ 3 vertices.
4. Output vertices dedupe by key (source vertices by `v<i>`, cut vertices by compound key);
   source vertices no kept triangle references are compacted away; indices remapped. `image` is
   passed through by reference.

Known and accepted (spec §6): a piece diagonal crossing one boundary triangle leaves unwelded,
coincident vertices. Do not try to fix it.

- [x] `keeps a fully inside triangle with its indices untouched` — assert the kept triangle's
      output positions equal the source's, in order, and no new vertex was created.
- [x] `drops a fully outside triangle and compacts its vertices`.
- [x] `clips a triangle crossing one edge to the analytic area and UV` — unit square outline;
      a triangle spanning x ∈ [−1, 1]; expected kept XY area and one cut-vertex UV as literals.
- [x] `drops a triangle inside a concave notch's bbox but outside the ring`.
- [x] `clips a vertical triangle crossing the boundary` — output Z range as literals.
- [x] `two triangles sharing a cut edge reuse one new vertex` — count of vertices at the cut
      point equals 1.
- [x] Commit.

### Task 10: `uvCoverage`

**Files:** `tools/scene-recon/crop/uvCoverage.ts`, `tests/tools/scene-recon/crop/uvCoverage.test.ts`

**Signature:** `export function uvCoverage(uvs: Float32Array, indices: Uint32Array): number`

Ruling: coverage is the sum of UV-triangle areas, clamped to 1, not a rasterised union — an MVS
atlas's charts do not overlap, and a sum is exact then — cost if wrong: overlapping charts
over-report the fraction part 2 budgets the atlas from.

- [x] `uvCoverage of two triangles tiling the lower-left quarter is 0.25`.
- [x] Commit.

### Task 11: `crop-mesh` CLI

**Files:** `tools/scene-recon/cropMesh.ts` (new), `package.json` (script),
`tests/tools/scene-recon/cropMesh.test.ts` (new)

**Signature:** `export async function cropMesh(group: SceneGroupDefinition, assetId: string): Promise<CropMeshReport>`

`main()` reads `sceneGroupFromArgv(process.argv)` and `argValue(process.argv, '--asset')` (required;
error naming the flag), guarded by the `invokedDirectly` check (`bakeMesh.ts` tail). Script:
`"crop-mesh": "tsx tools/scene-recon/cropMesh.ts"`.

**Flow** (spec §4.6):

1. Read `meshOutlinePath(group.id, assetId)` (missing → error naming the path), parse as
   `MeshOutline`, `normalizeRing`.
2. Read `groupManifestPath(group.id)`; the asset must exist with `kind === 'mesh'`, else error.
3. `meshGlbGeometry(await new NodeIO().read(join(groupAssetDir(group.id, assetId), 'mesh.glb')))`.
4. `triangulateOutline` → `cropMeshGeometry` → `packMeshGlb` (image bytes unchanged — no re-encode)
   → `groupAssetDir(group.id, \`${assetId}-cropped\`)/mesh.glb`.
5. `publishAsset(group, asset)` with `id: \`${assetId}-cropped\``, `label: \`${source.label} — cropped\``,
the source's `transform`, and `provenance`= the source's plus`{ step: 'cropMesh', version: <sha256 of the outline file's bytes, first 12 hex> }`,
`triangleCount`, `artifactUrl: assetArtifactUrl(...)`. No `boundsM` argument.
6. Print `cropMesh: <out> / <source> triangles (<pct>%), atlas coverage <pct>% → <artifactUrl>` to stderr.

**Landmine:** in a worktree `public/data` is a symlink into main, so a real run writes main's
`public/data/geo3d/`. The plan never runs the CLI against real data; the user does.

- [x] `cropMesh publishes a sibling asset and leaves the source untouched` — tmpdir cwd
      (`process.chdir`, forks pool, as `tests/tools/scene-recon/bakeMesh.test.ts` does): write a
      two-triangle `mesh.glb` via `packMeshGlb` (a tiny real JPEG from `sharp`), a manifest with
      that mesh asset, and an outline covering one triangle. Assert: manifest now has both ids;
      the cropped asset's `triangleCount` is 1; its last pipeline step is `cropMesh` with a
      12-hex version; the source asset object is unchanged.
- [x] Commit.

---

## Group C — endpoint, state, preview mask

### Task 12: `outlinePlugin`

**Files:** `tools/scene-workbench/plugin/outlinePlugin.ts` (new),
`tools/scene-workbench/vite.config.ts`, `tests/tools/scene-workbench/plugin/outlinePlugin.test.ts` (new)

**Signature:** `export function outlinePlugin(): Plugin` (Vite), registered after `react()`.

**Routes** — the middleware shape is `tools/famous-curator/plugin/apiPlugin.ts:123-160` (void shim
around an async handler, `next()` for anything outside `/api/outline/`); helpers from
`tools/utils/http/` (`readJsonBody`, `sendJson`):

| Method | Path                             | Result                                                                                                                                                                                                                         |
| ------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/api/outline/:groupId/:assetId` | 200 + file JSON; 404 when the manifest is missing, the asset is not a `mesh`, or no outline file exists                                                                                                                        |
| PUT    | `/api/outline/:groupId/:assetId` | 404 as above (minus the file); 400 `{ error }` when the body is not `{ formatVersion: 1, ringM }` or `normalizeRing` throws; else write `{ formatVersion: 1, ringM: normalized }` via `writeJsonAtomic` and 200 with that body |
| other  | `/api/outline/…`                 | 405                                                                                                                                                                                                                            |

Ids must match `^[\w-]+$` (path traversal) or 404. Paths are cwd-relative (`groupManifestPath`,
`meshOutlinePath`), as the bake CLIs' are; `npm run scene-workbench` runs from the repo root.
Plan 3b's nudge endpoint extends this plugin rather than adding a second (spec §4.2).

- [x] Test harness: the fake req/res + `configureServer` driver of
      `tests/tools/famous-curator/apiPlugin.routing.test.ts:13-60`, in a tmpdir cwd.
- [x] `unknown group returns 404`; `non-mesh asset returns 404`.
- [x] `invalid ring returns 400` — a bow-tie.
- [x] `PUT then GET round-trips a normalized ring` — PUT a clockwise square, GET returns it CCW.
- [x] Commit.

### Task 13: `outline` slice, commands, `selectMaskRing`

**Files:** `tools/scene-workbench/src/state/outline/outlineSlice.ts` (new),
`tools/scene-workbench/src/state/outline/selectMaskRing.ts` (new),
`tools/scene-workbench/src/state/commands.ts`, `tools/scene-workbench/src/store/rootReducer.ts`,
`tests/tools/scene-workbench/state/outlineSlice.test.ts` (new),
`tests/tools/scene-workbench/state/selectMaskRing.test.ts` (new)
**review: yes** — Redux state.

Ruling: the slice's state types sit in `outlineSlice.ts`, as `ViewSlice`/`GroupSlice` do in theirs,
not in `@types/` — the workbench's local precedent for slice-owned shapes — cost if wrong: a later
sweep moves three slices' types together.

**Contract:**

```ts
export type OutlineEntry = { ringM: Vec2[]; masked: boolean };
export type OutlineDraft = {
  assetId: string;
  ringM: Vec2[];
  closed: boolean;
  returnPose: SceneCamera;
};
export type OutlineSlice = {
  byAssetId: Record<string, OutlineEntry>; // loaded / last saved
  draft: OutlineDraft | null; // non-null ⇔ draw mode
  saveError: string | null;
};

// reducers (slice name 'outline')
outlineLoaded(PayloadAction<{ assetId: string; ringM: Vec2[] }>); // masked: true
maskToggled(PayloadAction<string>);
draftStarted(PayloadAction<OutlineDraft>); // clears saveError
cornerAppended(PayloadAction<Vec2>); // no-op when closed
cornerMoved(PayloadAction<{ index: number; xyM: Vec2 }>);
cornerClicked(PayloadAction<number>);
outlineSaved(PayloadAction<{ assetId: string; ringM: Vec2[] }>); // byAssetId[id] = { ringM, masked: true }
outlineSaveFailed(PayloadAction<string>);
draftEnded(); // draft = null
// extraReducers: groupSelected → the whole slice back to its default

// commands.ts — saga-only, no reducer
drawOutlineRequested: createAction<string>('drawOutlineRequested'); // assetId
outlineSaveRequested: createAction('outlineSaveRequested');
outlineDiscardRequested: createAction('outlineDiscardRequested');

// selectMaskRing.ts
export function selectMaskRing(state: RootState, assetId: string): readonly Vec2[] | null;
// draft?.assetId === assetId ? draft.ringM : byAssetId[assetId]?.masked ? byAssetId[assetId].ringM : null
```

**`cornerClicked(index)` rule:** on an open ring with ≥ 3 corners, index 0 closes it
(`closed = true`) and removes nothing; otherwise it deletes the corner, and a closed ring that
drops below 3 corners reopens.

Add `outline: outlineSlice.reducer` to `rootReducer.ts` and drop its stale "arrive with plan 3"
comment only if it now misleads.

- [x] `cornerClicked on the first corner of an open triangle closes it`.
- [x] `cornerClicked deletes a corner and reopens a ring that falls below three`.
- [x] `cornerAppended is ignored on a closed ring`.
- [x] `selectMaskRing prefers the draft over a saved ring`; `selectMaskRing is null when masked off`.
- [x] Commit.

### Task 14: `watchOutlineSaga`

**Files:** `tools/scene-workbench/src/state/outline/watchOutlineSaga.ts` (new),
`tools/scene-workbench/src/store/rootSaga.ts`,
`tests/tools/scene-workbench/state/watchOutlineSaga.test.ts` (new)
**review: yes** — sagas.

**Behaviour** (`typed-redux-saga`, the style of `watchGroupSaga.ts`):

- `takeLatest(manifestLoaded)`: for every `mesh` asset, `GET /api/outline/<groupId>/<assetId>`
  (`cache: 'no-cache'`); 200 → `outlineLoaded`; 404 → nothing; any other failure → `console.error`,
  continue with the next asset.
- `takeEvery(drawOutlineRequested)`: select the asset from `group.manifest`; if its
  `transform.rotation` fails `isZOnlyRotation`, `console.warn` and stop (spec §4.4). Otherwise put
  `draftStarted({ assetId, ringM: saved ring or [], closed: saved ring present, returnPose: current view.camera })`,
  then `commitCameraPose({ ...returnPose, projection: 'orthographic' })`.
- `takeEvery(outlineSaveRequested)`: select the draft (none or open → return); PUT
  `{ formatVersion: 1, ringM }`; on 200 put `outlineSaved` with the **server's** ring, then
  `commitCameraPose(returnPose)`, then `draftEnded`; on failure put `outlineSaveFailed(body.error ?? status text)`
  and stay in draw mode.
- `takeEvery(outlineDiscardRequested)`: select the draft; `commitCameraPose(returnPose)`; `draftEnded`.
- Explicit `put`s to `view`, never cross-slice `extraReducers` on outline actions — the project's
  state landmine (they have dropped silently before).

Register `watchOutlineSaga()` in `rootSaga.ts`'s `all([...])`.

- [x] `save PUTs the draft, stores the server's ring and restores the return pose` — `runSaga` or
      the store from `createSceneStore`, `fetch` stubbed with `vi.stubGlobal`; server returns a
      ring different from the draft's; assert `byAssetId` holds the server's, `draft` is null,
      `view.camera` equals `returnPose` (projection `'perspective'`).
- [x] `a failed save keeps draw mode and records the error`.
- [x] Commit.

### Task 15: the preview mask on the GPU

**Files:** `tools/scene-workbench/src/render/packMaskPolygon.ts` (new),
`tools/scene-workbench/src/render/writeMeshMask.ts` (new),
`tools/scene-workbench/src/render/renderResources.ts`,
`tools/scene-workbench/src/render/uploadTexturedMesh.ts`,
`tools/scene-workbench/src/render/texturedMeshRenderer.ts`,
`tools/scene-workbench/src/render/shaders/texturedMesh.wesl`,
`tools/scene-workbench/src/state/outline/watchOutlineSaga.ts`,
`tests/tools/scene-workbench/render/packMaskPolygon.test.ts` (new),
`tests/tools/scene-workbench/render/writeMeshMask.test.ts` (new)
**review: yes** — shader, TS↔WGSL layout.

**Layout** (storage, `read`; WGSL alignment of `array<vec2f>` is 8):

```
struct MaskPolygon { count: u32, _pad: u32, cornersM: array<vec2f> };

  off   size  field
    0      4  u32  count       0 ⇒ no mask (masked off, no outline, or < 3 corners)
    4      4  u32  _pad
    8   8·max(count,1)  f32 x, f32 y per corner, mesh-local metres
```

Minimum buffer 16 bytes (header + one element) even at `count = 0`.

Ruling: struct, binding and `insideMask` all live in `texturedMesh.wesl`, not a
`lib/maskPolygon.wesl` — WGSL cannot pass a runtime-sized storage array to a function without the
pointer-parameter extension, so the function must read the module-scope binding, and a lib that
declares a binding hard-codes the importer's group/binding numbers — cost if wrong: a second masked
pass later extracts the lib.

**Contracts:**

```ts
export function packMaskPolygon(ringM: readonly Vec2[] | null): ArrayBuffer; // null or < 3 → count 0, 16 B
export function writeMeshMask(
  device: GPUDevice,
  asset: MeshGpuAsset,
  ringM: readonly Vec2[] | null,
): void;
// MeshGpuAsset gains (NOT readonly): mask: GPUBuffer   — STORAGE | COPY_DST
```

- `uploadTexturedMesh` creates the 16-byte `count = 0` mask buffer. **`dispose` must destroy
  `asset.mask` read at dispose time, not a captured local** — `writeMeshMask` swaps it.
- `writeMeshMask`: when the packed bytes exceed `asset.mask.size`, create a buffer sized to the
  bytes, destroy the old one, assign it; then `queue.writeBuffer`. No corner cap.
- `texturedMeshRenderer`: `assetLayout` gains binding 2, `FRAGMENT`, `read-only-storage`; the bind
  group cache (`:106-121`) is keyed by the **mask buffer** (`WeakMap<GPUBuffer, GPUBindGroup>`),
  so a reallocation rebuilds the group. The wireframe pass stays unmasked.
- `texturedMesh.wesl`: `VsOut` gains `@location(1) localXY: vec2<f32>` = the vertex's
  `positionM.xy` (the vertex buffer is already mesh-local); `fs` `discard`s when
  `!insideMask(i.localXY)`. `insideMask` repeats Task 6's half-open even-odd rule exactly;
  `count < 3 ⇒ true`. No `enabled` flag, no pipeline variant.
- `watchOutlineSaga` gains a mask sync: `takeEvery` over every `outline/*` action and
  `assetStatusChanged` with `status: 'ready'` → for each `mesh` entry in `resources.gpuAssets`,
  `writeMeshMask(gpu.device, asset, selectMaskRing(state, id))`. The saga runs inside the
  dispatch, before the next rAF, and the dispatch already marked the viewport dirty — no new
  command. Ruling: no `meshMaskWritten` command — cost if wrong: one stale frame until the next
  store write.

- [x] `packMaskPolygon writes count at byte 0 and corner k at 8 + 8k` — read back through
      `DataView`, literal expectations for a 3-corner ring.
- [x] `packMaskPolygon of null is a 16-byte zero-count buffer`.
- [x] `writeMeshMask reallocates and destroys the old buffer when the ring outgrows it` — fake
      device recording `createBuffer`/`destroy`/`writeBuffer`.
- [x] Commit.

---

## Group D — draw mode

### Task 16: outline overlay renderer

**Files:** `tools/scene-workbench/src/render/outlineOverlayRenderer.ts` (new),
`tools/scene-workbench/src/render/shaders/outlineOverlay.wesl` (new),
`tools/scene-workbench/src/state/outline/selectDraftRingGroupM.ts` (new),
`tools/scene-workbench/src/ui/Viewport/Viewport.tsx`
**review: yes** — shader.

**Contracts:**

```ts
export type OutlineOverlayRenderer = {
  draw(pass: GPURenderPassEncoder, ringGroupM: readonly Vec3[], closed: boolean): void;
  dispose(): void;
};
export function createOutlineOverlayRenderer(
  gpu: GpuContext,
  targetFormat: GPUTextureFormat,
  cameraLayout: GPUBindGroupLayout,
): OutlineOverlayRenderer;

// group frame, Z = manifest.boundsM?.max[2] ?? view.camera.targetM[2]; null when no draft
export function selectDraftRingGroupM(state: RootState): readonly Vec3[] | null;
```

- `selectDraftRingGroupM` maps each draft corner through `assetToGroupM` (Task 3) with the asset's
  transform.
- Two pipelines off one module, group 0 = camera only: a `line-list` of the ring's edges (the
  closing edge only when `closed`), and corner handles as instanced camera-facing quads
  (6 vertices from `vertex_index`) of `HANDLE_PX = 8` pixels, sized with
  `cam.rightM`/`cam.upM`·`cam.metresPerPx`·`clip.w`. The first corner draws in a distinct colour
  so the user can see where to close. Colours are shader constants.
- `depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'always' }` —
  over the scene, no depth test.
- Vertex and instance buffers grow by reallocation; a zero-length ring draws nothing.
- `Viewport.tsx`: build the overlay beside `renderers` (`:144-145`), `dispose` on unmount, and after
  `renderers.draw` (`:124`) draw it when `selectDraftRingGroupM(state)` is non-null.
- [ ] No test — GPU plumbing verified visually; the maths it reads is Task 3's.
- [ ] Commit.

### Task 17: corner editing input

**Files:** `tools/scene-workbench/src/input/attachOutlineCornerControls.ts` (new),
`tools/scene-workbench/src/input/createSceneInput.ts`
**review: yes** — picking maths, gesture arbitration.

**Contract:**

```ts
export function attachOutlineCornerControls(
  canvas: HTMLCanvasElement,
  store: SceneStore,
  getCameraPose: () => SceneCamera,
): () => void; // detach
```

- **Append:** `createSceneInput` passes `attachOrbitControls` an `onClick`
  (`src/services/camera/orbitControls.ts:87-92`, fires on an orbit-button release within 4 CSS px)
  that, when a draft exists, is open, and the pose is orthographic, maps the click through
  `pxToGroupXY` (view built from `canvas.clientWidth/clientHeight`, point relative to
  `canvas.getBoundingClientRect()`) and `groupToAssetXY`, then dispatches `cornerAppended`. A
  press near a corner never reaches this path: the corner controls below swallow its
  `pointerdown`, so the orbit recognizer never sees the gesture.
- **Move / delete / close:** `attachOutlineCornerControls` listens to `pointerdown` in the
  **capture** phase on the canvas. When a draft exists and a corner (projected with `assetToGroupM`
  → `groupXYToPx`) is within 8 CSS px, it calls `stopImmediatePropagation()` — which keeps
  `attachOrbitControls`' non-capture listener from starting a pan — and `setPointerCapture`. Moves
  beyond 4 px dispatch `cornerMoved` per `pointermove`; a release that never moved beyond 4 px
  dispatches `cornerClicked(index)`.
  Ruling: arbitrate by a capture-phase listener that swallows the event, not by adding a
  suppression hook to the shared `orbitControls.ts` — the main app's recognizer stays untouched —
  cost if wrong: a browser dispatching target-phase listeners in registration order would let the
  pan start too (Chromium runs capture listeners first since M89).
- `createSceneInput` attaches and detaches the corner controls with the orbit controls.
- [ ] No automated test — DOM gesture arbitration; the pure maps are Task 3's and the edit rules
      are Task 13's. Verified by the user.
- [ ] Commit.

### Task 18: layer-row outline controls

**Files:** `tools/scene-workbench/src/ui/MeshOutlineControls/MeshOutlineControls.tsx` (new),
`tools/scene-workbench/src/ui/MeshOutlineControls/MeshOutlineControls.module.css` (new),
`tools/scene-workbench/src/ui/LayerList/LayerList.tsx`,
`tests/tools/scene-workbench/ui/MeshOutlineControls.test.tsx` (new)

Follow `.claude/skills/create-component/SKILL.md` (own folder, `function Name() {}` +
`export default`, top-level `.root`), adapted to this tool's `src/ui/` home.

**Props:** `{ readonly assetId: string }`. Rendered by `LayerList` inside the row
(`LayerList.tsx:24-45`) for `asset.kind === 'mesh'` only.

- No draft: a "Draw outline" button (`drawOutlineRequested(assetId)`, label "Edit outline" when a
  saved ring exists), disabled while another asset's draft is open; when `byAssetId[assetId]`
  exists, a "Mask" checkbox bound to `masked` (`maskToggled`).
- Draft for this asset: corner count, "Save" (`outlineSaveRequested`, **enabled only when
  `closed`**), "Discard" (`outlineDiscardRequested`), and `saveError` when set.
- [ ] `Save is enabled only on a closed ring` — render with a store holding an open 3-corner draft
      (disabled), then a closed one (enabled). Pattern: `tests/tools/scene-workbench/ui/LayerList.test.tsx`.
- [ ] Commit.

### Task 19: README

**Files:** `tools/scene-workbench/README.md`

- [ ] Architecture: add the `outline` slice and `watchOutlineSaga` to the slice/saga list, and
      `plugin/outlinePlugin.ts` (the workbench's first dev endpoint).
- [ ] New "Mesh outline" section: draw mode (orthographic nadir, click to add, drag to move, click
      a corner to delete, first corner closes), the mask toggle, the file at
      `data/geo3d/<groupId>/<assetId>.outline.json` (committed, mesh-local metres), splats
      hidden (neither sorted nor drawn) under orthographic, and
      `npm run crop-mesh -- --group <id> --asset <assetId>` with its sibling `<assetId>-cropped`
      asset and printed numbers.
- [ ] Commit.

---

## Rulings

1. No perf gate — dev tool outside the harness; no `src/` render path touched.
2. P1 guard is a scratch golden diff, not a committed test (Task 1).
3. `distanceM` is the orthographic zoom register; `halfHeightM = distanceM · tan(π/8)` (Task 2).
4. Orthographic near/far from a fixed 1000 m standoff, not `boundsM` Z (Task 2).
5. Orthographic pan keeps the perspective pan rate (Task 2).
6. `cropMeshGeometry` takes the ring as well as the pieces (Task 9).
7. `uvCoverage` sums UV-triangle areas (Task 10).
8. Slice state types beside the slice, per workbench precedent (Task 13).
9. Mask struct, binding and `insideMask` in `texturedMesh.wesl`, no `lib/maskPolygon.wesl` (Task 15).
10. No `meshMaskWritten` command; the mask write rides the triggering dispatch (Task 15).
11. Corner drag arbitration by a capture-phase listener, not an `orbitControls.ts` hook (Task 17).
12. Splats are neither sorted nor drawn under orthographic projection (review fix; originally a
    README note). Why: `splat.wesl` scales by view depth, and draw mode is a mesh tool. Cost if
    wrong: no splats while drawing.
13. `.gitignore` gains `!/data/geo3d/**/*.outline.json` — without it the spec's committed outline
    is silently ignored (Task 4).

## Definition of Done

**Deliverables**

- [ ] `CameraProjection`, `CameraProjectionRow`, `CAMERA_PROJECTIONS` with perspective and
      orthographic rows; `SceneCamera.projection`.
- [ ] `MeshOutline` type; `meshOutlinePath`; `.gitignore` negation for `*.outline.json`.
- [ ] `tools/scene-recon/crop/`: `normalizeRing`, `insideRing`, `triangulateOutline`,
      `clipPolygonByHalfPlane`, `cropMeshGeometry`, `segmentsTouch`, `uvCoverage`.
- [ ] `npm run crop-mesh -- --group <id> --asset <assetId>` publishing `<assetId>-cropped` with a
      `cropMesh` pipeline step; `earcut` devDependency.
- [ ] `plugin/outlinePlugin.ts` registered in the workbench `vite.config.ts`.
- [ ] `outline` slice, `selectMaskRing`, `watchOutlineSaga`, three commands.
- [ ] Mask storage binding in `texturedMesh.wesl` + `packMaskPolygon`/`writeMeshMask`.
- [ ] Outline overlay renderer; corner controls; `MeshOutlineControls` on mesh layer rows.
- [ ] README "Mesh outline" section.
- [ ] P1 is a separate commit ahead of the feature commits.

**Observable behaviours — user, at review** (not blocking execution)

- [ ] "Draw outline" on the 2019 crop mesh's row switches to a straight-down orthographic view at
      about the same scale; wheel zooms, drag pans; leaving restores the previous pose.
- [ ] Click adds corners; dragging a corner moves it without panning; clicking a corner deletes it;
      clicking the first corner of a ≥ 3-corner ring closes it; Save enables only then.
- [ ] While drawing, the mesh outside the draft ring disappears; the wireframe does not.
- [ ] Save writes `data/geo3d/soendermarken-crop-2019/mesh.outline.json`, which survives a reload,
      and `git status` shows it as untracked (not ignored).
- [ ] The Mask checkbox toggles the saved mask on and off.
- [ ] `npm run crop-mesh -- --group soendermarken-crop-2019 --asset mesh` prints triangle counts and
      atlas coverage; the new `mesh-cropped` row loads and matches the masked `mesh` when toggled
      against it.

**Deferred — do not chase**

- The user-drawn `mesh.outline.json` itself (the user draws it; the plan never creates it).
- Decimation, atlas re-pack/rebake, the mesh-body budget, and everything on Earth (part 2).
- Outlines on LiDAR or splats; multiple outlines, holes, Z limits; geodetic export.
- A stale-crop check against the outline hash.
- Welding the boundary-strip T-junctions (spec §6).
- Correct splat rendering under the orthographic projection.
- Draw mode on assets with non-Z rotations (refused, not supported).
