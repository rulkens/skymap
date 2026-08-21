# Earth surface navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

> **Prerequisite.** This plan executes on a worktree branched from `main` **after
> Plan 1 (Earth RTC surface foundation, PR #617) has merged**. Plan 1 shipped
> `prepareEarthFrame`, `cutSurfaceTiles`, and the instanced tile renderer this
> plan reads from (`src/services/engine/frame/passes/earthLayer.ts`'s
> `PreparedEarthFrame` export, `earthState.orientation`/`radiusMpc` in
> particular). Do not start Task 1 against a worktree that predates it.

**Goal:** Implement spec §4 — surface navigation: a cursor→surface raycast,
cursor-directed zoom (an eye-position correction, never a `target`/`distance`
change), an exact cursor-anchored orbit-drag, a pan altitude-currency fix, and
surface-fixed camera follow with engage/disengage hysteresis.

**Architecture:** Bottom-up, mirroring Plan 1's shape: pure geometry utils
first (each independently testable without a GPU device or a live engine),
then thin wiring tasks that plug them into `orbitControls.ts` (DOM input →
`OrbitCamera`), `frameContext.ts` (the per-frame eye-position assembly), and
`runFrame.ts` (the orientation-basis resolution block). Task 1 builds the
cursor→surface hit primitive every other task in this plan depends on
(directly or via the `hoveredSurfacePoint` register it produces). Tasks 2–3
consume it for zoom-bias and drag respectively; Task 4 (pan) and Task 5–6
(surface-fixed follow) are independent of the raycast and of each other, so
an SDD executor can run Task 4 and Task 5 in either order once Task 1 lands.
Task 7 is the perf-halt + visual verification gate.

**Tech Stack:** TypeScript (Vite/Vitest), `wgpu-matrix` for the existing
padded-Mat3 orientation-frame slerp path (untouched by this plan); this
plan's new math stays on the registry's tight 9-float `Mat3` convention
(`rotateVec3ByTightMat3.ts`, `camPosLocal.ts`), consistent with every other
camera util it sits beside.

**Spec:**
[docs/superpowers/specs/completed/2026-08-20-earth-rtc-surface-camera-design.md](../specs/completed/2026-08-20-earth-rtc-surface-camera-design.md)
§4 — authoritative for the decided shapes (SurfaceHit body-fixed, eye-position
cursor zoom, drag-bias persistence, pan currency fix, surface-fixed follow
hysteresis). Two corrections to the spec's stated contracts are made and
flagged in Tasks 2 and 3 below (see "Ground notes").

## Ground notes

Surveyed before writing this plan (not guessed): `src/services/camera/orbitControls.ts`,
`src/state/camera/cameraSlice.ts`, `src/services/engine/camera/{cameraDrivers,applyFocusedBodyPivot,pivotRadiusMpc,liveBodyPosition}.ts`,
`src/services/engine/frame/{runFrame,frameContext}.ts`,
`src/services/engine/phases/wireInput.ts`, `src/services/engine/interaction/hoverPickDriver.ts`,
`src/services/engine/frame/passes/earthLayer.ts` (post-Plan-1 shape),
`src/utils/camera/{orbitRadPerPixel,zoomedDistance,clampDistance,lonLatFocusPose,imagePlaneBasis,updatePosition,orbitAnglesLookingAlong}.ts`,
`src/utils/math/raySphereRoots.ts`, `src/utils/scene/{directionToLonLatDeg,lonLatDegToDirection}.ts`.
Four gaps §4 assumes closed but aren't yet — this plan's first tasks close them:

1. **No cursor→world-ray primitive exists.** The nearest precedents are
   `orbitControls.ts`'s pan `pxToWorld` (`orbitControls.ts:427`, a
   screen-delta→world-delta at the TARGET's depth, not a ray) and
   `horizonShellRenderer.ts`'s frustum-CORNER-only CPU unprojection (four
   fixed NDC corners, not an arbitrary cursor pixel). Task 1 builds
   `cursorRayWorld`, generalizing `imagePlaneBasis` + `tan(fovYRad/2)` (the
   same math family both precedents already use) to an arbitrary NDC offset.
2. **No engine-owned register exists for a live cursor→surface hit.**
   `EnginePickingState` (`src/@types/engine/state/EnginePickingState.d.ts`)
   only carries GPU-pick throttle flags (`pickInFlight`, `pointerDown`) — the
   existing hover mechanism (`hoverPickDriver.ts`) is a GPU r32uint readback
   with 1–2 frame latency, wrong for this feature's per-move CPU raycast.
   Task 1 adds `hoveredSurfacePoint` there; Task 2 adds `zoomBiasAnchor`
   beside it.
3. **No tight-`Mat3` compose primitive exists.** `rotateVec3ByTightMat3.ts`
   multiplies a vector by a tight `Mat3`; nothing multiplies two tight
   `Mat3`s or transposes one (the padded `wgpu-matrix` `mat3.multiply` used
   by `resolveFrameBasis.ts` operates on the OTHER, 12-float padded
   representation, for the orientation-FRAME slerp — a different subsystem).
   Task 5 needs `inverse(orientationAtFlip) · currentOrientation`; since both
   are orthonormal, inverse = transpose. A single-purpose
   `orientationFlipCorrection` util is added rather than a generic Mat3
   library (matches the codebase's existing narrow-primitive convention —
   `rotateVec3ByTightMat3`, not a `Mat3` class).
4. **Surface-fixed follow's basis correction has no existing home.** It is a
   THIRD un-braided camera concern, alongside `cameraDrivers.ts`'s
   pivot-vs-orbit-terms split: not a pose (`target`/`yaw`/`pitch`/`distance`,
   what drivers produce) and not the pivot pin (`applyFocusedBodyPivot.ts`,
   which only ever touches `target`). Task 5 rules: it composes into
   `poseBasis`/`upBasis` alongside `runFrame.ts`'s existing basis-resolution
   block (`runFrame.ts:291–304`), not into `applyFocusedBodyPivot` and not as
   a new `cameraDrivers.ts` row — see Task 5's "Ruling."

Two spec-contract corrections (flagged here, detailed in their tasks):
`surfaceZoomBias`'s stated 5-parameter signature (spec §4.2) cannot alone
answer "converge toward the anchor under the eye" without the current orbit
eye position, so Task 2 adds a 6th parameter. `surfaceDragRotation`'s exact
algorithm is left to the implementer (Newton iteration or a linearized
Jacobian both satisfy the stated contract test) since the spec names the
goal, not a formula — Task 3 pins the contract via a round-trip acceptance
test instead of prescribing the math.

## Global Constraints

Quoted verbatim from the spec, binding for every task below:

- **Distance semantics untouched (spec §4.2):** "`target` stays the body
  centre; `cam.distance` keeps meaning camera-to-centre. This is a
  deliberate, load-bearing choice … every one of those [foreground gates]
  stays correct **by construction** under an eye-position correction, because
  none of them reads eye position; they read `target`/`distance`."
- **Anchor lifecycle (spec §4.3, decided rule):** "Orbit-drag works exactly
  as today — it rotates about `target` … The bias correction continues to
  apply on top of the drag's resulting eye position, unmodified, for as long
  as the anchor stands … The anchor clears on **focus change** … not on drag
  start, not on drag end, not on zoom direction reversal."
- **Drag hit/miss coexistence (spec §4.4):** "`orbitRadPerPixel`'s
  altitude-damped rate is not deleted — it remains the `pivotRadiusMpc ===
  null` / no-hit fallback … so the exact fix and the existing approximation
  coexist as hit/miss branches of one drag path rather than two parallel drag
  implementations."
- **Pan/zoom-bias stay separate (spec §4.5):** "Pan is a **persistent,
  view-space** reframe … zoom-bias is a **transient, body-fixed**
  convergence … They stay two offsets, composed independently at
  eye-position resolution time."
- **Follow identity-at-flip (spec §4.6):** "Snapshot `orientationAtFlip` at
  the frame the mode engages: the composed delta starts at
  `inverse(orientationAtFlip) · orientationAtFlip = identity`, so the flip
  frame introduces no pose jump."
- **Perf-halt rule (spec §5, this plan is mostly CPU/camera-side but Task 7
  still measures):** "`npm run perf` measured before and after on every
  renderer/GPU-side change … A neutral-or-negative measurement halts the
  landing pipeline per `feedback_code_is_liability` — land/park is the
  user's ruling." This plan touches no shader/GPU-draw code, but Task 7 still
  runs the harness before/after per the skill's guidance, since a per-frame
  CPU addition (the raycast, the basis correction) is exactly the kind of
  change the harness would catch regressing the frame budget.
- **Scope boundary (spec §6):** the cut-planner/SSE frontier, synthetic
  super-resolution, GeoDanmark productionization, other bodies' RTC
  migration, and camera-pose URL deep links are all out of scope. The
  Earth-local slab work (`docs/grill-sessions/earth-local-slab-2026-08-21.md`)
  is a separate, paused effort — not pulled into this plan.

Plus the house-wide rules this plan inherits: `type` aliases never
`interface`; one exported symbol per file in `src/utils/` and `src/@types/`
(filename matches the export); comment budget (module header ≤ 10 lines,
comment lines ≤ half the code lines); `npm run typecheck` (both tsconfigs)
and `npm test` stay green after every task.

---

## Strategy

Task 1 builds the cursor→surface hit (§4.1) and the register it lives in —
every later task either reads it directly (Tasks 2, 3) or is independent of
it (Tasks 4, 5, 6). Task 2 (zoom bias, §4.2+§4.3) and Task 3 (drag, §4.4) both
depend on Task 1 but not on each other. Task 4 (pan currency fix, §4.5) is a
small, fully independent change to `orbitControls.ts`'s pan branch. Tasks 5–6
(surface-fixed follow, §4.6) are independent of the raycast entirely — engage
purely on altitude — and Task 6 (the `LIVE_IDLE_TICK_MS` re-derivation)
depends on Task 5's chosen disengage threshold, so they run in that order.
Task 7 is the perf-halt gate and the spec's §5 visual checklist.

## Definition of Done

- **Deliverable inventory:** `src/utils/camera/{cursorRayWorld,cursorSurfaceHit,surfaceZoomBias,nextZoomBiasAnchor,surfaceDragRotation,surfaceFollowEngaged,orientationFlipCorrection}.ts`,
  `EnginePickingState.hoveredSurfacePoint` + `.zoomBiasAnchor` fields,
  `CameraRuntime.surfaceFollow` Resource, `OrbitControlsOptions.hoveredSurfacePoint`
  + `.onZoomBiasAnchor` fields, the eye-position bias hook in `frameContext.ts`,
  the exact-rotation drag branch + pan currency fix in `orbitControls.ts`, the
  surface-follow basis correction in `runFrame.ts`'s basis-resolution block,
  and the re-derived `LIVE_IDLE_TICK_MS` constant + comment.
- **Named observable behaviours for the manual smoke pass (Task 7, dev
  server):** the spec's §5 acceptance criteria — cursor-directed zoom
  visibly converges on the hovered point and reverts cleanly to
  centre-directed on zoom-out or a cursor miss; orbit-drag keeps the grabbed
  ground point under the cursor at every latitude and screen position, not
  only near centre; a pan near the surface moves the target by a sane ground
  distance (not one dominated by Earth's radius); the ground does not
  visibly slide under the camera below the surface-follow engage threshold
  with the sim clock set to LIVE; flying anywhere with no body focused is
  visually unchanged from before this feature (every new mechanism gates on
  a focused body/star pivot).
- **The deferral boundary:** the cut-planner/SSE frontier, synthetic
  super-resolution, GeoDanmark productionization, other bodies' RTC
  migration, camera-pose URL deep links, and the Earth-local slab work are
  all out of scope per spec §6 and this plan's header.

---

## Task 1: `cursorRayWorld` + `cursorSurfaceHit` — the cursor→surface hit (§4.1)

**Files:**

- Create: `src/utils/camera/cursorRayWorld.ts`, `src/utils/camera/cursorSurfaceHit.ts`
- Modify: `src/@types/engine/state/EnginePickingState.d.ts` (add `hoveredSurfacePoint`),
  `src/@types/camera/OrbitControlsOptions.d.ts` (add `hoveredSurfacePoint` getter),
  `src/services/engine/phases/wireInput.ts` (compute + store the hit on each
  `onPointerMove`, alongside the existing `hoverPickDriver.onPointerMove` call
  at `wireInput.ts:277–279`)
- Test: `tests/utils/camera/cursorRayWorld.test.ts` (new),
  `tests/utils/camera/cursorSurfaceHit.test.ts` (new),
  `tests/services/engine/phases/wireInput.test.ts` (modify — add the
  persistence-on-miss coverage below)

**Interfaces:**

```ts
// src/utils/camera/cursorRayWorld.ts
export function cursorRayWorld(
  cursorCss: Readonly<{ x: number; y: number }>, // CssPx — CSS px, e.g. e.clientX/Y
  canvasCssSize: Readonly<{ width: number; height: number }>,
  camPosMpc: Readonly<Vec3>,
  forward: Readonly<Vec3>, // unit view direction (target - eye, normalised)
  roll: number,
  upRef: Readonly<Vec3>, // frameUp(cam.upBasis) — same reference imagePlaneBasis callers use
  fovYRad: number,
  aspect: number,
): { readonly origin: Vec3; readonly direction: Vec3 }; // direction is unit-length

// src/utils/camera/cursorSurfaceHit.ts
export function cursorSurfaceHit(
  ray: { readonly origin: Readonly<Vec3>; readonly direction: Readonly<Vec3> },
  bodyCentreMpc: Readonly<Vec3>,
  radiusMpc: number,
  bodyOrientation: Readonly<Mat3>,
): LonLatDeg | null; // null on a miss, or the ray originating inside the sphere
```

`cursorRayWorld`: derive NDC `(ndcX, ndcY)` from the cursor CSS position —
`ndcX = 2*cursorCss.x/canvasCssSize.width - 1`, `ndcY = 1 -
2*cursorCss.y/canvasCssSize.height` (Y flips: CSS grows down, NDC grows up —
the same flip `orbitControls.ts`'s pan step 3 documents). Build the screen
basis via `imagePlaneBasis(forward, roll, upRef)` (`right`, `up`); the ray
direction is `normalize(forward + ndcX*tanHalfFovY*aspect*right +
ndcY*tanHalfFovY*up)` where `tanHalfFovY = Math.tan(fovYRad/2)` — the same
per-pixel-to-NDC-to-world family `orbitControls.ts:427`'s `pxToWorld` and
`horizonShellRenderer.ts`'s frustum-corner unprojection both already use, but
resolved for an arbitrary pixel rather than a canvas delta or a fixed corner.
`origin` is `camPosMpc` unchanged.

`cursorSurfaceHit`: call `raySphereRoots(ray.origin, ray.direction,
bodyCentreMpc, radiusMpc)`; `null` on a miss. On a hit, take `tNear` (the
camera always sits outside the body in this app, so `tNear` is the
front-facing intersection — the visible one); if `tNear < 0` (camera inside
the sphere — should not happen, defensive) return `null` too. Compute the
world hit point `origin + tNear*direction`, rotate `(hit - bodyCentreMpc)`
into the body's local frame by `bodyOrientationᵀ` (the same transpose
convention `camPosLocal.ts`'s header derives — `orientation`'s columns are
local axes in world space, so carrying a world vector INTO local needs the
transpose), normalise, and convert via `directionToLonLatDeg`.

- [ ] **Test `cursorRayWorld` at screen centre returns `forward` unchanged** —
      cursor at `(width/2, height/2)` → `ndcX = ndcY = 0` → `direction` equals
      `forward` (within float tolerance), independent of `fovYRad`/`aspect`.
- [ ] **Test `cursorRayWorld` at a hand-picked corner** — `fovYRad = Math.PI/2`
      (90°, `tanHalfFovY = 1`), `aspect = 1`, `roll = 0`, cursor at CSS
      `(0, 0)` (top-left) → `ndcX = -1, ndcY = 1` → hand-computed
      `direction = normalize(forward - right + up)` for a specific
      `forward`/`upRef` pair (e.g. `forward = [0,0,-1]`, `upRef = [0,1,0]` →
      `right = [1,0,0]`, `up = [0,1,0]` → expected `normalize([-1,1,-1])`).
- [ ] **Test `cursorRayWorld`'s `origin` equals `camPosMpc` exactly** — a
      structural pin (the ray must start at the eye, not somewhere derived).
- [ ] Implement `cursorRayWorld`.
- [ ] **Test `cursorSurfaceHit` returns the nadir point for a ray aimed
      straight at the body centre** — `ray.origin` at `[0,0,3]` (3 Mpc out
      on local +Z), `direction = [0,0,-1]`, `bodyCentreMpc = [0,0,0]`,
      `radiusMpc = 1`, `bodyOrientation = IDENTITY_MAT3` → hand-computed
      hit point `[0,0,1]` → `directionToLonLatDeg([0,0,1])` (its own documented
      convention: `latDeg = asin(z)`, so `[0,0,1] → { lonDeg: NaN-safe atan2(0,0)=0, latDeg: 90 }`).
- [ ] **Test `cursorSurfaceHit` returns `null` for a ray that misses the
      sphere** — a ray offset past the radius (e.g. `origin = [0, 2, 3]`,
      `direction = [0,0,-1]`, `radiusMpc = 1` — perpendicular offset `2 > 1`).
- [ ] **Test `cursorSurfaceHit` respects `bodyOrientation`** — a 90°-rotated
      `bodyOrientation` (hand-built tight `Mat3`, e.g. rotating local +Z to
      world +X) with the same nadir-aimed ray as the first test, asserting the
      returned `LonLatDeg` reflects the ROTATED local frame, not world axes —
      this is the test that would catch a missing or un-transposed rotation.
- [ ] Implement `cursorSurfaceHit`.
- [ ] Add `hoveredSurfacePoint: { readonly bodyId: BodyId; readonly point: LonLatDeg } | null`
      to `EnginePickingState` (mirrors the spec §4.1 literal shape, with
      `bodyId: BodyId` generalizing beyond Earth — every other camera util
      this plan touches, `orbitRadPerPixel`/`zoomedDistance`/`clampDistance`,
      already generalizes over any focused body/star pivot via
      `pivotRadiusMpc`, not Earth-specific).
- [ ] Add `hoveredSurfacePoint?: () => { readonly bodyId: BodyId; readonly point: LonLatDeg } | null`
      to `OrbitControlsOptions` (a getter, mirroring the existing
      `pivotRadiusMpc?: () => number | null` field's shape and doc style) —
      consumed by Tasks 2 and 3, not yet read anywhere in this task.
- [ ] Wire `wireInput.ts`: alongside the existing
      `onPointerMove: (cssPx) => { hoverPickDriver.onPointerMove(cssPx); }`
      (`wireInput.ts:277–279`), add a sibling computation that resolves the
      CURRENTLY FOCUSED body row (`selectFocusRow(store.getState())`, the
      same selector `pivotRadiusMpc(...)` already reads at `wireInput.ts:351`),
      and when it is `type === 'body'`: read `deriveBodyStates(state.cameraRuntime.lastRenderedSimDays.current).get(row.id)`
      (mirrors `liveBodyPosition`'s/`applyFocusedBodyPivot`'s direct use of
      `deriveBodyStates`, since `liveBodyPosition` alone drops `orientation`)
      for `{ positionMpc, orientation }`, build the ray via `cursorRayWorld`
      from `state.cam!.position`/`target`/`roll`/`upBasis`/`fovYRad`/`aspect`
      (the live drag register — the same object `pivotRadiusMpc`'s sibling
      calls already read through `state.cam`), and call `cursorSurfaceHit`.
      **On a HIT only**, write `state.picking.hoveredSurfacePoint = {
      bodyId: row.id, point }`. **On a MISS (off-globe cursor, or no body
      focused) do NOT write `null`** — per spec §4.1, "a cursor miss …
      leaves `hoveredSurfacePoint` at whatever it already was." A stale
      entry from a since-changed focus is harmless: every consumer (Task 2's
      `zoomBiasAnchor` capture, Task 3's drag-grab capture) already gates on
      `bodyId` matching the CURRENTLY focused body before using it, so a
      stale `hoveredSurfacePoint` for a body no longer focused is simply
      never read — no explicit clear-on-focus-change or clear-on-pointer-
      leave site is needed (the same "read-time gate, not a write" shape as
      `zoomBiasAnchor`'s ruling in Task 2; do NOT add an `onPointerLeave`
      clear here either, for the same reason). **Recomputed on every
      `onPointerMove`, not every frame** — a deliberate cost/freshness
      tradeoff mirroring `hoverPickDriver`'s own pointer-driven (not
      frame-driven) cadence; noted in Ground notes item 2.
- [ ] **Test (`wireInput.test.ts`) a raycast miss does not overwrite a prior
      hit** — seed `state.picking.hoveredSurfacePoint` with a hit-shaped
      value, fire an `onPointerMove` whose ray misses the focused body (or
      with no body focused), and assert `state.picking.hoveredSurfacePoint`
      is unchanged (`toBe`, same reference) — the direct regression test for
      the persistence rule above.
- [ ] `npm run typecheck` — clean.
- [ ] `npm test -- cursorRayWorld cursorSurfaceHit wireInput` — green.
- [ ] Commit.

---

## Task 2: `surfaceZoomBias` — cursor-directed zoom (§4.2 + §4.3)

**Files:**

- Create: `src/utils/camera/surfaceZoomBias.ts`, `src/utils/camera/nextZoomBiasAnchor.ts`
- Modify: `src/@types/engine/state/EnginePickingState.d.ts` (add `zoomBiasAnchor`),
  `src/@types/camera/OrbitControlsOptions.d.ts` (add `onZoomBiasAnchor`),
  `src/services/camera/orbitControls.ts` (capture the anchor on wheel/pinch),
  `src/services/engine/phases/wireInput.ts` (wire `onZoomBiasAnchor` to the
  new state field), `src/services/engine/frame/frameContext.ts` (apply the
  bias to `cam.position` after `assembleOrbitCamera`)
- Test: `tests/utils/camera/surfaceZoomBias.test.ts` (new),
  `tests/utils/camera/nextZoomBiasAnchor.test.ts` (new),
  `tests/services/engine/frame/frameContext.test.ts` (modify — add the
  eye-bias coverage; file may not yet exist under this exact name — mirror
  whichever existing test file covers `deriveFrameContext`)

**Ground-note correction to the spec's §4.2 contract (binding for this
task):** the spec's stated signature
(`surfaceZoomBias(anchor, bodyOrientation, bodyCentreMpc, radiusMpc,
altitudeMpc): Vec3`) cannot, on its own, answer "converge toward the anchor
point sitting under the eye" — that convergence target is a world position
relative to the CURRENT orbit eye, which none of the five stated params
carry. This task adds a 6th parameter, `eyePosMpc`, and defines the return
value against it (below). This mirrors the corrections Plan 1 made in its
own Tasks 1 and 4 — flagged rather than silently resolved.

**Interfaces:**

```ts
// src/utils/camera/surfaceZoomBias.ts
export function surfaceZoomBias(
  anchor: LonLatDeg,
  bodyOrientation: Readonly<Mat3>,
  bodyCentreMpc: Readonly<Vec3>,
  radiusMpc: number,
  altitudeMpc: number, // distance - radiusMpc, the pivot's own altitude term
  eyePosMpc: Readonly<Vec3>, // the orbit-computed eye position, BEFORE this delta
): Vec3; // eye-position DELTA, in world Mpc, to add to eyePosMpc
```

Compute `anchorWorldDir = bodyOrientation · lonLatDegToDirection(anchor)`
(local→world, untransposed — the same convention `lonLatFocusPose.ts:34`
already documents and uses). `targetEyePos = bodyCentreMpc +
anchorWorldDir * (radiusMpc + altitudeMpc)` — the point directly "above" the
anchor at the CURRENT altitude, on the anchor's own bearing from the body
centre. `t = falloff(altitudeMpc, radiusMpc)`, monotonically `1` at
`altitudeMpc = 0` down to `0` as `altitudeMpc → ∞` (an exponential decay
scaled by `radiusMpc`, e.g. `Math.exp(-altitudeMpc / (radiusMpc *
FALLOFF_RADII))` with a named, documented `FALLOFF_RADII` constant —
implementer's tuning call, document the reasoning the way
`orbitRadPerPixel.ts`'s `ORBIT_MAX_RAD_PER_PX` comment documents its own
"~7 body radii" crossover). Return `t * (targetEyePos - eyePosMpc)`.

```ts
// src/utils/camera/nextZoomBiasAnchor.ts
export function nextZoomBiasAnchor(
  currentAnchor: { readonly bodyId: BodyId; readonly point: LonLatDeg } | null,
  lastCaptureSource: { readonly bodyId: BodyId; readonly point: LonLatDeg } | null,
  hoveredNow: { readonly bodyId: BodyId; readonly point: LonLatDeg } | null,
): {
  readonly anchor: { readonly bodyId: BodyId; readonly point: LonLatDeg } | null;
  readonly captureSource: { readonly bodyId: BodyId; readonly point: LonLatDeg } | null;
};
```

**Ruling — how "written once, at zoom-gesture start … not re-picked every
tick" (spec §4.2) is realized without a timer or a gesture-boundary event.**
`hoveredSurfacePoint` (Task 1) is recomputed ONLY on `pointermove`, never per
wheel tick and never per frame — so its object reference is provably stable
across an entire wheel/pinch burst where the pointer does not move (the
common case: users do not move the mouse while scrolling). `nextZoomBiasAnchor`
exploits that: called on every wheel tick and at pinch start, it recaptures
`hoveredNow` into the anchor ONLY when `hoveredNow` is a **different object
reference** than `lastCaptureSource` (a fresh hover since the last capture —
mirroring `hoverPickDriver.ts`'s `latest === picked` reference-identity
idiom exactly); an unchanged reference (mid-burst, no pointermove) leaves the
anchor untouched. `hoveredNow === null` also leaves it untouched (nothing to
anchor to). This is a pure function of three snapshots, testable without any
timing machinery.

- [ ] **Test `surfaceZoomBias` returns near-zero at large altitude** — a
      hand-picked `radiusMpc`/`FALLOFF_RADII`-scaled `altitudeMpc` far past
      the falloff (e.g. `100 * radiusMpc * FALLOFF_RADII`); assert
      `Math.hypot(...)` of the returned delta is below a small epsilon.
- [ ] **Test `surfaceZoomBias` at `altitudeMpc = 0` returns exactly
      `targetEyePos - eyePosMpc`** — hand-computed for a specific
      anchor/body/eye triple (e.g. `anchor = {lonDeg:0, latDeg:0}`,
      `bodyOrientation = IDENTITY_MAT3`, `bodyCentreMpc = [0,0,0]`,
      `radiusMpc = 1`, `eyePosMpc = [0,0,5]` → `anchorWorldDir = [1,0,0]` →
      `targetEyePos = [1,0,0]` → expected delta `[1,0,-5]`).
- [ ] **Test `surfaceZoomBias`'s magnitude is monotonically decreasing as
      altitude grows** — a property test over a small ascending sequence of
      `altitudeMpc` values (not a mirror: this checks a shape property the
      exact falloff formula must satisfy, not the formula's own output).
- [ ] Implement `surfaceZoomBias`.
- [ ] **Test `nextZoomBiasAnchor` recaptures on a fresh hover reference** —
      `lastCaptureSource` and `hoveredNow` are two DISTINCT object literals
      with the same field values; assert the result's `anchor` and
      `captureSource` both `toBe(hoveredNow)` (reference, not deep-equal).
- [ ] **Test `nextZoomBiasAnchor` holds the anchor when the hover reference
      is unchanged** — `lastCaptureSource === hoveredNow` (same reference);
      assert the result's `anchor` `toBe(currentAnchor)` unchanged.
- [ ] **Test `nextZoomBiasAnchor` holds the anchor when `hoveredNow` is
      `null`** — nothing to capture; assert `anchor` unchanged.
- [ ] Implement `nextZoomBiasAnchor`.
- [ ] Add `zoomBiasAnchor: { readonly bodyId: BodyId; readonly point: LonLatDeg } | null`
      to `EnginePickingState`.
- [ ] Add `onZoomBiasAnchor?: (anchor: { readonly bodyId: BodyId; readonly point: LonLatDeg } | null) => void`
      to `OrbitControlsOptions` — called whenever `nextZoomBiasAnchor`
      produces a value (every wheel tick and pinch-start check; idempotent
      when unchanged).
- [ ] Wire `orbitControls.ts`: closure-local `let zoomBiasAnchor` +
      `let zoomBiasAnchorSource` (both `| null`, mirroring the existing
      `dragMode`/`lastPinchDist` closure-state pattern). Call
      `nextZoomBiasAnchor(zoomBiasAnchor, zoomBiasAnchorSource,
      options?.hoveredSurfacePoint?.() ?? null)` and update both locals plus
      fire `options?.onZoomBiasAnchor?.(zoomBiasAnchor)` at: (a) every
      `onWheel` tick (both the in-gesture-fold and discrete-zoom branches,
      `orbitControls.ts:514–530`), and (b) the pinch-start transition
      (`activePointers.size === 2` first reached, `orbitControls.ts:253–262`).
- [ ] Wire `wireInput.ts`: `onZoomBiasAnchor: (anchor) => { state.picking.zoomBiasAnchor = anchor; }`,
      added to the `attachOrbitControls` options object alongside the
      existing `pivotRadiusMpc`/`onZoom` fields.
- [ ] **Ruling — anchor "clears on focus change" is a READ-TIME gate, not a
      write.** Rather than watch focus transitions to null the register (a
      second invalidation site), every consumer of `zoomBiasAnchor` treats it
      as absent unless `anchor.bodyId` equals the CURRENTLY focused body's
      id — behaviourally identical to an explicit clear (a stale anchor for
      a no-longer-focused body is simply never read again), with one write
      site instead of two. Document this in the field's docblock.
- [ ] Wire `frameContext.ts`: immediately after `const cam =
      assembleOrbitCamera(pose, projection, poseBasis, upBasis);`
      (`frameContext.ts:165`), when `state.selectionRows.focus?.type ===
      'body'` AND `state.picking.zoomBiasAnchor?.bodyId` matches that focus
      row's `id`: resolve `{ positionMpc, orientation }` via
      `deriveBodyStates(simDays).get(focusRow.id)` (the `simDays` parameter
      `deriveFrameContext` already receives), compute `radiusMpc =
      focusRow.radiusKm * SCALE_UNITS.KM_TO_MPC` and `altitudeMpc =
      cam.distance - radiusMpc`, call `surfaceZoomBias(...)` with
      `cam.position` as `eyePosMpc`, and add the returned delta into
      `cam.position` in place — BEFORE `computeViewProj(cam)` is called two
      lines below (`frameContext.ts:171`), so `vp`, `drawCamPos`, and
      `slabs` all derive from the corrected eye. Nothing else in
      `deriveFrameContext` changes: `pivotRadiusMpc(state.selectionRows.focus)`
      (line 178) still reads `cam.distance`, unaffected by an eye-position
      write.
- [ ] **Test (frameContext / deriveFrameContext suite): the bias shifts
      `ctx.drawCamPos` when a matching anchor is present** — a focused body
      row + a `zoomBiasAnchor` with matching `bodyId`; assert
      `ctx.drawCamPos` differs from the un-biased `assembleOrbitCamera`
      output by the exact `surfaceZoomBias` delta for the same inputs (an
      independent recomputation from hand-picked numbers, not importing the
      production call's own result).
- [ ] **Test the bias is a no-op when the anchor's `bodyId` does not match
      the focused body** — asserts the read-time gate (the "clears on focus
      change" ruling above) actually gates.
- [ ] **Test the bias is a no-op with no `zoomBiasAnchor`** — regression
      floor: an unbiased frame must be byte-identical to today's output.
- [ ] **Test the bias still applies while `orbitDrag` is the winning driver**
      (spec §4.3: "the bias correction continues to apply on top of the
      drag's resulting eye position, unmodified, for as long as the anchor
      stands") — feed `deriveFrameContext` a `pose` produced by a drag (any
      non-default yaw/pitch), a matching `zoomBiasAnchor`, and assert the
      SAME delta-shift assertion as the first test above holds regardless —
      this passes for free given the wiring above (the bias hook runs
      unconditionally after `assembleOrbitCamera`, whatever driver produced
      `pose`), but the test pins it explicitly since §4.3 calls it out as a
      decided rule, not an incidental property.
- [ ] `npm run typecheck` — clean.
- [ ] `npm test -- surfaceZoomBias nextZoomBiasAnchor frameContext` — green.
- [ ] Commit.

---

## Task 3: `surfaceDragRotation` — cursor-anchored orbit-drag (§4.4)

**Files:**

- Create: `src/utils/camera/surfaceDragRotation.ts`
- Modify: `src/services/camera/orbitControls.ts` (orbit branch: hit/miss
  split, `orbitControls.ts:449–479`)
- Test: `tests/utils/camera/surfaceDragRotation.test.ts` (new),
  `tests/services/camera/orbitControls.test.ts` (modify — add drag-with-hit
  coverage, mirroring the file's existing hand-rolled `PointerEvent`
  dispatch pattern)

**The one task in this plan needing original geometric derivation beyond
composing existing utils — budget extra review attention here.** The spec
names the GOAL ("solves for the rotation that keeps the grabbed hit point
under the cursor … not a single damped rate") but not an algorithm. This
task pins the CONTRACT via an acceptance test rather than prescribing the
math: either a linearized per-tick Jacobian (screen-pixel motion →
`(dYaw,dPitch)` at the grabbed point's current projected position,
recomputed fresh every `pointermove` tick so linearization error never
accumulates) or a short Newton iteration are valid implementations, built
from `orbitAnglesLookingAlong.ts` (the existing world-direction→(yaw,pitch)
inverse) and `cursorRayWorld` (Task 1).

**Interfaces:**

```ts
// src/utils/camera/surfaceDragRotation.ts
export function surfaceDragRotation(
  grabbedPoint: LonLatDeg, // body-fixed point grabbed at drag start
  bodyOrientation: Readonly<Mat3>,
  bodyCentreMpc: Readonly<Vec3>,
  radiusMpc: number,
  cam: Readonly<{
    readonly target: Vec3;
    readonly yaw: number;
    readonly pitch: number;
    readonly distance: number;
    readonly poseBasis?: Mat3;
  }>,
  fovYRad: number,
  aspect: number,
  canvasCssSize: Readonly<{ width: number; height: number }>,
  cursorCss: Readonly<{ x: number; y: number }>, // THIS tick's cursor position
): { readonly yaw: number; readonly pitch: number }; // the new ABSOLUTE cam.yaw/cam.pitch
```

Falls back to `orbitRadPerPixel`'s existing flat-rate math
(`cam.yaw -= dx * radPerPixel; cam.pitch += dy * radPerPixel`, unchanged) on
the `pivotRadiusMpc === null` / no-hit branch — per the "Drag hit/miss
coexistence" Global Constraint, this function is called ONLY on the hit
branch; the miss branch keeps `orbitControls.ts`'s existing two lines
verbatim.

- [ ] **Test `surfaceDragRotation` reprojects the grabbed point back to the
      cursor (round-trip acceptance test)** — pick a `grabbedPoint`,
      `bodyOrientation`, `bodyCentreMpc`, `radiusMpc`, and an initial `cam`
      pose such that the grabbed point projects to a KNOWN cursor pixel
      (e.g. compute it forward via `lonLatFocusPose`-style geometry, or pick
      screen centre with a nadir grab). Call `surfaceDragRotation` with a
      cursor position offset by a hand-picked `(dxCss, dyCss)` from that
      known pixel. Apply the returned `{yaw, pitch}` to a fresh `cam` copy,
      recompute `cam.position` (`updatePosition`), rebuild the cursor ray at
      the OFFSET cursor position via `cursorRayWorld`, intersect the sphere
      via `raySphereRoots`, and assert the resulting world hit point is
      within a small tolerance (e.g. `1e-4 * radiusMpc`) of the grabbed
      point's world position. This is an INDEPENDENT correctness check (does
      applying the output achieve the stated goal), not a mirror of
      whatever internal method the implementation used.
- [ ] **Test `surfaceDragRotation` at screen centre with a nadir grab
      approximately matches `orbitRadPerPixel`'s existing rate** — a
      consistency check against the one point `orbitRadPerPixel`'s header
      already documents as exactly correct (`orbitRadPerPixel.ts:22`,
      "Correct only at SCREEN CENTRE"): for a small `(dxCss, dyCss)` at
      screen centre, assert the returned `(dYaw, dPitch)` deltas are within
      a few percent of `dx * orbitRadPerPixel(...)` / `dy *
      orbitRadPerPixel(...)` for the same inputs — the two independently-
      derived formulas should agree where both are supposed to be exact.
- [ ] **Test `surfaceDragRotation` differs from the flat rate off-centre** —
      the same drag delta applied with a grab point near the visible limb
      (large pitch offset from centre) must NOT match the flat-rate
      prediction — this is the regression test for the bug the exact fix
      exists to close (`orbitRadPerPixel.ts`'s documented off-centre drift).
- [ ] Implement `surfaceDragRotation`.
- [ ] Add `hoveredSurfacePoint?.()` read to `orbitControls.ts`'s `onDown`
      (`orbitControls.ts:204–271`): closure-local `let grabbedPoint:
      { bodyId: BodyId; point: LonLatDeg } | null = null`, captured from
      `options?.hoveredSurfacePoint?.() ?? null` on the FIRST contact
      (`activePointers.size === 1` branch, alongside the existing
      `dragMode`/`downX`/`downY` capture), cleared on `onUp`'s
      all-contacts-lifted branch.
- [ ] Rewire the orbit branch (`orbitControls.ts:460–474`): when
      `grabbedPoint !== null` AND `grabbedPoint.bodyId` matches the current
      `pivotRadius()`-eligible focused body (reuse the same focus-row read
      the `pivotRadiusMpc` getter already performs — implementer's call on
      whether `OrbitControlsOptions` needs a THIRD getter for the focused
      body's id/orientation/radius, or whether `hoveredSurfacePoint`'s own
      `bodyId` field plus a new small getter for
      `{bodyCentreMpc, bodyOrientation, radiusMpc}` is added; document the
      choice), call `surfaceDragRotation(...)` and assign its `{yaw, pitch}`
      directly to `cam.yaw`/`cam.pitch` (replacing the flat-rate two lines);
      otherwise (no grab, or grab body no longer focused) keep the existing
      `orbitRadPerPixel`-driven lines unchanged.
- [ ] `npm run typecheck` — clean.
- [ ] `npm test -- surfaceDragRotation orbitControls` — green.
- [ ] Commit.

---

## Task 4: Pan altitude-currency fix (§4.5)

**Files:**

- Modify: `src/services/camera/orbitControls.ts` (`orbitControls.ts:427`)
- Test: `tests/services/camera/orbitControls.test.ts` (modify)

Fully independent of Tasks 1–3 — no raycast, no new register. `pxToWorld`
(`orbitControls.ts:427`, `(2 * cam.distance * Math.tan(cam.fovYRad / 2)) /
cssHeight`) uses raw `cam.distance` where the orbit-drag rate
(`orbitRadPerPixel`) and the wheel zoom (`zoomedDistance`) both already use
ALTITUDE (`distance - pivotRadiusMpc`) once a body is focused. Near the
surface, `cam.distance` is dominated by the body's own radius, so a pan
gesture moves the target by a distance scaled to Earth's whole radius
instead of the actual ground span in view.

- [ ] **Test pan's world-space delta uses altitude, not raw distance, when a
      pivot is focused** — with `options.pivotRadiusMpc` returning a large
      radius close to `cam.distance` (a near-surface framing), assert the
      resulting `cam.target` shift for a fixed `(dx, dy)` matches
      `2 * (cam.distance - pivotRadiusMpc) * Math.tan(fovYRad/2) / cssHeight`
      hand-computed for the fixture's own numbers — NOT the pre-fix
      `2 * cam.distance * tan(...)  / cssHeight` value (this is the
      regression test: the two formulas diverge sharply near a body's
      surface, so asserting against the OLD formula's output would fail
      after the fix, proving the test exercises the real change).
- [ ] **Test pan degenerates to the unchanged deep-space formula when no
      pivot is focused** — `options.pivotRadiusMpc` returning `null` (or
      omitted): assert the shift matches today's plain `cam.distance`-based
      formula exactly — the "stays two offsets… composed independently"
      Global Constraint's degenerate case, and the regression floor for
      every existing non-body-focused pan (galaxies, structures, the Milky
      Way) staying byte-identical.
- [ ] Implement: replace `orbitControls.ts:427`'s `cam.distance` with
      `cam.distance - (pivotRadius() ?? 0)` (mirroring `orbitRadPerPixel`'s
      own `h = distance - pivotRadiusMpc` term, `orbitRadPerPixel.ts:47` —
      `pivotRadius() ?? 0` degenerates to raw `cam.distance` exactly when
      unfocused, since subtracting 0 is a no-op).
- [ ] `npm run typecheck` — clean.
- [ ] `npm test -- orbitControls` — green.
- [ ] Commit.

---

## Task 5: Surface-fixed camera follow — hysteresis + basis correction (§4.6, part 1)

**Files:**

- Create: `src/utils/camera/surfaceFollowEngaged.ts`,
  `src/utils/camera/orientationFlipCorrection.ts`
- Modify: `src/@types/engine/state/CameraRuntime.d.ts` (add `surfaceFollow`
  Resource), `src/services/engine/frame/runFrame.ts` (basis-resolution
  block, `runFrame.ts:275–304`)
- Test: `tests/utils/camera/surfaceFollowEngaged.test.ts` (new),
  `tests/utils/camera/orientationFlipCorrection.test.ts` (new),
  `tests/services/engine/frame/runFrame.test.ts` (modify — add
  engage/disengage + identity-at-flip coverage, mirroring the file's
  existing basis-resolution assertions)

**Ruling (binding — resolves the spec's own open call).** The spec's file
inventory (§7) flags this as undecided: "interaction with §4.6's basis
composition — plan decides whether these compose or one subsumes the other,"
naming both `cameraDrivers.ts` and `applyFocusedBodyPivot.ts` as candidates.
Neither fits: `cameraDrivers.ts`'s rows produce a `CameraPose`
(`target`/`yaw`/`pitch`/`distance`); `applyFocusedBodyPivot.ts` only ever
overwrites `target`. Surface-fixed follow corrects neither — it corrects the
DECODE BASIS those numbers run through (the same axis `poseBasis`/`upBasis`
already occupy). This task composes the correction alongside `runFrame.ts`'s
existing basis-resolution block (`runFrame.ts:291–304`, where `poseBasis`
and `upBasis` are set onto `state.cam` and threaded into
`deriveFrameContext`), as a THIRD resolved basis quantity, not a new driver
row and not a pivot-pin addition.

**Interfaces:**

```ts
// src/utils/camera/surfaceFollowEngaged.ts
export function surfaceFollowEngaged(
  wasEngaged: boolean,
  altitudeMpc: number,
  engageAtMpc: number,
  disengageAtMpc: number, // > engageAtMpc
): boolean;

// src/utils/camera/orientationFlipCorrection.ts
export function orientationFlipCorrection(
  orientationAtFlip: Readonly<Mat3>,
  currentOrientation: Readonly<Mat3>,
): Mat3; // inverse(orientationAtFlip) · currentOrientation — tight 9-float, column-major
```

```ts
// src/@types/engine/state/CameraRuntime.d.ts — new field
surfaceFollow: {
  engaged: boolean;
  /** Snapshotted the frame engagement flips false→true; null while disengaged. */
  orientationAtFlip: Mat3 | null;
};
```

`surfaceFollowEngaged`: `!wasEngaged && altitudeMpc <= engageAtMpc` → `true`;
`wasEngaged && altitudeMpc >= disengageAtMpc` → `false`; otherwise
`wasEngaged` unchanged (the hysteresis band between the two thresholds).

`orientationFlipCorrection`: since both inputs are orthonormal rotations,
`inverse(R) = Rᵀ`. Transpose `orientationAtFlip`, then multiply by
`currentOrientation` using the tight 9-float column-major convention
`camPosLocal.ts`'s header documents (`m[c*3+r]` = cell row r, column c).

Engage/disengage thresholds: two named exported constants sized as
multiples of the focused body's `radiusMpc`-relative altitude (e.g. engage
at `SURFACE_STANDOFF_RADII`-relative `2×` the standoff floor's altitude,
disengage at `4×` — implementer's tuning call; document the reasoning
inline the way `ORBIT_MAX_RAD_PER_PX`'s comment documents its own crossover,
and finalize the exact multiples against Task 7's visual pass, since the
spec itself defers final tuning to the dev-server check).

- [ ] **Test `surfaceFollowEngaged` engages when altitude drops to the
      engage threshold** — `wasEngaged: false`, `altitudeMpc === engageAtMpc`
      → `true`.
- [ ] **Test `surfaceFollowEngaged` holds engaged through the hysteresis
      band** — `wasEngaged: true`, `altitudeMpc` strictly between
      `engageAtMpc` and `disengageAtMpc` → stays `true` (the test the two-
      operator boundary-test exception in `testing.md` calls for: `<` vs
      `<=` genuinely reclassifies here, since a single-threshold model would
      flicker in this exact band).
- [ ] **Test `surfaceFollowEngaged` disengages at the disengage threshold** —
      `wasEngaged: true`, `altitudeMpc === disengageAtMpc` → `false`.
- [ ] **Test `surfaceFollowEngaged` stays disengaged above the engage
      threshold** — `wasEngaged: false`, `altitudeMpc` above `engageAtMpc`
      → stays `false`.
- [ ] Implement `surfaceFollowEngaged`.
- [ ] **Test `orientationFlipCorrection` returns identity when both
      orientations are equal** — `orientationAtFlip === currentOrientation`,
      a hand-picked NON-identity rotation (e.g. a 90°-about-Z tight `Mat3`)
      passed as BOTH arguments; assert the result equals `IDENTITY_MAT3`
      (`src/utils/math/identityMat3.ts`) — `Rᵀ·R = I` is an independent
      mathematical identity, not a mirror of the transpose+multiply
      implementation under test.
- [ ] **Test `orientationFlipCorrection` with an identity `orientationAtFlip`
      returns `currentOrientation` unchanged** — `inverse(I)·R = R`,
      hand-verified.
- [ ] **Test `orientationFlipCorrection` composes two same-axis rotations by
      hand-computable angle subtraction** — e.g. `orientationAtFlip` = 90°
      about local +Z, `currentOrientation` = 150° about the SAME axis;
      hand-compute the expected 60°-about-Z result matrix directly (same-axis
      rotation composition is elementary trig, independently verifiable
      without running the code under test).
- [ ] Implement `orientationFlipCorrection`.
- [ ] Add `surfaceFollow: { engaged: boolean; orientationAtFlip: Mat3 | null }`
      to `CameraRuntime`, initialized `{ engaged: false, orientationAtFlip:
      null }` at construction (mirror `upBasis`'s init site).
- [ ] Wire `runFrame.ts`'s basis-resolution block: after `upBasis` is
      resolved (`runFrame.ts:292–298`) and before it is written onto
      `state.cam`, resolve the focused body's live altitude (reuse the same
      `state.selectionRows.focus` + `deriveBodyStates(simDays)` +
      `pivotRadiusMpc`-style radius resolution Task 2 already establishes at
      its `frameContext.ts` call site — implementer's call on whether to
      factor a shared small helper or read it twice; the two sites run at
      different points in the frame, so a shared per-frame memo is not
      required). Call `surfaceFollowEngaged(state.cameraRuntime.surfaceFollow.engaged,
      altitudeMpc, ENGAGE_AT_MPC, DISENGAGE_AT_MPC)`. On a false→true
      transition, snapshot `state.cameraRuntime.surfaceFollow.orientationAtFlip
      = bodyState.orientation` (a copy, not an alias — the body's orientation
      keeps changing every frame). While engaged, compute
      `orientationFlipCorrection(orientationAtFlip, bodyState.orientation)`
      and compose it into `poseBasis`/`upBasis` before they are written onto
      `state.cam` (both — the decode basis AND the live screen-up must
      co-rotate together, or a roll would desync from the hold). While
      disengaged, `poseBasis`/`upBasis` pass through unchanged (today's
      behaviour) and `orientationAtFlip` resets to `null`.
- [ ] **Test the engage frame introduces no pose jump** — construct a
      `runFrame` fixture (mirroring the file's existing basis-resolution
      test setup) where the frame the follow mode engages is also the frame
      being asserted; verify the corrected `poseBasis`/`upBasis` are
      bit-identical to the UNCORRECTED values that same frame (since
      `orientationFlipCorrection(orientationAtFlip, orientationAtFlip) =
      identity`, composing identity changes nothing) — this is the direct
      regression test for the spec's named "no pose jump" property.
- [ ] `npm run typecheck` — clean.
- [ ] `npm test -- surfaceFollowEngaged orientationFlipCorrection runFrame` — green.
- [ ] Commit.

---

## Task 6: `LIVE_IDLE_TICK_MS` re-derivation (§4.6, part 2)

**Files:**

- Modify: `src/services/engine/frame/runFrame.ts:117–141`

**Depends on Task 5's `DISENGAGE_AT_MPC` constant.** The existing comment
(`runFrame.ts:123–127`) derives the 500 ms cadence against "the 127 km
standoff" and a "~147 km viewport" — both stale by roughly two orders of
magnitude against the real ~15.3 m `SURFACE_STANDOFF_RADII` floor (spec §1,
§9.1). Per spec §4.6: "against the real ~15.3 m floor and whatever altitude
range surface-fixed follow now holds steady" — i.e. the worst-case altitude
this cadence must stay honest at is the surface-follow DISENGAGE threshold
(Task 5's `DISENGAGE_AT_MPC`), not the absolute floor: below the engage
threshold the ground no longer visibly slides at all (that's the whole point
of Task 5), so the idle-tick drift budget only has to hold up to the altitude
where surface-fixed follow is NOT yet active.

- [ ] Re-derive the cadence using the SAME formula the existing comment
      documents (`ground drift scales linearly with tick length,
      screen-space drift inversely with altitude`; `viewport_span =
      2 * h * tan(fovY/2)`), substituting `h = DISENGAGE_AT_MPC`'s altitude
      (Task 5) in place of the stale 127 km figure, and the SAME 1.5 px
      drift budget on a ~900 px canvas the current comment targets. Update
      `LIVE_IDLE_TICK_MS`'s value and rewrite the comment
      (`runFrame.ts:117–140`) to show the new derivation with the new
      altitude — do not leave the old 127 km framing in place alongside a
      changed constant.
- [ ] **No new test** — `testing.md`'s constant-restatement rule applies
      directly here (a `LIVE_IDLE_TICK_MS === <value>` test would only ever
      fail on a deliberate future re-tune, never a real bug); confirmed no
      existing test pins this constant's value (`grep -rn LIVE_IDLE_TICK_MS
      tests/` returns nothing today), so none needs updating either.
- [ ] `npm run typecheck` — clean.
- [ ] `npm test -- runFrame` — green (unaffected by a constant tuning
      change).
- [ ] Commit.

---

## Task 7: verification gate

**Not a code task** beyond whatever the manual check surfaces needing a fix.

- [ ] Load the `perf` skill (`.claude/skills/perf/SKILL.md`). Run `npm run
      perf -- --url http://localhost:<this worktree's dev-server port>`
      before Task 1's changes (a clean baseline, or reuse Plan 1's final
      Task 6 numbers if this worktree branches directly off that commit) and
      after Task 6 completes. Record MERGED/PER-LAYER/FLOOR numbers per the
      skill's interpretation guidance.
- [ ] **Land/park is the user's ruling per `feedback_code_is_liability`**: a
      neutral-or-negative perf measurement halts the pipeline here — report
      the numbers to the user before proceeding to the visual pass.
- [ ] `npm test` — full suite green.
- [ ] `npm run typecheck` — clean.
- [ ] Hand off to the user for the dev-server visual pass (spec §5):
  - Cursor-directed zoom visibly converges on the hovered ground point;
    zooming back out reverts to centre-directed with no snap.
  - Orbit-drag keeps the grabbed ground point under the cursor at every
    latitude and every screen position, not only near centre.
  - A pan near the surface moves the target by a sane ground distance, not
    one dominated by Earth's radius.
  - Ground does not visibly slide under the camera below the surface-follow
    engage threshold, with the sim clock set to LIVE.
  - No pose jump at the surface-follow engage/disengage transitions.
  - Flying with no body/star focused (galaxies, structures, the Milky Way)
    is visually unchanged from before this feature — every new mechanism in
    this plan gates on a focused pivot.
- [ ] `/feature-done` audit once the visual pass is clean.
