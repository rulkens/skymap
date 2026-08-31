# Grid-box gizmo + rotation — design

**Status:** Draft (2026-08-18), awaiting plan

**Parent:** [`2026-08-18-mcpm-workbench-design.md`](2026-08-18-mcpm-workbench-design.md) — this
spec extends the MCPM workbench's grid-box controls (§6 "Grid box") after Phase 1 shipped with
sliders only. Approved at the refactor-ground checkpoint (user: "ok", 2026-08-18); the checkpoint
record is [`.superpowers/sdd/2026-08-18-mcpm-workbench/gizmo-ground-prep.md`](../../../.superpowers/sdd/2026-08-18-mcpm-workbench/gizmo-ground-prep.md).

## 1. Goal

Two related interactions on the workbench's `Viewport`, both driving the same `GridBox` the sim
already builds against:

1. **Translate/resize gizmo.** Drag handles on the pending-box wireframe to move and resize the
   grid box directly in the 3D view, instead of only through the `GridBoxPanel` sliders.
2. **Rotatable (oriented) grid box.** The box gains an orientation, editable by three rotate rings
   on the same gizmo, so the sim volume can be aligned to a filament or wall that isn't axis-aligned
   in equatorial-cartesian coordinates.

Both land through the same handle set on the same wireframe — the gizmo is one feature with two
handle families, not two features.

## 2. Non-goals

- **No oriented EXPORT resampling.** `.npy`/`.scfd` exports stay exactly what `packLogTraceVoxels` /
  `exportNpy` already produce: the raw trace grid in its own (possibly rotated) local axes. A
  consumer that wants the cube in equatorial-cartesian world axes applies the sidecar's `rotation`
  field itself. Building a resampler that bakes rotation into an axis-aligned output cube is out of
  scope — it's a real feature (trilinear resample onto a new lattice) with its own cost/accuracy
  tradeoffs, not a corollary of storing an orientation.
- **No gizmo for anything but the grid box.** The camera, the catalog bounds, and any future
  handle-driven control are out of scope; this is the grid box's own placement tool.
- **No matrices anywhere in the tool.** Every existing mcpm-workbench module speaks in named basis
  vectors (`CameraBasis.right/up/forward`) or plain Vec3/Vec4 arrays, never a `Mat3`/`Mat4`. The
  gizmo and the rotation plumbing keep that convention deliberately — see §4.

## 3. Ground preparation

Produced by `refactor-ground`, approved by the user 2026-08-18. Carried verbatim from
[`gizmo-ground-prep.md`](../../../.superpowers/sdd/2026-08-18-mcpm-workbench/gizmo-ground-prep.md):

> ### Approved shape (data delta first)
>
> - GridBox gains `rotation: Quat` (identity default). sizeMpc/dims/voxelSize invariants untouched.
> - New transform pair in field/: worldToBoxLocal(box, p) / boxLocalToWorld(box, p) — THE home of R.
>   worldToVoxel = worldToBoxLocal then /voxelSizeMpc; voxelToWorld the exact inverse.
> - cameraBasis gains R^-1 on direction vectors (its "cubic voxels => uniform scale" shortcut dies).
> - Shaders: propagate/fragment/volpath need ZERO changes (rays arrive as host-computed eye+basis in
>   voxel space; slab tests stay axis-aligned in voxel space).
> - boxLines BoxUniform{min,max} -> center + halfExtents + 3 basis vectors (8 real corners host-side).
> - Sidecar + presets: optional `rotation` field; missing => identity (old exports stay valid;
>   comparator unaffected — grid-space cubes).
> - Gizmo infra (new): screenToRay(cam, ndc) by basis algebra (no matrices anywhere in the tool —
>   deliberate); analytic ray-vs-handle hit tests; a hit-test gate at the TOP of Viewport's
>   onPointerDown ahead of the orbit/pan branch (gizmoDragging short-circuits camera drags).
>
> ### Bolt-on inventory to fix in prep (explorer, file:line)
>
> - Origin math `center ± size/2` hand-rolled 4x: worldToVoxel.ts:10-14, voxelToWorld.ts:6-10,
>   boxPreviewPass.ts:34-40 (worldBounds), deriveGridBox.ts:14-20 (manualBounds),
>   emitTraceSidecar.ts:46-50.
> - cameraBasis.ts:12-18,31-37 bypasses the affine for directions (writeMcpmCamera.ts:26,
>   tracePass.ts:176 inherit).
> - fragment.wesl:58-59 and volpath.wesl:250-253 hand-duplicate ray reconstruction (consume basis
>   vectors; fixed host-side, but the lockstep pair is a known duplication).
> - voxelToWorld has ZERO consumers today (gains them via gizmo).
> - Main-app picking (resolvePick GPU ID-buffer) NOT reusable for drag; cameraGizmoLines.ts is the
>   display-only style precedent.
>
> ### Sequencing (user-approved, rides PR #570)
>
> - Prep A (pure refactor, byte-identical): worldToBoxLocal/boxLocalToWorld pair; funnel all 4 origin
>   duplicates.
> - Prep B (pure refactor): cameraBasis routes directions through the affine with identity R.
> - F1: gizmo translate + resize handles on the axis-aligned box.
> - F2: rotation — GridBox.rotation, R in the pair + cameraBasis, boxLines corners, rotate rings,
>   sidecar/presets field.

**How the funnel resolves the "4x" (5-site) duplication.** All five sites compute the same
`half = sizeMpc / 2` primitive before combining it with `centerMpc` one way or another. Prep A gives
that primitive one home — `boxHalfExtentMpc(sizeMpc) -> Vec3` in `field/` — and both new pair
functions (`worldToBoxLocal`/`boxLocalToWorld`) and the three non-pair call sites
(`deriveGridBox.ts`'s `manualBounds`, `emitTraceSidecar.ts`'s `originMpc`, `boxPreviewPass.ts`'s
`worldBounds`) call it instead of re-deriving `half` inline. `worldToVoxel.ts`/`voxelToWorld.ts`
collapse to one-line wrappers around the pair. `boxPreviewPass.ts`'s `worldBounds` (an axis-aligned
min/max) is legitimate at Prep A time — `GridBox.rotation` doesn't exist yet — and is replaced
outright in F2 by the corner/basis computation below, not merely refactored.

## 4. Architecture

### The transform pair and where R lives

`worldToBoxLocal`/`boxLocalToWorld` (`tools/mcpm-workbench/src/field/`) become the single home of
the position transform. "Box-local" here means the same frame `worldToVoxel` already returns before
the `/voxelSizeMpc` step: origin at the box's own corner `(0,0,0)`, range `[0, sizeMpc]` per axis —
so `voxel = boxLocal / voxelSizeMpc` is a plain uniform scale, unaffected by rotation. Rotation, when
F2 adds it, sits entirely in the step that maps a _centered_ offset into that frame:

```
worldToBoxLocal(box, p) = R⁻¹·(p − centerMpc) + halfExtentMpc     // range [0, sizeMpc]
boxLocalToWorld(box, q) = R·(q − halfExtentMpc) + centerMpc       // exact inverse
```

`R` is never a `Mat3`. §4's quaternion (pinned below, §7) is applied through
`rotateVec3ByQuat(q, v)`, and `R⁻¹` is the same call with the conjugate `[−x, −y, −z, w]` — cheap
because a unit quaternion's inverse is its conjugate, no separate "invert" routine to keep in step.

`worldToVoxel`/`voxelToWorld` (unchanged public signatures) become one-line wrappers: divide/scale
`worldToBoxLocal`/`boxLocalToWorld`'s result by `voxelSizeMpc`. Every existing consumer —
`seedAgents.ts` (already calls `worldToVoxel`, needs no edit), `writeMcpmCamera.ts`,
`tracePass.ts`, `boxPreviewPass.ts` — inherits rotation for free once F2 lands, because they already
go through the pair rather than hand-rolling the origin math themselves (Prep A's whole point).

### `cameraBasis` gains the box, direction rotation lands in F2

`cameraBasis(eyeMpc, targetMpc, upMpc)` today returns world-space unit `right`/`up`/`forward` and
relies on "voxels are cubic ⇒ uniform scale ⇒ a normalized world direction is already a valid voxel
direction." That shortcut is true only for translate+scale; a rotated box needs directions rotated by
`R⁻¹` too (rotation doesn't commute with the uniform-scale argument the current comment makes).

Prep B threads a `box: GridBox` parameter through `cameraBasis` and its two direct callers
(`writeMcpmCamera.ts:26`, `tracePass.ts:176` — both already have `box` in scope, so this is a
parameter addition, not a new dependency) with **no rotation math added yet** — `GridBox.rotation`
doesn't exist until F2. This is why Prep B is byte-identical: the signature changes, the numeric
output cannot, because there is nothing to rotate by. F2 fills in the body: rotate `right`/`up`/
`forward` by `R⁻¹` (via `rotateVec3ByQuat`) before returning. No third call site exists — every other
pass reaches the camera through `writeMcpmCamera` (`splatPass.ts:214`, `volpathPass.ts:276`,
`galaxyOverlayPass.ts:127`), so F2 touches exactly two files for this leg.

**Erratum (shipped):** the R6 extraction added a third `cameraBasis` caller,
`rayFromPointer.ts` (gizmo pick ray). It deliberately passes an identity-rotation copy of the
box — the gizmo picks against world-space handle geometry, never the rotated one — pinned by a
regression test (commit `99589b52d`).

### Zero-shader-change argument

`propagate.wesl`, `decay.wesl`, `histogram.wesl` never see camera or world coordinates — they walk
`array<f16>` by voxel index, untouched by any of this. `fragment.wesl` and `volpath.wesl` consume
`camVoxel`/`camRight`/`camUp`/`camForward` from the shared `McpmCamera` uniform and treat them as
**already voxel-space** — they always did, on the (previously true) assumption that world and voxel
directions coincide after normalizing. That assumption becomes explicit rather than accidental: the
host now _guarantees_ it by applying `R⁻¹` before the uniform is written (§4 above), so the shader's
own math (`dir = normalize(camForward + camRight·ndc.x + camUp·ndc.y)`, the slab `intersectGrid`
tests) is correct for any rotation with the exact same WGSL it has today. Nothing in
`camera.wesl`/`fragment.wesl`/`volpath.wesl` changes for rotation.

`boxLines.wesl` is the one shader that **does** change, and not because of `voxelToNdc` (unaffected,
same reasoning) — because its `BoxUniform` currently stores an axis-aligned `min`/`max`, which cannot
express an oriented box's 8 corners at all. F2 reshapes it to `center + halfExtents + 3 basis
vectors` (voxel space, already `worldToVoxel`'d host-side) and the vertex shader reconstructs each
corner as `center + select(-half,+half,bit)·basisX + …` for the three axes — three FMAs, not a
matrix. Carrying explicit basis vectors (rather than just the 8 corners) is deliberate: the gizmo's
own handle geometry (§5) wants the same three world-space axis directions to point its translate
arrows and orient its rotate rings, so `boxBasisVectors(rotation) -> {x, y, z}` (mirroring
`CameraBasis`'s shape) is one function serving both the wireframe and the handles.

### `voxelToWorld` gains its first consumers

`voxelToWorld.ts` has zero callers today. The gizmo is the first: hit-testing and drag math both
work in world Mpc (screen rays are naturally world-space), so converting a voxel-space quantity back
to world for display, or reasoning about handle positions computed from `GridBox` fields (which are
already world Mpc), exercises the inverse leg of the pair that Prep A stands up but nothing uses yet.

## 5. Gizmo interaction design

### Handle set

| Family    | Count | Geometry                                              | Edits                                                        | Phase |
| --------- | ----- | ----------------------------------------------------- | ------------------------------------------------------------ | ----- |
| Translate | 3     | Arrow from box center along each local axis           | `manualCenterMpc`                                            | F1    |
| Resize    | 6     | Small handle at each face center (±axis × halfExtent) | `manualCenterMpc` + `manualSizeMpc` (opposite face anchored) | F1    |
| Rotate    | 3     | Ring around the box center, normal = each local axis  | `rotation`                                                   | F2    |

All three families are driven by the same three **world-space axis directions** — `[1,0,0]`,
`[0,1,0]`, `[0,0,1]` before F2, `boxBasisVectors(box.rotation)`'s `x`/`y`/`z` after. The hit-test and
drag functions below take that axis direction as an explicit parameter rather than hardcoding a
coordinate axis internally, specifically so F2 only has to change what's _passed in_ — not the
math itself. `gizmoHandleGeometry` is the one place that decides which axis set to pass, and is the
only function this seam requires F2 to revisit (besides the rotate-ring additions, which are new
code, not an edit).

### Ray casting — no matrices

```ts
export type Ray = { readonly origin: Readonly<Vec3>; readonly dir: Readonly<Vec3> }; // dir unit

export function screenToRay(
  eyeMpc: Readonly<Vec3>,
  basis: CameraBasis, // world-space right/up/forward, same shape cameraBasis returns
  fovYRad: number,
  aspect: number,
  ndc: readonly [number, number], // [-1,1], y-up
): Ray;
```

Mirrors `fragment.wesl`'s own `dir = normalize(camForward + camRight·ndc.x·tan(fovY/2)·aspect +
camUp·ndc.y·tan(fovY/2))`, computed host-side in **world** space from the _unrotated_ `CameraBasis`
(the gizmo picks against world-space handle geometry, never voxel space) — basis-vector algebra, the
same shape as `cameraGizmoLines.ts`'s existing local `add`/`sub`/`cross`/`norm` helpers, not a
projection matrix inverse.

### Handle geometry and picking

```ts
export type GizmoHandleId =
  | { readonly kind: 'translate'; readonly axis: 0 | 1 | 2 }
  | { readonly kind: 'resize'; readonly axis: 0 | 1 | 2; readonly sign: 1 | -1 }
  | { readonly kind: 'rotate'; readonly axis: 0 | 1 | 2 }; // F2 only

export function gizmoHandleGeometry(
  box: GridBox,
  axes: readonly [Readonly<Vec3>, Readonly<Vec3>, Readonly<Vec3>], // world-space, unit
): GizmoHandleGeometry; // world-space positions/directions for every handle in §5's table

export function pickGizmoHandle(ray: Ray, geometry: GizmoHandleGeometry): GizmoHandleId | null;
```

**Hover/active highlight** is data-driven, not a shader branch per handle: `boxPreviewPass`'s
`BoxUniform` (or a small sibling uniform, F1 task's call) carries two small integers, `hoverHandle`
and `activeHandle`, encoding a `GizmoHandleId` as a flat index (`kind*100 + axis*10 + (sign<0?1:0)`
or similar — the plan pins the exact encoding). Every handle glyph vertex carries its own flat id
(uploaded alongside its position, §5's `gizmoHandleGeometry` output), and the fragment stage picks
one of three fixed colors by comparing that id against the two uniform ints — one small `select`
chain, not a per-handle-kind conditional (`simplicity.md` #7: table/data lookup, not a branch tree).

Handle size and pick tolerance are **world-space, sized off the box itself** (a fixed fraction of
`min(halfExtentMpc)`), not screen-space-constant. This is a deliberate simplification: the workbench
has no existing screen-space-constant-size precedent to build on, the box normally fills most of the
frame while its controls are in use, and adding depth-based rescaling would be new machinery serving
a polish concern, not a correctness one. Listed as an open item (§9) if it proves annoying at very
oblique zoom levels.

**Erratum (shipped):** the rotate rings shipped sized off `arrowLengthMpc` (the translate
arrows' own constant-screen-size length) rather than `halfExtentMpc` —
`RING_RADIUS_FRACTION = 1.3 × arrowLengthMpc` (`gizmoHandleGeometry.ts`), placing rings outside
the arrow tips per user directive during F2.5.

`pickGizmoHandle` replaces GPU ID-buffer picking outright for this use — the ground prep is explicit
that `resolvePick` (main-app picking) is not reusable for drag, and a per-pointer-move GPU readback
would add a frame of latency a CPU ray test doesn't need. This mirrors `cameraGizmoLines.ts`'s
existing precedent of doing camera-frustum geometry entirely host-side rather than through any
GPU-resident picking path.

### Drag math

Two pure functions, each independent of whether `GridBox.rotation` exists (F1 passes `axisDir =
UNIT_AXES[axis]`; F2 passes `boxBasisVectors(box.rotation)[axis]` — no signature change):

```ts
export function applyTranslateDrag(
  box: GridBox,
  axisDir: Readonly<Vec3>, // world-space unit direction for this handle's axis
  deltaMpc: number, // signed distance along axisDir since the drag anchor
): Vec3; // new centerMpc = box.centerMpc + axisDir * deltaMpc

export function applyResizeDrag(
  box: GridBox,
  axis: 0 | 1 | 2,
  axisDir: Readonly<Vec3>,
  sign: 1 | -1, // which face — from the picked GizmoHandleId
  deltaMpc: number,
): { readonly centerMpc: Vec3; readonly sizeMpc: Vec3 };
```

`applyResizeDrag`'s opposite face stays anchored: `sizeMpc[axis] += sign · deltaMpc` (floored at a
small positive minimum so a handle can't be dragged through the box), `centerMpc += axisDir ·
(deltaMpc / 2)` — no `sign` factor; the `sign · deltaMpc/2` form is wrong at `sign = -1`, where it
drifts the anchored face by `|deltaMpc|` instead of holding it fixed (erratum found in F1.3 review).
The shipped code uses the equivalent anchored form `center = anchor + sign·newHalf·axisDir`
(`tools/mcpm-workbench/src/gizmo/applyResizeDrag.ts`), which expands to the sign-independent formula
above at both signs. Both are ray-vs-axis problems, not ray-vs-plane: `deltaMpc` is the caller's
job to derive, via the closest point between the pointer ray and the 3D line `(anchorWorldPos,
axisDir)` — a skew-line closest-point calculation, one pure function:

```ts
export function closestPointOnRayToLine(
  ray: Ray,
  lineOrigin: Readonly<Vec3>,
  lineDir: Readonly<Vec3>, // unit
): number; // t such that lineOrigin + t*lineDir is nearest the ray
```

The caller (Viewport's drag state) captures `t` at pointer-down as the anchor, and feeds
`deltaMpc = t_now − t_anchor` into `applyTranslateDrag`/`applyResizeDrag` each pointer-move — so the
pure functions never see "drag state" at all, only a single delta, keeping them trivially testable
(§6) and free of the anchor-tracking concern (a UI-state responsibility, kept in Viewport's existing
closure-variable style — `dragging`/`panning` are already plain closure locals there, not store
fields, and `gizmoDragging`'s anchor follows the same pattern).

**Rotate rings (F2).** A ring drag is ray-vs-plane, not ray-vs-axis — the pointer moves around the
ring's own plane (normal = the ring's axis direction, through the box center):

```ts
export function rayPlaneIntersect(
  ray: Ray,
  planePoint: Readonly<Vec3>,
  planeNormal: Readonly<Vec3>, // unit
): Vec3 | null; // null when the ray is parallel to the plane

export function dragRotate(
  ray: Ray,
  centerMpc: Readonly<Vec3>,
  axisDir: Readonly<Vec3>, // ring normal, world-space unit
  referenceDir: Readonly<Vec3>, // any unit vector ⊥ axisDir — the ring's own 0°-angle reference
): number | null; // absolute angle (radians) of the pick point around the ring, via atan2
```

The absolute-angle design matters: Viewport captures `angle_anchor` and `rotation_anchor =
box.rotation` once at pointer-down, and on every subsequent pointer-move recomputes the full
rotation from that **fixed** anchor — `rotation' = quatFromAxisAngle(axisDir, angle_now −
angle_anchor) · rotation_anchor` — rather than accumulating a small quaternion multiply onto the
_previous_ frame's rotation. Composing from a fixed anchor every frame means a single-precision
rounding error on frame 500 of a drag can't compound into frame 501's input the way a running
multiply would; it also means no renormalization step is needed mid-drag, because each frame starts
from the same unit-length `rotation_anchor` and multiplies by a freshly-constructed unit quaternion.

### State flow

Every gizmo edit lands through the **existing** `gridSlice` setters — `setManualCenterMpc`,
`setManualSizeMpc`, and a new `setRotation` (F2) of the identical shape. This is why the V3
`importedBox` ruling (`gridSlice.ts`'s comment: "every setter... a user reaches through the
grid-controls UI clears `importedBox`") applies to the gizmo unchanged and needs no new rule: a
gizmo drag is exactly "the user reaching through the grid controls," just through the 3D view
instead of a slider, so it clears a loaded preset's box override exactly as a slider edit already
does. `setRotation` follows the same pattern as its four siblings.

The pending-box wireframe (`boxPreviewPass` / `RenderGraph.drawBoxPreview`) is already drawn every
frame a box-shaping change is "hot" (`Viewport.tsx`'s `boxPreviewUntil` window, §"Ground
preparation" bolt-on list) — the gizmo reuses this exact pass as its own visual ground rather than
standing up a second wireframe: `boxPreviewPass`'s `draw()` grows an optional gizmo-state parameter
(hover handle, active/dragging handle) so one pipeline draws both the box edges and the handle
glyphs from one `BoxUniform`-derived data set, and while `gizmoDragging` is truthy the wireframe stays
visible unconditionally (not gated by the 200ms `boxPreviewUntil` timer, which exists for the
slider case where there's no continuous pointer signal to key off of).

Viewport's `onPointerDown` gains a hit-test gate **before** the existing `dragging = true` /
`panning` branch (ground prep, verbatim): compute the click ray via `screenToRay`, call
`pickGizmoHandle`; a hit sets `gizmoDragging` to that handle and `canvas.setPointerCapture`s exactly
as the orbit path already does, then returns early — the orbit/pan logic is untouched code, not
special-cased for the gizmo. A miss falls through to the existing branch unchanged.
`onPointerMove` gains a symmetric branch: if `gizmoDragging`, compute the new ray and dispatch to
the handle-kind-appropriate drag function; otherwise the existing orbit/pan code runs as today. A
plain (non-dragging) `onPointerMove` also updates a local `hoverHandle` via `pickGizmoHandle`, purely
for the render layer's highlight — no store write, matching `dragging`/`panning`'s existing pattern
of staying in Viewport's closure rather than the store.

## 6. Testing strategy

Per [`testing.md`](../conventions/testing.md): pure math gets hand-computed or round-trip
assertions; nothing GPU-shaped is unit-tested (the probe is the gate, per the parent spec's own
testing strategy).

- **`worldToBoxLocal`/`boxLocalToWorld` round trip.** `boxLocalToWorld(box, worldToBoxLocal(box, p))
=== p` (within float epsilon) for several `p`, at identity rotation (Prep A) and at a
  non-trivial rotation (F2) — the property the whole pair exists to guarantee, and the one a wrong
  sign on `R⁻¹` would break silently.
- **`worldToVoxel`/`voxelToWorld` — hand-computed**, not a mirror of the pair: a point at a known
  Mpc position lands at a hand-computed voxel index (existing test, `worldToVoxel.test.ts`),
  extended with one non-identity-rotation case once F2 lands.
- **`cameraBasis` — byte-identical at identity rotation** (Prep B's own regression net, alongside
  the probe): existing `cameraBasis.test.ts` assertions must still pass with the new `box` parameter
  supplied and set to an identity-rotation box. F2 adds a rotated-box case asserting the returned
  basis is still orthonormal (`dot(right,up) ≈ 0`, `|right| ≈ 1`, …) and matches a hand-rotated
  expectation for one simple 90°-about-Y case.
- **`screenToRay`** — a hand-computed ray for `ndc = [0,0]` (must equal the basis's `forward`) and
  for a known off-center `ndc`, computed independently (by hand, not by re-deriving
  `fragment.wesl`'s formula in the test).
- **Handle hit-tests** (`pickGizmoHandle`) — a ray aimed exactly at a translate arrow's tip returns
  that handle; a ray through the box center but between handles returns `null`; a ray through one
  resize handle's face does not also match its neighbours (tests the tolerance radius doesn't
  overlap adjacent handles at the smallest supported box size — the one real bug class this class of
  test catches).
- **`applyTranslateDrag`/`applyResizeDrag`** — hand-computed: a `deltaMpc` of `+5` along
  `axisDir = [0,1,0]` moves `centerMpc.y` by exactly `5`; a resize with `sign = 1` on the same axis
  grows `sizeMpc.y` by `deltaMpc` and shifts `centerMpc.y` by `deltaMpc/2`, leaving the `y = center −
half` face unmoved (the anchored-opposite-face property, asserted directly by recomputing that
  face's position before and after).
- **`closestPointOnRayToLine`/`rayPlaneIntersect`** — hand-computed skew-line and plane cases
  (textbook geometry, independently derived, not copied from the implementation).
- **`dragRotate` / rotation composition (F2)** — a full-turn round trip
  (`angle_now = angle_anchor + 2π` reproduces `rotation_anchor`, within quaternion sign ambiguity —
  compare via `rotateVec3ByQuat`, not raw component equality, since `q` and `−q` represent the same
  rotation); a quarter-turn about a coordinate axis matches a hand-computed quaternion.
- **`rotateVec3ByQuat`/`quatFromAxisAngle`/`multiplyQuat`** (`src/utils/math/`) — hand-computed
  90°/180° rotations about each coordinate axis; identity quaternion is a no-op; composing two
  quarter-turns about the same axis matches one half-turn (an independent property, not the same
  formula fed back).
- **Sidecar/preset `rotation` field round trip** — `emitTraceSidecar`/`exportParams` with a
  non-identity rotation survives the JSON hop; a sidecar/preset with the field **absent** decodes to
  identity (the backward-compat contract, §8) rather than throwing.
- **No GPU tests.** `boxLines.wesl`'s corner reconstruction, the gizmo's WGSL glyph drawing, and any
  visual highlight state are covered by the probe (`npm run mcpm-workbench:probe`, extended to run
  through gizmo geometry once with a non-identity rotation) plus the maintainer's manual visual
  checklist (plan Definition of Done) — nothing about "does the wireframe look right" is a Vitest
  assertion, per the parent spec's own "deliberately not tested: anything visual."

## 7. Pinned decision: quaternion representation

**`GridBox.rotation: Readonly<Vec4>`** — `[x, y, z, w]`, identity `[0, 0, 0, 1]`. Same wire spelling
in the sidecar and preset JSON: `"rotation": [0, 0, 0, 1]`, a plain 4-number array alongside the
existing plain-array fields (`centerMpc`, `sizeMpc`, `dims`).

**Not a 3×3 basis**, for three concrete reasons:

1. **Matches the tool's own convention.** The ground prep is explicit that "no matrices anywhere in
   the tool" is deliberate; a flat 9-number basis array would be the tool's first matrix-shaped
   value, and would immediately raise the row-major-vs-column-major question
   `matrixToQuaternion.ts`'s own doc comment has to call out ("Indexed for column-major storage").
   A quaternion has no such ambiguity.
2. **Cheap to validate, no drift to renormalize.** `importParams.ts`'s existing validator pattern
   (`num`, `vec3`) extends to a `vec4` check plus one scalar assertion, `|q| ≈ 1`. A hand-edited or
   slightly-imprecise 3×3 basis needs a full orthonormality check — three unit-length columns _and_
   three pairwise-zero dot products, six conditions — before it's safe to use; a quaternion needs
   one magnitude check. The same asymmetry applies at runtime: composing incremental rotations
   (§5's `dragRotate`) via quaternion multiply never needs a renormalization step because each drag
   frame recomputes from a fixed unit-length anchor (§5), whereas a 3×3 basis accumulated by
   repeated small rotations _would_ drift off-orthonormal without an explicit re-orthogonalization
   pass.
3. **Already the codebase's convention for a stored orientation.** `matrixToQuaternion.ts` and
   `liveUpBasisQuat.ts` already store/pass orientation as `Vec4 (x, y, z, w)` elsewhere in the repo
   (`src/utils/math/`, `src/services/engine/camera/`) — `GridBox.rotation` follows that precedent
   rather than inventing a second convention for the same kind of value.

`rotateVec3ByQuat`, `quatFromAxisAngle`, and `multiplyQuat` (new, `src/utils/math/`, one function per
file per convention) are the only quaternion primitives the tool needs; no `Quat` type alias is
introduced — `Vec4` is used directly, matching `liveUpBasisQuat`'s existing precedent of not
aliasing it either.

## 8. Sidecar and preset `rotation` field

`emitTraceSidecar.ts`'s JSON payload and `exportParams.ts`'s `McpmParamsPreset.gridBox` both gain an
optional `rotation` field at the `GridBox`'s own level (not nested under `provenance`), spelled
`[x, y, z, w]`. Missing means identity: `importParams.ts`'s validator defaults a missing/absent field
to `[0, 0, 0, 1]` rather than failing, so every sidecar and preset written before this feature landed
stays valid. The comparator (`compareTraceCubes.ts`) is unaffected — it operates on grid-space cubes
and never reads `rotation` — matching the ground prep's own note.

A non-identity `rotation` on an exported cube is honest metadata, not an instruction the importer
acts on (§2's non-goal): `buildRhizomeVolume.ts` and the comparator keep treating the cube as the flat
grid-space array it is. A downstream consumer that cares about world alignment reads `rotation` and
applies it itself.

## 9. Open items

- **Screen-space-constant handle sizing** (§5) is deferred; if very oblique or very zoomed views make
  handles hard to grab or too large, revisit with a depth-based scale term.
- **Two-finger/touch input** is out of scope — the parent spec already scopes the whole tool to
  "Mobile, touch, or non-Chromium support" as a non-goal; the gizmo inherits that.
- **Rotate-ring visual occlusion** (a ring edge-on to the camera is hard to see or grab) is a known
  limitation of the ring-gizmo style generally; not addressed here beyond the world-space pick
  tolerance already giving some slack. If it proves a real usability problem, a per-ring
  camera-facing highlight (fade a ring's opacity as its normal approaches the view direction) is the
  standard fix and can be added without touching the drag math.
- **Undo.** Neither the existing slider controls nor this gizmo have any undo/redo; a bad drag is
  fixed by re-dragging or re-entering slider values. Out of scope, consistent with the rest of the
  tool.
