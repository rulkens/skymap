# Scene-workbench mesh outline crop: design

> **Status.** Ratified by the user; ready to plan.
> **Date.** 2026-09-17.
> **Relationship to prior work.** Part 1 of 2 toward landing the Søndermarken
> 2019 leaf-on MVS mesh as a mesh body on Earth. Part 2 (decimate + atlas
> rebake to the mesh-body budget, surface site, datum, unlit shading, ground
> seam) gets its own spec once this part has measured what the outline keeps
> and terrain F3a has landed. Builds on scene-workbench plan 3a
> ([completed spec](completed/)).

## 1. Problem

The 2019 crop mesh (`soendermarken-crop-2019`, asset `mesh`) is 660,051
triangles on a 4096² atlas and covers the whole ~258 × 183 m crop box,
including geometry the user does not want on Earth. Mesh bodies are budgeted at
150k triangles and a 2048² texture (`tools/meshes/buildMeshes.ts`). The user
wants to draw a 2D polygon around the part that matters and cut everything
outside it, then measure what is left before deciding the Earth body's budget.

## 2. Ratified decisions

- **An outline belongs to one mesh asset**, not to the group, and masks only
  that mesh. LiDAR, splats, and the splat clip box are untouched.
- **One simple (possibly concave) 2D polygon, an infinite prism along the
  mesh's local Z.** No holes, no Z bounds.
- **Stored in the mesh's local metres** (before its transform), own JSON format
  (not GeoJSON: RFC 7946 coordinates are WGS84), committed at
  `data/geo3d/<groupId>/<assetId>.outline.json`. Hand-authored, not a bake output.
- **The cut is destructive only at export.** The workbench previews it as a
  mask; `npm run crop-mesh -- --group <id> --asset <assetId>` writes the GLB.
- **Exact clip** at the polygon boundary (triangles split, UVs interpolated).
- **Output is a sibling asset** `<assetId>-cropped` in the same group manifest.
- **Budget decided after measuring**: the CLI reports the numbers; part 2 rules.
- **Draw mode uses an orthographic, exactly-nadir camera**; corners are placed by
  screen → group XY → inverse asset transform.
- **Concave clipping** = earcut the outline into triangles, clip each mesh
  triangle against each piece's three half-planes in 3D (handles vertical faces).
- **Provenance** is one `pipeline` step, not a new manifest field.
- **One PR**: the prep commit first, then the feature.

## 3. Ground preparation

Run 2026-09-17 (`refactor-ground`, with a greenfield cross-check; re-scoped the
same day from per-group to per-mesh, which removed the shared-bind-group prep).

| Touchpoint                            | Verdict               | Blocker / seam                                                                                                                                                                                            |
| ------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orthographic nadir camera             | bolt-on → **prep P1** | perspective hardcoded in `writeSceneCamera.ts:36` and `metresPerPx` (`:46`); pitch clamp `±(π/2−0.01)` (`viewSlice.ts:30`) makes exact nadir unreachable (0.36 m parallax across the mesh's 36 m Z range) |
| Mask polygon reaching the mesh shader | growth                | a binding in the mesh's per-asset group-1 bind group (`texturedMeshRenderer.ts:111-117`, `texturedMesh.wesl:10-12`)                                                                                       |
| Outline slice + load/save saga        | growth                | rows in `rootReducer` / `rootSaga`                                                                                                                                                                        |
| Dev endpoint                          | growth                | `tools/famous-curator/plugin/apiPlugin.ts:123` pattern, `tools/utils/http` helpers                                                                                                                        |
| Outline path                          | growth                | a helper in `tools/scene-recon/manifest/geo3dLayout.ts`                                                                                                                                                   |
| Draw-outline entry point              | growth                | a button on the mesh's row in `LayerList.tsx:24-39`                                                                                                                                                       |
| `crop-mesh` CLI                       | growth                | `bakeMesh.ts:262-292` flow: `meshGlbGeometry` → `packMeshGlb` → `publishAsset`                                                                                                                            |
| Corner clicks                         | growth                | `attachOrbitControls` already exposes `onClick` (`src/services/camera/orbitControls.ts:87`)                                                                                                               |

**P1: projection as data.** `SceneCameraView` carries a `CameraProjection`
(perspective variant only); `writeSceneCamera` and `metresPerPx` read one
`CAMERA_PROJECTIONS[kind]` row. No behaviour change. The feature adds the
orthographic row.

Greenfield divergence resolved at the checkpoint: provenance as a
`derivedFrom` field vs a pipeline step → pipeline step.

## 4. Design

### 4.1 Data

```ts
// tools/scene-workbench/@types/MeshOutline.d.ts
export type MeshOutline = { readonly formatVersion: 1; readonly ringM: readonly Vec2[] };
```

Mesh-local metres (for every current mesh the transform is identity, so these
equal group-frame metres). Open ring (first corner not repeated),
counter-clockwise, ≥ 3 corners, not self-intersecting; `normalizeRing` enforces
all four on save and on CLI read. The path derives from group + asset id
(`meshOutlinePath(groupId, assetId)`); the manifest does not reference it. A
missing file means "no outline".

### 4.2 Endpoint

`tools/scene-workbench/plugin/outlinePlugin.ts`, registered in the workbench's
`vite.config.ts`: `GET /api/outline/:groupId/:assetId` → 200 with the file or
404; `PUT` requires `assetId` to be a `mesh` asset in that group's manifest and
the body to pass `normalizeRing`, then writes via `writeJsonAtomic`. Plan 3b's
nudge endpoint extends this plugin rather than adding a second.

### 4.3 State

New slice `outline`:

```ts
type OutlineSlice = {
  byAssetId: Record<string, { ringM: Vec2[]; masked: boolean }>; // loaded / last saved
  draft: { assetId: string; ringM: Vec2[]; closed: boolean; returnPose: SceneCamera } | null; // non-null ⇔ draw mode
  saveError: string | null;
};
// selectMaskRing(assetId): draft?.assetId === assetId ? null  (trace against the whole mesh)
//                          : byAssetId[assetId]?.masked ? byAssetId[assetId].ringM : null
```

`watchOutlineSaga` runs on three commands and the group actions:
`drawOutlineRequested(assetId)` stores the perspective pose as the draft's
`returnPose` and switches to orthographic; `outlineSaveRequested` PUTs, then
`outlineSaved` moves the ring into `byAssetId` (or `outlineSaveFailed` sets
`saveError`); `outlineDiscardRequested` and `groupSelected` restore
`returnPose` and end the draft. Outlines of every `mesh` asset are fetched
after `manifestLoaded` (404 → absent), cancelled by a later `groupSelected`. The
mask toggle sits beside Draw outline on the mesh's layer row.

### 4.4 Draw mode

- **Camera.** Orthographic row of `CAMERA_PROJECTIONS`: view built from yaw
  only (forward exactly −Z, up = yaw direction), eye a fixed 1000 m above the
  target (near 1 m, far 2000 m — not the group's `boundsM` Z). `distanceM` stays
  the zoom register: `halfHeightM = distanceM · tan(fov/2)`, so the existing
  wheel zoom scales it; every drag pans.
- **Picking.** Screen → group XY through an affine px ↔ group-XY map (the view
  is orthographic with a horizontal basis, so no inverse view-projection), then
  the inverse asset transform → mesh-local XY. Valid while the asset's rotation
  is about Z only; draw mode refuses to open otherwise (every current mesh is
  identity).
- **Splats.** Neither sorted nor drawn while the projection is orthographic —
  `splat.wesl` scales by view depth.
- **Editing.** Click empty space: append a corner. Pointer-down within 8 px of a
  corner then drag: move it (suppresses pan). Click a corner without dragging:
  delete it; the first corner of an open ring with ≥ 3 corners closes it
  instead. Pointer-down within 6 px of an edge (open or closed ring) and at least
  8 px from both its corners: insert a corner at the foot and drag it. Save /
  Discard buttons; Save is enabled only on a closed ring.
- **Overlay.** The draft ring draws as a line-list and the corner handles as
  instanced quads, 8 CSS px wide, over the scene (no depth test), mapped through
  the asset transform at Z 0 (the nadir view ignores Z).

### 4.5 Preview mask

The mesh's per-asset bind group gains a storage buffer written from
`selectMaskRing(assetId)`:

```wgsl
struct MaskPolygon { count: u32, _pad: u32, cornersM: array<vec2f> };
fn insideMask(p: vec2f) -> bool;  // even-odd crossing; count < 3 ⇒ true
```

`texturedMesh.wesl` passes the mesh-local position to the fragment stage and
`discard`s outside. "Masked off" and "no outline" both upload `count = 0`: no
`enabled` flag, no pipeline variant. The buffer grows by reallocation (and a
bind-group rebuild) when the ring outgrows it; no corner cap. The wireframe
pass is not masked.

`insideRing(p, ringM)` (TS, used by the CLI) and `insideMask` (WGSL) are the
same algorithm.

### 4.6 `crop-mesh` CLI

`tools/scene-recon/cropMesh.ts`, `npm run crop-mesh -- --group <id> --asset <assetId>`:

1. Read `<assetId>.outline.json` (error if missing) → `normalizeRing`.
2. Error unless the asset is a `mesh`; `NodeIO().read` → `meshGlbGeometry`
   (positions in mesh-local metres, UVs, indices, image).
3. `triangulateOutline(ringM)` (earcut) → `HalfPlane2[][]`, one triple per piece.
4. `cropMeshGeometry(geometry, ringM, pieces)`:
   - bbox reject against the ring's bbox;
   - **fast path**: all three corners inside and no triangle edge touches an
     outline edge (inclusive, so a reflex corner on an edge still clips) → keep the triangle and its indices untouched;
   - otherwise, per piece, Sutherland–Hodgman against its three half-planes in
     3D, lerping position and UV; fan-triangulate each result polygon;
   - new vertices dedupe by (source edge, lower index first; plane), so
     neighbours cutting a shared edge reuse one vertex; unused source vertices
     are compacted away.
5. `packMeshGlb` with the image bytes unchanged → `assets/<assetId>-cropped/mesh.glb`.
6. `publishAsset` with `id: '<assetId>-cropped'`, the source's `transform` and
   provenance plus `{ step: 'cropMesh', version: <outline sha256, 12 hex> }`,
   and the new `triangleCount`. Re-runs overwrite the same asset id.
7. Print output triangles / source triangles, and the atlas fraction the kept
   UV triangles cover.

Pure functions, one per file under `tools/scene-recon/crop/`: `normalizeRing`,
`insideRing`, `triangulateOutline`, `clipPolygonByHalfPlane`,
`cropMeshGeometry`, `uvCoverage`.

## 5. Out of scope

- Decimation, atlas re-pack/rebake, and the mesh-body budget (part 2).
- Anything in the main app: surface site, datum, shading, ground seam (part 2).
- Outlines on LiDAR or splat assets.
- Multiple outlines per mesh, holes, Z limits, geodetic export.
- A "stale crop" check against the outline hash.

## 6. Risks, judged and accepted

- **Hairline T-junctions inside the boundary strip** where a triangle is split
  across two outline pieces: edge-keyed dedupe removes shared-edge cracks
  between neighbouring triangles, but a piece diagonal crossing one triangle
  leaves unwelded, sub-millimetre-coincident vertices. Confined to boundary
  triangles; part 2's decimation welds anyway.
- **Two copies of the inside test** (TS for the CLI, WGSL for the mask): the TS
  one is unit-tested, the WGSL one checked visually.

## 7. Landmines

- Root vitest cannot link the workbench's WESL (plan 3a): renderer tests
  `vi.mock` the shaders; the WGSL mask is verified visually.
- `public/data` is a symlink into main from worktrees: the CLI's GLB and the
  manifest write land in main's `public/data/geo3d/`. The outline is committed
  under `data/`, so worktree removal is safe for it.
- `lookAt` degenerates straight down; the orthographic row must not route
  through the yaw/pitch `lookAt` path.
- Plan 3b's nudge will make transforms non-identity: the outline follows the
  mesh by construction, but draw-mode picking assumes Z-only rotation (§4.4).

## 8. Backlog edits (this change)

None removed (no matching item). Added: part 2, "Søndermarken 2019 mesh body on
Earth" (`needs-design`, gated on this crop's measurement and terrain F3a).

## 9. Testing

- `normalizeRing`: CW → CCW, drops a repeated closing corner, rejects < 3
  corners and a bow-tie.
- `insideRing`: concave-notch point outside; vertex-on-edge cases stable.
- `cropMeshGeometry`: triangle fully inside (indices untouched), fully outside,
  crossing one edge (area + UV at the cut), inside a concave notch's bbox but
  outside the ring, a vertical triangle crossing the boundary, two triangles
  sharing a cut edge reuse one new vertex.
- `CAMERA_PROJECTIONS`: perspective row reproduces today's matrix (P1 guard);
  orthographic view forward is exactly (0, 0, −1) and a screen corner
  unprojects to target ± `halfHeightM`·aspect.
- `outlinePlugin`: unknown group or non-mesh asset → 404, invalid ring → 400,
  PUT then GET round-trips.
- Visual (user): draw an outline on the 2019 crop mesh, mask toggles, save
  survives reload, `crop-mesh` output toggles against `mesh`.

## 10. New and changed artifacts

- New: `tools/scene-workbench/@types/{MeshOutline,CameraProjection}.d.ts`,
  `plugin/outlinePlugin.ts`, `src/state/outline/{outlineSlice,watchOutlineSaga}.ts`,
  draw-overlay renderer + shader, corner-editing input, `MeshOutlineControls`,
  `tools/scene-recon/cropMesh.ts`, `tools/scene-recon/crop/*`,
  `data/geo3d/soendermarken-crop-2019/mesh.outline.json` (user-drawn), `earcut`
  devDependency, `crop-mesh` npm script. The mask struct and `insideMask` live
  in `texturedMesh.wesl`.
- Changed: `writeSceneCamera.ts`, `sceneCameraView.ts` (P1);
  `texturedMeshRenderer.ts`, `uploadTexturedMesh.ts`, `texturedMesh.wesl`;
  `LayerList.tsx`; `geo3dLayout.ts`; `rootReducer.ts`, `rootSaga.ts`;
  workbench `vite.config.ts` and `README.md`.
