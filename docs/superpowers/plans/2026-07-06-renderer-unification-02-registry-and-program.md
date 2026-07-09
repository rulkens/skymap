# Renderer Unification 02 — slab table, ContentLayer registry & FrameStep program

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Each implementer subagent must be dispatched `run_in_background: true` per project convention. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-06-29-renderer-unification-design.md` (Phase 2 paragraph + the _Core concepts_ type blocks, which are LOCKED contracts — copy signatures verbatim).
**Series:** plan 02 of 3. **Requires plan 01 (Compositor) landed** — this plan consumes `Compositor.draw(pass, src, blend, tone)` and the `@types/rendering/{Compositor,ToneMap,CompositeBlend}.d.ts` types, never rebuilds them. Where this plan cites `postProcess` / `volumeUpsamplePass` internals, reconcile with the shape plan 01 actually landed; the `Compositor` contract is the stable seam. Phase 3 (pick program) is a separate plan.

**Goal:** Replace the two-registry frame (`HDR_PASSES` additive / `UI_PASSES` over, plus the bespoke volume prepass) with one flat `ContentLayer` registry drawn by a `FrameStep` data program through a strategy-parameterized executor. Frame order becomes data (unit-testable); the slab/target/blend axes become independent fields on each layer; `renderFrame` shrinks to "run FRAME". Behaviour-neutral: the rendered frame is visually identical before and after.

**Architecture:** Three independent axes per the spec — **slab** (which view-projection, resolved ONCE per render step by the executor into a `SlabView`), **target** (which texture, a string id into a target table), **blend** (how fragments combine, baked into the renderer pipeline the layer calls). Step selection is data (`layer.target === step.target && layer.slab === step.slab`); the only `switch` in the frame is the executor's step-kind switch. The merged-vs-perLayerTimed fork is an execution _strategy_, not two encoder functions. Preserve these un-braided choices — do not re-braid them (no membership-implies-blend arrays, no per-layer slab lookups, no layer-identity branches).

**Tech Stack:** TypeScript, WebGPU (mocked in tests — no real device), Vitest, wgpu-matrix. **No WESL/shader edits in this phase** — if a task appears to need one, STOP and escalate.

## Global Constraints

- **Behaviour-neutral phase:** rendered frame visually identical; final task includes a user visual gate on the dev server (both strategies: default AND `?gpuTimings`).
- **One type per file in `src/@types`;** `type` never `interface`; filename = type name.
- **Layers must NOT cache state** (no mirror state — renderers.md); `enabled()`/`draw()` stay pure over `(state, ctx)`.
- **No per-type branches:** dispatch is registry/table lookup; a `switch` on a layer/step discriminant beyond the executor's step-kind switch is a stop-and-fix.
- **WESL untouched this phase** (no shader edits) — if a task seems to need one, escalate instead.
- **Didactic comments, timeless** (no dates/PR refs); tidy the comments of files you touch.
- **Grep `src/utils` before writing any helper** (search-before-writing-helpers).
- **Typed `vi.fn` in fixtures:** `vi.fn<() => void>()`.
- **`npm run typecheck` + `npm test` green per task;** prettier only touched files.
- **Final task: entanglement-radar pass over the phase diff** — preserve the spec's un-braided axes (slab/target/blend independent; step selection by data; ONE slab resolution per render step in the executor; no re-grown pass-array membership semantics).
- Commits stage specific paths, never `git add -A`. Worktree-absolute paths in every subagent dispatch.

## Plan-time decisions (spec gaps resolved here — implementers follow these)

1. **The program is a per-frame builder, not a module const.** The spec's `FRAME` literal shows `tone: TONE` on the tonemap composite, but `CompositeStep.tone: ToneMap | null` carries live values (`state.settings.tonemap`) that change at runtime. So `frameProgram.ts` exports `frameProgram(tone: ToneMap): readonly FrameStep[]` — the step _shape_ is constant, the tone rides in per frame. This is the same builder shape the spec's dynamic-slab `buildFrame()` already sketches.
2. **Clear values are executor/target-table data, not `RenderTargetSpec` fields** (the spec type is locked). Rule: the FIRST pass opened against a target in a frame uses `loadOp: 'clear'` with that target's clear value (`hdr` → `{0,0,0,1}`, `volume` → `{0,0,0,0}`, `swap` → `{0,0,0,1}`); every later pass loads. This reproduces today's clears exactly (cite: `encodeHdrSingle.ts:74-84`, `encodeVolumes.ts:63-78`, `postProcess.ts:284-292`, `encodeUiOverlay.ts:78-92`).
3. **Composite-step gating + the volume-upsample correction:** the executor tracks a per-frame `touched: Set<targetId>` (a render step with a non-empty group marks its target; an executed composite marks its dest), and a composite step is **skipped when its source was never touched this frame** — a general rule (its first real consumer is #386's `foreground:0 → swap`). **`volume-upsample` remains a content layer, NOT a composite step**: plan 01's shader verification found its fragment is a deliberate 4-tap rotated-grid low-pass (grain suppression for the raymarch) that the Compositor's single-sample fragment would visibly regress — the spec was corrected accordingly. The double-gate knot (`volumeUpsamplePass.ts:41-62` hand-mirroring `encodeVolumePrepass.ts:57-97`) is fixed instead by ONE shared volume-liveness projection that both volume layers' `enabled` gates consume (Task 7).
4. **Slab table instantiates BOTH spec rows** (`NEAR0 = 0`, `COSMO = 1`) so layer/step slab numbers are stable when PR #386 lands. The near row hosts **no layers** and appears in **no FRAME step** this phase. Its `vp` is derived per frame from the same camera with the adaptive near/far (`camDist·1e-4` / `camDist·100`), widened to `Float64Array`; its `camPos` semantics (origin-relative) activate when #386 defines `renderOrigin` — document this as provisional in the row's comment.
5. **Timing slots derive from the program.** Render steps contribute their matching layers' names (registry order); composite steps contribute `'<source>→<dest>'` (so `tone-map` becomes `hdr→swap`); compute steps contribute nothing (the flow _compute_ is untimed today and stays untimed — the flow _render_ layer keeps its slot); `'pick'` is appended (its consumer is off-program: `hoverPickDriver`/`wireInput`). Dev-only vocabulary changes are expected — the DebugPanel derives its rows, so they keep working (`GpuTimingsSection.tsx:50-57`). Under `perLayerTimed` the swap OVER group splits into per-layer passes (per-layer slots replace the combined `ui-overlay` slot) — spec-sanctioned, dev-only; the M1 OVER-coherency hazard note moves onto the executor.

---

### Task 1 — the eight new `@types/engine/frame` types

**Files (create, one type per file):** `src/@types/engine/frame/Slab.d.ts`, `SlabView.d.ts`, `Blend.d.ts`, `RenderTargetSpec.d.ts`, `ContentLayer.d.ts`, `CompositeStep.d.ts`, `FrameStep.d.ts`, `RenderStrategy.d.ts`.

Copy the spec's type blocks **verbatim** (field names and order included — `slab` not `slabIndex` on the render step; `SlabView` fields `{slab, vp, camPos, viewportPx}`):

- `Slab` — spec lines 85-94 (`index/nearMpc/farMpc/vp: Float64Array/originRelative/precision`).
- `SlabView` — spec lines 151-158 (`readonly slab: Slab; readonly vp: Float32Array; readonly camPos: Vec3; readonly viewportPx: Vec2`) — import `Vec2`/`Vec3` from `src/@types/math/` (never raw tuples).
- `Blend` = `'additive' | 'opaque' | 'over'`.
- `RenderTargetSpec` — spec lines 126-133 (`id/format/depth/scale`).
- `ContentLayer` — spec lines 159-178 (`name/slab/target/blend/enabled/draw/drawPick?`). Draw signature `(pass, view: SlabView, ctx: ReadyFrameContext, state: EngineState)` — **no `PassDeps`**. `drawPick?` is declared now (locked contract) but implemented by no layer until phase 3.
- `CompositeStep` — spec lines 271-276 (`source/dest/blend: CompositeBlend/tone: ToneMap | null`) — import `CompositeBlend` + `ToneMap` from `src/@types/rendering/` (plan 01's types).
- `FrameStep` — spec lines 278-282 (the three-kind union; render steps carry `target: string; slab: number`).
- `RenderStrategy` = `'merged' | 'perLayerTimed'`.

Didactic headers: each file explains its axis and points at the spec section (timeless — no dates).

- [x] Create the eight files with verbatim signatures.
- [x] `npm run typecheck` → green (types have no consumers yet). `npm test` → green.
- [x] Commit the eight files.

### Task 2 — `slabs.ts`: per-frame slab derivation + `slabViewOf`

**Files:** create `src/services/engine/frame/slabs.ts`, `tests/services/engine/frame/slabs.test.ts`; modify `src/@types/engine/frame/ReadyFrameContext.d.ts`, `src/services/engine/frame/frameContext.ts`, `tests/services/engine/frame/frameContext.test.ts`.

**Signatures:**

```ts
export const NEAR0 = 0; // near-field slab index (layerless until PR #386)
export const COSMO = 1; // cosmological slab index
export function deriveSlabs(cam: OrbitCamera, cosmoVp: Mat4): readonly Slab[];
export function slabViewOf(ctx: ReadyFrameContext, slab: number): SlabView;
```

**Behaviour:** `deriveSlabs` returns the spec's two-row table (spec lines 100-110): row 0 near-field (`nearMpc: cam.distance·1e-4`, `farMpc: cam.distance·100`, `originRelative: true`, `precision: 'f64'`, vp = adaptive-frustum view-proj per plan-time decision 4 — reuse `computeViewProj`'s lookAt/perspective shape (`src/utils/camera/computeViewProj.ts:114-132`) with the slab's near/far, widen the result); row 1 cosmological (`nearMpc: 0.01`, `farMpc: 50000`, `originRelative: false`, `precision: 'f32'`, `vp: Float64Array.from(cosmoVp)`). Widening f32→f64 is exact, so `Float32Array.from(slab.vp)` narrows back byte-equal — `slabViewOf` needs no COSMO special case. `slabViewOf` reads `ctx.slabs` (array position === `Slab.index` — assert this invariant in a test), builds `{slab, vp: Float32Array.from(slab.vp), camPos: ctx.drawCamPos, viewportPx: [ctx.canvasSize.width, ctx.canvasSize.height]}`.

`ReadyFrameContext` gains `slabs: readonly Slab[]`; `deriveFrameContext` populates it right where `vp` is computed (`frameContext.ts:141-144`) so there is exactly ONE derivation per frame.

- [x] Test `deriveSlabs returns two rows with index === array position` (0 then 1).
- [x] Test `every slab has nearMpc < farMpc` (try `cam.distance` 5 and 5000).
- [x] Test `the cosmological row preserves the given vp exactly` — `Float32Array.from(slabs[1].vp)` byte-equal to the input `Mat4`.
- [x] Test `slabViewOf(ctx, COSMO).vp is byte-equal to ctx.vp` and `viewportPx mirrors canvasSize`.
- [x] Test `slabViewOf(ctx, NEAR0) exposes the adaptive near/far slab row` (near = distance·1e-4, far = distance·100).
- [x] Implement; add `slabs` to the `frameContext.ts` return literal + fixture updates in `frameContext.test.ts`.
- [x] `npm run typecheck && npm test` → green.
- [x] Commit (`src/@types/engine/frame/ReadyFrameContext.d.ts src/services/engine/frame/slabs.ts src/services/engine/frame/frameContext.ts tests/...`).

### Task 3 — convert the nine HDR passes to `ContentLayer` rows

**Files:** every `src/services/engine/frame/passes/*.ts` in `HDR_PASSES` (`passes/index.ts:113-123`), `passes/index.ts`, matching tests under `tests/services/engine/frame/passes/`.

Mechanical conversion, per file:

1. Type changes `Pass` → `ContentLayer`; add fields per the spec migration table (spec lines 196-213): all nine are `slab: COSMO, target: 'hdr', blend: 'additive'` (import `COSMO` from `../slabs`).
2. `draw(pass, view, ctx, state)` — renderer refs move from `deps.*` to `state.gpu.*` (they are all stored there by `initGpu`: `milkyWayRenderer` :318, `horizonShellRenderer` :319, `filamentRenderer` :303, `texturedDiskRenderer` :316, `proceduralDiskRenderer` :317, `volumeFieldRenderer` :335, `flowFieldRenderer` :346). Nullable handles get the same in-draw null guard `filamentsPass.draw` already uses. VP/viewport reads switch from `ctx.vp`/`ctx.canvasSize` to `view.vp`/`view.viewportPx` — this retires the scattered `ctx.vp as Float32Array` casts (e.g. `labelsPass.ts:52` — task 4). `ctx.drawCamPos`/`ctx.drawPxPerRad` remain valid reads (slab-invariant for COSMO; `view.camPos` is the forward-compatible spelling — prefer it where the value is the camera position).
3. Rename symbol + file `<name>Pass` → `<name>Layer` (filename = exported symbol).
4. `passes/index.ts`: declare the flat registry and derive the transitional legacy arrays so the old encoders keep working until the flip:

```ts
export const CONTENT_LAYERS: readonly ContentLayer[] = [
  /* HDR order, then UI order (task 4) */
];
export const HDR_PASSES = CONTENT_LAYERS.filter((l) => l.target === 'hdr'); // transitional
```

5. Adapt the two HDR encoders to the new draw signature (5-line edits, deleted in task 8): in `encodeHdrSingle.ts:92-96` and `encodeHdrSplit.ts:98-117`, compute `const view = slabViewOf(ctx, COSMO)` once before the loop and call `l.draw(passEncoder, view, ctx, state)`; drop the `deps` parameter from both signatures and from `renderFrame.ts:114-122` (stop building `PassDeps` for these callers).

**Tests:** update `passes.test.ts` fixtures (drop `makeDeps`, put the renderers the draws read onto the state stub's `gpu` bag) and per-pass test files. Add the registry test that pins the migration table for the hdr group:

- [x] Test `every hdr content layer matches the migration table` — assert `CONTENT_LAYERS` rows `{name, slab: COSMO, target: 'hdr', blend: 'additive'}` for the nine names in the legacy order (`point-sprites`, `procedural-disks`, `textured-disks`, `milky-way`, `filaments`, `flow`, `volume-upsample`, `horizon-shell`, `structure-markers`).
- [x] Test `draw threads the SlabView vp/viewport to the renderer` for one representative layer (mirror the existing `filamentsPass.draw` arg assertions, `passes.test.ts:285-303`).
- [x] Convert the nine files + registry + encoder adaptation; migrate existing pass tests mechanically.
- [x] `npm run typecheck && npm test` → green (suite still runs through the old encoders).
- [x] Commit.

### Task 4 — convert the five UI passes; delete `PassDeps`; slim the input bags

**Files:** the five `UI_PASSES` files (`passes/index.ts:135-144`), `passes/index.ts` (append to `CONTENT_LAYERS`, derive transitional `UI_PASSES = CONTENT_LAYERS.filter((l) => l.target === 'swap')`), `encodeUiOverlay.ts:72-98` (same `slabViewOf` + signature adaptation as task 3), **delete** `src/@types/engine/frame/PassDeps.d.ts` and `src/@types/engine/frame/Pass.d.ts` (both now unreferenced), slim `src/@types/engine/frame/RenderFrameInput.d.ts` (drop the seven renderer fields, keep `ctx/state/device/context/timingService`), slim `src/@types/engine/frame/RunFrameDeps.d.ts` (drop `milkyWayRenderer/horizonShellRenderer/filamentRenderer/texturedDiskRenderer/proceduralDiskRenderer` — they were only forwarded into `renderFrame`), update `renderFrame.ts:93-122` destructure, `runFrame.ts:376-389` call, `startLoop.ts:101` bag construction, and the fixtures in `renderFrame.test.ts` / `renderFrame.timing.test.ts` / `runFrame.test.ts`.

Migration-table rows for the five: `selection-ring`, `disk-radius-ring`, `marker-lines`, `labels`, `clip-path-debug` — all `slab: COSMO, target: 'swap', blend: 'over'` (spec lines 208-212).

- [x] Test `every swap content layer matches the migration table` (five rows, legacy UI order).
- [x] Test `CONTENT_LAYERS blends are legal for their target` — hdr layers all `additive`, swap layers all `over` (the registry half of the target↔renderer-profile invariant; the renderer half lands in task 10).
- [x] Convert the five files; delete `PassDeps.d.ts` + `Pass.d.ts`; slim `RenderFrameInput`/`RunFrameDeps`; update call sites + fixtures.
- [x] `npm run typecheck && npm test` → green.
- [x] Commit.

### Task 5 — `frameProgram.ts`: the FRAME data + derived timing slots

**Files:** create `src/services/engine/frame/frameProgram.ts`, `tests/services/engine/frame/frameProgram.test.ts`.

**Signatures:**

```ts
export function frameProgram(tone: ToneMap): readonly FrameStep[];
export function timedSlotsOf(
  program: readonly FrameStep[],
  layers: readonly ContentLayer[],
): readonly string[];
```

**Behaviour:** `frameProgram` emits the spec program **minus the two PR-#386 steps** (no `foreground:0` render, no `NEAR0` swap render). There is NO `volume→hdr` composite — the volume merge is the `volume-upsample` layer inside the hdr render step (plan-time decision 3):

```ts
[
  { kind: 'compute', name: 'flow' },
  { kind: 'render', target: 'volume', slab: COSMO },
  { kind: 'render', target: 'hdr', slab: COSMO },
  { kind: 'composite', step: { source: 'hdr', dest: 'swap', blend: 'replace', tone } },
  { kind: 'render', target: 'swap', slab: COSMO },
];
```

`timedSlotsOf` implements plan-time decision 5 (layers per render step in registry order, `'<source>→<dest>'` per composite, computes skipped, `'pick'` appended). Module header carries the "why data, not imperative code" rationale from the spec (timeless).

- [x] Test `frameProgram(tone) emits the five-step main program` — deep-equal against the literal above.
- [x] Test `the tonemap composite carries the given tone and is the program's only composite`.
- [x] Test `every render step references a slab present in deriveSlabs' table` (assert `slab === COSMO`; keeps the program honest when slabs go dynamic).
- [x] Test `timedSlotsOf lists layer slots per step, composite slots, then pick` — with the real `CONTENT_LAYERS`: `['scalar-volume'?…]` — at this task the volume layer doesn't exist yet, so drive with fake 2-layer registries; the real-registry assertion lands in task 7.
- [x] Test `timedSlotsOf yields unique names` (mirrors `passes.test.ts:187-189`).
- [x] Implement; `npm run typecheck && npm test` → green.
- [x] Commit.

### Task 6 — `executeFrame.ts`: the strategy-parameterized executor + COMPUTE table

**Files:** create `src/services/engine/frame/executeFrame.ts`, `src/@types/engine/frame/ExecuteFrameArgs.d.ts`, `tests/services/engine/frame/executeFrame.test.ts`.

**Signature:**

```ts
export type ExecuteFrameArgs = {
  encoder: GPUCommandEncoder;
  ctx: ReadyFrameContext;
  state: EngineState;
  program: readonly FrameStep[];
  layers: readonly ContentLayer[];
  strategy: RenderStrategy;
  timing: GpuTimingService;
  swapView: GPUTextureView;
};
export function executeFrame(args: ExecuteFrameArgs): void;
```

**Executor semantics (the behaviour-neutrality contract — implement exactly):**

1. Steps run in program order into the one encoder. The step-kind `switch` here is the frame's ONLY switch.
2. `compute` → `COMPUTE[step.name](encoder, ctx, state)`; the table has one row, `'flow'`, calling the flow-compute encode (`encodeFlowCompute.ts:31-35` — refactor its signature to `(encoder, state)` reading its own gates, delete `EncodeVolumesArgs`-style bag `EncodeFlowComputeArgs.d.ts`; wired live in task 7).
3. `render` → `group = layers.filter(l => l.target === step.target && l.slab === step.slab && l.enabled(state, ctx) && state.settings.debug.disabledPasses[l.name] !== true)` (the one-way override, after the gate — same semantics as `encodeHdrSingle.ts:87-96`). Empty group → **no pass opened**. Otherwise `const view = slabViewOf(ctx, step.slab)` — **the ONLY slab resolution in the frame**, one per render step.
   - `'merged'`: one `beginRenderPass` for the group (tile-local; production).
   - `'perLayerTimed'`: one pass per layer, each with `timing.descriptorFor(layer.name)` via the spread-if idiom (`encodeHdrSplit.ts:104-114`) — dev-only; re-loads the target between passes (carry the M1 OVER-coherency hazard comment from `encodeHdrSingle.ts`'s header here).
4. `composite` → skipped unless `touched.has(step.step.source)`. Otherwise open the dest pass (clear rule below; `timing.descriptorFor('<source>→<dest>')`), call `state.gpu.compositor.draw(pass, viewFor(source), step.step.blend, step.step.tone)` (plan 01's handle — reconcile the exact `state.gpu` field name with what plan 01 landed), end the pass, mark dest touched.
5. **First-touch clear:** per-`executeFrame` `touched: Set<string>`; the first pass opened against a target uses `loadOp: 'clear'` with the target's clear value (plan-time decision 2), later passes `'load'`. A render step with a non-empty group marks its target touched.
6. `viewFor(id)`: `'swap'` → `args.swapView`; `'hdr'` → `ctx.postProcess.view`; `'volume'` → `ctx.volumeOffscreen.view`. This mini-table (plus the clear-value record) is transitional — task 9 repoints it at the target table. The swap-vs-offscreen branch is essential (the swap chain is not an allocated texture), keep it to this ONE site.

**Tests** (fake layers = object literals with spy `enabled`/`draw`; fake compositor; the encoder/pass recorder pattern from `renderFrame.test.ts:63-77`):

- [x] Test `runs steps in program order into a single encoder`.
- [x] Test `selects layers by (target, slab): two render steps over the same registry draw disjoint groups` (two fake layers on different targets).
- [x] Test `threads one SlabView instance per render step into every layer in the group` (identity-equal across draws).
- [x] Test `clears a target on its first pass of the frame and loads on later passes` (assert `loadOp`/`clearValue` per recorded descriptor; volume clears to a=0, hdr to a=1).
- [x] Test `opens no pass for a render step with no enabled layers`.
- [x] Test `skips a composite step whose source target was never touched` (compositor spy not called) and `runs it when the source render step drew`.
- [x] Test `merged strategy opens exactly one pass per non-empty render step`.
- [x] Test `perLayerTimed opens one pass per enabled layer, each carrying descriptorFor(layer.name)` (the `_stub`-tagged descriptor pattern from `renderFrame.timing.test.ts:56-75`).
- [x] Test `composite passes carry the source→dest timing descriptor`.
- [x] Test `disabledPasses[name] === true hides a layer; false/absent does not` (mirrors `renderFrame.test.ts:600-617`).
- [x] Test `compute steps dispatch through the COMPUTE table` (inject a fake table row? — the COMPUTE table is module-internal; assert via the flow renderer spy on `state.gpu.flowFieldRenderer` instead).
- [x] Implement; `npm run typecheck && npm test` → green (module not yet wired into `renderFrame`).
- [x] Commit.

### Task 7 — flip `renderFrame` to the program; add the scalar-volume layer + shared volume liveness

**Files:** `src/services/engine/frame/renderFrame.ts`, create `src/services/engine/frame/passes/scalarVolumeLayer.ts` + `src/services/engine/frame/volumeLiveness.ts` (+ test), modify `passes/volumeUpsampleLayer.ts` (gate repoint), `passes/index.ts`, `src/services/engine/phases/initGpu.ts:65,377-381`, `src/components/DebugPanel/GpuTimingsSection.tsx:50-57`, tests: `renderFrame.test.ts`, `renderFrame.timing.test.ts`, `frameProgram.test.ts`, `encodeVolumes.test.ts` (absorb), `encodeFlowCompute.test.ts` (signature), `passes.test.ts`.

**`renderFrame` shrinks to "run FRAME":** keep the focus-uniform write (`renderFrame.ts:128`), then encoder + swapView + `timing.beginFrame()`, `strategy = timingService.enabled ? 'perLayerTimed' : 'merged'`, `executeFrame({ …, program: frameProgram({ exposure: state.settings.tonemap.exposure, curve: state.settings.tonemap.curve }), layers: CONTENT_LAYERS, … })`, `timing.endFrame`, submit. Rewrite the module header for the new shape (the "what the encoder records" list becomes "the FRAME program"; keep the tile-local/timing rationale where it still applies, now mostly in `executeFrame`).

**`volumeLiveness.ts`** — the shared projection that dissolves the double-gate knot (plan-time decision 3). One derivation both volume layers consume:

```ts
// null ⇒ no live volume work this frame (renderer missing, master off AND fully faded,
// or no active fields). Non-null carries the per-field read closures both layers need.
export function deriveVolumeLiveness(
  state: EngineState,
  ctx: ReadyFrameContext,
): {
  settingsOf: (h: ScalarFieldHandle) => VolumeFieldSettings;
  fadeOpacityOf: (h: ScalarFieldHandle) => number;
} | null;
```

Extract it from the prepass gate logic (`encodeVolumePrepass.ts:57-97` — renderer non-null, master toggle-or-fade, `hasActiveFields`, the recession + clamp closures). The old consumer pair (`encodeVolumePrepass` gate vs `volumeUpsamplePass.enabled`'s hand-mirror, `volumeUpsamplePass.ts:41-62`) could drift on three axes (clamp, recession, clip factor — the audit's stale-offscreen finding); after this task the fact has ONE home.

**`scalarVolumeLayer`** (`name: 'scalar-volume'` — keeps the historical timing-slot label; `slab: COSMO, target: 'volume', blend: 'additive'`): `enabled` = `deriveVolumeLiveness(...) !== null`; `draw` absorbs `encodeVolumes.ts:60-87` (downscaled viewport via `VOLUME_RENDER_SCALE_DIVISOR`, renderer draw with `view.vp`/`view.camPos`, per-field reads through the liveness projection). The executor owns the pass + clear; the layer only draws. Registry position: before the hdr group.

**`volumeUpsampleLayer` stays** (it converted to a ContentLayer row in Task 3 — spec correction: its 4-tap low-pass fragment is essential, NOT a generic composite). This task repoints its `enabled` from the hand-mirrored gate to the same `deriveVolumeLiveness(...) !== null`, so producer and consumer of the volume target can no longer disagree; its `draw` is unchanged.

**Timing slots:** `initGpu` builds the service from `timedSlotsOf(frameProgram({ exposure: 1, curve: 0 }), CONTENT_LAYERS)` (tone values don't affect slot names — say so in a comment); delete `TIMED_SLOT_NAMES` (`passes/index.ts:166-172`) and its transitional `HDR_PASSES`/`UI_PASSES` derivations; repoint `GpuTimingsSection.tsx` `DISPLAY_SLOT_ORDER` at the same derivation (import the derived list — keep ONE source; simplest: export the computed list as a const from `frameProgram.ts` or a sibling, consumed by both `initGpu` and the DebugPanel).

**Test migration** — the existing `renderFrame` tests are the behaviour guard; keep their assertions, re-expressed:

- [x] `renderFrame.test.ts`: encoder-lifecycle tests unchanged (`creates exactly one command encoder`, `submits exactly once…`); HDR-attachment test unchanged in substance (first hdr pass: postProcess view, clear, a=1); `postProcess.draw` assertions become `compositor.draw` assertions — test `runs the hdr→swap composite with blend 'replace' and the settings tone` (fixture gains a compositor spy on `state.gpu`); canonical-order test asserts the FRAME order `createEncoder → hdr pass (points → milky-way) → pass.end → compositor.draw(replace) → finish → submit`; volume tests: `opens the volume pass before the hdr pass when the scalar-volume layer is enabled` + `skips the volume pass and hides the volume-upsample layer when volumes are off` (both gates are the one `deriveVolumeLiveness` — assert they cannot disagree by driving the same state).
- [x] `volumeLiveness.test.ts`: `returns null when the renderer is missing / master off and fully faded / no active fields`; `returns the settingsOf/fadeOpacityOf closures when a field is live` (port the gate assertions being absorbed from `encodeVolumePrepass`'s tests).
- [x] `renderFrame.timing.test.ts`: `descriptorFor` slots become `point-sprites`, `milky-way`, `hdr→swap` (no `ui-overlay` call when no swap layer is enabled — assert that); per-pass descriptor tagging updated; the scalar-volume billing test keeps the `'scalar-volume'` slot name.
- [x] `frameProgram.test.ts`: add the real-registry slot test — `timedSlotsOf(frameProgram(...), CONTENT_LAYERS)` equals `['scalar-volume', <the nine hdr layer names in registry order>, 'hdr→swap', <five swap layer names>, 'pick']`.
- [x] `passes.test.ts`: registry-shape tests updated (scalar-volume row added; the hdr group keeps its nine rows incl. volume-upsample); delete the `TIMED_SLOT_NAMES` describe.
- [x] Implement the flip; migrate `encodeVolumes.test.ts` gate/arg assertions into `scalarVolumeLayer` tests; update `encodeFlowCompute` signature + test.
- [x] `npm run typecheck && npm test` → green.
- [ ] Ask the user for a quick dev-server sanity look (volumes on/off, labels, markers) before proceeding — the flip is the highest-risk commit.
- [x] Commit.

### Task 8 — delete the dead encoders

**Files (delete):** `src/services/engine/frame/encodeHdrSingle.ts`, `encodeHdrSplit.ts`, `encodeUiOverlay.ts`, `encodeVolumePrepass.ts`, `encodeVolumes.ts`, `src/@types/engine/frame/EncodeVolumesArgs.d.ts`, plus their now-empty test files if any assertions weren't already absorbed in task 7.

All are unreferenced after the flip — verify with a grep for each symbol before deleting. Carry any still-load-bearing didactic content (the tile-local mega-pass rationale, the timestamp-at-pass-boundaries constraint, the M1 coherency history) into `executeFrame.ts`'s header if task 6/7 didn't already.

- [x] Grep confirms zero imports of each deleted module.
- [x] Delete; `npm run typecheck && npm test` → green.
- [x] Commit.

### Task 9 — RenderTarget table + consolidated resize (target lifecycle out of `postProcess`/`volumeOffscreen`)

**Files:** create `src/services/gpu/renderTargets.ts` + `tests/services/gpu/renderTargets.test.ts`; modify `src/services/engine/phases/initGpu.ts:134-148`, `src/services/engine/frame/runFrame.ts:133-140`, `src/services/engine/frame/executeFrame.ts` (`viewFor` + clear table repoint), `src/services/engine/helpers/engineReady.ts`, `src/@types/engine/frame/ReadyFrameContext.d.ts` + `frameContext.ts`, `src/@types/engine/state/EngineGpuHandles` (field swap), engine `destroy` chain; dissolve what remains of `src/services/gpu/passes/postProcess.ts` (the HDR texture half, `postProcess.ts:174-189` — the tonemap half went to the Compositor in plan 01; reconcile with plan 01's landed shape) and `src/services/gpu/passes/volumeOffscreen.ts` (whose `VOLUME_RENDER_SCALE_DIVISOR` becomes the `'volume'` row's `scale: 3` — re-export or repoint the scalar-volume layer's import so the divisor has ONE home).

**Contract:**

```ts
// services/gpu/renderTargets.ts — owns every offscreen RenderTargetSpec row.
export function createRenderTargets(
  device: GPUDevice,
  swapFormat: GPUTextureFormat,
  size: Size,
): RenderTargets;

export type RenderTargets = {
  readonly specs: readonly RenderTargetSpec[]; // hdr, volume, swap (pick rows arrive in phase 3)
  viewOf(id: string): GPUTextureView; // offscreen rows only; 'swap' throws (per-frame, executor-resolved)
  resize(size: Size): void; // reallocates every offscreen row at size/scale — the ONE resize seam
  destroy(): void;
};
```

Rows per the spec's concrete table (spec lines 137-144): `hdr` rgba16float/–/1, `volume` rgba16float/–/3, `swap` (swapFormat)/–/1. Clear values ride here (plan-time decision 2), consumed by the executor. `runFrame`'s hand-enumerated resize pair becomes one `state.gpu.renderTargets.resize(...)` call. `isEngineReady`'s `postProcess` check becomes the `renderTargets` check — a rename, NOT a predicate growth (heed `feedback_lifecycle_vs_teardown_invariants`: do not add the new handle _alongside_; bootstrap progression isn't the inverse of teardown). `ReadyFrameContext` swaps `postProcess`/`volumeOffscreen` for `renderTargets`.

- [x] Test `viewOf returns a live view per offscreen row and throws for swap`.
- [x] Test `resize reallocates offscreen textures at size/scale` (volume at ⌊size/3⌋, min 1 px — the `encodeVolumes.ts:60-61` guard moves here).
- [x] Test `specs carry the spec's format/depth/scale table` (the target half of the target↔renderer-profile invariant).
- [x] Test `destroy destroys every allocated texture` (mock-device pattern from existing gpu tests).
- [x] Implement; repoint executor `viewFor`/clears; update `frameContext.test.ts`, `renderFrame.test.ts` fixtures (ctx field swap), `initGpu.destroyReachability.test.ts`.
- [x] `npm run typecheck && npm test` → green.
- [x] Commit.

### Task 10 — renderer-factory `targetFormat` cleanup: `GpuContext.format` means swap-chain format, always

**Files:** `src/services/engine/phases/initGpu.ts`, the renderer factories below + their tests, `src/@types/rendering/GpuContext.d.ts` (docblock: `format` is the swap-chain format, full stop).

Three idioms coexist in `initGpu` today (verified against current code — the spec's phase-2 paragraph names them):

1. **Positional format arg** (already explicit — keep, but rename the parameter `targetFormat` where it's called `format`): `createPointRenderer(device, 'rgba16float', …)` :154-160, `createFilamentRenderer(device, 'rgba16float', …)` :302, `createVolumeFieldRenderer(device, 'rgba16float', …)` :335-339. (`createVolumeUpsample` :352 — gone with plan 01/task 8; skip if already deleted.)
2. **`GpuContext.format` repurposed as target format** (the offender — fix): `createTexturedDiskRenderer({ …, format: 'rgba16float', … })` :261-264, `createProceduralDiskRenderer({ …, format: 'rgba16float', … })` :272-278, `createMilkyWayRenderer({ device, format: 'rgba16float' })` :284-287, `createHorizonShellRenderer({ device, format: 'rgba16float' })` :291-294 — versus `uiCtx` :192 using the same field to mean swap format.
3. **Hybrid ctx-bag + positional override**: `createStructureMarkerRenderer(uiCtx, 'rgba16float', …)` :207-211 (already explicit; ensure the bag's `format` is no longer read for the colour target).

**Normalize to ONE idiom:** every factory takes an explicit `targetFormat: GPUTextureFormat` (positional arg or named field — match each factory's existing arg style, but the _name_ is `targetFormat` everywhere; `createFlowFieldRenderer`'s `hdrFormat` :346 renames to `targetFormat` for uniformity). Factories that receive a `GpuContext` never read `.format` for their colour target; `uiCtx`-consuming swap-target factories (label/markerLine/debugLine/selectionRing :195-202) pass `targetFormat: format` explicitly at the call site. This is what the registry invariant attaches to: a layer's target format is now legible at its renderer's construction site.

- [x] Test (per touched factory test file): construction-time pipeline descriptor carries the given `targetFormat` (most factories already have such tests — extend, don't duplicate).
- [x] Implement the renames + call-site updates; update `GpuContext.d.ts` docblock (:25-30).
- [x] `npm run typecheck && npm test` → green.
- [x] Commit.

### Task 11 — entanglement radar, full gate, visual sign-off

- [ ] Run the `entanglement-radar` skill over the full phase diff (`git diff main...HEAD`). Verify the spec's un-braided axes survived: slab/target/blend independent fields; step selection by `(target, slab)` data; exactly ONE `slabViewOf` call per render step (grep — it must appear only in `executeFrame.ts`); no array whose _membership_ implies blend/target semantics; no `switch`/predicate-chain on layer or step identity outside the executor's step-kind switch; no layer caching state. Fix any findings (delegate edits to a subagent per house convention).
- [ ] Sweep comments in touched files: didactic, timeless, no stale references to `HDR_PASSES`/`UI_PASSES`/`encodeHdr*` (grep the deleted names across `src/` including comments).
- [ ] `npm run typecheck && npm test` → full suite green. Prettier over touched files only.
- [ ] **User visual gate on the dev server (do not self-certify):** default URL — orbit, toggle volumes/filaments/milky-way, select a galaxy (ring + labels + marker lines), focus a cluster; then `?gpuTimings` — same sweep + DebugPanel timing rows populate under the new slot names (`scalar-volume`, `volume→hdr`, per-layer hdr rows, `hdr→swap`, per-layer swap rows, `pick`). Frame must be visually identical to `main` in the default path.
- [ ] Commit any final fixes; hand off for review/PR per `superpowers:finishing-a-development-branch`.

---

## Spec-clause coverage checklist (self-audit)

| Phase-2 spec clause                                                                 | Task                                                                  |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Flat `ContentLayer` registry replaces `HDR_PASSES`/`UI_PASSES`                      | 3, 4, 7                                                               |
| `FRAME` data program + small executor; `renderFrame` = "run FRAME"                  | 5, 6, 7                                                               |
| Two slabs derived per frame as today                                                | 2                                                                     |
| Volume/flow hoist to top-level steps (out of both encoders)                         | 5, 7                                                                  |
| Executor owns merged/perLayerTimed strategy; replaces `encodeHdrSingle`/`Split`     | 6, 7, 8                                                               |
| `TIMED_SLOT_NAMES` derives from the program                                         | 5, 7                                                                  |
| `debug.disabledPasses` gate absorbed by the executor                                | 6                                                                     |
| Layers read `state.gpu.*`; `PassDeps` deleted; `RenderFrameInput` slimmed           | 3, 4                                                                  |
| Target lifecycle → table; consolidated resize                                       | 9                                                                     |
| Every factory declares target format; `GpuContext.format` = swap always             | 10                                                                    |
| Tests: slab invariants, FRAME sequence, (target, slab) selection, profile invariant | 2, 4, 5, 6, 9, 10                                                     |
| Foreground/captions rows (PR #386)                                                  | **excluded** — near slab exists layerless; program has no NEAR0 steps |
