# View centre lens shift: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development under
> [`sdd-execution.md`](../conventions/sdd-execution.md). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** draw the orbit pivot at the centre of the canvas minus resting UI, and frame subjects inside that
uncovered area.

**Architecture:** first, behaviour-neutral prep. Shells and cursor rays read a view frustum, the camera
runtime owns the main-view frustum, framing reads one `FramingWindow`, and the HUD-stack hidden rule
becomes a selector. Then the feature: panels write cover rows, the camera runtime turns them into an
eased off-axis frustum plus a framing window, and framing fits the narrower side.

**Tech stack:** TS, Redux Toolkit + typed-redux-saga (no react-redux), React, WebGPU/WESL, Vitest.

**Spec:** [`docs/superpowers/specs/2026-11-02-view-centre-lens-shift-design.md`](../specs/2026-11-02-view-centre-lens-shift-design.md)

**Branches:** Part A on `lens-shift-prep` (PR 1). Part B on `lens-shift`, stacked on it (PR 2, `--base lens-shift-prep` until PR 1 merges).

## Global Constraints

- **Sign of the shift.** NDC is y-up. For insets `{top,right,bottom,left}` in CSS px on a `W×H` CSS-px
  canvas: `shiftNdc = [(left − right) / W, (bottom − top) / H]`.
- **Shifted frustum.** With `hx = tan(fovY/2)·aspect` and `hy = tan(fovY/2)`, the frustum for shift
  `[cx, cy]` is `tanLeft = −hx(1+cx)`, `tanRight = hx(1−cx)`, `tanDown = −hy(1+cy)`, `tanUp = hy(1−cy)`.
  Its extents stay `2hx × 2hy`.
- **Framing window.** `tanHalfX = hx·(W − left − right)/W`, `tanHalfY = hy·(H − top − bottom)/H`. It is
  computed from the **target** insets, never the eased ones.
- **Covers clamp.** Per axis, the covered fraction `(left+right)/W` (and `(top+bottom)/H`) is clamped to
  ≤ 0.6 before either formula. A cover can't push the pivot off-screen or collapse the window.
- **Ease.** Exponential approach of `shiftNdc` to its target: `τ = 80 ms`, factor `1 − exp(−dt/τ)`. The
  first step after boot or a zero-to-zero stretch snaps to the target. Done when `|Δ| < 1e-4` per axis.
  While not done, the step requests another render.
- **What counts as a cover** (rulings): the phone dock plus the collapsed InfoCard sheet's peek (one
  probe, Task 7); the desktop exhibit notes column (right edge); the phone exhibit caption block (bottom
  edge). A pulled-open sheet still counts as its peek. Panel sheets (Layers, …), Search, the Time row and
  the palette never add to a cover.
- **No re-fit when covers arrive late** (ruling, spec §9): framing uses the window at the moment it frames,
  and only the shift eases afterwards.
- **Hidden ⇒ no cover.** Phone covers drop while `selectUiStackHidden` is true, and exhibit covers while
  the exhibit eye toggle is hidden. In a non-mono `viewRig` the runtime treats insets as zero.
- Comments follow [`comments.md`](../conventions/comments.md): explain why, not what. UI work reads
  [`ui-ux.md`](../conventions/ui-ux.md) first.

## Review Focus

1. **Faded-but-mounted UI** (Tab, splash, tour, the exhibit eye) must clear its cover. Task 7's
   interaction tests pin it.
2. **Pulled-open sheet or Layers**: Earth must not move while the sheet is dragged or expanded, or Layers
   opens. Task 7 pins the probe's `restingSheet` class.
3. **Phone rotation mid-ease**: the shift lives in NDC, so it stays continuous. Task 8's ease test steps
   through a target change.
4. **Draw and pick disagreeing**: both must read `cameraRuntime.outputs.frustum`. Task 2 removes every
   other builder of the canvas frustum.
5. **Degenerate covers** (a sidebar wider than a narrow window): Task 8 tests the clamp.

---

## Part A — prep (PR 1, behaviour-neutral)

### Task 0: Docs (controller, inline)

**Files:** spec + this plan (add), `docs/BACKLOG.md` (modify: drop the "View centre avoids the UI" line),
`docs/backlog/2026-10-10-view-insets-lens-shift.md` (delete).

- [x] Commit "Lens shift: spec and plan".

### Task 1: Shell renderers build rays from the view's frustum — review: yes

**Files:**
- Create: `src/utils/camera/frustumRayAxis.ts`, `tests/utils/camera/frustumRayAxis.test.ts`
- Modify: `src/layers/cosmicHorizon/render/horizonShellRenderer.ts:130-170`,
  `src/layers/cosmicHorizon/passes/horizonShellPass.ts:21`,
  `src/layers/zoneOfAvoidance/render/zoneOfAvoidanceRenderer.ts:160-190` (and its pick packing ~`:243`),
  `src/layers/zoneOfAvoidance/passes/zoneOfAvoidancePass.ts:20-45`,
  `src/layers/lightTime/render/lightTimeSpheresRenderer.ts:100-145`,
  `src/layers/lightTime/passes/lightTimeSpheresPass.ts:22`,
  `src/utils/math/sphereNdcBounds.ts` (+ its test),
  `src/services/gpu/shaders/horizonShell/{io,fragment}.wesl`,
  `src/services/gpu/shaders/zoneOfAvoidance/{io,band}.wesl`,
  `src/services/gpu/shaders/lightTime/{io,fragment}.wesl`
- Delete: `docs/backlog/2026-09-22-off-axis-fovy-reconstruction.md` and its `docs/BACKLOG.md` line (~166)

**Interfaces:**
- Produces: `frustumRayAxis(forward: Readonly<Vec3>, right: Readonly<Vec3>, up: Readonly<Vec3>, frustum: ViewFrustum, out: Vec3): Vec3`.
  It returns `forward + right·(tanLeft+tanRight)/2 + up·(tanDown+tanUp)/2`, unnormalised, and the
  renderers call it per frame into a preallocated scratch.
- Each `draw` takes `frustum: ViewFrustum` (the pass passes `view.frustum`) instead of deriving
  `tanHalfFovY`/`aspect` from `cam` and `viewport`. Drop `viewport` where it only fed the aspect.

**Uniform layout** (same struct sizes; only three fields change meaning):

| offset | before | after |
|---|---|---|
| 0–11 | `camForward` | `rayAxis` = `frustumRayAxis(...)` |
| 12 | `tanHalfFovY` | `tanHalfY` = `(tanUp − tanDown)/2` |
| 28 | `aspect` | `tanHalfX` = `(tanRight − tanLeft)/2` |

Shader ray: `normalize(u.rayAxis + ndc.x * u.tanHalfX * u.camRight + ndc.y * u.tanHalfY * u.camUp)`.
Update each `io.wesl` layout comment and the TS twins' offset constants.

- [x] Test `frustumRayAxis returns forward for a symmetric frustum`: `symmetricFrustum(1, 1.5)` → `out ≈ forward` (1e-12).
- [x] Test `frustumRayAxis tilts toward the shifted window centre`: frustum `{tanLeft:-0.5, tanRight:1.5, tanDown:-1, tanUp:1}`, orthonormal basis → `out ≈ forward + 0.5·right`.
- [x] `sphereNdcBounds(centre, depth, radius, tanLo, tanHi, pad)`: maps a tangent `t` to NDC as `2(t − tanLo)/(tanHi − tanLo) − 1`. Update the existing tests to pass `(−tanHalf, tanHalf)`, and add `sphereNdcBounds maps through an off-axis window`: `tanLo=0, tanHi=2`, a sphere straddling tangent 1 → bounds centred on NDC 0.
- [x] Implement, then `npm run typecheck:fast` and `npm test -- frustumRayAxis sphereNdcBounds horizonShell zoneOfAvoidance lightTime`.
- [x] Eye check (controller): `#focus=body-earth` zoomed out to the cosmic horizon, and a zone-of-avoidance view, before/after. They must look identical.
- [x] Commit.

### Task 2: The camera runtime owns the main-view frustum; the cursor ray reads it — review: yes

**Files:**
- Modify: `src/@types/engine/state/FrameOutputs.d.ts` (add `frustum`),
  `src/services/engine/camera/stepCameraRuntime.ts:117-145, ~344` (build it once, put it in `rungFields` and `outputs`),
  `src/@types/camera/RungCtx.d.ts`, `src/@types/camera/SurfaceStepCtx.d.ts` (add `frustum: ViewFrustum`; `fovYRad` stays as the lens for rates),
  `src/utils/camera/mainViewSpec.ts`, `src/services/engine/frame/runFrame.ts:178-182`, `src/services/engine/helpers/pickFrameContext.ts:52-56`,
  `src/utils/camera/cursorRayBodyLocal.ts` and its callers `src/utils/camera/{draggedSurfacePose,latchSurfaceGesture,surfaceZoomStep}.ts`, `src/layers/body/present/{terrainPickUnderCursor,terrainPickMarkerReadoutOf}.ts`, `src/layers/body/passes/terrainPickMarkerPass.ts`,
  `tests/helpers/frame/canvasViewOf.ts`, `tests/services/engine/frame/deriveView.test.ts`, and every initial-state/fixture that builds `FrameOutputs` (typecheck finds them)
- Create: `src/utils/camera/opticalCentrePx.ts`, `tests/utils/camera/opticalCentrePx.test.ts`
- Delete `src/utils/camera/frustumFovYRad.ts` (+ test) if no caller remains.

**Interfaces:**
- `FrameOutputs.frustum: ViewFrustum`. In this task it is `symmetricFrustum(projection.fovYRad, aspect)`, built once per step.
- `mainViewSpec(cam: OrbitCamera, sizePx: Size, frustum: ViewFrustum): ViewSpec`. Both production callers pass `state.cameraRuntime.outputs.frustum`.
- `cursorRayBodyLocal(pose, pixel, viewportPx, frustum: ViewFrustum): BodyLocalRay`. It maps the pixel to NDC, then to tangents `rs = mix(tanLeft, tanRight, (ndcX+1)/2)` and `us = mix(tanDown, tanUp, (ndcY+1)/2)`.
- `opticalCentrePx(frustum: ViewFrustum, viewportPx: Readonly<Vec2>): Vec2`, the CSS pixel the axis passes through (y-down). `surfaceZoomStep.ts:53` uses it as the cursorless anchor in place of `[w/2, h/2]`.

- [x] Test `opticalCentrePx is the canvas centre for a symmetric frustum`: `[800, 450]` for 1600×900.
- [x] Test `opticalCentrePx follows a shifted window`: `{tanLeft:-1, tanRight:3, tanDown:-1, tanUp:1}`, 400×200 → `[100, 100]`.
- [x] Test `cursorRayBodyLocal's ray through the optical centre is the forward column`, with an off-axis frustum (extend the existing test file).
- [x] Implement, then `npm run typecheck:fast` and the targeted tests (`cursorRay`, `surfaceZoom`, `draggedSurface`, `latchSurface`, `terrainPick`, `deriveView`, `stepCameraRuntime`).
- [x] Commit.

### Task 3: Framing reads one framing window — review: yes

**Files:**
- Create: `src/@types/camera/FramingWindow.d.ts`, `src/utils/camera/lensFramingWindow.ts`
- Modify: `FrameOutputs.d.ts` (add `framing`), `stepCameraRuntime.ts` (fill it), `src/@types/engine/camera/DriverCtx.d.ts` (add `framing`) and `src/services/engine/camera/cameraDrivers.ts:169`,
  `src/store/types.ts:84-99` (`LiveCameraRuntime`: `aspect` → `framing`; doc comment updated), `src/services/engine/engine.ts:316-323`,
  framing functions: `focusFraming`, `framingPose`, `bodyLikeFraming`, `bodyFocusDistance`, `structureFocusDistance` (`src/services/engine/camera/`), `sphereFitDistance`, `missionCameraFrame` (`src/utils/camera/`), `homePose`, `bodyHomePose` (`src/services/engine/camera/`), `resolveClipFoci` (`src/services/engine/animation/`),
  their callers: `src/state/{selection/watchFocusTweenSaga,selection/watchGoHomeSaga,navigation/navigateSaga,camera/watchFlyToLonLatSaga,camera/clipBodySaga,camera/watchClipPathInspectSaga,camera/focusTweenDescriptor,tour/visitBeatSaga,exhibits/exhibitBodySaga}.ts`, `src/layers/missions/sagas/missionHoldSaga.ts`, `src/layers/missions/exhibits/timeline/missionPose.ts`,
  the boot seed `src/services/engine/phases/wireInput.ts:93-102`, and their tests.

**Interfaces:**
- `type FramingWindow = { readonly tanHalfX: number; readonly tanHalfY: number }`: half-tangents of the
  area a framed subject must fit, symmetric about the view axis.
- `lensFramingWindow(fovYRad: number, aspect: number): FramingWindow` → `{ tanHalfY: tan(fovY/2), tanHalfX: tan(fovY/2)·aspect }`.
- Each framing function swaps its `fovYRad` (+ `aspect`) parameter for `framing: FramingWindow`.
  - `bodyFocusDistance` and `structureFocusDistance` read `framing.tanHalfY`: identical numbers. Task 9 changes this.
  - `sphereFitDistance` uses `Math.atan(Math.min(framing.tanHalfX, framing.tanHalfY))`, the same value as today's `min(1, aspect)`.
- **Keep `fovYRad` where it is a lens or rate, not a fit.** `resolveFocusMotion` and the geodesic `FocusMotion.fovYRad` path width keep the lens. `LiveCameraRuntime` keeps `fovYRad` for them.

- [x] No new test: this is a parameter sweep with identical numbers. Existing framing tests change only their arguments (`lensFramingWindow(fovY, aspect)`), never their expected values.
- [x] Implement, then `npm run typecheck:fast` and the targeted framing, saga and mission tests.
- [x] Commit.

### Task 4: The HUD-stack hidden rule becomes a selector

**Files:** `src/state/ui/selectors.ts` (add), `src/components/App/App.tsx:89-91` (use it).

**Interfaces:** `selectUiStackHidden(state: RootState): boolean`, which is `uiHidden || splashVisible || tourActive || takeover is an exhibit`, reading the same selectors App uses today.

- [x] No new test: a pure extraction, and the App interaction tests cover it.
- [x] Commit.

### Task 5: Prep PR (controller)

- [ ] Push `lens-shift-prep`, open PR 1 (spec + plan + Tasks 1–4), and watch CI in the background.

---

## Part B — feature (PR 2, stacked)

### Task 6: Cover rows

**Files:**
- Create: `src/state/viewCover/viewCoverSlice.ts`, `src/state/viewCover/selectors.ts`, `src/@types/layout/{CoverId,CoverEdge,ViewCover,InsetsPx}.d.ts`, `tests/state/viewCover/selectors.test.ts`
- Modify: `src/store/constants.ts` (`viewCoverRoute`), the root reducer, `src/store/effects/watchWakeSaga.ts` (add `viewCoverRoute` to `WAKE_ROUTES`, with one line on why: covers move the drawn view)

**Interfaces:**
- `type CoverEdge = 'top' | 'right' | 'bottom' | 'left'`
- `type CoverId = 'phoneBottom' | 'exhibitNotes' | 'exhibitCaption'`
- `type ViewCover = { readonly edge: CoverEdge; readonly reachPx: number }`. `reachPx` is CSS px from that canvas edge to the panel's inner edge.
- `type InsetsPx = { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number }`
- Action `viewCoverSet({ id, cover: ViewCover | null })`; null deletes the row. State: `Partial<Record<CoverId, ViewCover>>`.
- `selectViewCoverPx(state): InsetsPx` is the per-edge **max**, memoised. With no rows it is all zeros.

- [x] Test `selectViewCoverPx takes the max per edge`: phoneBottom bottom 140 + exhibitCaption bottom 300 → `bottom: 300`, the rest 0.
- [x] Test `selectViewCoverPx is zero with no covers`.
- [x] Implement, typecheck, targeted tests, commit.

### Task 7: Panels claim their cover — review: yes

Read [`ui-ux.md`](../conventions/ui-ux.md) and the `create-component` skill's conventions before you touch components.

**Files:**
- Create: `src/hooks/useViewCover.ts`, `tests/hooks/useViewCover.test.tsx`
- Modify: `src/components/BottomStack/BottomStack.tsx` + `.module.css` (the probe and the `restingSheet` prop), `src/components/containers/PhoneHudContainer.tsx` (pass `restingSheet={selectionKey !== null}` and `active`), `src/components/ExhibitOverlay/ExhibitOverlay.tsx`; interaction tests beside them.

**Why a probe** (builder check): the sheet peeks by `transform` (`MobileSheet.module.css:39,52-56`), which a ResizeObserver can't see, and opening Layers unmounts the InfoCard sheet (`PhoneHudContainer.tsx:76-93`). A cover tied to the sheet element would vanish exactly when a transient panel opens.

**Interfaces:**
- `useViewCover(ref: RefObject<HTMLElement | null>, edge: CoverEdge, active: boolean, onCover: (cover: ViewCover | null) => void): void` — DOM-only; the container wires a stable `useCallback` that dispatches `viewCoverSet` for its `CoverId`.
  - While active: a ResizeObserver plus a window `resize` listener. The reach comes from `getBoundingClientRect()` against the viewport (`bottom` → `innerHeight − rect.top`, `right` → `innerWidth − rect.left`, `top` → `rect.bottom`, `left` → `rect.right`). It calls `onCover` only when the rounded reach changes.
  - Inactive or unmount: `onCover(null)`.
- BottomStack probe: an empty `aria-hidden` element, `position: fixed; bottom: 0; left: 0; width: 0; pointer-events: none`. Its height is `var(--dock-height)`, plus `var(--mobile-sheet-peek)` under `.restingSheet`. Cover `phoneBottom`, edge `bottom`, active while not `selectUiStackHidden`.
- Exhibit: on desktop, the notes column → `exhibitNotes`, `right`. On mobile, the caption block → `exhibitCaption`, `bottom`. Inactive while the eye toggle is hidden; the notes cover is also inactive when there are no notes.
- Update `CoverId` (Task 6) to `'phoneBottom' | 'exhibitNotes' | 'exhibitCaption'` if Task 6 landed the older names.

- [x] Test `useViewCover clears its row when it turns inactive`.
- [x] Test `useViewCover reports the reach from its edge`: stub `getBoundingClientRect` and `innerHeight`, then assert `reachPx`.
- [x] Interaction test (ExhibitOverlay): the eye toggle clears the exhibit row, and pressing it again restores it.
- [x] Interaction test (BottomStack/PhoneHud): the probe takes the `restingSheet` class while a selection exists, including while Layers is open.
- [x] Implement, typecheck, targeted tests, commit.

### Task 8: The camera runtime shifts the frustum and frames the uncovered area — review: yes

**Files:**
- Create: `src/utils/camera/{coverShiftNdc,shiftedFrustum,coveredFramingWindow,easedShiftNdc}.ts` + tests under `tests/utils/camera/`; constants `src/data/camera/{lensShiftEaseTauMs,maxCoveredFraction}.ts`
- Modify: `src/@types/engine/state/CameraRuntime.d.ts` (add `shiftNdc: Vec2` memory), its initial value, `stepCameraRuntime.ts` (input `coverPx: InsetsPx`; outputs `frustum` = shifted, `framing` = covered; `requestRender` while easing), `runFrame.ts:97-108` (pass `selectViewCoverPx(stored)`, or zeros when `state.viewRig !== 'mono'`)

**Interfaces:**
- `coverShiftNdc(insets: InsetsPx, canvasPx: Readonly<Vec2>): Vec2`, which applies the clamp.
- `shiftedFrustum(fovYRad: number, aspect: number, shiftNdc: Readonly<Vec2>): ViewFrustum`
- `coveredFramingWindow(fovYRad: number, aspect: number, insets: InsetsPx, canvasPx: Readonly<Vec2>): FramingWindow`, which applies the clamp and replaces `lensFramingWindow` in the runtime.
- `easedShiftNdc(current: Readonly<Vec2> | null, target: Readonly<Vec2>, dtMs: number): Vec2`. `null` current means snap.

- [x] Test `coverShiftNdc lifts the axis above a bottom cover`: insets bottom 200 on 400×1000 → `[0, 0.2]`.
- [x] Test `coverShiftNdc moves the axis left of a right sidebar`: right 400 on 1600×900 → `[-0.25, 0]`.
- [x] Test `coverShiftNdc clamps a cover wider than the window`: right 1000 on 1000 wide → `cx = −0.6`.
- [x] Test `shiftedFrustum keeps its extents`: for shift `[0.3, −0.2]`, `tanRight − tanLeft = 2hx` and `tanUp − tanDown = 2hy`, and at shift `[0,0]` it equals `symmetricFrustum`.
- [x] Test `shiftedFrustum puts the axis at the shift`: the NDC of tangent 0 equals `shiftNdc`.
- [x] Test `coveredFramingWindow shrinks to the uncovered rect`: bottom 200 on 400×1000 → `tanHalfY = 0.8·hy`, `tanHalfX = hx`.
- [x] Test `easedShiftNdc snaps from null, approaches with τ = 80 ms, and stays continuous when the target jumps mid-ease`.
- [x] Test (stepCameraRuntime): a cover change yields `requestRender: true` until the shift settles, and `outputs.framing` uses the target from the first frame.
- [x] Implement, typecheck, targeted tests, commit.

### Task 9: Framing fits the narrower side

**Files:** `src/services/engine/camera/{bodyFocusDistance,structureFocusDistance}.ts` + tests.

- [x] Change both to fill against `Math.min(framing.tanHalfX, framing.tanHalfY)`.
- [x] Test `bodyFocusDistance fits by width in a portrait window`: `{tanHalfX: 0.3, tanHalfY: 0.6}` gives the same distance as `{0.3, 0.3}`.
- [x] Update the expected values that change in existing tests (portrait fixtures only). Name each one in the commit body.
- [x] Commit.

### Task 10: Verify and land (controller)

- [ ] Eye checks, before (main) / after, one dash check each:
  - phone via `npm run phone`: `#focus=body-earth`; sheet expanded (Earth holds); `#exhibit=solarSystem`; the exhibit eye toggled (re-centred); a pinch on Earth's surface (anchors under the fingers)
  - desktop 1600×900: `#exhibit=solarSystem` (Sun left of the notes); Tab-hidden (centred)
- [ ] Push `lens-shift`, open PR 2 (`--base lens-shift-prep`), watch CI.
- [ ] One whole-branch review across both PRs' diffs (spec fidelity + slop), one fix round.

## Definition of Done

- **Deliverables:** `frustumRayAxis`, `opticalCentrePx`, `FramingWindow` + `lensFramingWindow`/`coveredFramingWindow`, `selectUiStackHidden`, the `viewCover` slice + `selectViewCoverPx`, `useViewCover`, `coverShiftNdc`, `shiftedFrustum`, `easedShiftNdc`; `FrameOutputs.frustum`/`.framing`; `LiveCameraRuntime.framing`.
- **Observable:**
  - On a phone, Earth's centre sits midway between the screen top and the top of the collapsed sheet.
  - Pulling the sheet open does not move Earth.
  - In a desktop exhibit the subject sits centred left of the notes column. In a phone exhibit it sits above the caption.
  - Tab or the exhibit eye re-centres the view, with an ease.
  - Shells stay aligned with labels and the grid on a shifted view.
  - A surface pinch anchors under the fingers.
  - Recorder and `shot --hide-ui` frames are unshifted.
- **Out of scope:** desktop covers outside exhibits; the TourOverlay caption (no cover); the galaxy-renderer tool's `FieldCamera`; debug gizmo frusta.
- Both backlog items are deleted: lens shift and off-axis fovY reconstruction.
