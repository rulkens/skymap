# Grid-box gizmo + rotation — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` to
> implement this plan task-by-task, under
> [`docs/superpowers/conventions/sdd-execution.md`](../conventions/sdd-execution.md). Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`docs/superpowers/specs/2026-08-18-grid-box-gizmo-design.md`](../specs/2026-08-18-grid-box-gizmo-design.md).
Every design question — the transform pair, R's two host-side homes, the zero-shader-change
argument, the quaternion pin, the handle set and drag math contracts — is settled there and in the
ground-prep record it carries verbatim
([`.superpowers/sdd/2026-08-18-mcpm-workbench/gizmo-ground-prep.md`](../../../.superpowers/sdd/2026-08-18-mcpm-workbench/gizmo-ground-prep.md)).
**Do not re-litigate.** Where this plan and the spec disagree, the spec wins — except for the exact
function signatures below, which the spec deliberately left at contract-sketch level and this plan
pins.

**Goal:** drag handles on the MCPM workbench's pending-box wireframe to translate and resize the
grid box, and three rotate rings to orient it — replacing/extending the `GridBoxPanel` sliders as
the box's placement tool, without any shader touching rotation except `boxLines.wesl` (spec §4's
zero-shader-change argument).

**Architecture:** two host-side homes for the rotation `R` — the `worldToBoxLocal`/`boxLocalToWorld`
transform pair (position) and `cameraBasis` (direction) — both in `tools/mcpm-workbench/src/`,
alongside a new `src/gizmo/` module of pure ray-casting, hit-testing, and drag-math functions with
no GPU dependency. Three new quaternion primitives land in `src/utils/math/` (repo-shared, one
function per file, matching `matrixToQuaternion.ts`'s existing precedent). `boxLines.wesl` is the
only shader edited; `propagate.wesl`, `decay.wesl`, `histogram.wesl`, `fragment.wesl`, `volpath.wesl`
stay untouched.

**Tech stack:** unchanged from the parent MCPM workbench plan — TypeScript + Vite + React, raw
WebGPU, WESL, Vitest, the headless GPU probe. No redux, no new UI framework.

## Ground preparation

Spec §3 (carrying `gizmo-ground-prep.md` verbatim): two prep refactors, **A1** and **B1** below,
each its own commit, both byte-identical to current behaviour, sequenced before the feature tasks.

## Global constraints

- `type` aliases, never `interface`. Deep relative imports, no barrels. One exported function per
  file under `src/utils/` and `tools/mcpm-workbench/src/gizmo/`/`src/field/`; one type per file
  under `@types/` — the tool's `@types/*.d.ts` files hold real `export type` declarations imported
  normally (`tools/mcpm-workbench/@types/GridBox.d.ts` is the existing pattern), not ambient
  globals.
- Comment budget: module header ≤ 10 lines, comment lines ≤ half the file's code lines. A comment
  earns its place by recording a landmine, a unit, a derivation, or a cross-file contract — not by
  restating a formula the code already shows. The quaternion-sign / anchor-recompute reasoning
  (spec §5's `dragRotate` note) is exactly the kind of thing that DOES earn a comment where the code
  lands; a `.d.ts`'s purpose line does not need a paragraph.
- **Every task that edits a `.wesl` file must invoke the project's `wesl-shaders` skill first** —
  `F1.4` (glyph draw), `F2.4` (`boxLines.wesl` corner reshape), and `F2.5` (ring glyph draw) are the
  three tasks that touch `.wesl`.
- Tests live under `tests/` mirroring the tree: `tests/tools/mcpm-workbench/gizmo/**`,
  `tests/tools/mcpm-workbench/field/**`, `tests/utils/math/**`. Judge every test by
  [`testing.md`](../conventions/testing.md)'s one question — no mirror tests (a hand-computed
  expectation, not a re-derivation of the function under test), no constant restatements, no
  clamp-boundary tests. Spec §6 lists what each new function's tests must actually assert; follow
  it, don't invent alternates.
- Typecheck is `npm run typecheck` (both tsconfigs — `tools/` is already covered, no new tsconfig
  registration needed). **Never start, stop, or restart the dev server; never touch port 5500** —
  the maintainer's own `npm run mcpm-workbench` session owns it. Use `npm run typecheck` and
  `npm test` to verify; use `npm run mcpm-workbench:probe` for the GPU gate.
- Stage specific paths in every commit; never `git add -A`. Format only touched files (`npx prettier
  --write <paths>`, never a repo-wide format pass).
- `npm test` and `npm run typecheck` stay green at every commit. `npm run mcpm-workbench:probe`
  stays green at every task that touches a `.wesl` file or the render graph.
- Nothing in this feature writes to `public/data` or the data manifest — unchanged from the parent
  plan's constraint; the gizmo only ever writes `gridSlice` fields already wired to the sim.

## Plan-authored contracts

The spec pinned the architecture and the quaternion representation. These five signatures it left
at sketch level; this plan decides the exact shape so tasks have a contract to hit.

1. **`GizmoHandleId` flat encoding for the highlight uniform** — `kind*100 + axis*10 +
   (sign === -1 ? 1 : 0)`, `kind` = `0` translate / `1` resize / `2` rotate. `-1` means "no handle"
   (used for both `hoverHandle`/`activeHandle` when nothing is hovered/dragging). Defined once in
   `tools/mcpm-workbench/src/gizmo/encodeGizmoHandleId.ts` (F1.2) so the TS-side glyph-vertex
   generation and the uniform write agree by construction.
2. **`GizmoDragState`** — the union Viewport's `gizmoDragging` closure variable holds (F1.5):
   ```ts
   export type GizmoDragState =
     | { readonly handle: Extract<GizmoHandleId, { kind: 'translate' | 'resize' }>; readonly anchorAxisParam: number }
     | { readonly handle: Extract<GizmoHandleId, { kind: 'rotate' }>; readonly anchorAngleRad: number; readonly anchorRotation: Readonly<Vec4> };
   ```
3. **`gizmoHandleGeometry`'s output shape** — three `@types` files (one type per file, per the
   Global constraints):
   ```ts
   // Handle.d.ts
   export type Handle = { readonly id: GizmoHandleId; readonly positionMpc: Vec3; readonly axisDir: Vec3 };
   // RingHandle.d.ts
   export type RingHandle = { readonly id: GizmoHandleId; readonly centerMpc: Vec3; readonly axisDir: Vec3; readonly radiusMpc: number };
   // GizmoHandleGeometry.d.ts
   export type GizmoHandleGeometry = {
     readonly translate: readonly [Handle, Handle, Handle];       // one per axis
     readonly resize: readonly [Handle, Handle, Handle, Handle, Handle, Handle]; // one per face, ±axis order
     readonly rotate: readonly [RingHandle, RingHandle, RingHandle];             // F1: empty-radius stub; F2: real
   };
   ```
   F1 populates `rotate` with `radiusMpc: 0` placeholders (never hit-tested — `pickGizmoHandle`
   skips any `RingHandle` with `radiusMpc <= 0`) so the type is stable across F1/F2 and F2 only
   changes the values, not the shape or any F1 call site.
4. **Handle sizing constants** (`tools/mcpm-workbench/src/gizmo/gizmoHandleGeometry.ts`):
   `ARROW_REACH_FRACTION = 0.6` (translate arrow tip at `0.6 · halfExtentMpc[axis]` from center —
   inside the box face, not poking through it), `PICK_TOLERANCE_FRACTION = 0.05` (of
   `min(halfExtentMpc)`), `RING_RADIUS_FRACTION = 0.8` (F2, of `halfExtentMpc[axis]` for the *other*
   two axes' extent — a ring around axis X sizes off `min(halfExtentMpc.y, halfExtentMpc.z)`, so it
   never pokes through a non-cubic box's shorter faces).
5. **`boxLines.wesl`'s `BoxUniform` byte layout (F2.4)** — replaces the current 32-byte
   `{boxMin: vec3, pad, boxMax: vec3, pad}`:

   | offset | field         | type      |
   |--------|---------------|-----------|
   | 0      | `center`      | `vec3<f32>` |
   | 12     | `_pad0`       | `f32`     |
   | 16     | `halfExtents` | `vec3<f32>` |
   | 28     | `_pad1`       | `f32`     |
   | 32     | `basisX`      | `vec3<f32>` |
   | 44     | `_pad2`       | `f32`     |
   | 48     | `basisY`      | `vec3<f32>` |
   | 60     | `_pad3`       | `f32`     |
   | 64     | `basisZ`      | `vec3<f32>` |
   | 76     | `_pad4`       | `f32`     |

   80 bytes total, 16-byte-aligned rows throughout (matches every existing uniform in this shader
   family). All values already in the BUILT box's voxel space (host-side `worldToVoxel`'d), matching
   today's `boxMin`/`boxMax` convention.

## Dependency DAG

Implementers are strictly serial (one working tree). This DAG is for **pipelined reviews**:
dispatch implementer N+1 alongside reviewer N only when their **Files** sets are disjoint.

```
A1 → B1                                            (prep; both byte-identical, probe is the net)
B1 → F1.1 → F1.2 → F1.3 ∥ F1.4                     (F1.3 drag math has no F1.4 dependency)
F1.2, F1.3, F1.4 → F1.5 → F1.6 → F1-GATE           [F1 GATE — visual checklist]
F1-GATE → F2.1 ∥ F2.2 → F2.3 → F2.4 → F2.5 → F2-GATE
```

Sequential (never overlap a review): A1→B1, F1.2→F1.5, F2.3→F2.4→F2.5, both gates.

---

# Ground preparation

### A1: `worldToBoxLocal`/`boxLocalToWorld` transform pair; funnel the origin-math duplicates

**Files (create):** `tools/mcpm-workbench/src/field/boxHalfExtentMpc.ts`,
`tools/mcpm-workbench/src/field/worldToBoxLocal.ts`,
`tools/mcpm-workbench/src/field/boxLocalToWorld.ts`,
`tests/tools/mcpm-workbench/field/boxHalfExtentMpc.test.ts`,
`tests/tools/mcpm-workbench/field/worldToBoxLocal.test.ts`,
`tests/tools/mcpm-workbench/field/boxLocalToWorld.test.ts`.
**Files (modify):** `tools/mcpm-workbench/src/field/worldToVoxel.ts`,
`tools/mcpm-workbench/src/field/voxelToWorld.ts`, `tools/mcpm-workbench/src/render/boxPreviewPass.ts`,
`tools/mcpm-workbench/src/field/deriveGridBox.ts`, `tools/mcpm-workbench/src/export/emitTraceSidecar.ts`.

**Interfaces — produces (spec §3, §4):**

```ts
export function boxHalfExtentMpc(sizeMpc: Readonly<Vec3>): Vec3;  // [x/2, y/2, z/2]

// "box-local": origin at the box's own (0,0,0) corner, range [0, sizeMpc] per axis —
// the same frame worldToVoxel already returns pre-scale. Identity rotation at this task
// (GridBox has no `rotation` field yet); F2.3 fills in the real R.
export function worldToBoxLocal(box: GridBox, p: Readonly<Vec3>): Vec3;
export function boxLocalToWorld(box: GridBox, q: Readonly<Vec3>): Vec3;   // exact inverse
```

`worldToVoxel`/`voxelToWorld` keep their exact existing signatures and become one-line wrappers
(divide/scale the pair's result by `box.voxelSizeMpc`). `boxPreviewPass.ts`'s `worldBounds`,
`deriveGridBox.ts`'s `manualBounds`, and `emitTraceSidecar.ts`'s inline `originMpc` computation each
call `boxHalfExtentMpc` instead of re-deriving `size/2` — see spec §3's "How the funnel resolves the
duplication" for exactly which three non-pair sites change and why `manualBounds`/`worldBounds` stay
axis-aligned bounds computations rather than routing through the full pair (no `rotation` field
exists yet to make that meaningful).

**Test-first:**

- [ ] `boxHalfExtentMpc` — hand-computed: `[10,20,30] -> [5,10,15]`.
- [ ] `worldToBoxLocal`/`boxLocalToWorld round trip returns the original point` — several `p`
      inside and outside the box, asserting `boxLocalToWorld(box, worldToBoxLocal(box, p))` equals
      `p` within float epsilon (the property the pair exists to guarantee).
- [ ] `worldToBoxLocal at the box's lower corner returns the zero vector` — one hand-computed case
      tying the frame's origin convention down explicitly (not a mirror: computed by hand from
      `center`/`size`, not by calling the function under test with different inputs).
- [ ] Read `worldToVoxel.ts`/`voxelToWorld.ts`, rewrite each as a wrapper. Existing
      `worldToVoxel.test.ts`/`voxelToWorld.test.ts` assertions must pass UNCHANGED (byte-identical
      output) — do not edit their expected values.
- [ ] Rewrite `boxPreviewPass.ts`'s `worldBounds`, `deriveGridBox.ts`'s `manualBounds`, and
      `emitTraceSidecar.ts`'s origin computation to call `boxHalfExtentMpc`. No behaviour change —
      existing tests for all three (`deriveGridBox.test.ts`, `emitTraceSidecar.test.ts`) must pass
      UNCHANGED.
- [ ] `npm run typecheck` → GREEN. `npm test -- mcpm-workbench` → GREEN, no expected-value edits.
- [ ] Commit: `refactor(mcpm-workbench): worldToBoxLocal/boxLocalToWorld transform pair`.

---

### B1: `cameraBasis` threads a `box` parameter (identity rotation, byte-identical)

**Files (modify):** `tools/mcpm-workbench/src/render/cameraBasis.ts`,
`tools/mcpm-workbench/src/render/writeMcpmCamera.ts`, `tools/mcpm-workbench/src/render/tracePass.ts`,
`tests/tools/mcpm-workbench/render/cameraBasis.test.ts`.
**Depends on:** A1 (none directly — sequenced by the ground prep, not a code dependency).

**Interface — produces (spec §4):**

```ts
export function cameraBasis(
  eyeMpc: Readonly<Vec3>,
  targetMpc: Readonly<Vec3>,
  upMpc: Readonly<Vec3>,
  box: GridBox,      // NEW — unused this task (no rotation field exists yet); F2.3 rotates by R⁻¹
): CameraBasis;
```

`writeMcpmCamera.ts:26` and `tracePass.ts:176` — the only two call sites — pass their already-in-scope
`box` argument through. No other file calls `cameraBasis` (every other pass reaches the camera via
`writeMcpmCamera`).

**Test-first:**

- [ ] Update `cameraBasis.test.ts`'s existing calls to pass a `box` fixture (any valid `GridBox`,
      contents irrelevant this task). Every existing assertion's expected value stays UNCHANGED —
      this is the byte-identical proof.
- [ ] `npm run typecheck` → GREEN (catches any missed call site).
- [ ] `npm run mcpm-workbench:probe` → exit 0 (the regression net ground-prep names — a rendering
      difference here would show as every pass's projection drifting).
- [ ] Commit: `refactor(mcpm-workbench): cameraBasis takes the GridBox (identity rotation)`.

---

# F1 — translate + resize gizmo (axis-aligned box)

### F1.1: `screenToRay`, `closestPointOnRayToLine`, `rayPlaneIntersect`

**Files (create):** `tools/mcpm-workbench/@types/Ray.d.ts`,
`tools/mcpm-workbench/src/gizmo/screenToRay.ts`,
`tools/mcpm-workbench/src/gizmo/closestPointOnRayToLine.ts`,
`tools/mcpm-workbench/src/gizmo/rayPlaneIntersect.ts`,
`tests/tools/mcpm-workbench/gizmo/screenToRay.test.ts`,
`tests/tools/mcpm-workbench/gizmo/closestPointOnRayToLine.test.ts`,
`tests/tools/mcpm-workbench/gizmo/rayPlaneIntersect.test.ts`.
**Depends on:** B1 (uses `CameraBasis`, unchanged type).

**Interfaces — produces (spec §5):**

```ts
// Ray.d.ts
export type Ray = { readonly origin: Readonly<Vec3>; readonly dir: Readonly<Vec3> };  // dir unit

export function screenToRay(
  eyeMpc: Readonly<Vec3>,
  basis: CameraBasis,
  fovYRad: number,
  aspect: number,
  ndc: readonly [number, number],
): Ray;

export function closestPointOnRayToLine(
  ray: Ray,
  lineOrigin: Readonly<Vec3>,
  lineDir: Readonly<Vec3>,   // unit
): number;   // t: lineOrigin + t*lineDir is nearest the ray (skew-line closest point)

export function rayPlaneIntersect(
  ray: Ray,
  planePoint: Readonly<Vec3>,
  planeNormal: Readonly<Vec3>,   // unit
): Vec3 | null;   // null when ray.dir ⊥ planeNormal (parallel to the plane)
```

**Test-first:**

- [ ] `screenToRay at ndc [0,0] points along the basis forward` — hand-computed: `dir === basis.forward`.
- [ ] `screenToRay at an off-center ndc matches a hand-computed direction` — one case worked out by
      hand from the `tan(fovY/2)` formula (spec §5), not by re-deriving `fragment.wesl`'s expression
      in the test.
- [ ] `closestPointOnRayToLine returns a hand-computed t for two skew lines` — a textbook case (e.g.
      ray along `+z` from origin, line along `+x` at `z=5`) worked out independently.
- [ ] `closestPointOnRayToLine returns 0 when the ray origin is already the closest point`.
- [ ] `rayPlaneIntersect returns a hand-computed point for a ray hitting an axis-aligned plane`.
- [ ] `rayPlaneIntersect returns null for a ray parallel to the plane`.
- [ ] `npm run typecheck` && `npm test -- gizmo` → GREEN.
- [ ] Commit: `feat(mcpm-workbench): gizmo ray-casting primitives`.

---

### F1.2: Handle geometry + hit-test

**Files (create):** `tools/mcpm-workbench/@types/GizmoHandleId.d.ts`,
`tools/mcpm-workbench/@types/Handle.d.ts`, `tools/mcpm-workbench/@types/RingHandle.d.ts`,
`tools/mcpm-workbench/@types/GizmoHandleGeometry.d.ts`,
`tools/mcpm-workbench/src/gizmo/encodeGizmoHandleId.ts`,
`tools/mcpm-workbench/src/gizmo/gizmoHandleGeometry.ts`,
`tools/mcpm-workbench/src/gizmo/pickGizmoHandle.ts`,
`tests/tools/mcpm-workbench/gizmo/gizmoHandleGeometry.test.ts`,
`tests/tools/mcpm-workbench/gizmo/pickGizmoHandle.test.ts`,
`tests/tools/mcpm-workbench/gizmo/encodeGizmoHandleId.test.ts`.
**Depends on:** F1.1.

**Interfaces — produces (spec §5, contracts §1/§3/§4 above):**

```ts
// GizmoHandleId.d.ts
export type GizmoHandleId =
  | { readonly kind: 'translate'; readonly axis: 0 | 1 | 2 }
  | { readonly kind: 'resize'; readonly axis: 0 | 1 | 2; readonly sign: 1 | -1 }
  | { readonly kind: 'rotate'; readonly axis: 0 | 1 | 2 };

export function encodeGizmoHandleId(id: GizmoHandleId | null): number;   // contract §1's flat encoding

export function gizmoHandleGeometry(
  box: GridBox,
  axes: readonly [Readonly<Vec3>, Readonly<Vec3>, Readonly<Vec3>],   // UNIT_AXES this task
): GizmoHandleGeometry;

export function pickGizmoHandle(ray: Ray, geometry: GizmoHandleGeometry): GizmoHandleId | null;
```

**Test-first:**

- [ ] `encodeGizmoHandleId` — hand-computed for one of each kind, and `null -> -1`.
- [ ] `gizmoHandleGeometry places each translate arrow along its axis at ARROW_REACH_FRACTION of the half-extent`
      — hand-computed position for a known box + `UNIT_AXES`.
- [ ] `gizmoHandleGeometry places each resize handle at its face center` — hand-computed for one
      `+axis` and one `-axis` face.
- [ ] `pickGizmoHandle hits a translate arrow when the ray is aimed at its tip` — construct a ray
      through a known handle position, assert the matching `GizmoHandleId`.
- [ ] `pickGizmoHandle returns null for a ray through the box center between handles`.
- [ ] `pickGizmoHandle does not cross-hit a neighbouring resize handle at the smallest supported box size`
      — the tolerance-radius regression the geometry (not a mock) is responsible for; use a box near
      `deriveGridBox.ts`'s smallest sane size.
- [ ] `pickGizmoHandle never returns a rotate handle when every RingHandle has radiusMpc 0` — this
      task's F1 stub state (contract §3).
- [ ] `npm run typecheck` && `npm test -- gizmo` → GREEN.
- [ ] Commit: `feat(mcpm-workbench): gizmo handle geometry and hit-test`.

---

### F1.3: Translate/resize drag math

**Files (create):** `tools/mcpm-workbench/src/gizmo/applyTranslateDrag.ts`,
`tools/mcpm-workbench/src/gizmo/applyResizeDrag.ts`,
`tests/tools/mcpm-workbench/gizmo/applyTranslateDrag.test.ts`,
`tests/tools/mcpm-workbench/gizmo/applyResizeDrag.test.ts`.
**Depends on:** B1 (uses `GridBox`, unchanged). **Parallel with:** F1.4.

**Interfaces — produces (spec §5):**

```ts
export function applyTranslateDrag(box: GridBox, axisDir: Readonly<Vec3>, deltaMpc: number): Vec3;

export function applyResizeDrag(
  box: GridBox,
  axis: 0 | 1 | 2,
  axisDir: Readonly<Vec3>,
  sign: 1 | -1,
  deltaMpc: number,
): { readonly centerMpc: Vec3; readonly sizeMpc: Vec3 };
```

A resize floors `sizeMpc[axis]` at a small positive minimum (name it `MIN_SIZE_MPC`, module-local
constant — a handle dragged through the box must not invert or zero it).

**Test-first:**

- [ ] `applyTranslateDrag moves centerMpc by deltaMpc along axisDir` — hand-computed for
      `axisDir = [0,1,0]`, `deltaMpc = 5`.
- [ ] `applyResizeDrag grows sizeMpc on the dragged axis and anchors the opposite face` —
      hand-computed: assert the new `centerMpc`/`sizeMpc` directly, AND separately recompute the
      un-dragged face's world position before and after (`center ∓ half`) and assert it is
      unchanged — the anchored-face property, not a restatement of the formula.
- [ ] `applyResizeDrag floors at MIN_SIZE_MPC` — a large negative `deltaMpc` does not invert the box.
- [ ] `npm run typecheck` && `npm test -- gizmo` → GREEN.
- [ ] Commit: `feat(mcpm-workbench): gizmo translate and resize drag math`.

---

### F1.4: Gizmo glyph draw — extend `boxLines.wesl` + `boxPreviewPass`

**Files (modify):** `src/services/gpu/shaders/mcpm/boxLines.wesl`,
`tools/mcpm-workbench/src/render/boxPreviewPass.ts`, `tools/mcpm-workbench/src/render/RenderGraph.ts`.
**Depends on:** F1.2 (consumes `GizmoHandleGeometry`'s shape). **Parallel with:** F1.3.
**Read `wesl-shaders` skill first.**

**Contract:** `boxPreviewPass`'s `draw()` grows two new arguments — `hoverHandle: GizmoHandleId | null`,
`activeHandle: GizmoHandleId | null` — encoded via `encodeGizmoHandleId` into a small uniform
alongside the existing `BoxUniform`. The vertex shader gains a second vertex-pulled draw call (glyph
geometry: arrow shafts as line segments, resize handles as small crosses — no new geometry kind
introduced for F1's rotate rings, since `gizmoHandleGeometry` returns zero-radius stubs this task)
sourced from a small storage buffer of `{position: vec3<f32>, handleId: i32}` the pass uploads from
`gizmoHandleGeometry`'s output every frame the wireframe is visible. Fragment stage: three fixed
colors selected by comparing each vertex's `handleId` against the two uniform ints (spec §5's
highlight paragraph) — a `select`/ternary chain over three cases, not a per-`GizmoHandleId.kind`
branch.

`RenderGraph.drawBoxPreview` grows the same two parameters and passes them straight through; its one
caller (`Viewport.tsx`, wired in F1.5) is the only call site.

**Tests:** none new (GPU-shaped; the probe is the gate — F1.6).

- [ ] Read `boxLines.wesl` and the `wesl-shaders` skill before editing.
- [ ] Extend `BoxUniform` handling / add the glyph storage buffer + second draw call.
- [ ] Extend `boxPreviewPass.draw()`'s signature and `RenderGraph.drawBoxPreview`'s signature.
- [ ] `npm run typecheck` → GREEN.
- [ ] Commit: `feat(mcpm-workbench): gizmo handle glyphs on the box-preview wireframe`.

---

### F1.5: Viewport pointer wiring

**Files (modify):** `tools/mcpm-workbench/src/ui/Viewport.tsx`,
`tools/mcpm-workbench/@types/GizmoHandleId.d.ts` (import only — already created F1.2).
**Files (create):** `tools/mcpm-workbench/@types/GizmoDragState.d.ts`.
**Depends on:** F1.2, F1.3, F1.4.

**Contract (spec §5's "State flow", contract §2 above):** a hit-test gate at the TOP of
`onPointerDown` (`Viewport.tsx:717`), before the existing `dragging = true` assignment: build a
`Ray` via `screenToRay` from the current camera state, call `pickGizmoHandle` against
`gizmoHandleGeometry(deriveGridBox(s.grid), UNIT_AXES)`; on a hit, set the closure variable
`gizmoDragging: GizmoDragState | null` (capturing `anchorAxisParam` via
`closestPointOnRayToLine`, or the rotate-handle branch, inert until F2.5), `setPointerCapture`, and
`return` before the existing branch runs. A miss falls through unchanged.

`onPointerMove` gains a symmetric `if (gizmoDragging)` branch dispatching to
`applyTranslateDrag`/`applyResizeDrag` and writing the result through `setManualCenterMpc`/
`setManualSizeMpc` (existing `gridSlice.ts` setters — no new setter this task); otherwise the
existing orbit/pan code runs unchanged. A non-dragging `onPointerMove` also updates a local
`hoverHandle` closure variable via `pickGizmoHandle`, read by the `drawBoxPreview` call (F1.4) — not
written to the store, matching `dragging`/`panning`'s existing closure-variable pattern.

`onPointerUp` clears `gizmoDragging` alongside its existing `dragging`/`panning` resets.

The `drawBoxPreview` call site (`Viewport.tsx:487`) gains `hoverHandle`/`gizmoDragging?.handle ??
null` as its two new arguments, and forces the wireframe visible while `gizmoDragging` is set
(bypassing the existing `now < boxPreviewUntil` gate for that one condition — the slider-driven
200ms window and "a drag is in progress" are two different reasons to show the wireframe, both
legitimate, checked with `||` not replaced).

**Tests:** none new — Viewport is integration glue with no pure-function surface of its own; its
correctness is the F1-GATE manual checklist plus the probe.

- [ ] Read `Viewport.tsx:690-789` (existing pointer handlers) before editing.
- [ ] Add the hit-test gate, drag dispatch, hover tracking, pointer-up reset, and
      `drawBoxPreview` argument wiring.
- [ ] `npm run typecheck` → GREEN.
- [ ] Commit: `feat(mcpm-workbench): gizmo drag wired into Viewport pointer handling`.

---

### F1.6: Probe extension

**Files (modify):** `tools/mcpm-workbench/probeGpuErrors.ts` (or its step-queue module, per
whatever the parent plan's `T12` named it).
**Depends on:** F1.5.

- [ ] Extend the probe's step queue: enable the box-preview layer with a non-zero `hoverHandle` and
      a non-zero `activeHandle` at least once, so the glyph draw path and the highlight `select`
      chain both execute under the probe's error capture.
- [ ] `npm run mcpm-workbench:probe` → exit 0.
- [ ] Commit: `feat(mcpm-workbench): probe exercises the gizmo glyph draw`.

---

### F1-GATE

**Files (modify):** `tools/mcpm-workbench/README.md`.
**Depends on:** F1.6. **No new code.**

- [ ] **Manual visual checklist (ask the user to confirm):**
      - [ ] Three translate arrows and six resize handles are visible on the pending-box wireframe.
      - [ ] Hovering a handle changes its color; dragging changes it again (three distinguishable
            states: idle / hover / active).
      - [ ] Dragging a translate arrow moves the box along that axis only; the `GridBoxPanel`
            sliders reflect the new `manualCenterMpc` live.
      - [ ] Dragging a resize handle grows/shrinks the box on one axis with the opposite face
            visibly anchored (the far wall doesn't move).
      - [ ] A gizmo drag clears a previously-loaded preset's box override (V3 `importedBox` rule) —
            load a preset, drag a handle, confirm the panel no longer shows the preset's exact values
            frozen.
      - [ ] Orbiting/panning the camera still works when NOT starting a drag on a handle (the
            hit-test gate doesn't swallow ordinary camera input).
- [ ] Update the README with the gizmo controls (drag to translate/resize; note rotation as "not
      yet" — F2 adds it).
- [ ] Commit: `docs(mcpm-workbench): F1 gizmo gate`.

---

# F2 — rotation

### F2.1: `GridBox.rotation` field + validators + sidecar/preset field

**Files (modify):** `tools/mcpm-workbench/@types/GridBox.d.ts`,
`tools/mcpm-workbench/src/field/autoFitGridBox.ts` (identity default on every constructed box),
`tools/mcpm-workbench/src/state/importParams.ts`, `tools/mcpm-workbench/src/export/exportParams.ts`,
`tools/mcpm-workbench/src/export/emitTraceSidecar.ts`,
`tests/tools/mcpm-workbench/state/importParams.test.ts`,
`tests/tools/mcpm-workbench/export/emitTraceSidecar.test.ts`.
**Depends on:** F1-GATE. **Parallel with:** F2.2.

**Interface — produces (spec §7, §8):**

```ts
// GridBox.d.ts — adds:
readonly rotation: Readonly<Vec4>;   // quaternion [x,y,z,w], identity [0,0,0,1]
```

`importParams.ts`'s `vec4` validator (new, mirrors the existing `vec3` helper at
`importParams.ts:35-45`) defaults a missing `gridBox.rotation` to `[0,0,0,1]` rather than failing —
the backward-compat contract (spec §8) — and asserts `|q| ≈ 1` (one magnitude check, spec §7's
"cheap to validate" argument) when present. `exportParams.ts`/`emitTraceSidecar.ts` write `rotation`
at the `GridBox`'s own JSON level (a sibling of `centerMpc`/`sizeMpc`, not nested under
`provenance`).

**Test-first:**

- [ ] `importParams defaults a missing rotation field to identity` — a preset JSON without
      `gridBox.rotation` decodes to `[0,0,0,1]`.
- [ ] `importParams rejects a non-unit rotation quaternion` — `|q|` far from 1 throws, naming the
      field.
- [ ] `importParams round-trips a non-identity rotation` — `exportParams(...)` → `importParams(...)`
      returns the same `rotation` array (a genuine round-trip, not a mirror — `exportParams` and
      `importParams` are independent implementations of opposite directions).
- [ ] `emitTraceSidecar writes rotation at the gridBox level` — parse the emitted JSON string,
      assert `JSON.parse(sidecar).dims` sibling-level `rotation` equals the input box's rotation
      (extends the existing round-trip test, doesn't replace it).
- [ ] `npm run typecheck` && `npm test -- mcpm-workbench` → GREEN.
- [ ] Commit: `feat(mcpm-workbench): GridBox.rotation field, validated and round-tripped`.

---

### F2.2: Quaternion primitives

**Files (create):** `src/utils/math/rotateVec3ByQuat.ts`, `src/utils/math/quatFromAxisAngle.ts`,
`src/utils/math/multiplyQuat.ts`, `tests/utils/math/rotateVec3ByQuat.test.ts`,
`tests/utils/math/quatFromAxisAngle.test.ts`, `tests/utils/math/multiplyQuat.test.ts`.
**Depends on:** none (independent of GridBox). **Parallel with:** F2.1.

**Interfaces — produces (spec §7):**

```ts
export function rotateVec3ByQuat(q: Readonly<Vec4>, v: Readonly<Vec3>): Vec3;
export function quatFromAxisAngle(axis: Readonly<Vec3>, angleRad: number): Vec4;   // axis unit
export function multiplyQuat(a: Readonly<Vec4>, b: Readonly<Vec4>): Vec4;          // a ∘ b (apply b, then a)
```

**Test-first:**

- [ ] `rotateVec3ByQuat with the identity quaternion is a no-op`.
- [ ] `rotateVec3ByQuat rotates [1,0,0] by 90° about Z to [0,1,0]` — hand-computed, one case per
      axis (three tests, not a loop hiding three assertions as one).
- [ ] `quatFromAxisAngle at angle 0 returns the identity quaternion`.
- [ ] `quatFromAxisAngle for a 180° turn about Y matches a hand-computed quaternion`.
- [ ] `multiplyQuat composing two 90° turns about the same axis matches one hand-computed 180° turn`
      — an independent property (apply both to a test vector via `rotateVec3ByQuat` and compare to
      the single 180° rotation's result), not the same formula fed back.
- [ ] `npm run typecheck` && `npm test -- utils/math` → GREEN.
- [ ] Commit: `feat(math): quaternion rotate/compose primitives`.

---

### F2.3: `R` into the transform pair and `cameraBasis`

**Files (modify):** `tools/mcpm-workbench/src/field/worldToBoxLocal.ts`,
`tools/mcpm-workbench/src/field/boxLocalToWorld.ts`, `tools/mcpm-workbench/src/render/cameraBasis.ts`,
`tests/tools/mcpm-workbench/field/worldToBoxLocal.test.ts`,
`tests/tools/mcpm-workbench/field/boxLocalToWorld.test.ts`,
`tests/tools/mcpm-workbench/render/cameraBasis.test.ts`.
**Depends on:** F2.1, F2.2.

**Behaviour (spec §4):**

```
worldToBoxLocal(box, p) = R⁻¹·(p − centerMpc) + halfExtentMpc
boxLocalToWorld(box, q) = R·(q − halfExtentMpc) + centerMpc
```

`R⁻¹` is `rotateVec3ByQuat` with the conjugate `[-x, -y, -z, w]` of `box.rotation` — no separate
"invert" helper (spec §4). `cameraBasis` rotates its computed `right`/`up`/`forward` by the same
conjugate before returning.

**Test-first:**

- [ ] Extend `worldToBoxLocal`/`boxLocalToWorld`'s A1 round-trip test with a non-identity-rotation
      case — same property (`boxLocalToWorld(box, worldToBoxLocal(box, p)) === p`), now exercising
      real `R`.
- [ ] `worldToBoxLocal at a 90°-about-Y rotation matches a hand-computed local coordinate` — one
      worked example, independent of the implementation.
- [ ] `cameraBasis at a rotated box returns an orthonormal basis` — `dot(right,up) ≈ 0`,
      `dot(right,forward) ≈ 0`, `dot(up,forward) ≈ 0`, each `|·| ≈ 1` (a property, not a mirror).
- [ ] `cameraBasis at a rotated box matches a hand-rotated expectation` — one simple 90°-about-Y
      case, computed by hand.
- [ ] `npm run typecheck` && `npm test -- mcpm-workbench` → GREEN.
- [ ] `npm run mcpm-workbench:probe` → exit 0 (identity-rotation renders must still match A1/B1's
      byte-identical baseline — the probe doesn't assert pixels, but a validation error or shader
      compile diagnostic here means the affine broke).
- [ ] Commit: `feat(mcpm-workbench): rotation R applied in the transform pair and cameraBasis`.

---

### F2.4: `boxBasisVectors` + `boxLines.wesl` corner reshape

**Files (create):** `tools/mcpm-workbench/src/field/boxBasisVectors.ts`,
`tests/tools/mcpm-workbench/field/boxBasisVectors.test.ts`.
**Files (modify):** `src/services/gpu/shaders/mcpm/boxLines.wesl`,
`tools/mcpm-workbench/src/render/boxPreviewPass.ts`.
**Depends on:** F2.3. **Read `wesl-shaders` skill first.**

**Interface — produces (spec §4):**

```ts
export function boxBasisVectors(rotation: Readonly<Vec4>): { readonly x: Vec3; readonly y: Vec3; readonly z: Vec3 };
```

Mirrors `CameraBasis`'s named-triplet shape (spec §2's non-goal: no matrices). `boxPreviewPass.ts`'s
`worldBounds` (axis-aligned min/max, A1) is replaced outright — not extended — by uploading
`center`, `halfExtents`, and the three basis vectors per contract §5's byte table; `boxLines.wesl`'s
`cornerPos` reconstructs each of the 8 corners via `center + select(-h,+h,bit)·basisX + …` for the
three axes (three FMAs, spec §4).

**Test-first:**

- [ ] `boxBasisVectors at identity rotation returns the unit axes` — `x=[1,0,0]`, `y=[0,1,0]`,
      `z=[0,0,1]`.
- [ ] `boxBasisVectors at a 90°-about-Y rotation matches a hand-computed triplet` — and the triplet
      is orthonormal (same property check as F2.3's `cameraBasis` test, applied here).
- [ ] `npm run typecheck` && `npm test -- mcpm-workbench` → GREEN.
- [ ] Rewrite `boxLines.wesl`'s `BoxUniform` and `cornerPos` per contract §5's table; rewrite
      `boxPreviewPass.ts`'s uniform-fill to upload `center`/`halfExtents`/`boxBasisVectors(...)`
      instead of `worldBounds`'s min/max.
- [ ] `npm run mcpm-workbench:probe` → exit 0 with a non-identity-rotation box in the probe's step
      queue (extend F1.6's queue entry) — the only automated check that the corner reconstruction
      is actually correct on-screen-shaped geometry.
- [ ] Commit: `feat(mcpm-workbench): oriented box-preview wireframe via basis vectors`.

---

### F2.5: Rotate rings — geometry, drag, `setRotation`, Viewport wiring

**Files (modify):** `tools/mcpm-workbench/src/gizmo/gizmoHandleGeometry.ts`,
`tools/mcpm-workbench/src/gizmo/pickGizmoHandle.ts`,
`tools/mcpm-workbench/src/state/slices/gridSlice.ts`, `tools/mcpm-workbench/src/ui/Viewport.tsx`,
`src/services/gpu/shaders/mcpm/boxLines.wesl` (glyph draw for rings, alongside F1.4's arrows/handles).
**Files (create):** `tools/mcpm-workbench/src/gizmo/dragRotate.ts`,
`tests/tools/mcpm-workbench/gizmo/dragRotate.test.ts`,
`tests/tools/mcpm-workbench/gizmo/gizmoHandleGeometry.test.ts` (extend),
`tests/tools/mcpm-workbench/state/gridSlice.test.ts` (extend).
**Depends on:** F2.3, F2.4. **Read `wesl-shaders` skill first** (ring glyph draw touches `boxLines.wesl`).

**Interfaces — produces (spec §5's "Rotate rings" + "State flow"):**

```ts
export function dragRotate(
  ray: Ray,
  centerMpc: Readonly<Vec3>,
  axisDir: Readonly<Vec3>,       // ring normal, world-space unit
  referenceDir: Readonly<Vec3>,  // any unit vector ⊥ axisDir — the ring's 0°-angle reference
): number | null;   // absolute angle (radians) of the pick point around the ring
```

```ts
// gridSlice.ts — new setter, same shape as its four siblings (V3 ruling applies):
export function setRotation(prev: GridSlice, rotation: Readonly<Vec4>): GridSlice;
```

`gizmoHandleGeometry` gains real `RingHandle` values (`radiusMpc` per contract §4's
`RING_RADIUS_FRACTION`, `axisDir` from `boxBasisVectors(box.rotation)`, `referenceDir` any unit
vector ⊥ `axisDir` — reuse the existing "pick a reference axis not near-parallel to `axisDir`"
pattern already in `cameraBasis.ts:29-35`, don't reinvent it). `pickGizmoHandle` extends its hit-test
to rings (a ray-to-torus-ish distance check — distance from the ray's closest approach to the ring's
circle, within tolerance).

Viewport's rotate-handle drag branch (extending F1.5's `gizmoDragState` dispatch): on pointer-down,
`rayPlaneIntersect` against the ring's plane gives the anchor point; `dragRotate` gives
`anchorAngleRad`; `anchorRotation = box.rotation` is captured too (contract §2). On pointer-move,
recompute `angle_now` via `dragRotate` and set `rotation' = multiplyQuat(quatFromAxisAngle(axisDir,
angle_now - anchorAngleRad), anchorRotation)` through `setRotation` — the fixed-anchor recompute
spec §5 requires (no incremental accumulation, no renormalize).

**Test-first:**

- [ ] `dragRotate returns a hand-computed angle for a known pick point`.
- [ ] `dragRotate returns null for a ray parallel to the ring's plane` (delegates to
      `rayPlaneIntersect`'s own null case).
- [ ] `setRotation clears importedBox` — the V3 ruling, same assertion shape as the four existing
      `gridSlice.ts` setter tests.
- [ ] `gizmoHandleGeometry's rotate rings have axisDir equal to boxBasisVectors(box.rotation)`'s
      corresponding axis — a structural check, not a full render assertion.
- [ ] `pickGizmoHandle hits a rotate ring when the ray is aimed at a point on its circle`.
- [ ] A full-turn composition round trip: `multiplyQuat(quatFromAxisAngle(axisDir, 2π),
      anchorRotation)` matches `anchorRotation` when compared via `rotateVec3ByQuat` on a test
      vector (sign-ambiguity-safe comparison, spec §6) — lives in `dragRotate.test.ts` or
      `multiplyQuat.test.ts`, implementer's call on the better home.
- [ ] `npm run typecheck` && `npm test -- mcpm-workbench` → GREEN.
- [ ] Extend `boxLines.wesl`'s glyph draw with ring geometry (a polyline circle, sampled at a fixed
      vertex count, uploaded the same way F1.4's arrow/handle vertices are).
- [ ] `npm run mcpm-workbench:probe` → exit 0 with a rotate drag exercised in the probe's step queue.
- [ ] Commit: `feat(mcpm-workbench): rotate rings complete the grid-box gizmo`.

---

### F2-GATE

**Files (modify):** `tools/mcpm-workbench/README.md`.
**Depends on:** F2.5. **No new code.**

- [ ] `npm run mcpm-workbench:probe` → exit 0.
- [ ] `npm test` → GREEN (full suite, not just `mcpm-workbench`/`utils/math` — the quaternion
      primitives are repo-shared).
- [ ] `npm run typecheck` → GREEN.
- [ ] **Manual visual checklist (ask the user to confirm):**
      - [ ] Three rotate rings are visible around the box; hover/active highlight matches F1's
            translate/resize handles.
      - [ ] Dragging a ring rotates the box smoothly with no jump or flip at any drag speed
            (the fixed-anchor recompute's own claim — this is where a sign error would show as a
            snap).
      - [ ] The translate arrows and resize handles still work correctly on a rotated box — they
            move/resize along the box's OWN (rotated) axes, not world axes.
      - [ ] A saved preset with a non-identity `rotation` reloads to the same oriented box.
      - [ ] A preset saved before this feature (no `rotation` field) still loads without error, at
            identity rotation.
      - [ ] Exporting a `.npy`+sidecar from a rotated box still opens; `buildRhizomeVolume.ts`
            processes it as a plain grid-space cube (no oriented resampling — spec §2's non-goal).
- [ ] Finish the README's gizmo section (rotate rings, the `rotation` field's meaning for exports).
- [ ] Commit: `docs(mcpm-workbench): F2 rotation gate`.

## Definition of Done

**Deliverable inventory**

- [ ] `worldToBoxLocal`/`boxLocalToWorld` (`field/`), `boxHalfExtentMpc`, `boxBasisVectors` — the
      pair and its two small helpers, all funneling the five origin-math duplicates the ground prep
      named.
- [ ] `cameraBasis(eyeMpc, targetMpc, upMpc, box)` — direction rotation applied, both call sites
      updated.
- [ ] `tools/mcpm-workbench/src/gizmo/`: `screenToRay`, `closestPointOnRayToLine`,
      `rayPlaneIntersect`, `gizmoHandleGeometry`, `pickGizmoHandle`, `encodeGizmoHandleId`,
      `applyTranslateDrag`, `applyResizeDrag`, `dragRotate`.
- [ ] `src/utils/math/`: `rotateVec3ByQuat`, `quatFromAxisAngle`, `multiplyQuat`.
- [ ] `GridBox.rotation`, `setRotation` (`gridSlice.ts`), the sidecar/preset `rotation` field with
      identity-default backward compat.
- [ ] `boxLines.wesl`'s reshaped `BoxUniform` (center/halfExtents/basis) plus its glyph draw for
      all three handle families.
- [ ] `tools/mcpm-workbench/README.md` documents the gizmo controls and the `rotation` field.

**Named observable behaviours (manual smoke)**

- [ ] Translate arrows, resize handles, and rotate rings each drag the box correctly, with visible
      hover/active highlighting.
- [ ] A gizmo drag clears a loaded preset's box override (V3 rule), exactly as a slider edit does.
- [ ] Rotating the box changes which world direction the translate/resize handles move along (they
      follow the box's own axes).
- [ ] Orbiting/panning the camera is unaffected when the pointer isn't on a handle.
- [ ] A pre-feature preset/sidecar (no `rotation` field) still loads, at identity rotation.
- [ ] A rotated box still exports; the importer treats the export as a plain grid-space cube.

**Deferral boundary — do not chase these in review**

- Oriented export resampling (spec §2 non-goal) — exports stay grid-space; a consumer applies
  `rotation` itself if it wants world alignment.
- A gizmo for anything other than the grid box.
- Screen-space-constant handle sizing (spec §9) — handles are sized off the box itself.
- Undo/redo for gizmo edits (spec §9) — consistent with the rest of the tool having none.
- Touch/mobile input — inherited non-goal from the parent MCPM workbench spec.
- Per-ring camera-facing highlight for edge-on rings (spec §9) — noted as a future refinement, not
  built.
