# Zoom to Earth — Plan 03: LOD & polish

**Spec:** `docs/superpowers/specs/2026-06-29-zoom-to-earth-true-scale-design.md` — scope is **§10 Phases 4 (LOD + depth) and 5 (Polish)**, plus §4's LOD section, §7 camera, §12 open questions.
**Re-grounded 2026-07-10** onto the unified layer/slab/program renderer (renderer-unification 04 fold; PR #386 merged as `504b15dc`); supersedes the pre-fold seams the locked contract names. The bespoke foreground wiring the original plan consumed — `encodeForegroundPass`, `frameContext`-owned `foregroundNear`/`foregroundFar`/`foregroundVp`/`renderOrigin`, the four `ReadyFrameContext` foreground fields — was all deleted in that fold. The foreground is now DATA: a `foreground:0` render target, a `NEAR0` slab row (`slabs.ts`), and per-type content layers driven by the FRAME program. Every `path:line` below was re-verified against `main` on the re-grounding date; the original locked-contract citations are stale and are not authoritative where they conflict with the code cited here.
**Cross-plan contract:** Plans 01/02/03 shared a locked interface contract. Plan 01 shipped and was folded; where a symbol it introduced still exists, this plan CONSUMES it under the same name, but the folded surface (below) is the source of truth over the pre-fold contract. If current code makes a cited symbol impossible, the task says **STOP and report** rather than silently diverging.
**Sibling plan 04 (conic orbit trails):** `docs/superpowers/plans/2026-07-11-zoom-to-earth-04-conic-orbit-trails.md` executes AFTER this plan, on the same branch/PR, and replaces the interim circle debug rings (`orbitRingsLayer` / `sceneOrbits.ts` / `orbitRingRenderer`) with exact Keplerian conics. So do NOT polish the circle-ring renderer beyond what this plan's tasks require — its geometry is about to be superseded. Anything touching the orbit rings here (e.g. the foreground-skip gate in Task 11) gates the row wholesale; it never reshapes the circle geometry.
**Plan style (OVERRIDES upstream writing-plans):** `docs/superpowers/conventions/plan-style.md` — **contract code yes, implementation code no.** Cite `path:line`, never paste full function bodies. Test names + assertions ARE the acceptance criteria.

## Goal

Make the zoom-to-Earth foreground pass scale-correct and legible at any zoom, and add the developer affordance to reach Earth:

1. **Adaptive foreground frustum** — replace the folded-in `NEAR0` slab's fixed near/far ratios (`slabs.ts`'s `NEAR0_NEAR_RATIO`/`NEAR0_FAR_RATIO`) with a pure helper that sizes the foreground frustum from camera-distance-to-focus, so depth precision stays good from galaxy scale down to Earth's surface. (`slabs.ts` already carries the forward-reference comment naming this plan as the replacement.)
2. **Apparent-size point↔sphere promotion for stars** — a star renders as an additive backdrop point (`starPointsLayer`, drawn into the HDR additive accumulation) when small, and promotes to a foreground emissive sphere (`starSpheresLayer`, into `foreground:0`) when its apparent size crosses a threshold. The Sun is always resolved. The same `apparentSizePx` mechanism galaxies already use for the point→thumbnail promotion.
3. **Fly-to-Earth debug key** — a keyboard handler that tweens the camera to Earth-surface framing. Real UI control stays deferred.
4. **Blue Marble texture as a demand-gated asset slot** — move the Earth texture load out of `initGpu`'s fire-and-forget IIFE into a `createEarthTextureSlot` + `ASSET_WIRING` row, descent-gated so the ~MB JPG fetch is paid on the way down to Earth, not at boot.

Then a band of **user-requested descent polish** (2026-07-11, folded in — legibility + overhead the live foreground revealed), each a small, mostly-visual fix:

5. **Marker-line geometry fix** — the famous-galaxy label leader line (`produceFamousLabels` + `markerLineRenderer`) is sometimes too short and sometimes crosses its own text; diagnose the world-space-offset root cause and pin correct geometry.
6. **Foreground labels adopt the famous treatment** — star/planet/Earth captions (`foregroundLabelsLayer` / `sceneBodyLabels`) currently sit ON the body at a smaller size; give them the famous labels' comparable size + offset-with-marker-line presentation.
7. **Star-label distance gate + declutter** — the 25-star local map's captions clobber together and show from too far; gate them to near/resolved stars and de-collide them.
8. **Skip the foreground pass when zoomed out** — beyond the Milky Way the whole NEAR0 foreground group still runs; one shared distance gate skips those encoder passes wholesale.
9. **Milky Way persists deeper on descent** — retune the MW approach-fade band so the low-detail impostor stays visible much longer as the camera dives in (more detail is later work, out of scope).
10. **Investigate a deep-zoom galaxy fade** — assess a camera-distance survey-point fade so galaxies don't clutter the field once stars fill it; land the minimal version or capture the design.

11. **ADR** recording the ADR-0001 refinement (continuous per-object floating origin vs discrete per-shell).
12. **Entanglement-radar pass** over the whole feature diff + **full gate**.

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
  - **Descent-gated texture arrival** — the Blue Marble fetch fires during the descent (not at boot) and the placeholder→texture swap is hitch-free; teardown/re-init neither leaks nor double-fetches.
  - **Marker-line geometry (needs `?deepZoom`)** — famous-galaxy leader lines connect the dot to the text at a consistent length and never cross or lie over the glyphs, at arbitrary camera orientations (orbit the galaxy and watch the stem stay put).
  - **Foreground label parity (needs `?deepZoom`)** — star/planet/Earth captions read at a comparable size to nearby galaxy labels and hang OFF the body on a leader line, not painted over it.
  - **Star-label declutter (needs `?deepZoom`)** — the local-star captions no longer clobber into an unreadable pile from far out; a caption appears only as its star nears/resolves, and overlapping captions de-collide.
  - **Foreground pass skipped when zoomed out** — at galaxy / cosmic zoom the NEAR0 foreground body + label + ring passes do not run (confirm via the GPU-timings panel: their slots read idle above the gate, populate below it); crossing the gate on a dive-in shows no pop of the bodies appearing.
  - **Milky Way persists on descent** — the low-detail MW impostor stays visible far deeper into the dive toward the solar system than before, fading out only close to the disc, with no hard pop.
  - **Galaxy deep-zoom fade (only if the minimal version lands)** — if Task 10 lands a survey fade, galaxies dim smoothly as the camera descends past the local volume rather than cluttering the field; if Task 10 defers to a backlog file, this gate does not apply.

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

- [x] Replace the `nearMpc`/`farMpc` derivation in `deriveSlabs` with `const { near: nearMpc, far: farMpc } = foregroundFrustum(cam.distance);`; delete `NEAR0_NEAR_RATIO`/`NEAR0_FAR_RATIO` and their forward-reference comment. Keep the `computeForegroundViewProj` call and the `COSMO` row exactly as they are (the backdrop keeps its own fixed near/far — that split is essential, see Task 15).
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

- [x] Add `resolvesToSphere.ts` — single function, file named for it. Didactic docblock: WHY this is downstream of `apparentSizePx` (the projection math is already tested in `apparentSizePx.test.ts`; this is just the threshold + always-resolved override, so it tests headlessly); WHY a boolean predicate and not a table (it's a 2-way point/sphere split — a tagged-union table would be over-engineering per simplicity.md §7).
- [x] Test `resolvesToSphere is true above the threshold` — `apparentSizePx` just above `thresholdPx`, `alwaysResolved: false` → true.
- [x] Test `resolvesToSphere is false below the threshold` — apparent size below threshold, `alwaysResolved: false` → false.
- [x] Test `resolvesToSphere is true at exactly the threshold` — equal → true (pin the boundary so the famous-gate `<` vs `>=` convention is matched; `produceFamousLabels.ts:221` uses `sizePx < threshold → continue`).
- [x] Test `resolvesToSphere is true when alwaysResolved regardless of size` — apparent size well below threshold but `alwaysResolved: true` → true (the Sun case).
- [x] `npm test -- resolvesToSphere` → all four pass. Commit.

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

- [x] Add `partitionStarsByResolution.ts` — map each star through `apparentSizePx` + `resolvesToSphere` (Sun → `alwaysResolved: true`), returning `{ spheres, points }`. Both `starSpheresLayer.draw` and `starPointsLayer.draw` call it and draw only their branch.
- [x] Define the threshold as a single named constant (e.g. `STAR_RESOLVE_PX`) in one module, imported by both layers (or by the partition helper), with a comment tying it to the famous-galaxy promotion precedent. Single source of truth — do not duplicate the literal.
- [x] Guard against double-draw: a star is EITHER a sphere OR a point in a given frame, never both — enforced structurally by the two layers consuming ONE predicate on opposite branches (disjoint + exhaustive by construction). State this invariant in the partition helper's docblock; it is the root of the "smooth promotion" visual gate.
- [x] Test `partitionStarsByResolution puts a near large star in spheres and a far small star in points` — two seeded stars at very different distances; assert membership. Use `SCENE_STARS`-shaped fixtures (Sun + a distant star) so the predicate is exercised against real radii.
- [x] Test `partitionStarsByResolution always resolves the Sun` — the Sun (origin, `alwaysResolved`) lands in `spheres` even though at galaxy scale its apparent size is sub-pixel.
- [x] Test (layer tests, extend): `starSpheresLayer draws only the resolved stars` and `starPointsLayer draws only the point stars` — a mixed fixture and a spy renderer, mirroring `debugSpheresLayer.test.ts`'s draw-spy idiom; assert the two draws' star sets are disjoint and cover the input (the structural XOR).
- [x] `npm test -- partitionStarsByResolution starSpheresLayer starPointsLayer` → green (whichever files exist).
- [x] **VISUAL GATE (needs `?deepZoom`) — STOP and ask the user to confirm on the dev server:** flying toward a distant star, it grows continuously from a backdrop point into a resolved sphere with no pop and no frame where both draw. Commit after the user confirms.

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

## Task 7 — Blue Marble texture load → `createEarthTextureSlot` + `ASSET_WIRING` row

Today the Earth texture is loaded by a fire-and-forget async IIFE at the tail of `initGpu` (`src/services/engine/phases/initGpu.ts:448-466` — `void (async () => { fetch(SCENE_EARTH.textureUrl) → createImageBitmap → earthRenderer?.setTexture → scheduler.requestRender })()`). Expedient for Plan 02, but it is the exact anti-pattern the `ASSET_WIRING` header warns against (`assetWiring.ts:1-48`), on four counts:

- **No lifecycle ownership.** Nothing cancels or awaits it; the `?.` on `setTexture` is a half-guard. On `destroy()` the fetch + the multi-megabyte `createImageBitmap` decode still run to completion, and `requestRender()` fires against a possibly-torn-down scheduler.
- **Unconditional boot cost.** Every visitor pays the ~MB JPG fetch + decode at page load for a texture only distinguishable after a deep-zoom descent (Earth subtends a pixel only around ~`1e-13` Mpc). Every OTHER fetchable asset gates on a `demand(ctx)` predicate.
- **Untestable.** The load, the swap, the failure branch, and the null-renderer-on-destroy branch are anonymous closure state inside a bootstrap phase — no unit can exercise them.
- **Wrong layer.** `initGpu` constructs GPU handles; content loading lives in `services/loading/slots/` + `assetWiring.ts`, built by `buildSlotsFromRegistry` / `installSlots` and driven by `reevaluateDemand`.

Make the texture a first-class asset row: a `createEarthTextureSlot` sidecar (fetch + `createImageBitmap`, abort on release) plus an `ASSET_WIRING` row whose commit re-skins the already-visible placeholder Earth via `earthRenderer.setTexture(bitmap)`. Descent-gate the fetch on a new camera-distance read surface so the JPG is paid on the way down, not at boot; the blue placeholder sphere (the renderer's pre-texture state, `EarthRenderer.d.ts:13-20`) covers the in-flight window.

**Files:**

- `src/services/loading/slots/earthTextureSlot.ts` (new) + `tests/services/loading/slots/earthTextureSlot.test.ts` (new) — the slot factory, modelled exactly on `flowFieldSlot.ts` / `cf4DensitySlot.ts`.
- `src/services/loading/fetchers/earthTextureFetcher.ts` (new) — the `Fetcher<ImageBitmap, void>`, modelled on `flowFieldFetcher.ts` (a separate fetcher module is the sibling convention; it also gives the slot test a mockable seam, mirroring `flowFieldSlot.test.ts`'s `vi.mock` of the fetcher). No dedicated fetcher test — none of the sibling fetchers have one; it is mocked in the slot test.
- `src/@types/loading/DemandCtx.d.ts` (modify — add the camera-distance read surface) + `src/services/engine/wiring/buildDemandCtx.ts` (modify — populate it) + `tests/services/engine/wiring/buildDemandCtx.test.ts` (extend).
- `src/services/engine/wiring/assetWiring.ts` (modify — add the row) + `tests/services/engine/wiring/assetWiring.test.ts` (extend — membership + demand + req).
- `src/@types/loading/AssetKey.d.ts` (modify — add `'earthTexture'`) + `src/@types/engine/state/EngineAssetSlots.d.ts` (modify — add `earthTexture: AssetSlot<ImageBitmap, void> | null`, docblock mirroring the `flow` field's null-until-`wireSlots` note).
- `src/services/engine/phases/initGpu.ts` (modify — **delete** the IIFE at `:448-466`; the `createEarthRenderer` call at `:446` stays, the phase returns to pure handle construction).

**Contract (match the sibling shapes exactly):**

```ts
// earthTextureSlot.ts
export const EARTH_TEXTURE_MAX_DISTANCE_MPC: number; // the descent gate (see below)
export const createEarthTextureSlot: SlotFactory<ImageBitmap, void>;

// earthTextureFetcher.ts
export const earthTextureFetcher: Fetcher<ImageBitmap, void>;

// DemandCtx.d.ts — new read surface
//   cameraDistanceMpc: number;   // orbit distance-to-focus of the last produced pose
```

- **Slot** — `createEarthTextureSlot(state, _cb)` builds `createAssetSlot({ name: 'earthTexture', fetch: earthTextureFetcher, commit })`, subscribes an optional `ready` log (mirror `flowFieldSlot.ts:49-53`), and RETURNS the slot (construction-purity: no `state.assetSlots` write, no `slot.load()` — `SlotFactory.d.ts:11-17`).
- **Fetcher** — `fetch(SCENE_EARTH.textureUrl, { signal })` then `createImageBitmap(await res.blob())`, throwing on `!res.ok`. Threading the `AssetSlot` `signal` into `fetch` IS the abort-on-release mechanism (`createAssetSlot` aborts it on cancel/reload); a 404/decode failure flows to the slot's `error` state and the blue placeholder simply stays — same silent-optional-asset posture as `flowFieldFetcher.ts:12-16`.
- **Commit** — `state.gpu.earthRenderer?.setTexture(bitmap)` and nothing else. NO manual `requestRender` — the ready wake is generic (`installSlotReadyWake.ts:26-35` subscribes every slot and wakes on `ready`, which fires only after this commit resolves), which is exactly what deletes the IIFE's hand-rolled `requestRender`. NO `syncVisibilityFades` — the swap is not a visibility fade (the Earth sphere is already on-screen as the placeholder; `setTexture` only re-skins it). The `?.` guard makes the destroy-race a no-op instead of a crash — the bug the IIFE's `?.` only half-covered.
- **Row** — a registry-built (NOT `built: 'external'`) sidecar, placed alongside the other `services/loading/slots/` rows in `ASSET_WIRING`: `{ key: 'earthTexture', factory: (deps) => createEarthTextureSlot(deps.state, deps.cb), req: () => undefined, demand: (ctx) => ctx.cameraDistanceMpc < EARTH_TEXTURE_MAX_DISTANCE_MPC }`. `req` is void like `flow`/`cf4Density` (`assetWiring.ts:164,178`). `buildSlotsFromRegistry` builds it and `installSlots` writes `state.assetSlots.earthTexture`, so `EngineAssetSlots` needs the field and `AssetKey` needs the member — same edit pair every string-keyed sidecar (`flow`, `cf4Density`) already has.

**Demand predicate — DESCENT-GATED (the read-surface addition IS part of this task).** `DemandCtx` today exposes only `settings` / `request` / `slotState` (`DemandCtx.d.ts:70-81`) — no camera. Add `cameraDistanceMpc: number`, populated in `buildDemandCtx` from `state.cameraRuntime.lastPose.current.distance` — the previous frame's produced orbit distance-to-focus (`CameraRuntime.d.ts:57` / `CameraPose.d.ts:10-15`). That box is always non-null (constructed + placeholder-seeded in `engine.ts`), and ALL drivers — wheel-zoom, tour clips, AND the Task 6 fly-to-Earth tween — converge to `CameraPose`, so this one field tracks every descent path. Reading the *previous* frame's pose is deliberate: `reevaluateDemand` runs at the frame TOP (`runFrame.ts:119`), before this frame's camera is produced (`deriveFrameContext` / `deriveSlabs` run later, `runFrame.ts:143+`), and a one-frame-stale distance is immaterial for a multi-frame async fetch. **Threshold:** `EARTH_TEXTURE_MAX_DISTANCE_MPC = 1e-3` — the same order as the `SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC = 1e-3` caption gate (`foregroundLabelsLayer.ts:70`), chosen because the descent from `1e-3` Mpc down to Earth-surface (~`1e-16` Mpc) spans ~13 decades of zoom — orders of magnitude more lead time than the fetch + decode needs, so the Blue Marble is always resolved before the surface subtends a pixel (~`1e-13` Mpc). Whether this should literally BE `SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC` rather than a second `1e-3` is a Task 15 radar candidate.

**Didactic docblocks (required):**

- `earthTextureSlot.ts` — WHY a slot, not an IIFE: lifecycle ownership (fetch/decode abort on release; no work past `destroy()`; no wake against a torn-down scheduler), a single demand-gated home (`ASSET_WIRING` header `assetWiring.ts:1-48`), and testability (failure + null-renderer branches become units). WHY descent-gated: every visitor was paying the ~MB fetch + decode at boot for a texture only distinguishable below ~`1e-13` Mpc; the predicate defers the cost to the descent, mirroring the thumbnail pipeline's defer-until-visible; the blue placeholder covers the in-flight window.
- `DemandCtx.d.ts` — WHY a camera read surface exists (one asset — the Earth texture — legitimately loads on proximity, not on a settings toggle or a slot-state join) and WHY it reads the last produced pose (demand runs before the frame's camera is produced; the boxed `lastPose` is the live cross-driver distance).

- [ ] Add `earthTextureFetcher.ts` — `Fetcher<ImageBitmap, void>`; `fetch(SCENE_EARTH.textureUrl, { signal })` + `createImageBitmap`, throw on `!res.ok`.
- [ ] Add the `cameraDistanceMpc` surface to `DemandCtx` and populate it in `buildDemandCtx` from `state.cameraRuntime.lastPose.current.distance`.
- [ ] Test (extend `buildDemandCtx.test.ts`): `buildDemandCtx surfaces the last produced pose's orbit distance as cameraDistanceMpc` — seed `state.cameraRuntime.lastPose.current.distance` and assert the ctx field equals it.
- [ ] Add `earthTextureSlot.ts` — the factory + `EARTH_TEXTURE_MAX_DISTANCE_MPC`, per the contract + docblock above.
- [ ] Test `createEarthTextureSlot sets the fetched bitmap on the earth renderer on ready` — mock `earthTextureFetcher` to resolve a stub `ImageBitmap`, stub `state.gpu.earthRenderer = { setTexture: vi.fn() }`, `slot.load(undefined as never)`, `await vi.waitFor(() => expect(slot.state().kind).toBe('ready'))`, assert `setTexture` called with the bitmap; pin construction purity (`slot.name === 'earthTexture'`, `state.assetSlots.earthTexture` undefined) — mirror `flowFieldSlot.test.ts:57-74`.
- [ ] Test `createEarthTextureSlot commit is a no-op when the earth renderer is null` — `state.gpu.earthRenderer = null` (the destroy race); assert the slot still reaches `ready` and nothing throws (the IIFE's half-guarded `?.` bug, now covered).
- [ ] Add the `'earthTexture'` member to `AssetKey` and the `earthTexture: AssetSlot<ImageBitmap, void> | null` field to `EngineAssetSlots` (docblock mirroring the `flow` null-until-`wireSlots` note); add the `ASSET_WIRING` row importing `createEarthTextureSlot` + `EARTH_TEXTURE_MAX_DISTANCE_MPC`.
- [ ] Test (extend `assetWiring.test.ts`): `ASSET_WIRING includes a registry-built earthTexture row` (row present, `built` undefined, `req('medium')` is `undefined`) and `the earthTexture row demands the texture only within the descent threshold` — extend the test's `makeCtx` helper with a `cameraDistanceMpc` field (default a large distance / `Infinity`), then assert `demand(makeCtx({ cameraDistanceMpc: EARTH_TEXTURE_MAX_DISTANCE_MPC / 2 }))` is true and both `makeCtx({ cameraDistanceMpc: EARTH_TEXTURE_MAX_DISTANCE_MPC * 10 })` and `makeCtx({})` are false.
- [ ] Delete the IIFE at `initGpu.ts:448-466`; verify the phase still constructs `earthRenderer` and stashes `phaseLocals`. (Optional: refresh the stale "fetched asynchronously by the engine (the NEXT task)" forward-reference in `EarthRenderer.d.ts:13` to name the slot.)
- [ ] `npm test -- earthTextureSlot buildDemandCtx assetWiring` → green.
- [ ] **VISUAL GATE (needs `?deepZoom`) — STOP and ask the user to confirm on the dev server:** descending toward Earth, the mid-blue placeholder sphere swaps to the Blue Marble texture with no hitch; the fetch does NOT fire at boot (confirm via the network panel — no `blue-marble` request until the descent crosses `1e-3` Mpc); a full teardown/re-init does not leak a fetch or double-load. Commit after the user confirms.

## Task 8 — Fix the famous-galaxy leader-line geometry (world-space → screen-space lift)

The famous-galaxy label leader line is reported as "sometimes too short, sometimes falls over the text." Root cause is a **frame-mismatch**: the leader line and the label lift are a fixed WORLD-space `+Y` offset, while the label glyphs stack in SCREEN space. `produceFamousLabels.ts:240-245` sets the label anchor to `worldPos + [0, offset, 0]` and the connector to `worldPos → worldPos + [0, 0.75·offset, 0]` (both world `+Y`), with `offset = max(FAMOUS_LABEL_MIN_OFFSET_MPC 0.05, FAMOUS_LABEL_OFFSET_FACTOR 1.5 · diameterMpc)` (`produceFamousLabels.ts:138-141`). `markerLineRenderer` then projects those two world endpoints and expands the segment to a screen quad (`markerLineRenderer.ts:316-351` + `shaders/markerLines/vertex.wesl`), so the drawn line follows world `+Y` projected to screen — whereas the label's glyphs always stack screen-up from a `baseline`/`center` anchor (`labelLayout.ts:49-131`, screen-space billboard). The two only agree when world `+Y` projects to screen-up.

**The two defects, named:**

- **"too short"** — when the camera looks near-along the galaxy's world `+Y` axis, the `+Y` offset foreshortens; the projected connector collapses toward zero length and the label baseline lands on the dot.
- **"falls over the text"** — when world `+Y` projects to screen-DOWN or sideways (camera rolled / viewing from below), the connector points one way while the glyphs stack screen-up, so the line crosses / lies over the text.

**The blocking seam (verify, do not invent around).** The current static-world-offset is DELIBERATE (`produceFamousLabels.ts:235-240` comment): the label director's re-upload signature EXCLUDES `worldPos` (`labelDirectorSubsystem.ts:175-177` keys only on `id:fadeAlpha`), so a per-frame camera-derived world position would "freeze at the first-visible distance" — the buffer would never re-upload as the camera moves. A screen-consistent leader line IS camera-derived per frame, so this task MUST also make the director re-upload when a leader line's endpoints move. If that cannot be done without reshaping the director's change-detection beyond adding the connector's endpoints to the signature, **STOP and report** rather than shipping a frozen connector.

**Files:** `src/utils/camera/labelLeaderLine.ts` (new — the pure geometry) + `tests/utils/camera/labelLeaderLine.test.ts` (new); `src/services/engine/presentation/produceFamousLabels.ts` (modify — consume the helper for the connector + label anchor); `src/services/engine/subsystems/labelDirectorSubsystem.ts` (modify — extend `signatureOf` so a moved connector re-uploads) + `tests/services/engine/subsystems/labelDirectorSubsystem.test.ts` (extend).

**Signature (contract — match exactly):**

```ts
export function labelLeaderLine(input: {
  anchorWorldPos: Vec3; // the dot (galaxy/body) position in the layer's world frame
  vp: Float32Array; // the view-projection the layer draws through
  viewportPx: Vec2;
  liftPx: number; // screen-space vertical lift from the dot to the text baseline
}): { fromWorld: Vec3; toWorld: Vec3 } | null; // null when the anchor is behind the camera
```

**Behaviour:** project `anchorWorldPos` through `vp` to screen pixels, offset straight UP `liftPx` pixels in screen space, then un-project that lifted screen point back to a world position at the anchor's depth — so `fromWorld = anchorWorldPos` and `toWorld` projects to exactly `liftPx` above the dot on screen, at ANY camera orientation. Returns `null` behind the camera (clip-w ≤ 0). Pure — no engine state, no clock; the projection math mirrors the declutter projection at `labelDirectorSubsystem.ts:210-227`.

- [ ] Add `labelLeaderLine.ts` — single function, file named for it. Didactic docblock: WHY a screen-space lift (the label's glyphs stack in screen space, so the connector that points at them must too; a world-space offset foreshortens and mis-orients — the reported "too short" / "over the text" defects); WHY un-project rather than a pure 2D line (the marker-line renderer consumes WORLD endpoints — `markerLineRenderer.ts:267-314` — so the screen lift is expressed as a world point at the anchor's depth).
- [ ] Test `labelLeaderLine lifts straight up in screen space` — a representative anchor + vp; project both returned endpoints and assert they share a screen-x and the `toWorld` projects `liftPx` above `fromWorld` (within a small tolerance), proving the screen lift is orientation-independent (assert it holds for a rolled/tilted vp too, where a world `+Y` offset would NOT).
- [ ] Test `labelLeaderLine returns null behind the camera` — an anchor with clip-w ≤ 0 → null.
- [ ] Consume the helper in `produceFamousLabels` for BOTH the connector endpoints and the label anchor (label sits `liftPx` above the dot; connector runs dot → ~75% of the lift), replacing the world-`+Y` offset. Keep `fadeAlpha` / `ownerLabelId` wiring unchanged. The per-entry `labelAnchorOffsetMpc` world lift retires in favour of a screen-space `liftPx` (tie it to the label's apparent size / a style constant, not a world distance).
- [ ] Extend `labelDirectorSubsystem.signatureOf` so a leader line whose endpoints changed re-uploads (include a coarse-quantised endpoint term, or the connector's `toWorld`, in the line signature) — the fix for the "freeze at first-visible distance" trap the old static offset dodged. Test `labelDirectorSubsystem re-uploads a marker line when its endpoints move` — two frames with the same line id but moved endpoints assert a re-flush (mirror the existing signature test idiom). **If this can't be expressed as a signature extension, STOP and report.**
- [ ] `npm test -- labelLeaderLine labelDirectorSubsystem` → green.
- [ ] **VISUAL GATE (needs `?deepZoom` for the foreground bodies in Task 9; famous galaxies are visible without it) — STOP and ask the user to confirm on the dev server:** orbiting a famous galaxy, its leader line stays a consistent length straight up to the caption and never crosses or lies over the glyphs at any camera orientation. Commit after the user confirms.

## Task 9 — Foreground (star/planet/Earth) captions adopt the famous-label treatment

The scene-body captions read much smaller than nearby galaxy labels and sit ON the body rather than lifted off it. `sceneBodyLabels.ts:88-92` gives every caption `minPixelSize: 13` / `maxPixelSize: 44` and NO leader-line offset, drawn straight through `foregroundLabelRenderer` (`foregroundLabelsLayer.ts:92-119`) — whereas famous labels use `minPixelSize: 30` / `maxPixelSize: 150` (`famousLabelStyle.ts:46-47`) with an offset + connector. Bring the two to parity.

**The slab tension (why the foreground path can't just join the director).** The foreground captions are on a SEPARATE renderer precisely because they project through the NEAR0 slab (`foregroundLabelsLayer.ts:6-21`, `sceneBodyLabels.ts:21-33`), while `labelDirectorSubsystem` + `markerLinesLayer` project through `ctx.vp` (COSMO) — which would clip the AU-scale bodies. So parity means giving the FOREGROUND path its own size bump and its own leader-line render, reusing the Task 8 `labelLeaderLine` helper against the NEAR0 rebased vp — NOT routing the captions through the director.

**Files:** `src/services/engine/presentation/sceneBodyLabels.ts` (modify — famous-comparable size), `tests/services/engine/presentation/sceneBodyLabels.test.ts` (extend); `src/services/engine/frame/passes/foregroundLabelsLayer.ts` (modify — emit + draw leader lines rebased into NEAR0) + `tests/services/engine/frame/passes/foregroundLabelsLayer.test.ts` (extend); a foreground marker-line renderer instance (see below).

**Contract:**

- **Size** — raise the foreground caption `minPixelSize`/`maxPixelSize` to a famous-comparable band (align with `FAMOUS_LABEL_STYLE`'s `30`/`150`, or a tuned pair reusing the same constants so the two can't drift — single source of truth). Keep the `worldEmMpc = radiusKm · KM_TO_MPC` sizing model (`sceneBodyLabels.ts:88`).
- **Leader line** — each caption lifts off its body by a screen-space `liftPx` via `labelLeaderLine` (Task 8), and a connector is drawn dot → ~75% lift. Render the connectors through a `foregroundMarkerLineRenderer` (a `createMarkerLineRenderer` instance targeting the swap chain, the sibling of `foregroundLabelRenderer`), rebased into the NEAR0 camera-relative frame exactly as the captions are (`foregroundLabelsLayer.ts:98-119`'s `rebaseViewProj` + `pos − camPos`). **STOP and report** if a foreground marker-line seam does not fall out of `createMarkerLineRenderer` + the layer's existing rebase (e.g. if a new GPU-handle slot + bootstrap wiring is required beyond this plan's scope — surface it rather than half-wiring it).

- [ ] Raise the foreground caption size to the famous-comparable band in `sceneBodyLabels.ts`, sharing `FAMOUS_LABEL_STYLE`'s clamp constants rather than re-typing literals. Test `sceneBodyLabels sizes captions comparably to famous labels` — assert the emitted `minPixelSize`/`maxPixelSize` equal the shared famous clamps (pins the parity so a future famous-style change carries).
- [ ] Add the leader-line emission + a rebased `foregroundMarkerLineRenderer` draw to `foregroundLabelsLayer` (or a sibling `foreground-marker-lines` row through the same `(swap, NEAR0)` step), consuming `labelLeaderLine`. Didactic docblock: WHY a second marker-line renderer instead of the director's (the NEAR0-vs-COSMO slab split — same reason the captions are a separate renderer); WHY the connectors are rebased (the AU-scale f64 seam the caption header already documents).
- [ ] Test (extend `foregroundLabelsLayer.test.ts`): `foregroundLabelsLayer draws a leader line per caption` — a draw-spy on the foreground marker-line renderer asserts one connector per emitted caption, rebased (endpoints are camera-relative, not raw ~1-AU anchors). Mirror the existing layer draw-spy idiom.
- [ ] `npm test -- sceneBodyLabels foregroundLabelsLayer` → green.
- [ ] **VISUAL GATE (needs `?deepZoom`) — STOP and ask the user to confirm on the dev server:** star/planet/Earth captions read at a comparable size to nearby galaxy labels and hang off the body on a leader line, not painted over it. Commit after the user confirms.

## Task 10 — Star captions: per-star resolve gate + declutter

The local star map's 24 captions (`SCENE_STARS`, `sceneBodies.ts:115-141`) all draw together, gated only by the layer-wide `ctx.cam.distance < SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC` (1e-3) (`foregroundLabelsLayer.ts:89`) — there is NO per-star gate and NO declutter on the foreground caption path (the director's screen-space declutter at `labelDirectorSubsystem.ts:197-294` runs on the COSMO producer set, not this NEAR0 renderer). So from far out the captions pile into an unreadable clump. Gate each caption to its own star's resolution and de-collide the survivors.

**Reuse check (grounded):** the director's declutter is a greedy screen-space priority cull (project anchor → measured rect → accept if it clears accepted rects, `labelDirectorSubsystem.ts:197-294`), but it is welded to `ctx.vp` and the merged producer set — it cannot be called against the NEAR0 foreground captions without the slab tension of Task 9. So extract the minimal screen-space priority cull as a PURE helper the foreground path can call against the NEAR0 view. Per-star visibility reuses `apparentSizePx` + `resolvesToSphere` (Tasks 3-4): a caption appears only as its star nears/resolves — the same near-vs-far machinery the spheres use.

**Files:** `src/utils/scene/declutterByScreenSeparation.ts` (new — the pure cull) + `tests/utils/scene/declutterByScreenSeparation.test.ts` (new); `src/services/engine/frame/passes/foregroundLabelsLayer.ts` (modify — per-star gate + declutter in `draw`, replacing the module-cached `BASE_LABELS` set with a per-frame filtered set) + `tests/services/engine/frame/passes/foregroundLabelsLayer.test.ts` (extend); plus the star-label settings toggle (user-requested 2026-07-11) — a boolean settings field + SettingsPanel control + the layer reading it.

**Signature (contract — match exactly):**

```ts
export function declutterByScreenSeparation(input: {
  candidates: readonly { screenPx: Vec2; priorityPx: number }[]; // priority = apparent size / -distance
  minSeparationPx: number;
}): readonly number[]; // indices of the kept candidates, highest-priority first
```

**Behaviour:** sort candidates by `priorityPx` DESC (stable input-order tiebreak — the director's convention, `labelDirectorSubsystem.ts:261-264`); greedily accept a candidate when it is at least `minSeparationPx` from every already-accepted candidate; return the kept indices. Pure — takes already-projected screen positions, so it unit-tests without a device or a vp.

- [ ] Add `declutterByScreenSeparation.ts` — single function, file named for it. Didactic docblock: WHY a separate pure cull and not the director's (the director's declutter is welded to `ctx.vp` + the merged producer set — the NEAR0 foreground captions can't join it, per Task 9's slab tension); WHY priority = apparent size (keep the near/bright star's caption, drop the distant one that would clutter — the director's own rationale, `labelDirectorSubsystem.ts:184-192`).
- [ ] In `foregroundLabelsLayer.draw`, compute per-star `apparentSizePx` from the star radius + the NEAR0 view (`view.camPos`, `ctx.fovYRad`, `view.viewportPx`), gate each caption via `resolvesToSphere`-style near/resolved threshold (a caption shows only when its star is near resolving — Sun always shown), project the survivors, and `declutterByScreenSeparation` them. The per-frame filtered set replaces the module-cached `BASE_LABELS` flush (`foregroundLabelsLayer.ts:78,106-114`); Earth + planets keep showing (only the dense star map declutters). Note the threshold is ONE named constant, shared with / tied to the Task 4 star-resolve threshold — do not duplicate.
- [ ] Add a user-facing **star-labels toggle**: a boolean settings field defaulting ON (ground its home in the existing settings shape — find where comparable label/visibility toggles live in the settings slice and mirror that placement + naming; wire a SettingsPanel control the same way its siblings are wired), read by `foregroundLabelsLayer` so OFF suppresses the STAR captions only (Earth + planet captions unaffected). Test (extend `foregroundLabelsLayer.test.ts`): `foregroundLabelsLayer suppresses star captions when the toggle is off` — toggle off in the settings fixture → no star captions emitted, Earth/planet captions still present.
- [ ] Test `declutterByScreenSeparation keeps the highest-priority of an overlapping cluster` — several candidates within `minSeparationPx`, differing priority → only the top survivor's index returned; a well-separated candidate is always kept.
- [ ] Test (extend `foregroundLabelsLayer.test.ts`): `foregroundLabelsLayer hides distant unresolved star captions` — a far camera where the star map is sub-resolve asserts the emitted caption set is culled to (at most) the resolved/near stars; a near camera emits more. Mirror the layer test idiom.
- [ ] `npm test -- declutterByScreenSeparation foregroundLabelsLayer` → green.
- [ ] **VISUAL GATE (needs `?deepZoom`) — STOP and ask the user to confirm on the dev server:** the local-star captions no longer clobber into a pile from far out; each appears as its star nears/resolves, and overlapping captions de-collide. Commit after the user confirms.

## Task 11 — Skip the NEAR0 foreground pass when zoomed out

Beyond the Milky Way the entire near-field foreground group still runs every frame — the NEAR0 layers gate ONLY on their GPU handle, never on distance: `earthLayer.ts:54-57`, `starSpheresLayer.ts:56`, `planetsLayer.ts:58`, `starPointsLayer.ts:48`, `orbitRingsLayer.ts:48-52`. So at galaxy / cosmic zoom the executor still opens the `(hdr, NEAR0)` step, the `(foreground:0, NEAR0)` step, the `foreground:0→swap` composite, and the `(swap, NEAR0)` caption step — all producing sub-pixel output. Gate them off wholesale above a distance.

**The seam is already there — no executor change.** `executeFrame` skips a render step whose enabled-layer group is empty (`executeFrame.ts:172-179`) and skips a composite whose source target went untouched (`executeFrame.ts:203`). So ANDing one shared distance gate into every NEAR0 foreground layer's `enabled` cascades automatically: above the gate all four NEAR0 steps produce empty groups / an untouched source and are skipped — no `beginRenderPass`, no partition computation (Task 4 runs inside `draw`), no composite. This is a pure `enabled`-predicate change plus one constant; do NOT touch `executeFrame` or the circle-ring geometry (superseded by plan 04 — see the header note).

**Threshold — derive, don't hand-tune.** `FOREGROUND_MAX_DISTANCE_MPC` from the farthest seeded foreground element: `max |positionMpc|` over `SCENE_BODIES` (Pollux at ~10.34 pc ≈ `3.36e-3` Mpc, `sceneBodies.ts:140`) times a small margin — beyond it every body / ring is well behind the camera and the star points' neighbourhood is no longer the subject. **Caveat to verify visually:** `starPointsLayer` draws fixed-size billboards meant as a local starfield backdrop, so the gate must not cut the points while the neighbourhood is still being framed — set the margin generously and confirm on the dev server. Whether this constant should fold with `SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC` (`foregroundLabelsLayer.ts:70`, the caption gate) is a Task 15 radar candidate.

**Files:** `src/services/engine/frame/foregroundMaxDistance.ts` (new — the derived constant, one symbol) + `tests/services/engine/frame/foregroundMaxDistance.test.ts` (new); `src/services/engine/frame/passes/{earthLayer,starSpheresLayer,planetsLayer,starPointsLayer,orbitRingsLayer,foregroundLabelsLayer}.ts` (modify — AND the gate into each `enabled`) + their layer tests (extend).

- [ ] Add `foregroundMaxDistance.ts` — `export const FOREGROUND_MAX_DISTANCE_MPC` derived from `SCENE_BODIES`' max `|positionMpc|` × a margin (no bare literal). Didactic docblock: WHY derived (moving/adding a body seed must carry the gate automatically — the single-source-of-truth rule the `bodies/` folder observes, `sceneOrbits.ts:9-15`); WHY a gate at all (above it every foreground element is sub-pixel / behind the camera, so the four NEAR0 encoder steps are pure overhead — `executeFrame.ts:172-179` skips empty groups for free).
- [ ] AND `ctx.cam.distance < FOREGROUND_MAX_DISTANCE_MPC` into each of the six NEAR0 foreground layers' `enabled` (the layers today return handle-only). One shared import; do not re-derive per layer. `foregroundLabelsLayer` keeps its tighter `SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC` gate as well (captions turn on later than the bodies) — the two gates compose.
- [ ] Test `foregroundMaxDistance encloses the farthest seeded body` — assert `FOREGROUND_MAX_DISTANCE_MPC` ≥ the farthest `SCENE_BODIES` distance (so nothing is gated off while still on-screen), and is far below galaxy scale (`< 1`), pinning it as a near-field gate.
- [ ] Test (extend the layer tests, one representative + the labels layer): `earthLayer is disabled beyond the foreground gate` / `... enabled below it` — a ctx above and below `FOREGROUND_MAX_DISTANCE_MPC` toggles `enabled`. Assert via the same executor-group filter the frame uses (`layers.filter(l => … l.enabled(state, ctx))`, `executeFrame.ts:172-178`) that the `(foreground:0, NEAR0)` group is empty above the gate and non-empty below — the wholesale-skip property.
- [ ] `npm test -- foregroundMaxDistance earthLayer foregroundLabelsLayer starPointsLayer` → green.
- [ ] **VISUAL GATE — STOP and ask the user to confirm on the dev server:** at galaxy / cosmic zoom the NEAR0 foreground body + label + ring passes read idle in the GPU-timings panel (`?gpuTimings`) and populate only below the gate; diving in past the gate shows no pop of the bodies appearing, and the star-points backdrop is not cut while the neighbourhood is still framed. Commit after the user confirms.

## Task 12 — Milky Way impostor persists deeper on the descent

The low-detail MW impostor fades out too early as the camera dives toward the solar system. The near-side fade lives in `milkyWayApproachFadeAlpha` (`utils/math/milkyWayApproachFadeAlpha.ts:39-43`): `smoothstep(APPROACH_FADE_INNER_MPC = 0.008, APPROACH_FADE_OUTER_MPC = 0.04, camDistMpc)` — full outside ~40 kpc, gone by ~8 kpc. Retune the band so the impostor stays visible much deeper into the dive (the "more detail later" work is explicitly OUT of scope — this is a constant retune only, keeping the same low-detail renderer on screen longer).

**Files:** `src/utils/math/milkyWayApproachFadeAlpha.ts` (modify — lower the two band constants) + `tests/utils/math/milkyWayApproachFadeAlpha.test.ts` (repoint to the new constants). Primarily a VISUAL-gate task.

- [ ] Lower `APPROACH_FADE_INNER_MPC` / `APPROACH_FADE_OUTER_MPC` so the impostor holds full strength far deeper toward the disc (the band closes only close to / inside the Sun's galactocentric radius). Update the docblock's kpc-scale rationale (`milkyWayApproachFadeAlpha.ts:19-34`) to the new band; keep the smoothstep shape. Named constants, no inline magic.
- [ ] Repoint the existing `milkyWayApproachFadeAlpha.test.ts` cases to the new constants (endpoint + a mid-band value that tracks the retuned band) — do NOT add clamp-boundary/mirror tests (testing.md); the test's job is to pin that the band moved, not to restate `smoothstep`.
- [ ] `npm test -- milkyWayApproachFadeAlpha` → green.
- [ ] **VISUAL GATE — STOP and ask the user to confirm on the dev server:** the low-detail MW impostor stays visible far deeper into the dive toward the solar system than before, fading only close to the disc, with no hard pop. Commit after the user confirms.

## Task 13 — INVESTIGATE a deep-zoom survey-galaxy fade (decision point)

Once stars fill the near field the galaxy point cloud clutters the view. Investigate a camera-distance fade on the survey points, then either land the minimal version or capture the larger design — a fork, not a foregone implementation.

**The seam (grounded).** The per-source galaxy opacity is written each frame from `pointSpritesLayer.draw`'s callback `fadeOpacityOf: (source) => fades.opacityOf({ kind: 'galaxyCatalog', id: galaxyCatalogIdOf(source) }, nowMs)` (`pointSpritesLayer.ts:114-121`), consumed in `pointRenderer.ts:782` (`fadeScratchF32[0] = settings.fadeOpacityOf(source)` → the per-source 16-byte FadeUniforms). A global camera-distance fade is a single multiply into that callback's return — a pure `surveyDeepZoomFade(camDistanceMpc)` factor — WITHOUT touching `syncVisibilityFades` (`services/engine/wiring/syncVisibilityFades.ts`, the FadeRegistry writer) or the per-source intent. That is the candidate "minimal version."

**This is an investigation task — the checkboxes fork:**

- [ ] Investigate: confirm the multiply-at-`fadeOpacityOf` seam holds (the callback is the ONLY place per-source opacity enters the draw; `pointRenderer.ts:782` is the sole consumer), and sketch the fade band (where should galaxies begin dimming on descent — tie it to the local-volume / foreground scale, not a hand-picked number). Note whether the disks layers (`proceduralDisksLayer` / `texturedDisksLayer`) need the same factor for coherence, and how it composes with the existing FadeRegistry opacity.
- [ ] **STOP and present findings to the user** — the seam, the proposed band, the disks-coherence question, and a land-vs-defer recommendation. The user decides.
- [ ] **FORK (per the user's decision):**
  - **Land the minimal version** if it is genuinely a small uniform multiply: add `src/utils/math/surveyDeepZoomFade.ts` (pure, one symbol) + test, and multiply it into `pointSpritesLayer.draw`'s `fadeOpacityOf` return. Test `surveyDeepZoomFade fades survey points on deep descent` (full above the local volume, ramping to 0 as the camera descends). `npm test -- surveyDeepZoomFade pointSpritesLayer` → green. Then a VISUAL GATE (needs `?deepZoom`): galaxies dim smoothly on descent rather than cluttering; commit after the user confirms.
  - **OR capture the design** if it wants disks-coherence / per-source thresholds / FadeRegistry interplay: write `docs/backlog/2026-07-11-deep-zoom-survey-fade.md` (seam + options + evidence) and add ONE terse index line to `docs/BACKLOG.md` under the rendering area (title + readiness tag + one clause + `→ [details]`). No code lands. Commit the backlog capture.
- [ ] Either branch ends in a commit; record which branch was taken in the PR body.

## Task 14 — ADR: continuous floating origin for free zoom

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

## Task 15 — Entanglement-radar pass + full gate

**Files:** none new — a review pass over the whole zoom-to-Earth feature diff (Plans 01+02+03) and the final gate.

Run the `entanglement-radar` skill over the full feature diff per `docs/superpowers/conventions/simplicity.md`. The radar's design-time trigger applies: any place this plan (or 01/02) handles an "asymmetry" / "special-case" / "must-remember-to" is a STOP-and-classify signal (essential vs accidental complecting), not a note to write more carefully.

**Known candidates to classify (name reader + writer of each state; mismatch = mirror to un-braid):**

- The `NEAR0` slab row (adaptive near/far via `foregroundFrustum`) vs the `COSMO` slab row (fixed near/far) in `slabs.ts` — is the split essential (two genuinely different precision regimes) or accidental (could one row serve both)? Expected: **essential** (spec §4 — the two slabs are separate rows by construction; the cosmological scene's depth doesn't move as the user zooms, only the near-field's does).
- The star point↔sphere partition disjointness (a star is point XOR sphere) — is the "never both in one frame" invariant enforced structurally (`starSpheresLayer` and `starPointsLayer` consuming ONE shared predicate on opposite branches) or by remembering-to (two independent gates that could drift)? Must be the former — confirm both layers call the same `partitionStarsByResolution`/`resolvesToSphere`, not two hand-copied thresholds.
- `apparentSizePx` reused for both galaxy labels (`produceFamousLabels`) and star resolution — confirm it's one shared util, not a forked copy.
- `earthSurfaceFraming` distance ↔ `foregroundFrustum` near plane — is the "framing distance clears the near plane" relationship encoded, or a latent drift waiting to clip? (Comment-level coupling acceptable if both cite each other; a shared constant if it tightens cleanly.)
- `EARTH_TEXTURE_MAX_DISTANCE_MPC` (Task 7 demand gate) vs the other descent thresholds, notably `SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC` (`foregroundLabelsLayer.ts:70`) and `FOREGROUND_MAX_DISTANCE_MPC` (Task 11) — a family of descent thresholds now. Is each relationship ENCODED (shared constant where they must move together) or is each constant essential (independent gate points, each with a comment naming the others and stating why they differ)? Do not leave bare `1e-3`-style literals that silently drift; either fold or cross-reference.
- The leader-line geometry (Task 8 `labelLeaderLine`) consumed by BOTH the famous producer (Task 8) and the foreground caption path (Task 9) — confirm it is ONE shared helper, not a forked copy per path. Same for the star-resolve threshold shared by Task 4 (partition) and Task 10 (caption gate) — one constant, not two.
- Two declutter mechanisms after Task 10: the director's greedy screen-space cull (`labelDirectorSubsystem.ts:197-294`, COSMO/`ctx.vp`) and the new `declutterByScreenSeparation` (NEAR0 foreground path). Is the split essential (genuinely different slabs / producer sets, so one cull can't serve both — Task 9's slab tension) or accidental (could the director's cull be generalised to take a vp + candidate set)? Classify; if accidental-but-large, capture rather than force-merge.
- The Task 13 survey-fade factor (if landed) vs the per-source FadeRegistry opacity (`pointSpritesLayer.ts:114-121`) — confirm the camera-distance factor composes as ONE multiply at the `fadeOpacityOf` seam and does not fork fade ownership away from `syncVisibilityFades`.

- [ ] Run `entanglement-radar` over the feature diff; for each finding classify essential vs accidental and record the verdict (in the PR body or a short notes block). If an accidental braid surfaces, either un-braid it (small) or capture it in `docs/BACKLOG.md` (if it's a larger follow-up) — do not silently ship it.
- [ ] Run `npm run typecheck` (both src + tools tsconfigs) → clean.
- [ ] Run `npm test` (full suite) → green.
- [ ] Note in the PR body EVERY visual property confirmed by the user across the visual-gate tasks — the four LOD/descent gates (Tasks 4/6/7: smooth promotion, fly-to-Earth motion, believable LOD, descent-gated texture arrival) PLUS the polish gates (Tasks 8-12: marker-line geometry, foreground label parity, star-label declutter, foreground-pass skip, Milky Way persistence; and Task 13's galaxy fade only if its minimal version landed) — none of these are covered by automated tests.
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
| Backlog 2026-07-11 — Blue Marble texture out of `initGpu`'s IIFE (folded in) | T7 (`createEarthTextureSlot` + `ASSET_WIRING` row + `DemandCtx.cameraDistanceMpc` surface); NOT a spec bullet — folded from `docs/backlog/`                  |
| §10 Phase 5 — tests                                                     | T1/T3/T5 unit tests; T4 partition + layer tests; T6 saga tests; T7 slot + demand tests; T15 full gate                                                            |
| §10 Phase 5 — docs (ADR recording ADR-0001 refinement)                  | T14 (ADR 0009)                                                                                                                                                   |
| §10 Phase 5 — entanglement-radar pass                                   | T15                                                                                                                                                              |
| User-requested polish (2026-07-11, folded in) — marker-line geometry fix | T8 (`produceFamousLabels` leader-line geometry + `markerLineRenderer`); NOT a spec bullet — folded from live-foreground feedback                                 |
| User-requested polish (2026-07-11, folded in) — foreground label parity  | T9 (`foregroundLabelsLayer` / `sceneBodyLabels` adopt famous size + leader line); NOT a spec bullet                                                              |
| User-requested polish (2026-07-11, folded in) — star-label distance gate + declutter | T10 (per-star resolve gate + screen-space declutter on the foreground caption path); NOT a spec bullet                                               |
| User-requested polish (2026-07-11, folded in) — skip foreground pass when zoomed out | T11 (`FOREGROUND_MAX_DISTANCE_MPC` gate across the NEAR0 foreground layers' `enabled`); NOT a spec bullet                                             |
| User-requested polish (2026-07-11, folded in) — Milky Way persists on descent | T12 (retune `milkyWayApproachFadeAlpha` band); NOT a spec bullet                                                                                            |
| User-requested polish (2026-07-11, folded in) — deep-zoom galaxy fade investigation | T13 (investigate survey-point camera-distance fade → land minimal OR capture backlog); NOT a spec bullet                                              |
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

None. Every task has concrete files, signatures, and test names. Task 13 is a deliberate investigate-then-fork (its two branches each name concrete files — the minimal `surveyDeepZoomFade.ts` + test, or a `docs/backlog/` capture) — a decision point by design, not an unresolved placeholder. Tasks 8/9 carry explicit STOP-and-report guards where a needed seam (the director re-upload signature; a foreground marker-line renderer) may not fall out cleanly — surfaced, not invented around.

### Type-name consistency vs the folded surface

`foregroundFrustum`, `resolvesToSphere`, `partitionStarsByResolution`, `apparentSizePx`, `StarBody`, `StarRenderer`/`StarPointRenderer`, `starSpheresLayer`/`starPointsLayer`, `BodyStore`/`state.data.bodies`, `EarthBody`/`SCENE_EARTH`, `deriveSlabs`/`slabViewOf`/`NEAR0`/`COSMO`, `SlabView`, `composeBodyMvp`, `SCALE_UNITS`, `RENDER_ORIGIN_MPC`, `CameraTweenDescriptor`/`startCameraTween`, `MIN_DISTANCE_MPC` — all spelled identically to the folded surface and verified against current code. The pre-fold `foregroundNear`/`foregroundFar`/`foregroundVp`/`renderOrigin` `ReadyFrameContext` fields no longer exist — `ReadyFrameContext` carries `slabs: readonly Slab[]` instead, and the near-field near/far live on the `NEAR0` slab row.

### Contract conflicts / seams found

- **Foreground is now DATA, not a bespoke pass:** the fold deleted `encodeForegroundPass`, `foregroundOffscreen`, `foregroundComposite`, and the four `ReadyFrameContext` foreground fields. T2 lands the adaptive frustum in `slabs.ts` (not `frameContext.ts`); T4 re-homes the star partition to the two Plan-02 layers (not a dispatch inside a hand-encoded pass). No task references any deleted symbol.
- **Keyboard/tween seam (real, re-verified):** `watchFocusTweenSaga` (`src/state/selection/watchFocusTweenSaga.ts`, bails on null runtime at `:46-47`) is the canonical "read `cameraRuntime` from getContext → build a tween via a pure framing helper → `put(startCameraTween)`" pattern; `watchTourKeyboardSaga` (`src/state/tour/watchTourKeyboardSaga.ts`, `routeKeys` at `:42-48`) + `createKeyboardListener` (`src/services/input/createKeyboardListener.ts`) is the canonical keyboard-channel pattern. The fly-to-Earth key (T6) composes both. Sagas are forked from `src/store/rootSaga.ts` (the `all([...])` array + docblock list — re-verify line ranges before editing). The tween descriptor is `CameraTweenDescriptor` (`src/@types/camera/CameraTweenDescriptor.d.ts`: `from`/`to`/`durationMs`/`easing: 'easeOutCubic'`), built exactly as `focusTweenDescriptor.ts:48-53`; `startCameraTween` is `cameraSlice.ts:90`. The plan does NOT invent a new effect method (reuses `startCameraTween`).
- **Next ADR number:** **0009** (`docs/adrs/` ends at `0008-effects-layer-vehicle.md`; the contract's `00NN` resolves to 0009). T14 re-verifies before finalising.
- **ADR-0001 source path is off-`main`:** the cosmic-zoom-plan dir (`docs/superpowers/plans/2026-05-08-cosmic-zoom-powers-of-ten/`) does NOT exist on `main` (it's on the `cosmic-zoom-plan` worktree per project memory). The ADR (T14) references it by path and notes the branch; it does not depend on the file being present.
- **`MIN_DISTANCE_MPC` is `?deepZoom`-gated on `main`:** `hasUrlGate('deepZoom') ? 1e-17 : 0.05` (`clampDistance.ts:50-52`). Plan 03 must NOT touch the gate — un-gating is a release decision. Stated in Global Constraints + Consumes + T4 notes; every VISUAL gate needs `?deepZoom` in the URL. No conflict, just a guardrail.
- **Fixed NEAR0 ratios vs Plan 03 adaptive:** the fold's `slabs.ts` derives `NEAR0`'s near/far from `NEAR0_NEAR_RATIO`/`NEAR0_FAR_RATIO` (1e-4 / 100) and carries a forward-reference comment naming this plan as the replacement; T2 REPLACES that derivation with `foregroundFrustum(cam.distance)` and DELETES the two constants + the comment (this plan is the referenced future). Called out explicitly so the executor removes rather than duplicates.
