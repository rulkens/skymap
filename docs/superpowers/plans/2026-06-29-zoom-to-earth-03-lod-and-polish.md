# Zoom to Earth — Plan 03: LOD & polish

**Spec:** `docs/superpowers/specs/2026-06-29-zoom-to-earth-true-scale-design.md` — scope is **§10 Phases 4 (LOD + depth) and 5 (Polish)**, plus §4's LOD section, §7 camera, §12 open questions.
**Re-grounded 2026-07-10** onto the unified layer/slab/program renderer (renderer-unification 04 fold; PR #386 merged as `504b15dc`); supersedes the pre-fold seams the locked contract names. The bespoke foreground wiring the original plan consumed — `encodeForegroundPass`, `frameContext`-owned `foregroundNear`/`foregroundFar`/`foregroundVp`/`renderOrigin`, the four `ReadyFrameContext` foreground fields — was all deleted in that fold. The foreground is now DATA: a `foreground:0` render target, a `NEAR0` slab row (`slabs.ts`), and per-type content layers driven by the FRAME program. Every `path:line` below was re-verified against `main` on the re-grounding date; the original locked-contract citations are stale and are not authoritative where they conflict with the code cited here.
**Cross-plan contract:** Plans 01/02/03 shared a locked interface contract. Plan 01 shipped and was folded; where a symbol it introduced still exists, this plan CONSUMES it under the same name, but the folded surface (below) is the source of truth over the pre-fold contract. If current code makes a cited symbol impossible, the task says **STOP and report** rather than silently diverging.
**Plan style (OVERRIDES upstream writing-plans):** `docs/superpowers/conventions/plan-style.md` — **contract code yes, implementation code no.** Cite `path:line`, never paste full function bodies. Test names + assertions ARE the acceptance criteria.

## Goal

Make the zoom-to-Earth foreground pass scale-correct and legible at any zoom, and add the developer affordance to reach Earth:

1. **Adaptive foreground frustum** — replace the folded-in `NEAR0` slab's fixed near/far ratios (`slabs.ts`'s `NEAR0_NEAR_RATIO`/`NEAR0_FAR_RATIO`) with a pure helper that sizes the foreground frustum from camera-distance-to-focus, so depth precision stays good from galaxy scale down to Earth's surface. (`slabs.ts` already carries the forward-reference comment naming this plan as the replacement.)
2. **Apparent-size point↔sphere promotion for stars** — a star renders as an additive backdrop point (`starPointsLayer`, drawn into the HDR additive accumulation) when small, and promotes to a foreground emissive sphere (`starSpheresLayer`, into `foreground:0`) when its apparent size crosses a threshold. The Sun is always resolved. The same `apparentSizePx` mechanism galaxies already use for the point→thumbnail promotion.
3. **Fly-to-Earth debug key** — a keyboard handler that tweens the camera to Earth-surface framing. Real UI control stays deferred.
4. **ADR** recording the ADR-0001 refinement (continuous per-object floating origin vs discrete per-shell).
5. **Entanglement-radar pass** over the whole feature diff + **full gate**.

## What this plan CONSUMES (treat as existing)

From **`main`** (the renderer-unification 04 fold + the shape Plan 02 lands on it):

- The `NEAR0`/`COSMO` slab table and its derivation/lookup: `deriveSlabs` / `slabViewOf` (`src/services/engine/frame/slabs.ts`). `NEAR0`'s `vp` is the origin-relative f64 `computeForegroundViewProj` product; its `nearMpc`/`farMpc` are `cam.distance · NEAR0_NEAR_RATIO` (1e-4) / `cam.distance · NEAR0_FAR_RATIO` (100) — the two ratios **this plan replaces** (Task 2).
- The `foreground:0` render target (rgba16float + depth32float, scale 1) and the flat `CONTENT_LAYERS` registry (`src/services/engine/frame/passes/index.ts`) with per-layer files `passes/<name>Layer.ts`. A layer's `draw(pass, view: SlabView, ctx, state)` reads the f32-narrowed `view.vp`; the rare f64-compose consumer reads `view.slab.vp`. Exemplars: `debugSpheresLayer.ts` (NEAR0 / `foreground:0` / opaque, `composeBodyMvp(view.slab.vp, …)`), `foregroundLabelsLayer.ts` (NEAR0 / swap / over, gate `SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC = 1e-3`).
- `composeBodyMvp` (`src/utils/camera/composeBodyMvp.ts`), `computeForegroundViewProj`, `narrowMat4`, `RENDER_ORIGIN_MPC` (imported directly from `src/data/renderOrigin.ts` — a constant, NOT per-frame ctx state), `SCALE_UNITS` (`src/data/scaleUnits.ts`).
- **`MIN_DISTANCE_MPC` is `?deepZoom`-gated** (`src/utils/camera/clampDistance.ts:50-52`): `hasUrlGate('deepZoom') ? 1e-17 : 0.05`. **Plan 03 does NOT touch this gate** — un-gating is a release decision, deferred until real content fills the descent. Every VISUAL gate in this plan therefore needs `?deepZoom` in the URL to reach the foreground bodies. Stated again in Task 4's notes.

From **Plan 02** (`2026-06-29-zoom-to-earth-02-earth-and-anchors.md`, re-grounded onto the fold in parallel with this plan) — bodies arrive as per-type content layers, NOT a dispatch table inside a bespoke pass:

- Body content-layer rows: `earthLayer`, `planetsLayer`, `starSpheresLayer` (all NEAR0 / `foreground:0` / opaque) and `starPointsLayer` (NEAR0 / target `'hdr'` / additive — distant stars as points in the additive accumulation; COSMO's 0.01 Mpc near plane would clip parsec-scale anchors), plus a new `frameProgram` step `{ kind: 'render', target: 'hdr', slab: NEAR0 }`. Plan 02 keeps the caption path (`foregroundLabelRenderer` / `foregroundLabelsLayer`) repointed at the real bodies.
- `StarRenderer` / `StarPointRenderer` (`src/@types/rendering/StarRenderer.d.ts` + `StarPointRenderer.d.ts`), `starRenderer.ts` / `starPointRenderer.ts` factories, and their `EngineGpuHandles` slots (the type/factory NAMES survive the fold; the renderers are now driven by the two layers above, not a hand-encoded pass).
- `StarBody` (`src/@types/scene/StarBody.d.ts`) with `absMag`, `color`, `radiusKm`, `positionMpc`.
- `BodyStore` (`src/services/engine/data/createBodyStore.ts`) wired as `state.data.bodies`, seeded from `sceneBodies.ts` (Sun at origin, Proxima at ~1.301 pc). Source codes: **Star = 21, Planet = 22, Earth = 23** (DESI took 18/19/20).

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
- **VISUAL gates (NOT covered by automated tests — STOP and ask the user to confirm on the dev server; ALL require `?deepZoom` in the URL — without it `clampDistance` floors the wheel at 0.05 Mpc and the foreground bodies never grow past sub-pixel):**
  - **Smooth point↔sphere promotion** — a star crossing the threshold as you fly toward it must fade/grow continuously, no pop, no double-draw (point AND sphere in the same frame).
  - **Fly-to-Earth motion** — the debug key tweens the camera smoothly down to Earth-surface framing; Earth resolves round, stable, no jitter/clipping/swim; backdrop intact.
  - **Believable LOD** — anchors (Sun, Moon, Jupiter, Proxima) sit at believable relative sizes through the descent; the foreground frustum keeps Earth crisp without near-plane clipping or z-fighting at any zoom.

---

## Task 1 — `foregroundFrustum` pure helper

> **Executed early on the plan-02 branch (PR #425, 2026-07-11)** as a defect fix: the fixed NEAR0 ratios clipped the plan-02 orbit-ring quads (far = cam.distance·100 ≈ 0.02 AU at Earth focus vs the Earth ring's 2 AU span → boundary sweep flicker). One amendment to the contract below: `far = max(camDistance·100, FAR_MIN_MPC = 3e-11)` — a scene floor enclosing the largest seeded orbit — so far is monotone non-decreasing rather than strictly proportional. `MIN_NEAR_MPC = 1e-19`. Tests adjusted accordingly (4 tests, incl. the far-floor pin).

**Files:** `src/utils/camera/foregroundFrustum.ts` (new), `tests/utils/camera/foregroundFrustum.test.ts` (new).

**Signature (contract — match exactly):**

```ts
export function foregroundFrustum(camDistanceMpc: number): { near: number; far: number };
```

**Behaviour:** derive a foreground near/far bracket scaled around the camera-distance-to-focus so the depth32float foreground buffer stays precise at any scale. `near` scales DOWN with distance (a fraction of `camDistanceMpc`, floored above 0 so it never collapses to or below zero — the near plane is what z-precision is most sensitive to), `far` scales UP with distance (a multiple of `camDistanceMpc`) to enclose the resolved near bodies. Both strictly positive, `near < far`. Pure — no engine state, no clock.

- [x] Add `foregroundFrustum.ts` — single function, file named for it. Didactic docblock: WHY the foreground frustum is adaptive (a fixed near/far cannot stay precise across ~17 OOM of zoom; the backdrop is the separate `COSMO` slab row in `slabs.ts`, which keeps its own fixed wide near/far — 10 kpc to 50 Gpc — because the cosmological scene's depth doesn't change as the user zooms, only the near-field `NEAR0` row's does — see spec §4/§7), and WHY near must stay strictly above 0 (the depth32float buffer's precision is dominated by the near plane; `near=0` is a degenerate perspective matrix).
- [x] Test `foregroundFrustum returns near < far` — for a representative distance (e.g. galaxy scale `0.43` and Earth-surface scale ~`1e-16`), assert `near < far`.
- [x] Test `foregroundFrustum near stays strictly positive at tiny distance` — at an Earth-surface `camDistanceMpc` (~`1e-16`), assert `near > 0` (guards the degenerate-matrix trap).
- [x] Test `foregroundFrustum both bounds scale with distance` — assert near and far at a 10× larger distance are each strictly larger than at the base distance (monotone in `camDistanceMpc`).
- [x] `npm test -- foregroundFrustum` → all three pass. Commit.

## Task 2 — Wire adaptive near/far into `deriveSlabs`, replacing the fixed NEAR0 ratios

> **Executed early on the plan-02 branch (PR #425, 2026-07-11)** together with Task 1 — see the note there. Ratios + forward-reference comment deleted; `slabs.test.ts` repointed exactly as specified below.

**Files:** `src/services/engine/frame/slabs.ts` (modify), `tests/services/engine/frame/slabs.test.ts` (modify).

`slabs.ts` currently derives the `NEAR0` row's near/far as `cam.distance * NEAR0_NEAR_RATIO` (1e-4) and `cam.distance * NEAR0_FAR_RATIO` (100) — two module-local constants (`slabs.ts:44-45`) carrying a forward-reference comment (`slabs.ts:42-43`) that says _this plan_ replaces them with an adaptive `foregroundFrustum`. Do exactly that: `deriveSlabs` (`slabs.ts:76-88`) computes `nearMpc`/`farMpc` at `slabs.ts:77-78` and feeds them to `computeForegroundViewProj`. Swap those two lines for `const { near: nearMpc, far: farMpc } = foregroundFrustum(cam.distance);` and **delete** `NEAR0_NEAR_RATIO`, `NEAR0_FAR_RATIO`, and their forward-reference comment — this plan IS the referenced future, so the marker retires with them.

`frameContext.ts` is NOT touched by this task — `ReadyFrameContext` has no foreground fields any more; the near-field near/far live entirely in the slab row.

**Interfaces:**

- Consumes: `foregroundFrustum(camDistanceMpc)` (Task 1); `cam.distance` from the `OrbitCamera` argument.
- Produces: the `NEAR0` slab row's `nearMpc`/`farMpc`/`vp` derived from `foregroundFrustum(cam.distance)` (replaces the two constant ratios — find and delete them, do not leave both).

- [x] Replace the `nearMpc`/`farMpc` derivation in `deriveSlabs` with `const { near: nearMpc, far: farMpc } = foregroundFrustum(cam.distance);`; delete `NEAR0_NEAR_RATIO`/`NEAR0_FAR_RATIO` and their forward-reference comment. Keep the `computeForegroundViewProj` call and the `COSMO` row exactly as they are (the backdrop keeps its own fixed near/far — that split is essential, see Task 8).
- [x] Refresh the `NEAR0` block comment: the near-field near/far are now adaptive via `foregroundFrustum` (Task 1), unlike the `COSMO` row's fixed `COSMO_NEAR_MPC`/`COSMO_FAR_MPC`.
- [x] Test (update `slabs.test.ts`): the existing `the near-field row uses an adaptive near/far derived from cam.distance` (`slabs.test.ts:63-68`) and `slabViewOf(ctx, NEAR0) exposes the adaptive near/far slab row` (`slabs.test.ts:138-144`) currently assert against the literal `distance * 1e-4` / `distance * 100`. Repoint both to assert `slab.nearMpc`/`farMpc` equal `foregroundFrustum(cam.distance).near`/`.far`, at two distinct distances (adaptive, not a fixed ratio the test hard-codes).
- [x] Test: the NEAR0-vp derivation test (`the near row's vp is the origin-relative computeForegroundViewProj product`, `slabs.test.ts:70-90`) stays structurally the same (it still pins the util as the derivation) — but its `expected` call must feed `foregroundFrustum(distance).near`/`.far` as `near`/`far` so it tracks the new source of truth rather than the deleted literals.
- [x] `npm test -- slabs` → green. Commit.

## Task 3 — `resolvesToSphere` partition predicate

**Files:** `src/utils/scene/resolvesToSphere.ts` (new), `tests/utils/scene/resolvesToSphere.test.ts` (new).

The LOD partition: a star renders as a foreground SPHERE (`starSpheresLayer`) when its apparent size crosses a threshold, otherwise as an additive backdrop POINT (`starPointsLayer`). This is the same "point when far, resolved when near" mechanism galaxies use for the point→thumbnail promotion (cite `apparentSizePx.ts` and the gate at `produceFamousLabels.ts:215-221` as the precedent — a star's apparent size drives presentation exactly like a galaxy's).

**Signature (contract — match exactly):**

```ts
export function resolvesToSphere(input: {
  apparentSizePx: number;
  thresholdPx: number;
  alwaysResolved: boolean; // the Sun is always a sphere regardless of size
}): boolean;
```

**Behaviour:** returns `true` (sphere) when `alwaysResolved` is true OR `apparentSizePx >= thresholdPx`; `false` (backdrop point) otherwise. Pure — takes the already-computed apparent size (the caller computes it via `apparentSizePx({...})`), not a body. Keeping the predicate downstream of `apparentSizePx` lets it be unit-tested headlessly without a projection or a body record.

- [ ] Add `resolvesToSphere.ts` — single function, file named for it. Didactic docblock: WHY this is downstream of `apparentSizePx` (the projection math is already tested in `apparentSizePx.test.ts`; this is just the threshold + always-resolved override, so it tests headlessly); WHY a boolean predicate and not a table (it's a 2-way point/sphere split — a tagged-union table would be over-engineering per simplicity.md §7).
- [ ] Test `resolvesToSphere is true above the threshold` — `apparentSizePx` just above `thresholdPx`, `alwaysResolved: false` → true.
- [ ] Test `resolvesToSphere is false below the threshold` — apparent size below threshold, `alwaysResolved: false` → false.
- [ ] Test `resolvesToSphere is true at exactly the threshold` — equal → true (pin the boundary so the famous-gate `<` vs `>=` convention is matched; `produceFamousLabels.ts:221` uses `sizePx < threshold → continue`).
- [ ] Test `resolvesToSphere is true when alwaysResolved regardless of size` — apparent size well below threshold but `alwaysResolved: true` → true (the Sun case).
- [ ] `npm test -- resolvesToSphere` → all four pass. Commit.

## Task 4 — Partition stars: which `starSpheresLayer` draws vs which `starPointsLayer` draws

**Files:** `src/services/engine/frame/partitionStarsByResolution.ts` (new — the preferred extraction), `tests/services/engine/frame/partitionStarsByResolution.test.ts` (new); `src/services/engine/frame/passes/starSpheresLayer.ts` + `src/services/engine/frame/passes/starPointsLayer.ts` (modify — the two Plan 02 rows consume the partition), `tests/services/engine/frame/passes/starSpheresLayer.test.ts` + `starPointsLayer.test.ts` (extend — mirror `tests/services/engine/frame/passes/debugSpheresLayer.test.ts` and the `passes.test.ts` idioms).

Plan 02 delivers stars as TWO content-layer rows: `starSpheresLayer` (NEAR0 / `foreground:0` / opaque) and `starPointsLayer` (NEAR0 / `hdr` / additive). This task supplies the ONE shared predicate that re-homes each `StarBody` to exactly one of those layers: for each star, compute `apparentSizePx({ diameterKpc, distanceMpc, viewportHeightPx, fovYRad })` from the star's radius and the camera, then `resolvesToSphere({...})` (Task 3) decides which layer draws it:

- **true** → `starSpheresLayer` draws it (per-body MVP from `composeBodyMvp(view.slab.vp, …)` — the f64-compose seam `debugSpheresLayer` documents).
- **false** → `starPointsLayer` draws it as an additive backdrop point in the HDR accumulation (COSMO's near plane would clip parsec-scale anchors, so the points ride the NEAR0 slab into `hdr`, not COSMO).

The two layers consume the SAME predicate on OPPOSITE branches, so a star is a sphere XOR a point by construction — the disjointness is structural, not a "remember to keep two gates in sync" invariant. Neither layer touches a `GPUCommandEncoder` to decide membership; each filters via the pure helper.

The Sun passes `alwaysResolved: true` (it has no meaningful "far point" presentation at the scales we ship). `apparentSizePx` needs a `diameterKpc` — a star's diameter is `radiusKm * 2`, converted to kpc via `SCALE_UNITS` (`radiusKm → Mpc → kpc`, or `km → kpc` directly; keep the conversion in terms of `SCALE_UNITS` constants, no inline magic numbers). The `distanceMpc` is `|positionMpc − view.camPos|` (the slab view's origin-relative camera position).

**Decomplection note (structural disjointness):** the partition is a pure function of `(stars, camPos, threshold, viewport, fov)`. **Extract the pure helper** `partitionStarsByResolution` so each layer's `draw`/`enabled` calls it and the split is unit-testable without a device — this is the preferred shape (the per-star predicate is `resolvesToSphere` from Task 3; the partition over a list is its trivial consumer). Extracting it once, consumed by both rows, is what makes "point XOR sphere" a structural fact: there is one branch point, not two. **If a clean extraction does not fall out**, keep `resolvesToSphere` inline in each layer against the shared threshold constant and rely on Task 3's test — note which you chose. Either way the threshold is ONE named constant, imported by both layers, never duplicated.

**Interfaces:**

- Consumes: `resolvesToSphere` (Task 3), `apparentSizePx` (`src/utils/math/apparentSizePx.ts`), `SCALE_UNITS` (`src/data/scaleUnits.ts`), `state.data.bodies.stars` (Plan 02 `BodyStore`), `view.camPos` + `ctx.cam.fovYRad` + `view.viewportPx` (the `SlabView` a layer's `draw` receives — the layers already read these, see `debugSpheresLayer.ts` / `foregroundLabelsLayer.ts`), `starRenderer` / `starPointRenderer` handles (Plan 02), `composeBodyMvp` (`src/utils/camera/composeBodyMvp.ts`).
- Produces (the preferred extraction): `partitionStarsByResolution(input: { stars: readonly StarBody[]; camPosMpc: Readonly<Vec3>; thresholdPx: number; viewportHeightPx: number; fovYRad: number }): { spheres: readonly StarBody[]; points: readonly StarBody[] }` in its own file `src/services/engine/frame/partitionStarsByResolution.ts`.

- [ ] Add `partitionStarsByResolution.ts` — map each star through `apparentSizePx` + `resolvesToSphere` (Sun → `alwaysResolved: true`), returning `{ spheres, points }`. Both `starSpheresLayer.draw` and `starPointsLayer.draw` call it and draw only their branch.
- [ ] Define the threshold as a single named constant (e.g. `STAR_RESOLVE_PX`) in one module, imported by both layers (or by the partition helper), with a comment tying it to the famous-galaxy promotion precedent. Single source of truth — do not duplicate the literal.
- [ ] Guard against double-draw: a star is EITHER a sphere OR a point in a given frame, never both — enforced structurally by the two layers consuming ONE predicate on opposite branches (disjoint + exhaustive by construction). State this invariant in the partition helper's docblock; it is the root of the "smooth promotion" visual gate.
- [ ] Test `partitionStarsByResolution puts a near large star in spheres and a far small star in points` — two seeded stars at very different distances; assert membership. Use `SCENE_STARS`-shaped fixtures (Sun + a distant star) so the predicate is exercised against real radii.
- [ ] Test `partitionStarsByResolution always resolves the Sun` — the Sun (origin, `alwaysResolved`) lands in `spheres` even though at galaxy scale its apparent size is sub-pixel.
- [ ] Test (layer tests, extend): `starSpheresLayer draws only the resolved stars` and `starPointsLayer draws only the point stars` — a mixed fixture and a spy renderer, mirroring `debugSpheresLayer.test.ts`'s draw-spy idiom; assert the two draws' star sets are disjoint and cover the input (the structural XOR).
- [ ] `npm test -- partitionStarsByResolution starSpheresLayer starPointsLayer` → green (whichever files exist).
- [ ] **VISUAL GATE (needs `?deepZoom`) — STOP and ask the user to confirm on the dev server:** flying toward a distant star, it grows continuously from a backdrop point into a resolved sphere with no pop and no frame where both draw. Commit after the user confirms.

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
- [ ] Append `watchFlyToEarthKeySaga()` to the `all([...])` in `rootSaga.ts:54-69` and add it to the rootSaga docblock list (`rootSaga.ts:9-19`). (Re-verify these line ranges before editing — the fork array and its docblock list drift as watchers are added.)
- [ ] Test `watchFlyToEarthKeySaga dispatches startCameraTween framing Earth on the key` — drive the saga with a stubbed `cameraRuntime` (non-null `from` + `fovYRad`) and a store/Resource holding `SCENE_EARTH`; emit the key on the channel; assert a `startCameraTween` is put whose `to.target` equals Earth's position and `to.distance` equals `earthSurfaceFraming(earth).distance`, and `to.yaw`/`to.pitch` carry from the from-pose. Mirror `watchFocusTweenSaga.test.ts` mocking (getContext stubs, channel emit helper).
- [ ] Test `watchFlyToEarthKeySaga is a no-op when the camera runtime is null` — null runtime → no `startCameraTween` put (mirrors `watchFocusTweenSaga` bail).
- [ ] Test `watchFlyToEarthKeySaga is a no-op when Earth is absent` — Earth null → no tween.
- [ ] `npm test -- watchFlyToEarthKeySaga` → green.
- [ ] **VISUAL GATE (needs `?deepZoom` — the tween's end distance sits below the releasable 0.05 Mpc floor, so without the gate `clampDistance` arrests the descent) — STOP and ask the user to confirm on the dev server:** pressing `'e'` tweens the camera smoothly from the galaxy view down to Earth-surface framing; Earth resolves round/stable/textured, no jitter/clipping/swim, backdrop intact. Commit after the user confirms.

## Task 7 — ADR: continuous floating origin for free zoom

**Files:** `docs/adrs/0009-continuous-floating-origin-for-free-zoom.md` (new).

Record the refinement of ADR-0001 (per-shell floating origin) for the interactive free-zoom case. **Next free ADR number is 0009** (existing: 0001-fade-ownership, 0002-tiered-thumbnail-textures, 0003-cluster-catalog-loading, 0004-famous-calibration, 0005-engine-data-layer, 0006-volume-field-settings, 0007-intent-centric-state, 0008-effects-layer-vehicle). The contract's filename placeholder `00NN-continuous-floating-origin-for-free-zoom.md` resolves to **0009**.

Follow the house ADR template (`docs/adrs/0007-...md` and `0003-...md` for the field set): `# ADR 0009 — …`, `**Status:** Accepted`, `**Date:** 2026-06-29`, `**Decision-makers:**`, `**Amends (does not reverse):**` ADR-0001, then `## Context`, `## Decision`, `## Consequences` (Positive / Negative / Neutral), `## References`.

**Content (the refinement to record, from spec §3 "Relationship to ADR 0001"):**

- ADR-0001 chose **discrete per-shell** floating origins with snap-once anchors, for a _scripted tour_ over nine curated shells.
- This feature is _interactive free zoom_: the user parks anywhere on the continuum, so there is no "current shell"; discrete snap-once anchors would produce re-anchor pops at boundaries.
- The **continuous per-object** scheme KEEPS ADR-0001's core (`f64` truth on CPU, `f32` only at the GPU boundary, per-object MVP, native units) and DROPS the global-shell-unit register + shell registry the free-zoom case does not want.
- `RENDER_ORIGIN_MPC` (`src/data/renderOrigin.ts`, on `main` since the fold; imported directly as a constant, not per-frame ctx state) is fixed at the Sun for this feature; it is the named extension point where a future moving origin plugs in (YAGNI: no threshold-rebasing built). The `NEAR0` slab's `originRelative: true` / `precision: 'f64'` fields are already live against it.
- ADR-0001 was "proposed, awaiting review", so this is a legitimate refinement, not a reversal.

**Citation note:** ADR-0001's source doc (`docs/superpowers/plans/2026-05-08-cosmic-zoom-powers-of-ten/decisions/0001-floating-origin.md`) lives on the `cosmic-zoom-plan` worktree, **not on `main`**. Reference it by that path (the spec already does, §References) and note in the ADR that the source lives on the cosmic-zoom-plan branch. If a reviewer needs it on `main`, STOP and report — do not copy it in.

- [ ] Write the ADR per the template + content above. Cite the spec (`docs/superpowers/specs/2026-06-29-zoom-to-earth-true-scale-design.md` §3) and ADR-0005 (units/data-layer) in References.
- [ ] (Optional) use the `adr` skill to scaffold the numbered file if it picks 0009 automatically; otherwise write directly. **Verify the chosen number is 0009** before finalising (re-list `docs/adrs/` — it currently ends at 0008-effects-layer-vehicle).
- [ ] This is a docs-only task — typecheck/test gates do not apply. Commit. (Ask the user, per house convention, whether the ADR rides this plan's PR or a separate docs-only PR — default: rides this plan's PR.)

## Task 8 — Entanglement-radar pass + full gate

**Files:** none new — a review pass over the whole zoom-to-Earth feature diff (Plans 01+02+03) and the final gate.

Run the `entanglement-radar` skill over the full feature diff per `docs/superpowers/conventions/simplicity.md`. The radar's design-time trigger applies: any place this plan (or 01/02) handles an "asymmetry" / "special-case" / "must-remember-to" is a STOP-and-classify signal (essential vs accidental complecting), not a note to write more carefully.

**Known candidates to classify (name reader + writer of each state; mismatch = mirror to un-braid):**

- The `NEAR0` slab row (adaptive near/far via `foregroundFrustum`) vs the `COSMO` slab row (fixed near/far) in `slabs.ts` — is the split essential (two genuinely different precision regimes) or accidental (could one row serve both)? Expected: **essential** (spec §4 — the two slabs are separate rows by construction; the cosmological scene's depth doesn't move as the user zooms, only the near-field's does).
- The star point↔sphere partition disjointness (a star is point XOR sphere) — is the "never both in one frame" invariant enforced structurally (`starSpheresLayer` and `starPointsLayer` consuming ONE shared predicate on opposite branches) or by remembering-to (two independent gates that could drift)? Must be the former — confirm both layers call the same `partitionStarsByResolution`/`resolvesToSphere`, not two hand-copied thresholds.
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

| Spec bullet                                                             | Task                                                                                                                                                             |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §10 Phase 4 — adaptive foreground near/far                              | T1 (`foregroundFrustum`) + T2 (wire into `deriveSlabs`, `slabs.ts`)                                                                                              |
| §10 Phase 4 — apparent-size point↔sphere promotion for stars            | T3 (`resolvesToSphere`) + T4 (partition consumed by `starSpheresLayer`/`starPointsLayer`)                                                                        |
| §10 Phase 4 — foreground/backdrop partition by apparent size            | T4 (`partitionStarsByResolution`)                                                                                                                                |
| §10 Phase 5 — fly-to-Earth affordance (debug key)                       | T5 (`earthSurfaceFraming`) + T6 (`watchFlyToEarthKeySaga`)                                                                                                       |
| §10 Phase 5 — tests                                                     | T1/T3/T5 unit tests; T4 partition + layer tests; T6 saga tests; T8 full gate                                                                                     |
| §10 Phase 5 — docs (ADR recording ADR-0001 refinement)                  | T7 (ADR 0009)                                                                                                                                                    |
| §10 Phase 5 — entanglement-radar pass                                   | T8                                                                                                                                                               |
| §4 LOD — star point (far) ↔ emissive sphere (near); Sun always resolved | T3 (`alwaysResolved`) + T4                                                                                                                                       |
| §4 LOD — planets/Earth always foreground spheres                        | Plan 02 (`earthLayer`/`planetsLayer` rows, always `foreground:0`; no Plan-03 gating needed — noted, not re-tasked)                                               |
| §7 camera — adaptive foreground near/far from cam-distance-to-focus     | T1 + T2                                                                                                                                                          |
| §7 camera — lower `MIN_DISTANCE_MPC`                                    | Already on `main` as the `?deepZoom` gate (`clampDistance.ts:50-52`) — explicitly NOT touched here (Consumes note, T4 notes, Global Constraints)                 |
| §7 camera — fly-to-Earth debug key                                      | T6                                                                                                                                                               |
| §7 camera — the near-field slab derivation chokepoint                   | T2 (foreground frustum into `deriveSlabs`; the `COSMO` row untouched)                                                                                            |
| §12 OQ — foreground depth format (lean depth32float)                    | Landed on `main` as the `foreground:0` target row (rgba16float + depth32float); T1's near>0 guard is what that precision needs — noted, not re-decided           |
| §12 OQ — composite into HDR (one tonemap) vs over swapchain             | Landed on `main` (the fold): `foreground:0` composites OVER onto swap post-tone-map through the compositor, sharing the hdr→swap tone object; not re-opened here |
| §12 OQ — camera-intent-slice landed?                                    | Verified: `cameraSlice.ts` + `startCameraTween` exist on `main` (`cameraSlice.ts:90`); T6 leans only on the slab derivation + tween seam, which exist either way |

### Placeholder scan

None. Every task has concrete files, signatures, and test names.

### Type-name consistency vs the folded surface

`foregroundFrustum`, `resolvesToSphere`, `partitionStarsByResolution`, `apparentSizePx`, `StarBody`, `StarRenderer`/`StarPointRenderer`, `starSpheresLayer`/`starPointsLayer`, `BodyStore`/`state.data.bodies`, `EarthBody`/`SCENE_EARTH`, `deriveSlabs`/`slabViewOf`/`NEAR0`/`COSMO`, `SlabView`, `composeBodyMvp`, `SCALE_UNITS`, `RENDER_ORIGIN_MPC`, `CameraTweenDescriptor`/`startCameraTween`, `MIN_DISTANCE_MPC` — all spelled identically to the folded surface and verified against current code. The pre-fold `foregroundNear`/`foregroundFar`/`foregroundVp`/`renderOrigin` `ReadyFrameContext` fields no longer exist — `ReadyFrameContext` carries `slabs: readonly Slab[]` instead, and the near-field near/far live on the `NEAR0` slab row.

### Contract conflicts / seams found

- **Foreground is now DATA, not a bespoke pass:** the fold deleted `encodeForegroundPass`, `foregroundOffscreen`, `foregroundComposite`, and the four `ReadyFrameContext` foreground fields. T2 lands the adaptive frustum in `slabs.ts` (not `frameContext.ts`); T4 re-homes the star partition to the two Plan-02 layers (not a dispatch inside a hand-encoded pass). No task references any deleted symbol.
- **Keyboard/tween seam (real, re-verified):** `watchFocusTweenSaga` (`src/state/selection/watchFocusTweenSaga.ts`, bails on null runtime at `:46-47`) is the canonical "read `cameraRuntime` from getContext → build a tween via a pure framing helper → `put(startCameraTween)`" pattern; `watchTourKeyboardSaga` (`src/state/tour/watchTourKeyboardSaga.ts`, `routeKeys` at `:42-48`) + `createKeyboardListener` (`src/services/input/createKeyboardListener.ts`) is the canonical keyboard-channel pattern. The fly-to-Earth key (T6) composes both. Sagas are forked from `src/store/rootSaga.ts` (the `all([...])` array + docblock list — re-verify line ranges before editing). The tween descriptor is `CameraTweenDescriptor` (`src/@types/camera/CameraTweenDescriptor.d.ts`: `from`/`to`/`durationMs`/`easing: 'easeOutCubic'`), built exactly as `focusTweenDescriptor.ts:48-53`; `startCameraTween` is `cameraSlice.ts:90`. The plan does NOT invent a new effect method (reuses `startCameraTween`).
- **Next ADR number:** **0009** (`docs/adrs/` ends at `0008-effects-layer-vehicle.md`; the contract's `00NN` resolves to 0009). T7 re-verifies before finalising.
- **ADR-0001 source path is off-`main`:** the cosmic-zoom-plan dir (`docs/superpowers/plans/2026-05-08-cosmic-zoom-powers-of-ten/`) does NOT exist on `main` (it's on the `cosmic-zoom-plan` worktree per project memory). The ADR (T7) references it by path and notes the branch; it does not depend on the file being present.
- **`MIN_DISTANCE_MPC` is `?deepZoom`-gated on `main`:** `hasUrlGate('deepZoom') ? 1e-17 : 0.05` (`clampDistance.ts:50-52`). Plan 03 must NOT touch the gate — un-gating is a release decision. Stated in Global Constraints + Consumes + T4 notes; every VISUAL gate needs `?deepZoom` in the URL. No conflict, just a guardrail.
- **Fixed NEAR0 ratios vs Plan 03 adaptive:** the fold's `slabs.ts` derives `NEAR0`'s near/far from `NEAR0_NEAR_RATIO`/`NEAR0_FAR_RATIO` (1e-4 / 100) and carries a forward-reference comment naming this plan as the replacement; T2 REPLACES that derivation with `foregroundFrustum(cam.distance)` and DELETES the two constants + the comment (this plan is the referenced future). Called out explicitly so the executor removes rather than duplicates.
