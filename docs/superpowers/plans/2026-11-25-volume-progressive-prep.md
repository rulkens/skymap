# Progressive volume sampling: ground preparation (prep PR)

**Goal.** Land the behaviour-neutral prep refactors of
[the spec](../specs/2026-11-25-progressive-volume-sampling-design.md) §4, so the feature PR (§5)
only has to:

- add a per-view planner;
- flip `retained: true` on one target row;
- name that planner on one `FRAME_ORDER` line.

Nothing in this plan accumulates, sets `retained`, or reads `prev` or `stillFrames` outside a unit
test.

**Base.** `main` at `bfff3d7d8`, in a fresh worktree. The `volume-progressive-octree` worktree
holds uncommitted spike code (`volumeFieldRenderer.ts`, both `scalarVolume` shaders,
`executeFrame.ts`, `frameSections.ts`, `tierSlice.ts`, `spike/`, `tools/spike/`). None of it rides
along, and no task cites it.

**Commits.** Seven tasks, one commit each, in the spec §4 order. Each commit is green on its own.

| # | Task | Spec |
| --- | --- | --- |
| 1 | One shared WESL struct-layout test helper | §4.4 |
| 2 | The volume renderer takes its jitter index, step count and weight as inputs | §4.1 |
| 3 | The star planner reads the engine frame index | §4.5 |
| 4 | `renderTargets` holds a retained row's textures per view id | §4.2 |
| 5 | The executor loads a retained target unless its planner value says `restart` | §4.2 |
| 6 | Per-view planners receive `prev` from the plan runner | §4.3 |
| 7 | Core fills `FrameView.stillFrames` | §4.3 |

## Rulings (2026-11-25) this plan is written against

1. `PassState` gains `frameIndex` (Task 2). It was missing (`PassState.d.ts:10-13`).
2. `ScalarVolumePassRow` gains `inputs(state, ctx)` (Task 2).
3. `prev` goes to **per-view planners only**. The once arm of `FrameContentPlanner` and every
   once-scope planner stay untouched.
4. **Nothing is added to `FramePlannerResultStore`'s type.** The plan runner keeps last frame's
   per-view values itself. Neither passes nor planners can reach that memory.
5. The WESL struct-layout parser becomes one shared test helper, in its own commit, ahead of the
   uniform task.
6. The star planner's closure frame counter is replaced in this PR (Task 3, traced below).

### Where the code differed from the first draft of the spec (now folded into it)

- **`prev` cannot be the last parameter.** `plan` already ends in the rest tuple `...fade`
  (`FrameContentPlanner.d.ts:42`), and TS allows nothing after a rest parameter. `prev` therefore
  goes just before it. Only one planner is affected: `structureMarkersPlanner`, the sole per-view
  planner, which declares `fade`. It takes an unused `_prev`.
- **The executor has no "just allocated" fact.** `touched` lives for one program run
  (`executeFrame.ts:195`), and `renderTargets` keeps no record of what it allocated this frame.
  Instead, `renderTargets` clears a retained texture when it allocates it, through its own
  encoder. This is the same path that already clears the far-depth placeholder
  (`renderTargets.ts:304-318`).
- **View ids exist only after `reconcile`.** `reconcile` runs at `runFrame.ts:68`, and the views are
  derived later, at `runFrame.ts:181-196`. `reconcile` cannot move later: `domeFaceSpecs` reads
  `layerViewOf('dome-cube')` at `domeFaceSpecs.ts:34`. The fix is a second method,
  `reconcileViews(state, viewIds)`, called right after the views are derived.
- **The volume uniform has no slot for `weight`.** `weight` is the blend constant, matching §5's
  `(constant, one)` field blend. At weight 1 this is identical to today's additive blend. The
  uniform grows by `steps` only: 260 B rounded up to 16 gives 272 B.
- **The jitter index is the frame index, not the sample number.** On a moving camera every frame
  restarts, so a sample-number index would be 0 on every moving frame. That is the screen-locked
  grain recorded at `fragment.wesl:216-224`. The field is named `jitterIndex`, and the spec says so.
- **The planner count is 10, not 11.** There are 10 planners in 8 Layers;
  `createGalaxyFieldHost.plan` is not a `FrameContentPlanner`.
- **Exact rest holds.** `stepNavigator` snaps velocities below `NAV_REST_EPS` to 0
  (`stepNavigator.ts:89-96`). Near and far are constants (`stepCameraRuntime.ts:136-137`).
  `computeViewProj` returns a fresh `Float32Array` per call.
- **The store keeps keying by view identity.** An earlier draft re-keyed `FramePlannerResultStore`
  by `view.id`. That was only needed for a `prev` read through the store, which ruling 4 removed.
  The store is untouched.

---

## Task 1 — §4.4: one shared WESL struct-layout test helper

**Files:**
- `tests/helpers/wesl/weslStructLayout.ts` (create)
- `tests/helpers/wesl/@types/WeslStructLayout.ts` (create: the return type, as
  `tests/helpers/starCatalog/@types/ReferenceStarCut.ts` sits beside `referenceStarCut.ts`; a
  sibling `WeslStructLayout.ts` is the same file as `weslStructLayout.ts` on a case-insensitive
  disk)
- `tests/layers/blackHoles/lensing/render/blackHoleLensingUniformsLayout.parity.test.ts` (modify)
- `tests/layers/body/atmosphere/render/atmosphereUniformsLayout.parity.test.ts` (modify)
- `tests/layers/body/surfaceTiles/patch/render/surfaceTileLayout.test.ts` (modify)
- `tests/services/gpu/shaders/asteroidPoints.parity.test.ts` (modify)
- `tests/tools/scene-workbench/render/sceneCamera.parity.test.ts` (modify: a fifth copy the
  ruling did not count, migrated too so no copy is left behind)

**Contract.**

```ts
// tests/helpers/wesl/WeslStructLayout.ts
export type WeslStructLayout = {
  /** Declaration order; `offset` and `size` in bytes. */
  readonly fields: readonly {
    readonly name: string;
    readonly type: string;
    readonly offset: number;
    readonly size: number;
  }[];
  /** The struct's byte size under the address space's rounding rule. */
  readonly size: number;
};

// tests/helpers/wesl/weslStructLayout.ts
export function weslStructLayout(
  source: string,
  structName: string,
  addressSpace: 'uniform' | 'storage',
): WeslStructLayout;
```

- **Types it must lay out.** It covers the union of what the five copies handle: `f32`, `i32`,
  `u32`, `vec2<f32>`, `vec2<u32>`, `vec3<f32>`, `vec4<f32>`, `mat3x3<f32>` (align 16, size 48),
  `mat4x4<f32>`, `CameraUniforms` (align 16, size 80, opaque) and `array<vec4<f32>, N>`
  (align 16, size 16·N). Any other type throws, naming the type and the field.
- **Size rounding.** `'uniform'` rounds the struct size up to a multiple of 16; `'storage'` rounds
  it to the largest member alignment. Each caller passes the address space of its binding.
- **Parsing.** It handles three cases the copies already do:
  - multi-line `//` doc comments (`surfaceTileLayout.test.ts:50-54` strips them per physical line);
  - a missing trailing comma on the last field;
  - commas inside generics (`array<vec4<f32>, 4>`, from `asteroidPoints.parity.test.ts`).
- **Callers keep their own lane logic.** Lanes, kinds and mat3 column handling stay in each test
  and are derived from `type` and `offset`. The helper only reports where each field sits.

Steps:

- [x] Write the helper, then switch each of the five tests to it and delete its private
      `WESL_TYPES` / `WGSL_TYPE` / `roundUp` / `structFields` / `structLayout` / `layoutOf`.
      Keep every assertion unchanged. Those unchanged assertions passing is the proof that the
      helper reproduces each copy.
- [x] No test of the helper itself: five parity tests exercise it against independent packers.
- [x] `npm run typecheck:fast`, then
      `npm test -- blackHoleLensingUniformsLayout atmosphereUniformsLayout surfaceTileLayout asteroidPoints sceneCamera`.

**Done when:** the five listed tests lay their structs out with the shared helper and pass with
their assertions untouched. Other private layout parsers (the packed mcpm-workbench layouts,
`starUniformsLayout`, `starCutLayout`, `labelRecord`, `packIsmMapFluidConstants`) are out of scope.

---

## Task 2 — §4.1: `draw` takes `VolumeFieldDrawInputs`; step count and jitter index leave the renderer

**review: yes** (shader, TS↔WGSL uniform contract, blend state)

**Files:**
- `src/@types/rendering/VolumeFieldDrawInputs.d.ts` (create)
- `src/@types/rendering/VolumeFieldRenderer.d.ts` (modify: `draw` signature)
- `src/@types/engine/frame/ScalarVolumePassRow.d.ts` (modify: `inputs`)
- `src/@types/engine/frame/PassState.d.ts` (modify: `'frameIndex'` joins the `Pick`)
- `src/services/gpu/renderers/volumeField/volumeFieldRenderer.ts` (modify)
- `src/services/gpu/shaders/scalarVolume/fragment.wesl` (modify)
- `src/services/gpu/lib/blendStates.ts` (modify: header lists only)
- `src/services/engine/frame/passes/createScalarVolumePass.ts` (modify)
- `src/layers/cosmicWebDensity/densityCubes/data/densityMarchSteps.ts` (create)
- `src/layers/cosmicWebDensity/densityCubes/passes/cosmicWebDensityPass.ts` (modify)
- `tests/services/gpu/renderers/volumeField/volumeFieldRenderer.test.ts` (modify)
- `tests/services/gpu/renderers/volumeField/volumeUniformsLayout.parity.test.ts` (create)
- `tests/services/engine/frame/passes/createScalarVolumePass.test.ts` (modify: `makeRow` default)
- `tests/packages/website/docsRenderingFacts.test.ts` (modify)

`vertex.wesl` does not change. Its `VolumeUniforms` is a 240 B prefix, inside a 272 B binding.

**Contract.**

```ts
// src/@types/rendering/VolumeFieldDrawInputs.d.ts
export type VolumeFieldDrawInputs = {
  /** Index into the jitter sequence: the engine frame index. */
  jitterIndex: number;
  /** March steps per ray. */
  steps: number;
  /** Blend constant each field's march is scaled by as it adds into the target; 1 = plain additive. */
  weight: number;
};

// VolumeFieldRenderer.draw — one parameter appended
draw(pass, viewProj, viewportPx, pxPerRad, cameraPosWorld, settingsOf, fadeOpacityOf,
     inputs: VolumeFieldDrawInputs): void;

// ScalarVolumePassRow — one member
/** This view's march inputs, read once per draw. */
inputs(state: PassState, ctx: FrameView): VolumeFieldDrawInputs;

// src/layers/cosmicWebDensity/densityCubes/data/densityMarchSteps.ts
export const DENSITY_MARCH_STEPS = 128;   // §5 replaces it with STEPS_BY_TIER
```

The field pipeline's blend is a local constant in `volumeFieldRenderer.ts`. `blendStates.ts`'s
rule is that a blend used at a single site stays at that site.

```ts
const WEIGHTED_ADDITIVE_BLEND: GPUBlendState = {
  color: { srcFactor: 'constant', dstFactor: 'one', operation: 'add' },
  alpha: { srcFactor: 'constant', dstFactor: 'one', operation: 'add' },
};
```

**Uniform block, 256 → 272 B.** Bytes 0–251 are unchanged (`volumeFieldRenderer.ts:360-378`).

| Bytes | Float index | Field | WGSL type | Written from |
| --- | --- | --- | --- | --- |
| 252–255 | 63 | `jitterIndex` (renamed from `frame`) | `f32` | `inputs.jitterIndex % JITTER_INDEX_WRAP` |
| 256–259 | 64 | `steps` | `f32` | `inputs.steps` |
| 260–271 | 65–67 | padding (uniform struct rounded up to 16) | — | zeroed |

```wgsl
// fragment.wesl, tail of struct VolumeUniforms (`frame` at :91-98 becomes jitterIndex)
  trim: f32,
  jitterIndex: f32,
  steps: f32,
};  // 272 B
```

- **`steps` type.** It is `f32` like every scalar in the struct, and integer-exact far past any
  step count.
- **The wrap.** `JITTER_INDEX_WRAP` is `FRAME_WRAP` renamed (`volumeFieldRenderer.ts:72-77`). It
  stays in the renderer because it guards the shader's f32 hash input, and `frameIndex` is never
  wrapped upstream.

Steps:

- [x] Add the type file and the `draw`, `ScalarVolumePassRow` and `PassState` changes.
- [x] Renderer:
  - Delete `let frame` and its increment (`volumeFieldRenderer.ts:206-212, 384`).
  - Set `UNIFORM_BYTES` to 272. Pack indices 63 and 64 per the table, and zero 65–67 (the
    scratch is reused across fields).
  - Call `pass.setBlendConstant({ r: w, g: w, b: w, a: w })` once per `draw`, before the field
    loop.
  - Switch the target blend at `:181-186` to `WEIGHTED_ADDITIVE_BLEND`.
  - Rewrite the layout comments at `:63-69` and `:360-381`, and bring the module header (`:1-46`)
    under 10 lines (comments.md, opportunistic rule).
- [x] Shader:
  - Delete `const STEP_COUNT` (`fragment.wesl:117`).
  - The step length and the loop bound read `uniforms.steps` (`:203-204, :233`).
  - The jitter seed reads `uniforms.jitterIndex` (`:229`).
  - Update the field doc (`:91-98`) and the temporal-seed comment (`:216-224`).
  - No other expression changes.
- [x] `blendStates.ts` header: drop "the volume field" from the ADDITIVE users (`:14`, `:55`), and
      add the weighted additive under "What deliberately does NOT fold in here".
- [x] Pass:
  - `createScalarVolumePass` passes `erased.inputs(state, ctx)` as `draw`'s last argument
    (`createScalarVolumePass.ts:32-42`).
  - `cosmicWebDensityPass` supplies
    `inputs: (state) => ({ jitterIndex: state.frameIndex, steps: DENSITY_MARCH_STEPS, weight: 1 })`.
  - No new test: this is plumbing.
- [x] Test file `volumeUniformsLayout.parity.test.ts`, test `VolumeUniforms layout: every field
      the WGSL struct declares lands at its offset`:
  - Lay out `fragment.wesl`'s struct with `weslStructLayout(…, 'VolumeUniforms', 'uniform')`.
  - Drive the real `draw` on a mock device with a distinct sentinel per field (settings, statics,
    camera position, the cube's model matrix, `inputs`).
  - Assert each sentinel sits at its field's offset.
  - Assert the layout size is 272, equal to the uniform buffer's `createBuffer` size and to the
    written scratch's byte length.
- [x] Same file, test `vertex.wesl's VolumeUniforms is a prefix of fragment.wesl's`: its fields
      equal the fragment struct's first N, by name, type and offset.
- [x] `volumeFieldRenderer.test.ts`:
  - `uniformScratch` finds the 68-float scratch, and the fake pass gains `setBlendConstant`.
  - Add `draw packs jitterIndex modulo the wrap`: 1 000 005 packs 5 at index 63.
  - Add `draw sets the blend constant to inputs.weight`: 0.25 gives
    `setBlendConstant({r:.25,g:.25,b:.25,a:.25})`. A missing call is a real bug: WebGPU's default
    blend constant is 0, which erases the volume.
- [x] `docsRenderingFacts.test.ts:99-102`: read `DENSITY_MARCH_STEPS` from
      `src/layers/cosmicWebDensity/densityCubes/data/densityMarchSteps.ts` instead of
      `STEP_COUNT`. The fact text (`packages/website/src/data/docsRenderingFacts.ts:166-170`)
      still says 128.
- [x] `npm run typecheck:fast`, `npm test -- volumeField createScalarVolumePass docsRenderingFacts`.
- [ ] Controller, after the commit: shoot an inside-the-MCPM-cube pose, mono and dome, on main and
      on this branch (`npm run shot`), and send the pairs to the dash as a check: same structure
      and brightness, grain only. Pixels cannot match exactly, because the jitter phase now
      follows `frameIndex` and a shot renders an arbitrary number of frames.

**Done when:**

- The renderer holds no counter.
- The 272 B struct is pinned by the parity test.
- At weight 1 the blend sums exactly as `ADDITIVE_BLEND` did.
- The five dome faces share one jitter phase per frame. The old counter advanced five times per
  dome frame.

---

## Task 3 — §4.5: the star planner reads the engine frame index

**Files:**
- `src/layers/starCatalog/frame.ts` (modify)
- `tests/layers/starCatalog/frame.test.ts` (modify)

**What the counter is for.** `frameIndex` (`starCatalog/frame.ts:36`) is incremented once per
`plan` call (`:67`). It has two readers:

- the chunk-plan cadence, `frameIndex - plannedFrame >= STAR_PLAN_INTERVAL_FRAMES` (`:90`), with
  `plannedFrame = frameIndex` at `:94`;
- the chunk pool's LRU clock, `stream.update(frameIndex, …)` (`:104`). The comment at `:35` says
  any strictly increasing count serves.

The closure never resets it. The slots override at `:59-63` resets `plannedCut`, not the counter.

**Why `state.frameIndex` gives the same numbers.** `state` is the planner's `PassState`, which
carries `frameIndex` after Task 2. Three facts line up:

- The `star-catalog` plan line sits in `PRELUDE` (`frameSections.ts:20`), the first section of
  both rigs (`viewRigs.ts`, mono and dome). It runs exactly once per `renderFrame`, at
  `renderFrame.ts:64-75`, and `gatePlannerByFade` never skips it.
- `renderFrame` increments `state.frameIndex` first, at `renderFrame.ts:28`, from a seed of 0
  (`engine.ts:248`). No other path increments it.
- The closure starts at 0 and increments before use.

So both counts read 1 on the first planned frame and stay equal for the engine's lifetime. A
re-created engine resets both, because the Layer's planner closure is re-created with it.

Steps:

- [x] Delete the closure `frameIndex` and its increment. `:90`, `:94` and `:104` read
      `state.frameIndex`. Update the `:35` comment, which moves to the reads. `plannedFrame` stays
      in the closure: it is the cadence anchor, not a counter.
- [x] `frame.test.ts`: every `plan` call gets its own `frameIndex`. `STATE` (`:81`) becomes a
      per-call value with a counter the test advances. The cadence tests must still see a plan
      every `STAR_PLAN_INTERVAL_FRAMES` calls. No new test.
- [x] `npm run typecheck:fast`, `npm test -- starCatalog`.

**Done when:** the planner holds no frame counter, and its cadence and LRU clock are unchanged
frame for frame.

---

## Task 4 — §4.2: `renderTargets` holds a retained row's textures per view id

**Files:**
- `src/@types/engine/frame/RenderTargetSpec.d.ts` (modify)
- `src/@types/rendering/RenderTargets.d.ts` (modify)
- `src/@types/engine/frame/ViewSpec.d.ts` (modify: the `id` doc at `:14-16`, which says
  `timingSlotForView` is its only reader)
- `src/services/gpu/renderTargets.ts` (modify)
- `src/services/engine/frame/runFrame.ts` (modify: one call)
- `src/services/engine/frame/executeFrame.ts` (modify: `viewFor` passes `ctx.id`)
- `src/services/engine/frame/passes/createUpsamplePass.ts` (modify: passes `ctx.id`)
- `tests/services/gpu/renderTargets.test.ts` (modify)
- typed `RenderTargets` stubs that fail typecheck (add `reconcileViews: () => {}`)

**Contract.**

```ts
// RenderTargetSpec
/** Keep contents across frames: one texture per view id, cleared on (re)allocation and whenever
 *  the drawing step's planner value says `restart`. Rejected at construction with `depth` or `layers`. */
retained?: true;

// RenderTargets
/** `viewId` selects a retained row's texture for that view and is ignored for every other row.
 *  Throws for a retained row without a `viewId`, or one `reconcileViews` has not seen. */
viewOf(id: string, viewId?: string): GPUTextureView;
/** Allocate (and clear) each retained row's texture for every id in `viewIds` that lacks one, at
 *  the row's held size; release the textures of ids absent from `viewIds`. Rows without
 *  `retained` are untouched. `runFrame` calls it once per frame, after deriving the views. */
reconcileViews(state: EngineState, viewIds: readonly string[]): void;
```

- **Size.** A retained row records its size in `sizes` like any row, so `sizeOf(id)` is unchanged.
  Every view of a frame is canvas-sized (`domeFaceSpecs.ts:32`). The row holds no row-level
  texture.
- **Reallocation and release.** `reconcile` reallocates and clears every per-view texture of a
  retained row whose size moved. `release` (from `allocateWhen`) and `destroy` free all of them.
- **Clearing.** Each retained allocation is cleared to `clearValueOf(spec, state)`. All clears go
  through one encoder per call that allocated anything, submitted immediately, as at
  `renderTargets.ts:304-318`.
- **Label.** `` `render-target-${id}@${viewId}` ``, so the GPU-memory ledger shows one row per view.
- **Construction guard.** `createRenderTargets` throws for `retained` together with `depth` or
  `layers > 1`.
- **`runFrame` wiring.** Right after `views` is set (`runFrame.ts:192-196`):
  `snapshot.renderTargets.reconcileViews(state, views.map((view) => view.id))`.
- **Callers that pass a view id.** `executeFrame`'s `viewFor` (`:118-121`) calls
  `viewOf(id, ctx.id)`. `createUpsamplePass.ts:24` calls `viewOf(row.sourceTargetId, ctx.id)`. No
  other caller reads a retained row.

Steps:

- [x] Types, then `renderTargets.ts`. The retained maps sit beside the existing ones
      (`:267-286`) and are cleared by `release` / `destroy` (`:393-404`, `:509-520`).
- [x] Test `a retained row keeps one texture per view id across frames`: reconcile, then
      `reconcileViews(['canvas'])` twice.
  - Exactly one `createTexture` carries the retained row's label.
  - `viewOf(id, 'canvas')` returns the same object both times.
  - A non-retained row's texture count is unchanged by `reconcileViews`.
- [x] Test `a view id absent from a frame frees its retained texture`: call with `['a','b']`,
      then `['a']`.
  - b's texture is destroyed, and `viewOf(id, 'b')` throws.
  - a's texture is neither destroyed nor replaced.
- [x] Test `a fresh retained texture is cleared to the row's clear value`: the mock encoder records
      a `beginRenderPass` on the new view with `loadOp: 'clear'` and the row's `clearValue`, and
      the encoder is submitted.
- [x] Test `a resize reallocates every view's retained texture at the new size, cleared`: two
      view ids, then a new canvas size.
  - Both old textures are destroyed.
  - The new textures have the new size, and each gets a clear pass.
- [x] Test `viewOf on a retained row throws without a view id`.
- [x] `npm run typecheck:fast`, `npm test -- renderTargets runFrame executeFrame createUpsamplePass`.

**Done when:** no shipped row is retained, so the frame allocates what it did before, and
`reconcileViews` finds nothing to do.

---

## Task 5 — §4.2: the executor loads a retained target unless the step's planner value says `restart`

**Files:**
- `src/@types/engine/frame/RenderStepSpec.d.ts` (modify)
- `src/@types/engine/frame/FrameStep.d.ts` (modify: render arm)
- `src/services/engine/frame/expandFrameOrder.ts` (modify)
- `src/services/engine/frame/restartRequested.ts` (create)
- `src/services/engine/frame/executeFrame.ts` (modify)
- `tests/services/engine/frame/executeFrame.test.ts` (modify)

**Contract.**

```ts
// RenderStepSpec and FrameStep's render arm
/** A per-view planner planned earlier in this section whose value's `restart` decides a retained
 *  target's first-touch clear. Required on a step whose target row is `retained`. */
readonly restartPlanner?: string;

// src/services/engine/frame/restartRequested.ts — its own file: executeFrame's inline-helper
// allowance in serviceFilePurity is already used up (5)
export function restartRequested(
  plannerName: string,
  view: FrameView,
  planners: readonly FrameContentPlanner<unknown>[],
): boolean;
// Throws when no planner has that name, or when the value's `restart` is not a boolean. Either
// wiring bug would otherwise load forever and pile up additively.
```

The first-touch rule in the target-row branch (`executeFrame.ts:314-340, 370`), before and after:

```
alreadyTouched = touched.has(target)
alreadyTouched = touched.has(target) || (spec.retained && !restartRequested(step.restartPlanner, ctx, state.planners))
```

- A retained target whose step has no `restartPlanner` throws.
- `restartRequested` is evaluated only on a retained target's first touch in the program.
- Later touches load, as today.
- The decision reads the row's flag and the step's named planner, never a target id.

Steps:

- [x] Types. `expandFrameOrder`'s render expander (`:88-97`) copies `restartPlanner` the way it
      copies `slot`. `sameGroup` (`:133-144`) compares it, because it shapes the pass descriptor.
      No test for the merge key: no authored line pairs two same-group steps with different values.
- [x] `restartRequested` reads `view.snapshot.plans.get(planner, view)`.
- [x] Executor: apply the rule above. Add one sentence to the module header's "First-touch clear"
      section.
- [x] Test `a retained target loads on first touch when its planner value does not restart`:
  - Fixture: a `retained: true` row, a per-view planner whose stored value is
    `{ restart: false }`, and one render step naming it.
  - Expect `loadOp: 'load'`, on the view that `viewOf(id, ctx.id)` returns.
- [x] Test `a retained target clears on first touch when its planner value says restart`: with
      `{ restart: true }`, expect `loadOp: 'clear'` with the row's `clearValue`.
- [x] Test `a retained target's step without restartPlanner throws`.
- [x] `npm run typecheck:fast`, `npm test -- executeFrame expandFrameOrder checkFrameOrder`.

**Done when:** no shipped line sets `restartPlanner`, so every pass descriptor is byte-identical to
today's, and the existing `executeFrame` suite stays green unchanged.

---

## Task 6 — §4.3: per-view planners receive `prev` from the plan runner

**Files:**
- `src/@types/engine/frame/FrameContentPlanner.d.ts` (modify: the `'perView'` arm only)
- `src/@types/engine/frame/PerViewPlanMemory.d.ts` (create)
- `src/@types/engine/frame/PlannerScopeTarget.d.ts` (modify: the `'perView'` arm)
- `src/@types/engine/state/EngineState.d.ts` (modify: `perViewPlanMemory`)
- `src/services/engine/engine.ts` (modify: seed `perViewPlanMemory: new Map()` beside
  `frameIndex: 0`, `:248`)
- `src/services/engine/frame/runPlanSteps.ts` (modify)
- `src/services/engine/frame/renderFrame.ts` (modify)
- `src/services/engine/layer/gatePlannerByFade.ts` (modify: the per-view wrapper)
- `src/layers/structure/frame.ts` (modify: `_prev`)
- `tests/services/engine/frame/renderFrame.plans.test.ts` (modify)
- `tests/services/engine/layer/gatePlannerByFade.test.ts` (modify)

**Untouched:**
- `FramePlannerResultStore`, its type and its tests (ruling 4);
- the `'once'` arm of `FrameContentPlanner` (ruling 3);
- the nine once-scope planners.

The 10 planners in 8 Layers are:

- body: `surfaceTilePlanner`, `atmosphereRosterPlanner`
- flow
- galaxyCatalog: `galaxyCatalogPlanner`, `galaxyDisksPlanner`
- milkyWay
- satellites
- starCatalog
- stellarStreams
- structure: `structureMarkersPlanner`, the only per-view one

**Contract.**

```ts
// FrameContentPlanner, 'perView' arm — prev sits before the fade rest tuple
plan(view: FrameView, state: PassState,
     prev: T | undefined, ...fade: FadeParam<K, ShowKey>): PlannerResult<T>;

// src/@types/engine/frame/PerViewPlanMemory.d.ts
/** One frame's per-view planner values: planner name → view id → value. */
export type PerViewPlanMemory = ReadonlyMap<string, ReadonlyMap<string, unknown>>;

// PlannerScopeTarget, 'perView' arm gains two members
/** Last frame's values; `runPlanSteps` reads `prev` here. */
readonly previous: PerViewPlanMemory;
/** This frame's values, filled beside each `put`; `renderFrame` installs them for next frame. */
readonly next: Map<string, Map<string, unknown>>;

// EngineState — engine-private: PassState does not pick it, so no pass or planner reaches it
/** Last rendered frame's per-view planner values. `renderFrame` is its only writer. Empty before the first frame. */
perViewPlanMemory: PerViewPlanMemory;
```

How the memory works:

- **Write.** `renderFrame` creates `next` once per frame and hands
  `{ previous: state.perViewPlanMemory, next }` to every per-view `runPlanSteps` call
  (`renderFrame.ts:159`). As its last statement it sets `state.perViewPlanMemory = next`.
- **Read.** `runPlanSteps` reads `prev` as `previous.get(planner.name)?.get(view.id)`. It writes
  the result's `value` into `next` at the same statement as the `put`
  (`runPlanSteps.ts:45-46`), so the two cannot disagree.
- **Eviction.** No sweep is needed. A view id absent from a frame never enters that frame's
  `next`, so it has no `prev` when it returns. The same holds for a planner whose plan line did
  not run.

Steps:

- [ ] Types and `engine.ts` seed, then `runPlanSteps`, `renderFrame` and the per-view wrapper in
      `gatePlannerByFade` (`:36-40`), which forwards `prev` ahead of the handed value.
- [ ] `structureMarkersPlanner` takes `_prev` (`structure/frame.ts:27`). The compiler flags it,
      because the old `fade` position is now contextually typed as `prev`.
- [ ] Test in `renderFrame.plans.test.ts`: `a perView planner gets its own view id's previous
      value as prev, and undefined for an id absent last frame`.
  - The planner returns `(prev ?? 0) + 1`.
  - Run three `renderFrame` calls on one `state`, each with a fresh store, with views `[a, b]`,
    then `[a]`, then `[a, b]`.
  - Frame 3 reads a = 3, b = 1.
  - Give the fixture views ids: `makeView` builds none today.
- [ ] Test in `gatePlannerByFade.test.ts`: `the per-view gate hands prev through ahead of the
      handed value`. The inner `plan` receives `(view, state, prev, fade)` with the sentinel
      `prev` intact. A wrapper that drops `prev` still compiles, so only this test catches it.
- [ ] `npm run typecheck:fast`, `npm test -- renderFrame gatePlannerByFade structure`.

**Done when:**

- Every planner's output is unchanged.
- The engine keeps exactly one frame of per-view planner values.
- `renderFrame` is the single writer, and nothing outside the plan runner reads them.

---

## Task 7 — §4.3: core fills `FrameView.stillFrames`

**Files:**
- `src/@types/engine/frame/FrameView.d.ts` (modify)
- `src/@types/engine/state/EngineState.d.ts` (modify: `previousViews`)
- `src/services/engine/engine.ts` (modify: seed `previousViews: new Map()`)
- `src/utils/frame/stillFramesOf.ts` (create)
- `src/services/engine/frame/deriveView.ts` (modify)
- `src/services/engine/frame/runFrame.ts` (modify)
- `src/@types/engine/frame/ViewSpec.d.ts` (modify: the `id` doc names every reader that keys on it)
- `tests/utils/frame/stillFramesOf.test.ts` (create)
- `tests/services/engine/frame/runFrame.test.ts` (modify)
- any typed `FrameView` literal that fails typecheck (e.g.
  `tests/layers/body/glints/passes/bodyGlintsPass.test.ts:573`)

**Contract.**

```ts
// FrameView
/** Frames since this view id's `vp` or `canvasSize` last changed; 0 on the frame it changed and on
 *  a view with no previous derivation (capture faces, pick). Compared exactly: rest is exact. */
stillFrames: number;

// deriveView — optional last parameter; every existing call site compiles unchanged
deriveView(snapshot: ReadyFrameContext, cam: OrbitCamera, spec: ViewSpec, previous?: FrameView): FrameView;

// src/utils/frame/stillFramesOf.ts (deriveView.ts is a frame file: no inline helper)
export function stillFramesOf(previous: FrameView | undefined, vp: Mat4, sizePx: Size): number;

// EngineState
/** Last frame's derived views by id; `runFrame` is its only reader and writer. */
previousViews: ReadonlyMap<string, FrameView>;
```

- **Wiring.** `runFrame` (`:178-196`) builds the canvas spec into a const and derives it with
  `state.previousViews.get(spec.id)`. It derives the rig views the same way, then sets
  `state.previousViews = new Map([canvas, ...views].map((v) => [v.id, v]))`.
- **View identity is kept.** In mono, `canvas === views[0]`, and `renderFrame`'s one-submit
  batching relies on that. Never stamp the field by spreading a view.
- **Eviction** comes with the old map: ids absent this frame drop out.
- **No history.** Capture-face and pick derivations pass no `previous` and read 0.

Steps:

- [ ] Type and util, then `deriveView` sets `stillFrames: stillFramesOf(previous, vp, sizePx)` in
      its return (`deriveView.ts:131-147`), then `runFrame`.
- [ ] `stillFramesOf.test.ts`, with hand values:
  - `no previous derivation → 0`;
  - `same vp values (a different Float32Array) and same size → previous.stillFrames + 1`
    (4 → 5);
  - `one vp element differs by one ulp → 0`;
  - `same vp, height differs → 0`.
- [ ] `runFrame.test.ts`: `a view's stillFrames counts unchanged frames and resets on a resize`.
      Run three ready frames at a fixed pose, reading `views[0].stillFrames` off the mocked
      `renderFrame`, then change `deps.canvas.width`. Expect 0, 1, 2, 0.
- [ ] `npm run typecheck:fast`, `npm test -- stillFramesOf runFrame deriveView`.

**Done when:** every rendered view carries `stillFrames` and nothing reads it yet. The derivation
stays pure in its inputs plus the previous view.

---

## Risks

- **Loop bound from a uniform** (Task 2). The compiler can no longer treat the 128-step loop as a
  constant. If the perf gate is chosen at plan start, time the volume before and after Task 2 with
  spec §8's wall-clock bench, not `npm run perf`, which failed its control for this pass on Apple
  GPUs (spec §2).
- **Retained rows invert a landmine.** The rule "offscreen consumers gate on `renderedTargets`"
  does not hold for a retained target: it is current while untouched. In §5 its reader (the
  upsample) must not gate on `renderedTargets` or `touched`, and today it does not. Composite and
  copy steps gate on `touched`, so retained rows stay limited to pass consumers.
- **Star-planner tests** (Task 3) read the cadence off a counter the test now advances. A test
  that forgets to advance it sees no plan after the first, and fails rather than passing wrongly.

## Definition of Done

**Deliverable inventory**
- `tests/helpers/wesl/weslStructLayout.ts` and `WeslStructLayout.ts`, used by all six layout tests.
- `VolumeFieldDrawInputs` (`jitterIndex`, `steps`, `weight`) and `VolumeFieldRenderer.draw(…, inputs)`.
- `ScalarVolumePassRow.inputs`, `PassState.frameIndex`, and `DENSITY_MARCH_STEPS` in
  `densityCubes/data/`.
- `STEP_COUNT` and the renderer's `frame` counter removed.
- A 272 B `VolumeUniforms`, pinned by `volumeUniformsLayout.parity.test.ts`.
- `starCatalogPlanner` with no closure frame counter.
- `RenderTargetSpec.retained`, plus `RenderTargets.viewOf(id, viewId?)` and `reconcileViews`
  (called once per frame by `runFrame`).
- `RenderStepSpec.restartPlanner` / `FrameStep.restartPlanner`, `restartRequested`, and the
  executor's retained first-touch rule.
- The per-view `plan(view, state, prev, ...fade)`, `PerViewPlanMemory`,
  `PlannerScopeTarget.previous/next`, and `EngineState.perViewPlanMemory`.
- `FrameView.stillFrames`, `stillFramesOf`, `deriveView(…, previous?)`, and
  `EngineState.previousViews`.

**Smoke pass (named observable behaviours)**
- **Mono, inside the MCPM cube with the cosmic web on:** same structure and brightness as main.
  The grain changes frame to frame while the loop ticks, and the loop still sleeps at rest.
- **Dome rig with the cosmic web on:** all five faces draw the volume, share one jitter phase per
  frame, and show no new seam.
- **Field controls:** palette change, intensity slider, and a field toggle's fade-in and fade-out
  behave as on main.
- **Window resize with the cosmic web on:** redraws at the new size, with no console error.
- **Stars:** fly through the solar neighbourhood and stop. Stars stream in, fade and settle as on
  main, with the same chunk fetch cadence in the network panel.
- **Other content:** galaxy LOD disks, structure markers, satellites, flow ribbons and the Milky
  Way field draw and settle as on main.
- **DebugPanel Memory:** render-target rows unchanged, with no per-view rows.
- **Website Rendering → Performance:** the density-march fact still reads 128 steps.

**Deferral boundary (out of scope)**
- Everything in spec §5:
  - the accumulation planner;
  - `retained: true` on `cosmic-web-density`, and `restartPlanner` on its line;
  - the decay draw, the blue-noise mask, `STEPS_BY_TIER`, `SAMPLE_CAP_BY_TIER` and the wake vote;
  - shots and `settled()` waiting for convergence.
- Spec §6 (the trim fix).
- `prev` for once-scope planners.
- A boot-time `checkFrameOrder` rule for `restartPlanner`. The executor's throw and the store's
  "never planned" throw catch misconfiguration on the first frame.
- Retained rows with depth, layers, or composite or copy consumers.
- `docs/RENDERER.md` text on retained targets and per-view planner memory. It lands with §5, the
  first user.
