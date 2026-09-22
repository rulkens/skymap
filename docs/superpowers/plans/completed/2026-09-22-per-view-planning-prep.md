# Per-view planning prep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development under the lean protocol in `docs/superpowers/conventions/sdd-execution.md` (grouped dispatches, one whole-branch review at the end, CI as the gate). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the frame program a place to plan per view, so that everything a dome face (or a VR eye) consumes is planned for that face — and fix the four latent multi-view bugs the first dome smoke exposed, with mono rendering as it does today.

**Architecture:** A CPU planner becomes a program line (`{ kind: 'plan' }`) with a declared scope, like a compute; its result lands in ONE view-keyed `Plans` store on the frame whose miss throws. Layers contribute planner rows the way they contribute passes and computes; the `Layer.frame` hook retires. Views carry a rig-given `id` and GPU timing slots derive from it. `pxPerRad` joins the shared camera uniform prefix so shader-side pixel sizing stops reconstructing the focal length from the viewport. Milky Way sprites become eye-facing.

**Tech Stack:** TypeScript, WebGPU/WESL, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-19-view-rigs-dome-fisheye-design.md` § "Ground preparation 2 — per-view planning (2026-09-22)". Call-graph fact sheet used to author this plan: the dome worktree's `.superpowers/sdd/2026-09-19-dome-fisheye/prep-callgraph.md` (file:line citations against main 890984682; cite it, don't paste it).

## Global Constraints

- **Mono renders as today.** Every task's mono result at the app's 60° fov is unchanged (bit-identical for T1–T4 and T7; T5 and T6 preserve the look by the retune rule inside them). No behaviour change is allowed to hide inside a refactor commit.
- **Each task is its own commit**, sequenced as listed; prep commits never carry feature behaviour.
- **Frame files declare only their own symbol** (`src/services/engine/frame/**`, incl. `timing/`, `passes/`, `computes/`, `planners/`); helpers go to `src/utils/<area>/<fn>.ts` with a focused test; `tests/services/engine/frame/frameFilePurity.test.ts` budgets only ever shrink — a new frame file needs its own row at 0.
- One symbol per file, one type per file, `type` never `interface`, no barrels, deep relative imports. New `@types` files under `src/@types/engine/frame/`.
- Didactic comments: module header ≤ 5 lines, comment lines ≤ half the code lines. **No backtick inside a `.wesl` comment** (breaks the WESL parser).
- Formatting: `npx prettier --write <the files you touched>` only. Never `npm run format`. Stage by path, never `git add -A`. No `Co-Authored-By` trailer.
- Renames/moves via `npm run move-files -- <from> <to>` / `npm run refactor` (see `.claude/skills/refactor/SKILL.md`), never `git mv` + hand edits.
- `npm run typecheck:fast` is the inner loop; `npm test` must stay green (full suite) before every commit.
- Tests only where a real bug could slip past the compiler and the existing suite (`docs/superpowers/conventions/testing.md`).
- Coordination: PR #800 (dome, branch `worktree-dome-fisheye`) changed `checkFrameOrder`'s signature to take every rig's program. This plan changes the same signature; the merge of main into #800 reconciles it. Do not try to match #800's shape here.

---

## File Structure

**Created**

- `src/@types/engine/frame/SectionScope.d.ts` — `'once' | 'perView'`, lifted out of `FrameSection`.
- `src/@types/engine/frame/PlanStepSpec.d.ts`, `PlanResult.d.ts`, `ContentPlanner.d.ts`, `Plans.d.ts`.
- `src/services/engine/frame/createPlans.ts` — the store.
- `src/services/engine/frame/runPlanSteps.ts` — runs a section's plan rows for one scope target.
- `src/services/engine/frame/planners/index.ts` (`CORE_PLANNERS`), `planners/structureMarkersPlanner.ts`.
- `src/utils/frame/timingSlotForView.ts` — the one view-suffix rule.
- `docs/backlog/2026-09-22-captures-as-views.md`, `2026-09-22-field-uniforms-per-view.md`, `2026-09-22-off-axis-fovy-reconstruction.md`.
- Tests: `tests/services/engine/frame/createPlans.test.ts`, `renderFrame.plans.test.ts`, `tests/utils/frame/timingSlotForView.test.ts`; additions to `checkFrameOrder.test.ts`.

**Modified**

- `src/@types/engine/frame/{FrameSection,FrameStepSpec,ContentCompute,ViewSpec,FrameView,ReadyFrameContext}.d.ts`
- `src/@types/engine/layer/{Layer,LayerInstance}.d.ts`; `src/@types/engine/state/EngineState.d.ts`
- `src/services/engine/frame/{renderFrame,executeFrame,expandFrameOrder,checkFrameOrder,runFrame,frameContext,deriveView,scheduleSkyCaptures,slabs,runMarkerProducers}.ts`, `frame/timing/computeTimingSlotName.ts`, `frame/passes/structureMarkersPass.ts`, `frame/passes/milkyWayPass.ts`, `frame/passes/milkyWayAggregatePass.ts`, `frame/computes/{index,skyViewCompute,aerialPerspectiveCompute}.ts`
- `src/services/engine/layer/instantiateLayer.ts`, `src/services/engine/phases/createLayers.ts`
- `src/layers/galaxyCatalog/{layer,frame}.ts`, `src/layers/flow/{layer,frame}.ts` (+ their computes rows gain `scope`)
- `src/data/rendering/frameSections.ts`, `src/services/engine/frame/frameOrder.ts` (if the flat list survives), `src/services/engine/camera/mainViewSpec.ts` (or wherever the canvas `ViewSpec` is minted), capture face spec builders.
- `src/services/gpu/lib/cameraUniforms.ts` + its 20 `writeCameraPrefix` callers; `src/services/gpu/shaders/lib/{camera,billboard}.wesl`; `structureMarker/ring.wesl`, `starCatalog/vertex.wesl`, `labels/vertex.wesl` consumers' constants; `src/services/engine/presentation/structureMarkerStyles.ts` and every label producer that sets `worldEmMpc`.
- `src/services/gpu/renderers/milkyWay/milkyWayCloudRenderer.ts`, `src/services/gpu/shaders/milkyWay/sprites/{io,stars,dust}.wesl`.
- `src/utils/perf/foldCaptureFaceRows.ts`, `src/components/DebugPanel/GpuTimingsSection.tsx` (only if the fold's signature moves).
- `docs/RENDERER.md` (frame program: plan rows), `docs/BACKLOG.md` (three index lines).
- Tests touched: `frameOrderBoot`, `checkFrameOrder`, `frameFilePurity` (new rows), `renderFrame.*`, `runFrame`, `tests/layers/galaxyCatalog/frame.*.test.ts`, `tests/utils/perf/foldCaptureFaceRows.test.ts`, any fixture that builds a `ReadyFrameContext` or `ViewSpec` literal.

**Deleted**

- `src/@types/engine/layer/LayerFrameVote.d.ts`; `Layer.frame` / `LayerInstance.frame`; `ReadyFrameContext.layersSettling`; the `·FACE[n]` suffix branch in `slabs.ts`; `camRight`/`camUp` in the MW cloud uniform.

---

### Task 1: The plan step, the `Plans` store, the boot rules

**Files:** create `src/@types/engine/frame/{SectionScope,PlanStepSpec,PlanResult,ContentPlanner,Plans}.d.ts`, `src/services/engine/frame/{createPlans,runPlanSteps}.ts`, `src/services/engine/frame/planners/{index,structureMarkersPlanner}.ts`, `tests/services/engine/frame/{createPlans,renderFrame.plans}.test.ts`; modify `FrameSection.d.ts`, `FrameStepSpec.d.ts`, `ContentCompute.d.ts`, `ReadyFrameContext.d.ts`, `EngineState.d.ts`, `frameContext.ts`, `renderFrame.ts`, `expandFrameOrder.ts`, `checkFrameOrder.ts`, `frameOrderBoot.test.ts`, `checkFrameOrder.test.ts`, `frameFilePurity.test.ts`, `computes/{index,skyViewCompute,aerialPerspectiveCompute}.ts`, the flow Layer's compute row, `createLayers.ts` (fold `state.planners`), `runFrame.ts` (delete the `setMarkers` call at `runFrame.ts:356-358`), `runMarkerProducers.ts` (unchanged signature, now called by the planner), `passes/structureMarkersPass.ts`, `data/rendering/frameSections.ts` (one `plan` line at the head of `SCENE`), `docs/RENDERER.md`.

**Contract:**

```ts
// SectionScope.d.ts — lifted out of FrameSection; FrameSection.scope, ContentCompute.scope
// and ContentPlanner.scope all use it.
export type SectionScope = 'once' | 'perView';

// PlanStepSpec.d.ts — FrameStepSpec |= PlanStepSpec
export type PlanStepSpec = { readonly kind: 'plan'; readonly name: string };

// PlanResult.d.ts — the two vote bits are LayerFrameVote's (awake ⊇ settling by convention);
// runFrame ORs them into the scheduler, captures read `settling`.
export type PlanResult<T> = { readonly value: T; readonly awake: boolean; readonly settling: boolean };

// ContentPlanner.d.ts — scope is the ONLY discriminant.
export type ContentPlanner<T> =
  | { readonly name: string; readonly scope: 'once';
      plan(snapshot: ReadyFrameContext, views: readonly FrameView[], state: PassState): PlanResult<T> }
  | { readonly name: string; readonly scope: 'perView';
      plan(view: FrameView, state: PassState): PlanResult<T> };

// Plans.d.ts — ONE home for planned data, on `ReadyFrameContext.plans`, minted per frame.
export type Plans = {
  /** The planned value; THROWS on a miss (unplanned planner, or a view it never planned for). */
  get<T>(planner: ContentPlanner<T>, view?: FrameView): T;
  put<T>(planner: ContentPlanner<T>, view: FrameView | undefined, result: PlanResult<T>): void;
  /** OR-fold of every put result's votes so far this frame. */
  readonly awake: boolean;
  readonly settling: boolean;
};
// createPlans(): Plans — perView values keyed by FrameView identity (WeakMap, the idiom of
// atmosphereDrawListCache / readStarCut), once values by planner name.

// ContentCompute gains `readonly scope: SectionScope`. flow, sky-view, aerial-perspective: 'once' in this task.

// EngineState.planners: readonly ContentPlanner<unknown>[]  (fold: CORE_PLANNERS, Layer rows in Task 2)

// runPlanSteps.ts — runs the `plan` rows at the head of one section:
export function runPlanSteps(
  steps: readonly FrameStepSpec[], planners: readonly ContentPlanner<unknown>[],
  target: { scope: 'once'; snapshot: ReadyFrameContext; views: readonly FrameView[] } | { scope: 'perView'; view: FrameView },
  state: PassState,
): void;  // puts each result into snapshot.plans; a planner missing from `planners` throws
```

**Semantics — planning precedes encoding.** `renderFrame` runs every once-scope section's plan rows (program order) BEFORE `scheduleCubemapCaptures` and before any encoder is created (captures read the settling vote, `scheduleSkyCaptures.ts:38`; see the fact sheet § 3 for why the vote must exist by then). For a perView section, a view's plan rows run before that view's first GPU step (before its encoder opens). `expandFrameOrder` maps `plan` to no GPU step (`EXPAND_STEP.plan = () => []`). `executeFrame` never sees a plan step.

**Boot rules added to `checkFrameOrder`** (it now takes `sections: readonly FrameSection[]`, plus `planners`, instead of the flat order — the flat `FRAME_ORDER` may keep existing for `MAX_PROGRAM`/`pickProgram`, but the check reads sections):

- every registered planner is on exactly one `plan` line (0 → throw, >1 → throw), mirroring the compute rule at `checkFrameOrder.ts:106-118`;
- a `plan` line's planner scope equals its section's scope; a `compute` line's compute scope equals its section's scope (throw naming the step and both scopes);
- every `plan` line precedes every non-plan line of its section (throw: "plan rows lead their section").

**The proving row:** `structureMarkersPlanner: ContentPlanner<readonly StructureMarkerDescriptor[]>` (`scope: 'perView'`, `plan: (view, state) => ({ value: runMarkerProducers(state, view), awake: false, settling: false })`) in `CORE_PLANNERS`; `SCENE` gets `{ kind: 'plan', name: 'structure-markers' }` as its first line. `structureMarkersPass` reads `ctx.snapshot.plans.get(structureMarkersPlanner, ctx)` and uploads via `structureMarkerRenderer.setMarkers(...)` before its draw — one instance buffer is correct because each perView view is its own submit (the same contract the compositor's per-key uniform rides; say so in the pass comment). Delete the call at `runFrame.ts:356-358`.

- [x] Types + `createPlans` + test `createPlans.test.ts`: `get throws for a planner never put`, `get throws for a view another view planned`, `once value is view-independent`, `awake/settling OR-fold across puts`.
- [x] `runPlanSteps` + wiring in `renderFrame` per the semantics; `expandFrameOrder.plan`; `EngineState.planners` folded in `createLayers` (`concatUniqueRows`, as computes at `createLayers.ts:131-134`).
- [x] `checkFrameOrder` over sections + the three rules; tests in `checkFrameOrder.test.ts`: `perView planner in a once section throws`, `once compute in a perView section throws`, `plan row after a render row throws`, `planner on two lines throws`, `unlisted planner throws`; adapt `frameOrderBoot.test.ts` to pass `VIEW_RIGS.mono.program` sections + `CORE_PLANNERS`.
- [x] `renderFrame.plans.test.ts`: with a stub once planner and a stub perView planner and two views, assert (a) the once planner ran once, before `scheduleCubemapCaptures` was invoked (spy call order), (b) the perView planner ran once per view with that view, before that view's encoder was created, (c) `snapshot.plans.get(perViewPlanner, views[1])` returns the second run's value.
- [x] Structure-markers row + pass read + `runFrame` deletion; `ContentCompute.scope` on the three computes; `frameFilePurity` rows for the new frame files (budget 0); `docs/RENDERER.md` frame-program section gains a paragraph on plan rows (scope, head-of-section, `Plans` throws).
- [x] `npm run typecheck:fast`, `npm test` green. Commit `refactor(frame): plan rows and the Plans store`.

### Task 2: Layers contribute planner rows; the `frame` hook retires

**Files:** modify `src/@types/engine/layer/{Layer,LayerInstance}.d.ts`, `instantiateLayer.ts`, `createLayers.ts`, `runFrame.ts:236-250` (delete the hook loop; `layersAwake`/`layersSettling` reads become `snapshot.plans.awake` / `.settling` AFTER `renderFrame` for the scheduler fold at `runFrame.ts:374-392`), `frameContext.ts:124` + `ReadyFrameContext.d.ts:100` (delete `layersSettling`), `scheduleSkyCaptures.ts:38` (read `ctx.snapshot.plans.settling`), `src/layers/galaxyCatalog/{layer,frame}.ts`, `src/layers/flow/{layer,frame}.ts`, `data/rendering/frameSections.ts` (two `plan` lines at the head of `PRELUDE`: `galaxy-catalog`, `flow`), tests `tests/layers/galaxyCatalog/frame.*.test.ts`, `runFrame.test.ts`, any `ReadyFrameContext` fixture; delete `LayerFrameVote.d.ts`.

**Contract:**

```ts
// Layer.d.ts:  planners?(runtime: Runtime): readonly ContentPlanner<unknown>[];   // replaces frame?
// LayerInstance.d.ts: readonly planners: readonly ContentPlanner<unknown>[];      // replaces frame
// galaxyCatalog/frame.ts becomes the row factory (keep the file name; rename the export):
export function galaxyCatalogPlanner(runtime: GalaxyCatalogRuntime): ContentPlanner<void>;  // scope 'once'
export function flowPlanner(runtime: FlowRuntime): ContentPlanner<void>;                    // scope 'once'
```

**Why once, not perView, for the catalog:** the disk walk touches the whole visible catalog (~2.5M rows); per face it is a 5× CPU cost for a threshold nudge. The once row plans over the rig's views: `pxPerRad = max(view.drawPxPerRad over views)`, `cam = views[0].cam` (the anchor contract `computeStarCut.ts:44-47` already states). The implementer confirms `diskPlannerWalk` does not frustum-cull against one view (if it does, report — the union frusta is a follow-up, not this task). Every other piece of `frame.ts:36-122` (alias index, member count, bias mode, hi-res famous planner, disk walk) moves verbatim into the row's `plan`; the vote at `frame.ts:124-134` becomes the `PlanResult` bits with `value: undefined`.

- [x] Types, `instantiateLayer`, `createLayers` fold (`[CORE_PLANNERS, ...instances.map((i) => i.planners)]`).
- [x] galaxyCatalog + flow rows; PRELUDE lines; adapt the four `frame.*.test.ts` to call the planner's `plan(snapshot, [view], state)` — no new tests (the reconcile assertions are unchanged).
- [x] `runFrame` hook loop deleted; scheduler fold reads `plans`; `layersSettling` deleted end to end; `scheduleSkyCaptures` reads `plans.settling`. `runFrame.test.ts` / `renderFrame.cubemapCaptures.test.ts` adapt (a settling planner still marks a capture stale — keep that assertion if it exists, else add it to `renderFrame.plans.test.ts`).
- [x] `npm run typecheck:fast`, `npm test` green. Commit `refactor(layers): planner rows replace the frame hook`.

### Task 3: Views are named; timing slots derive from the name

**Files:** modify `ViewSpec.d.ts` (`readonly id: string`), `FrameView.d.ts` (`readonly id: string`, copied by `deriveView.ts`), the canvas spec minting site (`id: 'canvas'`), capture face spec builders (`id: \`${key}:${face}\``), `slabs.ts:66-96` (`passTimingSlotName(passName, slabIndex, viewId)`, `renderStepTimingSlotName(groupKey, viewId, slot?)`; the `CaptureFaceRef` parameter and the `FACE[n]` text go), `executeFrame.ts:287` and every other slot-name site (pass the view's id), `timing/computeTimingSlotName.ts` (`(stepName, viewId)`), create `src/utils/frame/timingSlotForView.ts` + test, `src/utils/perf/foldCaptureFaceRows.ts` + test, `DebugPanel/GpuTimingsSection.tsx` if the fold's signature changes; fixtures building `ViewSpec` literals gain `id`.

**Contract:**

```ts
// utils/frame/timingSlotForView.ts — the ONE suffix rule (replaces the capture-only FACE rule).
export function timingSlotForView(base: string, viewId: string): string;
//   'canvas' → base;  otherwise `${base}@${viewId}`   e.g. 'hdr·COSMO@sgrAStar:3', 'aerial-perspective-compute@dome:front'
// foldCaptureFaceRows: folds rows whose name ends in `@<key>:<digit+>` onto `<name without suffix>` — same
// display as today; the regex at foldCaptureFaceRows.ts:7 is the only thing that changes.
```

The compute slot takes the suffix too (a perView compute would otherwise claim one slot per view under one name — Task 4 depends on this). `disabledPasses[slot]` keys follow the new names; no migration of persisted settings (they are debug toggles).

- [x] `ViewSpec.id` / `FrameView.id`, minting sites, `deriveView`.
- [x] `timingSlotForView` + test (`canvas gives the bare base`, `a capture face gets @key:face`); `slabs.ts` + `computeTimingSlotName` rewired; `foldCaptureFaceRows` regex + test updated (fold still groups six faces onto one row; a `@dome:front` row is NOT folded).
- [x] `renderFrame.timing.test.ts` / `renderFrame.cubemapCaptures.test.ts` expectations updated to the new slot text.
- [x] `npm run typecheck:fast`, `npm test` green. Commit `refactor(timing): slot names derive from the view id`.

### Task 4: `aerial-perspective` is a per-view compute

**Files:** modify `computes/aerialPerspectiveCompute.ts` (`scope: 'perView'`), `data/rendering/frameSections.ts` (delete line 27; insert `{ kind: 'compute', name: 'aerial-perspective' }` in `SCENE` right after its plan rows, before the first render line), `frameOrderBoot.test.ts` if it pins the PRELUDE compute list.

`encodeAtmosphereAerialPerspective` is unchanged: it already reads the `ctx` it is handed (`encodeAtmosphereAerialPerspective.ts:25-32`); under a perView section that `ctx` is the view. The froxel volume and `shellUniformBuffer` (`aerialPerspectiveRenderer.ts:235-244`) stay one per body: each perView view is its own submit, so the bake for view N lands before view N's apply and after view N−1's — state that contract in the compute's header comment.

- [x] Scope + line move; boot test passes (the scope rule from Task 1 would reject the old placement — add the negative case to `checkFrameOrder.test.ts` if Task 1's `once compute in a perView section` doesn't already cover the mirror).
- [x] Mono eye-check note for the PR body: Søndermarken and the Mars/Perseverance pose render as before.
- [x] `npm run typecheck:fast`, `npm test` green. Commit `refactor(atmosphere): aerial-perspective bakes per view`.

### Task 5: `pxPerRad` in the camera prefix; `worldLenToPx` reads it — **review: yes**

**Files:** modify `src/services/gpu/shaders/lib/camera.wesl:77-82` (`_pad0` → `pxPerRad: f32`; bytes 72..75; struct stays 80 B — update the byte-layout doc at lines 59-75), `src/services/gpu/lib/cameraUniforms.ts:77-85` (`writeCameraPrefix(target, viewProj, viewportPx, pxPerRad)` writes float 18) and its 20 callers (fact sheet § 6 lists them; each passes `ctx.drawPxPerRad` — captures and every view already carry it), `lib/billboard.wesl:225-245` (`worldLenToPx(cam, worldLen, clipW) = worldLen / clipW * cam.pxPerRad`; rewrite the derivation comment), and the retune sites below.

**Retune rule (user ruling 2026-09-22: mono at 60° looks as today).** Old `worldLenToPx` = `L / w · H/2`; new = `L / w · H / (2·tan(fovY/2))`; at 60° the ratio is `1/tan 30° = 1.7321`. Every constant that was tuned by eye against the old conversion folds `tan 30° = 0.57735` (or its inverse) into its own home, as a NAMED factor with a comment saying it preserves the pre-`pxPerRad` look; never a hidden multiplier inside `worldLenToPx` or a shader-global fudge. Physical lengths (a structure's `radiusMpc`, `SOLAR_RADIUS_MPC`, an aggregate's `cellScaleMpc`) are never scaled — only the constants beside them:

| Consumer | Constant(s) to fold | Direction |
|---|---|---|
| `structureMarker/ring.wesl:92` band widths in UV | `RING_PX_WIDTH`, `RING_AA_WIDTH` (their home) | × 1.7321 (the band is a pixel width divided by `sizePx`) |
| `labels/vertex.wesl:58` `pxPerEm` | every producer's `worldEmMpc` (`structureMarkerStyles.ts:65-146` and every other label producer that sets it — grep `worldEmMpc`) | × 0.57735; `minPixelSize`/`maxPixelSize` untouched |
| `starCatalog/vertex.wesl:338` aggregate glow radius | the `0.5` diameter factor (name it) | × 0.57735 |
| `starCatalog/vertex.wesl:417` sphere-resolve fade | `STAR_SPHERE_RESOLVE_PX` | × 1.7321; rewrite the comment at lines 402-408 (the under-report it describes no longer exists) |

Any further `worldLenToPx` caller the implementer finds gets the same treatment and is listed in the report. After this task sizes scale correctly with the fov slider (they did not before); that is the intended behaviour change and goes in the PR body.

- [x] Prefix field + writer + 20 callers; `worldLenToPx` rewrite. No TS twin test (it would restate the formula — same ruling as the spec's P5).
- [x] Retune per the table; each folded constant carries its comment.
- [x] Eye-check list for the user (PR body): mono 60° — structure rings, cosmo labels, famous-galaxy labels, star aggregates, a near star's sprite→sphere hand-off all as before; fov slider 90° — ring bands thinner, labels smaller, consistently.
- [x] `npm run typecheck:fast`, `npm test` green. Commit `fix(shaders): worldLenToPx takes the focal term from the camera prefix`.

### Task 6: Milky Way sprites face the eye — **review: yes**

**Files:** modify `src/services/gpu/shaders/milkyWay/sprites/io.wesl:34-73` (uniform: `camRight`/`camUp` at bytes 144..175 become `camPosModel: vec4<f32>` at 144..159 — the camera position in the cloud's model space, `w` unused — and 16 reserved zero bytes at 160..175; total stays 208 B; update the byte-layout doc), `sprites/stars.wesl:72`, `sprites/dust.wesl:57` (per-instance basis), `milkyWayCloudRenderer.ts:229-249` (pack), `passes/milkyWayPass.ts:111`, `passes/milkyWayAggregatePass.ts:65` (drop `cameraBillboardBasis`, pass the eye in model space — `invModel × drawCamPos`; renormalise nothing here, it is a point).

**Basis contract (mirror `bodies/sgrAStarLensing/vertex.wesl:24-31`):** `forward = normalize(centerModel − camPosModel)`; `right = normalize(cross(ref, forward))`, `up = cross(forward, right)`, with `ref` the cloud's model-space disk normal and a fallback axis when `|cross(ref, forward)|` is tiny, so the basis is defined for every viewing direction. The basis depends only on the instance-to-eye direction, never on a view's axes — that is what makes a blob identical on both sides of a dome seam. Mono: sprites gain a position-dependent roll (they were screen-aligned); the blobs are near-radial, so the look holds — eye-check, and say so in the PR body.

- [x] Uniform layout + pack + both passes; both shaders. (No test: the contract is visual; the existing renderer layout test, if any, updates its byte table.)
- [x] `npm run typecheck:fast`, `npm test` green. Commit `fix(milkyWay): sprites build an eye-facing basis per instance`.

### Task 7: Backlog the adjacent findings

**Files:** create the three `docs/backlog/2026-09-22-*.md` detail files; modify `docs/BACKLOG.md` (three index lines: title + readiness tag + one clause + `→ [details]`).

- **captures-as-views** — the greenfield shape models a capture face as a `role: 'capture'` view in the frame's view list with `roles` on sections and planners as the single exclusion knob; priced at the 2026-09-22 checkpoint as a rework of #769's capture step, not needed by the dome. Record the shape and the price.
- **field-uniforms-per-view** — `packFieldUniforms.ts:132-158` packs its own camera (eye, basis, `tanHalfFov`, aspect, `lensShift`) and `field/fieldSplat/vertex.wesl:24-38` builds NDC itself; must become a view-slot uniform before the v2 field joins the frame order.
- **off-axis-fovy-reconstruction** — `turnedOrbitCamera.ts:31` synthesises an exact `fovYRad` from frustum extents; `horizonShellRenderer.ts:156` / `zoneOfAvoidanceRenderer.ts:161` depend on it; an off-axis (VR) frustum breaks it the way `worldLenToPx` was broken.

- [x] Files + index lines. Commit `docs(backlog): three per-view findings from the dome smoke`.

---

## Definition of Done

**Deliverables**

- `ContentPlanner`, `PlanResult`, `PlanStepSpec`, `Plans`, `SectionScope` types; `createPlans`, `runPlanSteps`, `CORE_PLANNERS` with `structureMarkersPlanner`; `LayerInstance.planners` with galaxyCatalog and flow rows; `Layer.frame`, `LayerFrameVote`, `ReadyFrameContext.layersSettling` gone.
- `checkFrameOrder` rejects: a scope mismatch (plan or compute), a plan row not at its section's head, a planner on zero or two lines.
- `ViewSpec.id` / `FrameView.id`; `timingSlotForView`; no `FACE[` text anywhere in `src/`.
- `aerial-perspective` compute in `SCENE`, scope `perView`.
- `CameraUniforms.pxPerRad`; `worldLenToPx` without `viewportPx`; retune factors named at their homes.
- MW cloud uniform without `camRight`/`camUp`.
- Three backlog detail files + index lines.

**Observable behaviours (manual smoke, mono, dev server)**

- Default 60° view: structure rings, cosmo and famous-galaxy labels, star aggregates, the Milky Way and a near star's sprite→sphere hand-off look as on main.
- FOV slider to 90°: ring bands and labels shrink consistently; nothing pops.
- Søndermarken (`aerial-perspective·BODY` row present in the timings panel) and the Mars/Perseverance pose render as on main.
- Timings panel: capture rows still fold to one row per pass; no duplicate slot names.
- Thumbnail fade (settling) still holds the sky capture stale until it ends (no stale reflection on the lens while textured disks fade in).

**Deferral boundary**

- Label directors and 3-D label producers stay in `runFrame` (OVERLAYS stays `once`); they become rows when dome text lands.
- Star cut and surface-tile cut stay in `runFrame`; the star Layer PR owns its once-scope row.
- The five per-renderer `pxPerRad` uniform copies stay for the feature's deletion audit.
- Per-view disk LOD (walk per view) is explicitly not done; the once row over the views is the shape.
- The dome rig, `DOME_PARAMS`, and dome view ids live on #800; the merge adds their `id`s.

---

Completed 2026-09-22 on PR #805. Names ruled at the eye-check: `Plans` → `FramePlannerResultStore`, `PlanStepSpec` → `PlannerStepSpec`, `PlanTarget` → `PlannerScopeTarget`, `PlanResult` → `PlannerResult`, `ContentPlanner` → `FrameContentPlanner`, `createPlans` → `createFramePlannerResultStore`. Task 5's ring row and label row were wrong (band widths invariant; `worldEmMpc` physical) — see the PR body.
