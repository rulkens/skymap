# Zoom to Earth — Plan 03: LOD & polish

**Spec:** `docs/superpowers/specs/2026-06-29-zoom-to-earth-true-scale-design.md` — scope is **§10 Phases 4 (LOD + depth) and 5 (Polish)**, plus §4's LOD section, §7 camera, §12 open questions.
**Cross-plan contract (source of truth):** the locked interface contract shared by Plans 01/02/03. Every symbol name, file path, and signature below MUST match it. Where Plan 01/02 introduce a symbol, this plan CONSUMES it under the same name. If current code makes a contract symbol impossible, the task says **STOP and report** rather than silently diverging.
**Plan style (OVERRIDES upstream writing-plans):** `docs/superpowers/conventions/plan-style.md` — **contract code yes, implementation code no.** Cite `path:line`, never paste full function bodies. Test names + assertions ARE the acceptance criteria.

## Goal

Make the zoom-to-Earth foreground pass scale-correct and legible at any zoom, and add the developer affordance to reach Earth:

1. **Adaptive foreground frustum** — replace Plan 01's heuristic `foregroundNear`/`foregroundFar` with a pure helper that sizes the foreground frustum from camera-distance-to-focus, so depth precision stays good from galaxy scale down to Earth's surface.
2. **Apparent-size point↔sphere promotion for stars** — a star renders as an additive backdrop point (`starPointRenderer`) when small, and promotes to a foreground emissive sphere (`starRenderer`) when its apparent size crosses a threshold. The Sun is always resolved. The same `apparentSizePx` mechanism galaxies already use for the point→thumbnail promotion.
3. **Fly-to-Earth debug key** — a keyboard handler that tweens the camera to Earth-surface framing. Real UI control stays deferred.
4. **ADR** recording the ADR-0001 refinement (continuous per-object floating origin vs discrete per-shell).
5. **Entanglement-radar pass** over the whole feature diff + **full gate**.

## What this plan CONSUMES (prior-plan deliverables — treat as existing)

From **Plan 01** (`2026-06-29-zoom-to-earth-01-precision-slice.md`):
- The opaque foreground pass: `encodeForegroundPass.ts`, `foregroundOffscreen.ts`, `foregroundComposite.ts`.
- `composeBodyMvp` (`src/utils/camera/composeBodyMvp.ts`), `computeForegroundViewProj`, `narrowMat4`, `RENDER_ORIGIN_MPC`, `SCALE_UNITS`.
- The four `ReadyFrameContext` foreground fields (`src/@types/engine/frame/ReadyFrameContext.d.ts`): `foregroundVp: Float64Array`, `foregroundNear: number` (Plan 01 sets a **simple heuristic**; THIS plan makes it adaptive), `foregroundFar: number`, `renderOrigin: Readonly<Vec3>`.
- **`MIN_DISTANCE_MPC` already lowered by Plan 01** (`src/utils/camera/clampDistance.ts:27`, currently `0.05`). **Plan 03 does NOT touch it.** Stated again in Task 4's notes.

From **Plan 02** (`2026-06-29-zoom-to-earth-02-earth-and-anchors.md`):
- `StarRenderer` / `StarPointRenderer` (`src/@types/rendering/StarRenderer.d.ts` + `StarPointRenderer.d.ts`), `starRenderer.ts` / `starPointRenderer.ts`, and their `EngineGpuHandles` slots.
- `StarBody` (`src/@types/scene/StarBody.d.ts`) with `absMag`, `color`, `radiusKm`, `positionMpc`.
- `BodyStore` (`src/services/engine/data/createBodyStore.ts`) wired as `state.data.bodies`, seeded from `sceneBodies.ts` (Sun at origin, Proxima at ~1.301 pc).
- The table-dispatch by `type` in `encodeForegroundPass` (tagged-union convention) — Plan 03 partitions the star list into backdrop-points vs foreground-spheres BEFORE that dispatch runs.

## Tech stack

TS, wgpu-matrix (`mat4d`/`vec3d` f64 namespaces), WebGPU + WESL, redux-toolkit + typed-redux-saga, hotkeys-js (via `createKeyboardListener`), Vitest. No new deps.

## Global constraints (house rules — these override defaults)

- **Contract code yes, implementation code no.** No function bodies in this plan; cite `path:line` and pin signatures + test names only.
- **One symbol per file** in `src/utils/` and `src/@types/` — filename = exported symbol (`foregroundFrustum.ts`, `resolvesToSphere.ts`). Deep relative imports, no barrels.
- **`type` aliases, never `interface`.** `Vec2`/`Vec3` aliases from `src/@types/math/`, never raw tuples.
- **Tagged-union table-dispatch** for any >2-way split (simplicity.md §7) — never an `if (type === …)` chain. The star-partition is a 2-way predicate (point vs sphere) so a boolean predicate is correct; do not over-engineer it into a table.
- **Didactic, timeless comments** — explain _why_ and _what the alternative was_; no dates / PR refs / "pre-X" history in code comments.
- **Tests mirror the src tree**; `import { describe, it, expect } from 'vitest'`.
- **Suite stays green.** Each task ends with its named tests passing. The final task gates on the full `npm run typecheck` (both src + tools tsconfigs) + `npm test`.
- **VISUAL gates (NOT covered by automated tests — STOP and ask the user to confirm on the dev server):**
  - **Smooth point↔sphere promotion** — a star crossing the threshold as you fly toward it must fade/grow continuously, no pop, no double-draw (point AND sphere in the same frame).
  - **Fly-to-Earth motion** — the debug key tweens the camera smoothly down to Earth-surface framing; Earth resolves round, stable, no jitter/clipping/swim; backdrop intact.
  - **Believable LOD** — anchors (Sun, Moon, Jupiter, Proxima) sit at believable relative sizes through the descent; the foreground frustum keeps Earth crisp without near-plane clipping or z-fighting at any zoom.

---

## Task 1 — `foregroundFrustum` pure helper

**Files:** `src/utils/camera/foregroundFrustum.ts` (new), `tests/utils/camera/foregroundFrustum.test.ts` (new).

**Signature (contract — match exactly):**
```ts
export function foregroundFrustum(camDistanceMpc: number): { near: number; far: number };
```

**Behaviour:** derive a foreground near/far bracket scaled around the camera-distance-to-focus so the depth32float foreground buffer stays precise at any scale. `near` scales DOWN with distance (a fraction of `camDistanceMpc`, floored above 0 so it never collapses to or below zero — the near plane is what z-precision is most sensitive to), `far` scales UP with distance (a multiple of `camDistanceMpc`) to enclose the resolved near bodies. Both strictly positive, `near < far`. Pure — no engine state, no clock.

- [ ] Add `foregroundFrustum.ts` — single function, file named for it. Didactic docblock: WHY the foreground frustum is adaptive (a fixed near/far cannot stay precise across ~17 OOM of zoom; the backdrop keeps its own wide static frustum via `computeViewProj` — see spec §4/§7), and WHY near must stay strictly above 0 (the depth32float buffer's precision is dominated by the near plane; `near=0` is a degenerate perspective matrix).
- [ ] Test `foregroundFrustum returns near < far` — for a representative distance (e.g. galaxy scale `0.43` and Earth-surface scale ~`1e-16`), assert `near < far`.
- [ ] Test `foregroundFrustum near stays strictly positive at tiny distance` — at an Earth-surface `camDistanceMpc` (~`1e-16`), assert `near > 0` (guards the degenerate-matrix trap).
- [ ] Test `foregroundFrustum both bounds scale with distance` — assert near and far at a 10× larger distance are each strictly larger than at the base distance (monotone in `camDistanceMpc`).
- [ ] `npm test -- foregroundFrustum` → all three pass. Commit.

## Task 2 — Wire adaptive near/far into `deriveFrameContext`

**Files:** `src/services/engine/frame/frameContext.ts` (modify), `tests/services/engine/frame/frameContext.test.ts` (modify or add — match the existing test's `makeCtx`/state-builder style).

Plan 01 populates `ctx.foregroundNear` / `ctx.foregroundFar` with a simple heuristic. Replace that with `foregroundFrustum(cam.distance)`. The camera-distance-to-focus is the assembled camera's `distance` (the orbit radius — `cam` is built at `frameContext.ts:136` via `assembleOrbitCamera`; the existing `drawPxPerRad` derivation at `frameContext.ts:144` is the precedent for deriving a scalar off `cam` in this function). The four foreground fields are returned in the `isReady: true` block (`frameContext.ts:163-177`).

**Interfaces:**
- Consumes: `foregroundFrustum(camDistanceMpc)` (Task 1); `cam.distance` from the assembled `OrbitCamera`.
- Produces: `ctx.foregroundNear` / `ctx.foregroundFar` set to the helper's output (replaces Plan 01's heuristic locals — find and delete them, do not leave both).

- [ ] Replace the Plan 01 heuristic `foregroundNear`/`foregroundFar` derivation with `const { near, far } = foregroundFrustum(cam.distance);` and assign `foregroundNear: near, foregroundFar: far` in the returned ready context. Keep `foregroundVp` and `renderOrigin` exactly as Plan 01 set them.
- [ ] Add a one-line comment at the assignment: the foreground frustum is adaptive (Task 1), unlike the backdrop's static frustum baked into `vp` via `computeViewProj`.
- [ ] Test `deriveFrameContext sets adaptive foreground near/far from camera distance` — build a ready state at two camera distances (mirror how the existing frameContext test builds its state + pose + projection); assert `ctx.foregroundNear`/`ctx.foregroundFar` equal `foregroundFrustum(cam.distance)` for each, AND that the two distances yield different brackets (proves it's adaptive, not a constant).
- [ ] If the existing frameContext test builds `ReadyFrameContext` via `as unknown as` casts, those keep compiling unchanged (contract note). The NEW test populates the fields for real.
- [ ] `npm test -- frameContext` → green. Commit.

## Task 3 — `resolvesToSphere` partition predicate

**Files:** `src/utils/scene/resolvesToSphere.ts` (new), `tests/utils/scene/resolvesToSphere.test.ts` (new).

The LOD partition: a star renders as a foreground SPHERE (`starRenderer`) when its apparent size crosses a threshold, otherwise as an additive backdrop POINT (`starPointRenderer`). This is the same "point when far, resolved when near" mechanism galaxies use for the point→thumbnail promotion (cite `apparentSizePx.ts` and the gate at `produceFamousLabels.ts:208-214` as the precedent — a star's apparent size drives presentation exactly like a galaxy's).

**Signature (contract — match exactly):**
```ts
export function resolvesToSphere(input: {
  apparentSizePx: number;
  thresholdPx: number;
  alwaysResolved: boolean;   // the Sun is always a sphere regardless of size
}): boolean;
```

**Behaviour:** returns `true` (sphere) when `alwaysResolved` is true OR `apparentSizePx >= thresholdPx`; `false` (backdrop point) otherwise. Pure — takes the already-computed apparent size (the caller computes it via `apparentSizePx({...})`), not a body. Keeping the predicate downstream of `apparentSizePx` lets it be unit-tested headlessly without a projection or a body record.

- [ ] Add `resolvesToSphere.ts` — single function, file named for it. Didactic docblock: WHY this is downstream of `apparentSizePx` (the projection math is already tested in `apparentSizePx.test.ts`; this is just the threshold + always-resolved override, so it tests headlessly); WHY a boolean predicate and not a table (it's a 2-way point/sphere split — a tagged-union table would be over-engineering per simplicity.md §7).
- [ ] Test `resolvesToSphere is true above the threshold` — `apparentSizePx` just above `thresholdPx`, `alwaysResolved: false` → true.
- [ ] Test `resolvesToSphere is false below the threshold` — apparent size below threshold, `alwaysResolved: false` → false.
- [ ] Test `resolvesToSphere is true at exactly the threshold` — equal → true (pin the boundary so the famous-gate `<` vs `>=` convention is matched; `produceFamousLabels.ts:214` uses `< → skip`).
- [ ] Test `resolvesToSphere is true when alwaysResolved regardless of size` — apparent size well below threshold but `alwaysResolved: true` → true (the Sun case).
- [ ] `npm test -- resolvesToSphere` → all four pass. Commit.

## Task 4 — Partition stars into backdrop-points vs foreground-spheres in `encodeForegroundPass`

**Files:** `src/services/engine/frame/encodeForegroundPass.ts` (modify), `tests/services/engine/frame/encodeForegroundPass.test.ts` (modify or add — match the existing encode-pass test harness if Plan 01/02 left one; otherwise extract a pure partition helper, see below).

`encodeForegroundPass` already (Plan 02) table-dispatches resolved bodies by `type`. THIS task gates which STARS reach the foreground sphere draw: for each `StarBody`, compute `apparentSizePx({ diameterKpc, distanceMpc, viewportHeightPx, fovYRad })` from the star's radius and the camera, then `resolvesToSphere({...})` decides:
- **true** → draw via `starRenderer` in the foreground depth pass (per-body MVP from `composeBodyMvp` — Plan 01/02 path).
- **false** → the star is a backdrop POINT via `starPointRenderer` in the ADDITIVE pass (NOT the foreground depth pass — read `starPointRenderer.ts` for the reuse seam; the contract notes it reuses the point pipeline, not the foreground depth pass).

The Sun passes `alwaysResolved: true` (it has no meaningful "far point" presentation at the scales we ship). `apparentSizePx` needs a `diameterKpc` — a star's diameter is `radiusKm * 2`, converted to kpc via `SCALE_UNITS` (`radiusKm → Mpc → kpc`, or `km → kpc` directly; keep the conversion in terms of `SCALE_UNITS` constants, no inline magic numbers). The `distanceMpc` is `|positionMpc − drawCamPos|`.

**Decomplection note (avoid a per-call braid):** the foreground/backdrop partition is a pure function of `(stars, camera, threshold)`. If folding it inline into `encodeForegroundPass` braids GPU encoding with the partition decision, **extract a pure helper** `partitionStarsByResolution` so the predicate is unit-testable without a `GPUCommandEncoder`. Prefer the extraction — the contract says "Partition foreground bodies vs backdrop by apparent size" and "Unit-test the partition predicate headlessly". The pure helper for the per-star predicate is `resolvesToSphere` (Task 3); the partition over a list is its trivial consumer. **If a clean extraction does not fall out** (e.g. the apparent-size loop is already hoisted for other reasons), keep the predicate inline and rely on Task 3's test — note which you chose in the task.

**Interfaces:**
- Consumes: `resolvesToSphere` (Task 3), `apparentSizePx` (`src/utils/math/apparentSizePx.ts`), `SCALE_UNITS` (Plan 01), `state.data.bodies.stars` (Plan 02 `BodyStore`), `ctx.drawCamPos` + `ctx.cam.fovYRad` + `ctx.canvasSize.height` (existing `ReadyFrameContext`), `starRenderer` / `starPointRenderer` handles (Plan 02), `composeBodyMvp` (Plan 01).
- Produces (if extracted): `partitionStarsByResolution(input: { stars: readonly StarBody[]; camPosMpc: Readonly<Vec3>; thresholdPx: number; viewportHeightPx: number; fovYRad: number }): { spheres: readonly StarBody[]; points: readonly StarBody[] }` in its own file `src/services/engine/frame/partitionStarsByResolution.ts`.

- [ ] Compute per-star apparent size and partition via `resolvesToSphere` (Sun → `alwaysResolved: true`). Route spheres through the foreground depth pass, points through the additive `starPointRenderer` seam.
- [ ] Define the threshold as a single named constant beside the pass (e.g. `STAR_RESOLVE_PX`), with a comment tying it to the famous-galaxy promotion precedent. Single source of truth — do not duplicate the literal.
- [ ] Guard against double-draw: a star is EITHER a sphere OR a point in a given frame, never both (the partition is exhaustive and disjoint). State this invariant in a comment; it is the root of the "smooth promotion" visual gate.
- [ ] Test `partitionStarsByResolution puts a near large star in spheres and a far small star in points` (if extracted) — two seeded stars at very different distances; assert membership. Use `SCENE_STARS`-shaped fixtures (Sun + a distant star) so the predicate is exercised against real radii.
- [ ] Test `partitionStarsByResolution always resolves the Sun` (if extracted) — the Sun (origin, `alwaysResolved`) lands in `spheres` even though at galaxy scale its apparent size is sub-pixel.
- [ ] If NOT extracted: rely on Task 3's `resolvesToSphere` tests and note the choice; the pass change itself is then a typecheck + VISUAL gate (smooth promotion).
- [ ] `npm test -- encodeForegroundPass partitionStarsByResolution` → green (whichever files exist).
- [ ] **VISUAL GATE — STOP and ask the user to confirm on the dev server:** flying toward a distant star, it grows continuously from a backdrop point into a resolved sphere with no pop and no frame where both draw. Commit after the user confirms.

## Task 5 — Earth-surface camera framing helper

**Files:** `src/utils/camera/earthSurfaceFraming.ts` (new), `tests/utils/camera/earthSurfaceFraming.test.ts` (new).

The pure core of the fly-to-Earth tween: given Earth's position + radius and a from-pose, produce the `{ target, distance }` that frames the camera just above Earth's surface. Modelled on `focusTweenDescriptor`'s shared shape — yaw/pitch carry from the live pose, only `target` and `distance` change (`focusTweenDescriptor.ts:48-53`).

**Signature (contract — match exactly):**
```ts
export function earthSurfaceFraming(earth: EarthBody): { target: Vec3; distance: number };
```

**Behaviour:** `target` is Earth's `positionMpc` (copied into a fresh array so the result never aliases the body record — same discipline as `focusTweenDescriptor.ts:26`). `distance` is a small multiple of Earth's radius in Mpc (`radiusKm * SCALE_UNITS.KM_TO_MPC`, e.g. ~2–3 Earth radii) so the descent ends with Earth filling much of the frame without clipping the foreground near plane. No engine state.

- [ ] Add `earthSurfaceFraming.ts` — single function, file named for it. Didactic docblock: WHY a few Earth-radii distance (close enough that Earth fills the frame, far enough that `foregroundFrustum(distance)`'s near plane clears the surface — ties the framing distance to the Task 1 frustum so the two can't drift into clipping); WHY only target+distance change (preserve the user's orientation, mirroring `focusTweenDescriptor`).
- [ ] Test `earthSurfaceFraming targets Earth's position` — assert `target` equals Earth's `positionMpc` element-wise AND is a distinct array (not the same reference as `earth.positionMpc`).
- [ ] Test `earthSurfaceFraming distance is a small multiple of Earth's radius in Mpc` — assert `distance` is within an expected band of `earth.radiusKm * SCALE_UNITS.KM_TO_MPC` (e.g. `2× .. 4×`), proving it's surface-scale, not galaxy-scale.
- [ ] `npm test -- earthSurfaceFraming` → both pass. Commit.

## Task 6 — Fly-to-Earth debug-key saga

**Files:** `src/state/scene/watchFlyToEarthKeySaga.ts` (new), `src/store/rootSaga.ts` (modify — append the fork), `tests/state/scene/watchFlyToEarthKeySaga.test.ts` (new — mirror `watchTourKeyboardSaga` and `watchFocusTweenSaga` test harness style).

Wire a single debug key (e.g. `'e'`) that tweens the camera to Earth-surface framing. **The seam:** mirror `watchFocusTweenSaga` (`src/state/selection/watchFocusTweenSaga.ts`) — it reads `cameraRuntime()` from `getContext`, builds a tween payload from a pure framing helper, and `put(startCameraTween(...))` (`cameraSlice.ts:90`). The keyboard channel is `createKeyboardListener('e')` (`src/services/input/createKeyboardListener.ts`); the route-keys drain loop mirrors `watchTourKeyboardSaga.ts:42-48` (`routeKeys`).

**Why a tween, not a clip:** the fly-to is a single from→to camera move with a duration — exactly `CameraTweenDescriptor`'s shape. A clip (`startClip`) is the heavier Layer-1 animation seam; a focus-style tween is the minimal seam that already exists (`startCameraTween`), so reuse it (pause-before-implementing: reuse the existing tween path, do not add a new effect method). The tween's `to` carries `yaw`/`pitch` from the live `from` pose and `target`/`distance` from `earthSurfaceFraming` — assembled into a `CameraTweenDescriptor` exactly as `focusTweenDescriptor.ts:48-53` does (`durationMs: FOCUS_TWEEN_MS`, `easing: 'easeOutCubic'`).

**Why NOT tour-bracketed:** `watchTourKeyboardSaga` brackets its keys to the tour window because it hijacks `Space`/arrows (shared browser gestures). A single debug letter `'e'` is safe to bind always-on via `takeEvery`/an always-open channel — but it MUST read Earth from `state.data.bodies.earth` (Plan 02) and bail when Earth is absent or `cameraRuntime()` is null (pre-bootstrap / post-destroy), exactly as `watchFocusTweenSaga.ts:46-47` bails on a null runtime.

**STOP-and-report check:** confirm `state.data.bodies.earth` (Plan 02 `BodyStore`) is reachable from the saga via the same path `watchFocusTweenSaga` reaches `resolveDeps`/`cameraRuntime` (a `getContext` Resource), OR via a store selector. If neither exists, STOP and report rather than inventing a parallel access path.

**Interfaces:**
- Consumes: `createKeyboardListener` (`src/services/input/createKeyboardListener.ts`), `cameraRuntime` (`SagaContext['cameraRuntime']`), `startCameraTween` (`cameraSlice.ts`), `earthSurfaceFraming` (Task 5), `FOCUS_TWEEN_MS` (`src/services/engine/camera/focusTweenDuration.ts`), `state.data.bodies.earth` (Plan 02).
- Produces: `watchFlyToEarthKeySaga()` generator forked from `rootSaga`.

- [ ] Add `watchFlyToEarthKeySaga.ts` — bind `'e'`, drain the channel, on each fire read the live runtime + Earth body, build the `CameraTweenDescriptor` (yaw/pitch from `runtime.from`, target/distance from `earthSurfaceFraming(earth)`), `put(startCameraTween(...))`. Bail (no tween) when Earth or runtime is null. Didactic docblock: WHY a tween reuses the focus-tween seam (no new effect), WHY always-on (single safe letter, not a shared gesture), WHY it bails (mirrors `watchFocusTweenSaga`).
- [ ] Append `watchFlyToEarthKeySaga()` to the `all([...])` in `rootSaga.ts:50-63` and add it to the rootSaga docblock list (`rootSaga.ts:5-17`).
- [ ] Test `watchFlyToEarthKeySaga dispatches startCameraTween framing Earth on the key` — drive the saga with a stubbed `cameraRuntime` (non-null `from` + `fovYRad`) and a store/Resource holding `SCENE_EARTH`; emit the key on the channel; assert a `startCameraTween` is put whose `to.target` equals Earth's position and `to.distance` equals `earthSurfaceFraming(earth).distance`, and `to.yaw`/`to.pitch` carry from the from-pose. Mirror `watchFocusTweenSaga.test.ts` mocking (getContext stubs, channel emit helper).
- [ ] Test `watchFlyToEarthKeySaga is a no-op when the camera runtime is null` — null runtime → no `startCameraTween` put (mirrors `watchFocusTweenSaga` bail).
- [ ] Test `watchFlyToEarthKeySaga is a no-op when Earth is absent` — Earth null → no tween.
- [ ] `npm test -- watchFlyToEarthKeySaga` → green.
- [ ] **VISUAL GATE — STOP and ask the user to confirm on the dev server:** pressing `'e'` tweens the camera smoothly from the galaxy view down to Earth-surface framing; Earth resolves round/stable/textured, no jitter/clipping/swim, backdrop intact. Commit after the user confirms.

## Task 7 — ADR: continuous floating origin for free zoom

**Files:** `docs/adrs/0008-continuous-floating-origin-for-free-zoom.md` (new).

Record the refinement of ADR-0001 (per-shell floating origin) for the interactive free-zoom case. **Next free ADR number is 0008** (existing: 0001-fade-ownership, 0002-tiered-thumbnail-textures, 0003-cluster-catalog-loading, 0004-famous-calibration, 0005-engine-data-layer, 0006-volume-field-settings, 0007-intent-centric-state). The contract's filename placeholder `00NN-continuous-floating-origin-for-free-zoom.md` resolves to **0008**.

Follow the house ADR template (`docs/adrs/0007-...md` and `0003-...md` for the field set): `# ADR 0008 — …`, `**Status:** Accepted`, `**Date:** 2026-06-29`, `**Decision-makers:**`, `**Amends (does not reverse):**` ADR-0001, then `## Context`, `## Decision`, `## Consequences` (Positive / Negative / Neutral), `## References`.

**Content (the refinement to record, from spec §3 "Relationship to ADR 0001"):**
- ADR-0001 chose **discrete per-shell** floating origins with snap-once anchors, for a _scripted tour_ over nine curated shells.
- This feature is _interactive free zoom_: the user parks anywhere on the continuum, so there is no "current shell"; discrete snap-once anchors would produce re-anchor pops at boundaries.
- The **continuous per-object** scheme KEEPS ADR-0001's core (`f64` truth on CPU, `f32` only at the GPU boundary, per-object MVP, native units) and DROPS the global-shell-unit register + shell registry the free-zoom case does not want.
- `renderOrigin` (`src/data/renderOrigin.ts`, Plan 01) is fixed at the Sun for this feature; it is the named extension point where a future moving origin plugs in (YAGNI: no threshold-rebasing built).
- ADR-0001 was "proposed, awaiting review", so this is a legitimate refinement, not a reversal.

**Citation note:** ADR-0001's source doc (`docs/superpowers/plans/2026-05-08-cosmic-zoom-powers-of-ten/decisions/0001-floating-origin.md`) lives on the `cosmic-zoom-plan` worktree, **not on `main`**. Reference it by that path (the spec already does, §References) and note in the ADR that the source lives on the cosmic-zoom-plan branch. If a reviewer needs it on `main`, STOP and report — do not copy it in.

- [ ] Write the ADR per the template + content above. Cite the spec (`docs/superpowers/specs/2026-06-29-zoom-to-earth-true-scale-design.md` §3) and ADR-0005 (units/data-layer) in References.
- [ ] (Optional) use the `adr` skill to scaffold the numbered file if it picks 0008 automatically; otherwise write directly. **Verify the chosen number is 0008** before finalising (re-list `docs/adrs/`).
- [ ] This is a docs-only task — typecheck/test gates do not apply. Commit. (Ask the user, per house convention, whether the ADR rides this plan's PR or a separate docs-only PR — default: rides this plan's PR.)

## Task 8 — Entanglement-radar pass + full gate

**Files:** none new — a review pass over the whole zoom-to-Earth feature diff (Plans 01+02+03) and the final gate.

Run the `entanglement-radar` skill over the full feature diff per `docs/superpowers/conventions/simplicity.md`. The radar's design-time trigger applies: any place this plan (or 01/02) handles an "asymmetry" / "special-case" / "must-remember-to" is a STOP-and-classify signal (essential vs accidental complecting), not a note to write more carefully.

**Known candidates to classify (name reader + writer of each state; mismatch = mirror to un-braid):**
- The foreground frustum (adaptive) vs the backdrop frustum (static) — is the split essential (two genuinely different precision regimes) or accidental (could one frustum serve both)? Expected: **essential** (spec §4 — the depthless additive backdrop and the depth-tested foreground are different passes by construction).
- The star point↔sphere partition disjointness (a star is point XOR sphere) — is the "never both in one frame" invariant enforced structurally (one partition) or by remembering-to (two independent gates)? Must be the former.
- `apparentSizePx` reused for both galaxy labels (`produceFamousLabels`) and star resolution — confirm it's one shared util, not a forked copy.
- `earthSurfaceFraming` distance ↔ `foregroundFrustum` near plane — is the "framing distance clears the near plane" relationship encoded, or a latent drift waiting to clip? (Comment-level coupling acceptable if both cite each other; a shared constant if it tightens cleanly.)

- [ ] Run `entanglement-radar` over the feature diff; for each finding classify essential vs accidental and record the verdict (in the PR body or a short notes block). If an accidental braid surfaces, either un-braid it (small) or capture it in `docs/BACKLOG.md` (if it's a larger follow-up) — do not silently ship it.
- [ ] Run `npm run typecheck` (both src + tools tsconfigs) → clean.
- [ ] Run `npm test` (full suite) → green.
- [ ] Note in the PR body the THREE visual properties confirmed by the user across Tasks 4/6 (smooth promotion, fly-to-Earth motion, believable LOD) — these are NOT covered by automated tests.
- [ ] Commit.

---

## Self-review (done before finalising this plan)

### Spec-coverage map (each Phase 4/5 + §4-LOD/§7/§12 bullet → task)

| Spec bullet | Task |
| --- | --- |
| §10 Phase 4 — adaptive foreground near/far | T1 (`foregroundFrustum`) + T2 (wire into `frameContext`) |
| §10 Phase 4 — apparent-size point↔sphere promotion for stars | T3 (`resolvesToSphere`) + T4 (partition in `encodeForegroundPass`) |
| §10 Phase 4 — foreground/backdrop partition by apparent size | T4 (`partitionStarsByResolution`) |
| §10 Phase 5 — fly-to-Earth affordance (debug key) | T5 (`earthSurfaceFraming`) + T6 (`watchFlyToEarthKeySaga`) |
| §10 Phase 5 — tests | T1/T3/T5 unit tests; T6 saga tests; T8 full gate |
| §10 Phase 5 — docs (ADR recording ADR-0001 refinement) | T7 (ADR 0008) |
| §10 Phase 5 — entanglement-radar pass | T8 |
| §4 LOD — star point (far) ↔ emissive sphere (near); Sun always resolved | T3 (`alwaysResolved`) + T4 |
| §4 LOD — planets/Earth always foreground spheres | Plan 02 (no Plan-03 gating needed; noted, not re-tasked) |
| §7 camera — adaptive foreground near/far from cam-distance-to-focus | T1 + T2 |
| §7 camera — lower `MIN_DISTANCE_MPC` | **Plan 01** — explicitly NOT touched here (T2/T4 notes, Global Constraints) |
| §7 camera — fly-to-Earth debug key | T6 |
| §7 camera — extend the single viewProj chokepoint | T2 (foreground frustum into `deriveFrameContext`; backdrop `vp` untouched) |
| §12 OQ — foreground depth format (lean depth32float) | Plan 01 fixed `depth32float` (contract `foregroundOffscreen.ts`); T1's near>0 guard is what that precision needs — noted, not re-decided |
| §12 OQ — composite into HDR (one tonemap) vs over swapchain | Plan 01 (foreground inside HDR/tonemap); not re-opened here |
| §12 OQ — camera-intent-slice landed? | Verified: `cameraSlice.ts` + `startCameraTween` exist on `main`; T6 leans only on the viewProj chokepoint + tween seam, which exist either way |

### Placeholder scan
None. Every task has concrete files, signatures, and test names.

### Type-name consistency vs the contract
`foregroundFrustum`, `foregroundNear`/`foregroundFar` (ReadyFrameContext), `resolvesToSphere`, `apparentSizePx`, `StarBody`, `StarRenderer`/`StarPointRenderer`, `BodyStore`/`state.data.bodies`, `EarthBody`/`SCENE_EARTH`, `composeBodyMvp`, `SCALE_UNITS`, `RENDER_ORIGIN_MPC`, `CameraTweenDescriptor`/`startCameraTween`, `MIN_DISTANCE_MPC` — all spelled identically to the contract and verified against current code.

### Contract conflicts / seams found
- **Keyboard/tween seam (real):** `watchFocusTweenSaga` (`src/state/selection/watchFocusTweenSaga.ts`) is the canonical "read `cameraRuntime` from getContext → build a tween via a pure framing helper → `put(startCameraTween)`" pattern; `watchTourKeyboardSaga` (`src/state/tour/watchTourKeyboardSaga.ts`) + `createKeyboardListener` (`src/services/input/createKeyboardListener.ts`) is the canonical keyboard-channel pattern. The fly-to-Earth key (T6) composes both. Sagas are forked from `src/store/rootSaga.ts`. The tween descriptor is `CameraTweenDescriptor` (`src/@types/camera/CameraTweenDescriptor.d.ts`: `from`/`to`/`durationMs`/`easing: 'easeOutCubic'`), built exactly as `focusTweenDescriptor.ts:48-53`. The contract said "find the real seam" — this is it; the plan does NOT invent a new effect method (reuses `startCameraTween`).
- **Next ADR number:** **0008** (`docs/adrs/` ends at 0007; the contract's `00NN` resolves to 0008). T7 re-verifies before finalising.
- **ADR-0001 source path is off-`main`:** the cosmic-zoom-plan dir (`docs/superpowers/plans/2026-05-08-cosmic-zoom-powers-of-ten/`) does NOT exist on `main` (it's on the `cosmic-zoom-plan` worktree per project memory). The ADR (T7) references it by path and notes the branch; it does not depend on the file being present.
- **`MIN_DISTANCE_MPC` ownership:** Plan 01 lowers it; Plan 03 must NOT touch it. Stated in Global Constraints + T2/T4 notes — no conflict, just a guardrail against a plausible mis-step.
- **Plan 01 heuristic vs Plan 03 adaptive:** Plan 01 populates `foregroundNear`/`foregroundFar` with a simple heuristic; T2 REPLACES that derivation (delete the heuristic locals, do not leave both). Called out explicitly so the executor removes rather than duplicates.
