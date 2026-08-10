# GPU-side v2 placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the v2 analytic galaxy generator's map-dependent placement (dust
particle cloud, DIG veil) from CPU (fed by a `mapAsync` readback of the ISM
map) onto GPU compute passes that read the map directly, so the placement
critical path never leaves the GPU — the primitive real-time per-galaxy
generation needs, not that scheduler itself.

**Architecture:** Four new compute shaders under
`src/services/gpu/shaders/milkyWay/ismMap/` (`ismMapDustCdfScan`,
`placeDust`, `placeDigVeil`, `ringReduce`) plus a new `records.wesl` struct
that becomes the one authority for the `FieldComponentRec` layout the splat
shaders already read as a bare `array<vec4<f32>>`. `createGalaxyModel.ts`'s
existing `createKeyedRebuild` seam gets new closure bodies that encode these
passes into the rebuild's own encoder instead of calling the CPU builders.
Readbacks stay wired for tool diagnostics only.

**Tech Stack:** WebGPU compute (WGSL via wesl-plugin), TypeScript dispatch
hosts under `tools/galaxy-renderer/src/engine/`, Vitest for parity/CPU-vs-CPU
tests, the existing Playwright-driven `probeGpuErrors.ts` for anything that
needs a real GPU.

## Global Constraints

- `type` aliases, never `interface`, for every new TS shape.
- One exported function per `utils/`-style helper file (see house precedent:
  `packIsmMapFluidConstants.ts` is one function; `ismMapRingMeans.ts` is one
  function).
- Comment budget: module header ≤ 10 lines, comment lines ≤ half the code
  lines — didactic (why), never what.
- `.wesl` files live under `src/services/gpu/shaders/...` only; the
  `tools/galaxy-renderer/src/engine/shaders/...` tree is a symlink farm at
  the leaf (see `tools/galaxy-renderer/src/engine/shaders/milkyWay/field/io.wesl`
  → symlinked to `src/services/gpu/shaders/milkyWay/field/io.wesl`). Never
  author a `.wesl` file under `tools/`.
- Every shader-editing task: invoke the `wesl-shaders` skill before touching
  a `.wesl` file, and the task's implementer must run
  `npm run galaxy-renderer:probe` before declaring the task done (the
  orchestrator runs the actual npm invocation; the task text below says so
  explicitly so a fresh subagent doesn't skip it).
- No `mapAsync` call may sit on the path from a rebuild to a drawn frame once
  this plan ships (spec DoD). Readbacks are legal only behind a debug-view
  gate (`viewIntensity(...)`) or from a test-only probe hook.
- Slot-hash RNG (`genRand`/`pcg4d`, `src/services/gpu/shaders/milkyWay/sprites/generate.wesl:164-185`)
  is the only RNG new GPU placement code may use — never a ported
  `mulberry32` stream (order-dependence has no meaning across parallel
  invocations; see spec "RNG: slot-hash adoption").
- `FieldComponentRec` has no boolean liveness lane. A placement failure
  (survival floor, budget miss) zeroes `amplitude`, never compacts the
  record array and never adds a lane.

---

## Ground preparation — as specified

The spec's Ground Preparation section names three prep items. Two produce
code (Tasks 1 and 3 below); the third (**"name the rebuild-encode
touchpoints"**) is bookkeeping the spec itself already completed — its own
verdict table records blocker "none" because `createKeyedRebuild`'s
`wanted()`/`build()` shape already hosts a compute-pass body with no
structural change needed. That naming is folded into Tasks 6/7's "Files"
citations below rather than given its own commit.

This plan also adds prep beyond the spec's three items, load-bearing for
tasks that follow:

- **Task 4** (arm-gather RNG fix) and **Task 5** (probe numeric-readback
  harness) are plan-time additions, not spec Ground Preparation items — see
  their own "Why this task exists" notes.

## Corrections to spec anchors (verified against the current tree; see report)

- **Velocity-texture free lanes.** The arm-gather fold-in decision (not the
  spec, which predates it) described the stars-only advection velocity as
  "packed into the free `.zw` lanes" of
  `velocityTex`. Verified against `ismMapFluidVelocity.wesl:368` and
  `ismMapFluidStep.wesl:210`: `.z` already carries `eventStamp` (consumed by
  Pass B for the `stars`/`activity` update), so **only `.w` is free**, not
  two lanes. Task 4 below designs around this: a second small storage
  texture, not a repurposed `.zw` pair.
- All other spec file/line anchors were checked against this tree during
  planning and are accurate to within a few lines of drift (the spike
  graduated from `tools/` to `src/` before this branch, but line numbers
  cited in the spec already reflect the post-graduation paths). No further
  corrections needed.

---

## Task DAG

```
Group A (parallel, no cross-dependencies):
  Task 1  records.wesl SSoT + parity test
  Task 2  Drop applyIsmMapSeeding
  Task 3  ringReduce.wesl — ring-means slice (replaces recomputeIsmMapSeedingMeans)
  Task 4  Arm-gather RNG fix — stars-only advection velocity
  Task 5  Probe numeric-readback harness (testing infra)

Group B (each gated on a subset of Group A):
  Task 6  ismMapDustCdfScan.wesl                 gated on: Task 5
  Task 7  placeDust.wesl + rebuildDustMixture wiring   gated on: Task 1, Task 6
  Task 8  placeDigVeil.wesl + rebuildHiiIfSeeded wiring gated on: Task 1, Task 2, Task 6

Group C:
  Task 9  ringReduce.wesl — survivor-sum slice + renorm uniform   gated on: Task 3, Task 7

Group D:
  Task 10 Readback demotion (createGalaxyModel.ts placement path) gated on: Task 7, Task 8

Group E (final, single task):
  Task 11 Recalibration + visual pass   gated on: Task 4, Task 7, Task 8, Task 9, Task 10
```

Tasks 1-5 have disjoint file sets and can be dispatched to fresh subagents
in parallel. Task 6 only needs Task 5's readback plumbing to test against;
it touches none of Tasks 1-4's files. Tasks 7 and 8 both depend on Task 1
(the record struct) and Task 6 (the CDF scan they binary-search), but are
disjoint from each other (dust vs. HII/DIG) — dispatch in parallel once 1
and 6 are both reviewed clean. Task 9 needs Task 7's record buffer to reduce
over. Task 10 needs both placement paths GPU-side before the CPU readback
can be pulled off the critical path. Task 11 is the sign-off gate and
touches no files of its own beyond tuning presets.

---

## Task 1: `records.wesl` SSoT + parity test

**Why:** Ground Prep #1. A compute pass is about to become a second writer
of the `comps` buffer; without a WGSL struct neither writer has anything to
typecheck against.

**Files:**
- Create: `src/services/gpu/shaders/milkyWay/field/records.wesl`
- Modify: `src/services/gpu/shaders/milkyWay/field/io.wesl:365` (`comps: array<vec4<f32>>` → `comps: array<FieldComponentRec>`, plus an `import` of the new struct)
- Modify: `tools/galaxy-renderer/src/engine/field/packFieldUniforms.ts:275-317` (`packFieldComponents` — doc comment only: it becomes a *mirror* of the struct, not the layout authority; no functional change, the byte order it already writes is bit-identical to the struct below)
- Test: `tests/services/gpu/shaders/records.parity.test.ts`

**Contract — the struct** (already fully specified in the spec; reproduced
here as the literal contract, not a sketch):

```wgsl
// src/services/gpu/shaders/milkyWay/field/records.wesl
struct FieldComponentRec {
  invCovDiagonal: vec3<f32>,
  amplitude: f32,
  invCovOffDiagonal: vec3<f32>,
  boundRadius: f32,
  color: vec3<f32>,
  textureWeight: f32,
  center: vec3<f32>,
  starsWeight: f32,
}
```

Field order and byte offsets must match `packFieldComponents`
(`tools/galaxy-renderer/src/engine/field/packFieldUniforms.ts:296-317`)
exactly — verify by reading that function before writing the struct, not the
other way around; the packer's existing bytes are the ground truth this
struct documents.

- [ ] Write `records.wesl` with the struct above, importable as
      `package::milkyWay::field::records::FieldComponentRec`.
- [ ] Update `io.wesl` to import it and change the `comps` binding's type.
      Every existing `comps[i].xyz`-style swizzle read elsewhere
      (`fieldSplat/`, `hiiSplat/`, `dustMap/fragment.wesl:165-167`) must keep
      compiling unchanged — a `FieldComponentRec` reinterpreted as 4 `vec4`s
      is bit-identical, so if a read site breaks, the struct field order is
      wrong, not the read site.
- [ ] Write `records.parity.test.ts` following
      `tests/tools/galaxy-renderer/engine/ismMap/packIsmMapFluidConstants.test.ts`'s
      technique exactly: `parseWgslStructFields` + `layoutWgslStruct` +
      `wgslPrimitiveLayout` (`tools/utils/wgsl/*.ts`) read `FieldComponentRec`
      from the new `.wesl` file; a sentinel-valued `GalaxyFieldComponent` is
      packed via `packFieldComponents`; each sentinel's observed offset in
      the packed `Float32Array` is asserted against the struct's own offset
      for that field name.
- [ ] `npm run galaxy-renderer:probe` — PASS (no shader linking regression).
- [ ] Commit.

## Task 2: Drop `applyIsmMapSeeding`

**Why:** Scope decision (verified): `hiiRegions.ts:771-773` already gates
`applyIsmMapSeeding` off the fluid path (`isFluid ? candidateRegions :
applyIsmMapSeeding(...)`), and `defaultGalaxyIsmMapParams.ts:6` ships
`generator: 'fluid'` as the only default — the function is dead on every
shipped default today. Dropping it changes nothing at defaults; the legacy
event-stamp (`generator !== 'fluid'`) path loses map-seeded HII centres,
accepted.

**Files:**
- Modify: `src/services/engine/galaxyGenerator/v2/hiiRegions.ts` — delete
  `applyIsmMapSeeding` (`:411-434`), its `seedingCdfMemo` (`:380`), and the
  `isFluid ? candidateRegions : applyIsmMapSeeding(...)` branch at
  `buildHiiRegionsWithSegments` (`:771-773`) collapses to
  `candidateRegions` unconditionally (the `isFluid` local and its own guard
  at `:762` may still be needed by other logic in the function — read the
  surrounding body before deleting `isFluid` itself).
- Modify/delete: any test in `tests/services/engine/galaxyGenerator/v2/hiiRegions.test.ts`
  (or wherever `hiiRegions.ts`'s tests live — locate via
  `grep -rl applyIsmMapSeeding tests/`) that exercises `applyIsmMapSeeding`
  directly or asserts the legacy-path map-seeding behavior.

**Behaviour:** `buildHiiRegionsWithSegments`/`buildHiiRegions` produce
byte-identical output for `generator: 'fluid'` (today's only shipped
default) before and after this change. For the legacy generator path,
region centres come straight from `planRegions` with no post-pass — a real,
accepted behavior change, not a bug.

- [ ] `grep -rn applyIsmMapSeeding src tests` to find every call site and
      test reference before deleting.
- [ ] Delete the function, its memo, and collapse the ternary at `:771-773`.
- [ ] Delete or rewrite the tests that named `applyIsmMapSeeding` directly;
      keep any test that exercises `buildHiiRegionsWithSegments`'s public
      behavior at `generator: 'fluid'` (it should still pass unchanged).
- [ ] `npm test -- hiiRegions` → green.
- [ ] `npm run typecheck` → green (catches any stray import).
- [ ] Commit.

## Task 3: `ringReduce.wesl` — ring-means slice

**Why:** Ground Prep #3, ring-means half. `recomputeIsmMapSeedingMeans`
(`createGalaxyModel.ts:349-353`) computes `ismMapRingMeans` on the CPU from
a `mapAsync`-landed `GalaxyIsmMap`, then uploads via
`ismMapGenerator.writeRingMeans` (`createIsmMapOutput.ts:263-265`, which
already just does `device.queue.writeBuffer(ringMeansBuf, 0, means)`). A GPU
reduction writing `ringMeansBuf` directly removes this CPU round trip
without changing what any downstream reader sees — `ringMeansBuf` is
already a GPU resource today, only the producer moves.

**Files:**
- Create: `src/services/gpu/shaders/milkyWay/ismMap/ringReduce.wesl`
- Create: `tools/galaxy-renderer/src/engine/ismMap/createIsmMapRingReduce.ts`
  (dispatch host — pipeline + bind group, `dispatch(encoder, ...)` API,
  following `createIsmMapFluidRunner.ts`'s shape: pipelines built once,
  `rebuild`/`dispatch` takes per-call args)
- Modify: `tools/galaxy-renderer/src/engine/model/createGalaxyModel.ts:349-353`
  (`recomputeIsmMapSeedingMeans` — its `ismMapRingMeans` CPU call is
  replaced by encoding this pass into the same rebuild's encoder; the
  cached `ismMapGlobalMeanDust` scalar the function also derives —
  `arrayMean(ringMeans)` — either comes from a 1-texel reduction of
  `ringMeansBuf` or is read back once behind the same debug-diagnostics
  discipline Task 10 establishes; pick whichever keeps this task's diff
  smallest, since Task 10 revisits this file anyway)
- Test: `tests/tools/galaxy-renderer/engine/ismMap/createIsmMapRingReduce.test.ts`
  wired through Task 5's probe readback harness (this task cannot land a
  meaningful correctness test until Task 5 exists — see Task 5's own
  ordering note; this task may write the shader and host now and land its
  correctness assertion once Task 5 merges, or simply follow Task 5 in
  dispatch order despite the DAG marking both Group A — the DAG's "no
  cross-dependency" claim is about *files*, not test landing order)

**Contract:**

```wgsl
// src/services/gpu/shaders/milkyWay/ismMap/ringReduce.wesl
// Reduction over ISM_MAP_RINGS rows of ISM_MAP_AZ columns each: one thread
// group per ring, workgroup-reduce across az, write one f32 per ring.
@compute @workgroup_size(ISM_MAP_AZ_WORKGROUP_SIZE)
fn csRingMeans(@builtin(global_invocation_id) id: vec3<u32>) { }
```

Use `workgroup_size(16, 16)` matching every other 2D ismMap pass
(`ismMapFluidStep.wesl:167`, `ismMapDustBlur.wesl:19`) unless the reduction
shape genuinely wants a 1D-per-ring dispatch — implementer's call, exact
structure is not pinned by this plan.

- [ ] Write `ringReduce.wesl`'s ring-means entry point, reading `ismMapTex`
      (or whatever texture handle `ismMapRingMeans`'s CPU version reads —
      confirm against `ismMapRingMeans.ts:14-35`'s `extract(texel) =>
      texel.dust` call shape) and writing `ringMeansBuf`-shaped output.
- [ ] Write `createIsmMapRingReduce.ts`'s dispatch host.
- [ ] Wire `recomputeIsmMapSeedingMeans` to encode this pass instead of
      running the CPU loop, for the fluid-generator path only (build on this
      task's own gate — `fieldTuning.ismMap.generator === 'fluid'`, matching the
      existing call sites' own gating at `createGalaxyModel.ts:426-427`).
- [ ] `npm run galaxy-renderer:probe` → PASS.
- [ ] Commit.

## Task 4: Arm-gather RNG fix — stars-only advection velocity

**Why this task exists (plan-time addition, folded in per user instruction):**
the fluid ISM map's `stars` tracer today advects through the SAME
`velocityTex` gas uses, which carries `armGather`/`armDrag` terms — those
terms produce visible sharp lines in the young-stars layer because stars are
collisionless and shouldn't gather/drag like gas. This commit gives `stars`
its own shear+curl-only velocity. Folded into this PR (not spec-mandated
Ground Prep, but user-approved scope) so its look shift and the RNG re-roll
(Tasks 7/8) land together for Task 11's single recalibration pass.

**Design correction (see "Corrections to spec anchors" above):** the fold-in
decision described packing this into `velocityTex`'s free `.zw` lanes; `.z` is
occupied by `eventStamp` (`ismMapFluidVelocity.wesl:368`,
`ismMapFluidStep.wesl:210`). This task instead adds a second small storage
texture.

**Files:**
- Modify: `src/services/gpu/shaders/milkyWay/ismMap/ismMapFluidVelocity.wesl`
  — new `@group(0) @binding(N) var starsVelocityTex:
  texture_storage_2d<rg16float, write>;`, written alongside `velocityTex` in
  the same `cs` entry point (`:368`'s `textureStore` call gets a sibling
  store of `(shearVelAz, curlStrength * curl.y)` — no `armGather`, no
  `armDrag`, no event kicks — into `starsVelocityTex`; confirm the exact
  term list against `composedVelocity`'s body at `:193-278` before writing,
  the "no gather/drag" requirement is the spec's, the exact expression is
  this task's to derive from the existing function)
- Modify: `src/services/gpu/shaders/milkyWay/ismMap/ismMapFluidStep.wesl`
  — new binding for `starsVelocityTex` (`texture_2d<f32>`); the `stars`
  channel's semi-Lagrangian back-trace (today folded into the shared
  `advected` computation reading `velocityTex`, `:131-134` / `:203-252`)
  gets its own back-trace sampling `starsVelocityTex` instead — "one extra
  prevTex back-trace" per the spec, i.e. a second bilinear sample of
  `prevTex.y` at the position `starsVelocityTex` advects to, independent of
  where `velocityTex` advects gas/dust/activity.
- Modify: `tools/galaxy-renderer/src/engine/ismMap/createIsmMapFluidRunner.ts`
  — allocate `starsVelocityTex` (`rg16float`, same `[ISM_MAP_AZ,
  ISM_MAP_RINGS]` size as `velocityTex`, `:91-96`) and bind it into both
  passes' `layout: 'auto'` bind groups (rebuild bind groups after any
  pipeline-layout-affecting change — see the project's own 'auto' layout
  trap note).

**Behaviour:** the `stars` state channel (`.y` in `IsmMap`'s `x=gas,
y=stars, z=activity, w=dust` layout, `ismMapFluidStep.wesl:6-9`) advects
through shear+curl only. `gas`/`dust`/`activity` advection is unchanged —
this task touches only the stars back-trace.

- [ ] Invoke the `wesl-shaders` skill before editing either `.wesl` file.
- [ ] Write the velocity-composition change in `ismMapFluidVelocity.wesl`.
- [ ] Write the stars-only back-trace in `ismMapFluidStep.wesl`.
- [ ] Wire the new texture through `createIsmMapFluidRunner.ts`.
- [ ] `npm run galaxy-renderer:probe` → PASS (this is the ONLY automated
      check for this task — the look change itself is validated in Task 11,
      not here; do not attempt to write a numeric "arm-gather line is gone"
      test, there is no headless rendering harness to measure it against).
- [ ] Commit.

## Task 5: Probe numeric-readback harness (testing infrastructure)

**Why this task exists (plan-time addition):** the spec's Testing section
requires GPU compute output to be checked against CPU reference values
"within float tolerance," but the only automated path that reaches these
shaders is `probeGpuErrors.ts` (Playwright + real Chromium), which today
"judges NOTHING about the picture — errors only"
(`tools/galaxy-renderer/probeGpuErrors.ts:9`). There is no headless
WebGPU-in-Node harness in this repo (`@webgpu/types` is types-only; no
`dawn`/`gpu` runtime dependency exists — verified via `package.json`).
Numeric validation for Tasks 6/9 needs *some* real-GPU path; this task adds
one debug-gated readback hook the probe can drive.

**Files:**
- Modify: `tools/galaxy-renderer/probeGpuErrors.ts` — add a step that, behind
  a debug flag already reachable from the tool's UI (or a new one, minimal),
  triggers a readback of a named GPU buffer and asserts a decoded value is
  within tolerance of a value passed into the probe run. Model this on the
  existing settle-frame / `page.evaluate` discipline already in the file
  (see `SETTLE_FRAMES`, `:24-27`) — do not invent a second probe script;
  this repo's convention is one probe.
- New readback plumbing this exposes (used by Tasks 6 and 9): a debug-gated
  `requestX`-shaped hook analogous to `createIsmMapReadbacks.ts`'s
  `requestIsmMap`/`requestOrientation`, added to whichever module owns the
  buffer under test — each task adds its own hook when it needs one, this
  task only proves the probe-side plumbing (page evaluate → decode →
  compare) works end to end against one existing, already-landed buffer
  (e.g. `ringMeansBuf` from Task 3, or `orientationData` which already has a
  working readback) before Task 6 leans on the pattern for a brand-new
  buffer.

**Contract:** whatever function this task adds, name it so Tasks 6 and 9 can
find and reuse the pattern by grep — no code from this task is pasted
forward into later tasks' plan text; later tasks cite this task's file by
name.

- [ ] Pick one already-landed GPU buffer (recommend `ringMeansBuf` post-Task
      3, since it is small and has a known CPU reference —
      `ismMapRingMeans.ts`) and extend `probeGpuErrors.ts` with a step that
      reads it back and diffs against a CPU-computed expectation for a fixed
      preset.
- [ ] `npm run galaxy-renderer:probe` → PASS, and demonstrably FAILS if the
      tolerance is tightened past what the two computations actually
      disagree by (sanity-check the assertion is live, not vacuously true —
      temporarily corrupt one side, confirm the probe reports it, then
      revert).
- [ ] Commit.

## Task 6: `ismMapDustCdfScan.wesl`

**Why:** Design decision "Density sampling: GPU CDF, not bounded rejection."
Reproduces `buildIsmMapDustCdf`'s annular-sector-weighted prefix sum
(`src/utils/galaxy/buildIsmMapDustCdf.ts:39-70`) as a GPU scan, over a
per-texel weight function supplied by the caller — dust density for Task 7,
`armBiasedDensity`-reweighted activity for Task 8 (both share this one scan,
per the spec's "the scan pass takes a per-texel weight input, not a bare
channel index").

**Files:**
- Create: `src/services/gpu/shaders/milkyWay/ismMap/ismMapDustCdfScan.wesl`
- Create: `tools/galaxy-renderer/src/engine/ismMap/createIsmMapDustCdfScan.ts`
  (dispatch host)
- Test: extend Task 5's probe with a fixture-map scan-vs-CPU-prefix-sum
  comparison (see Testing note below); add a plain Vitest test only for any
  pure TS helper this task introduces (e.g. a uniform-table packer for the
  weight function's parameters) — not for the shader's own numeric output,
  which has no non-GPU path to check.

**Contract:**

```wgsl
// src/services/gpu/shaders/milkyWay/ismMap/ismMapDustCdfScan.wesl
// Prefix-sum over ISM_MAP_RINGS x ISM_MAP_AZ (786432 texels), area-weighted
// per texelArea = 0.5 * dTheta * (rOuter^2 - rInner^2) — see
// buildIsmMapDustCdf.ts:54 for the derivation this must reproduce exactly,
// not approximate. Per-texel weight comes from a uniform-parametrized
// function (dust density for placeDust, arm-biased activity for
// placeDigVeil), not a hardcoded channel read.
@compute @workgroup_size(16, 16)
fn cs(@builtin(global_invocation_id) id: vec3<u32>) { }
```

The weight function is a small uniform table (matching the spec's
"the arm-proximity envelope becomes a small uniform table the scan can
evaluate per texel") — `buildArmProximityEnvelope`'s CPU closure
(`hiiRegions.ts:484-518`) becomes packed per-arm data (ridge angle, weight,
`invSigma`) this shader reads, not a re-derivation of the CPU closure's
control flow.

- [ ] Invoke the `wesl-shaders` skill.
- [ ] Write the two-pass scan (per-ring workgroup scan, then a fold pass
      combining ring totals into a running offset — "exact structure is
      implementation detail," per the spec).
- [ ] Write `createIsmMapDustCdfScan.ts`'s dispatch host, parametrized so a
      caller supplies either a dust-density weight table or an arm-biased
      activity weight table.
- [ ] Extend Task 5's probe harness: seed a small fixture `GalaxyIsmMap`
      (few rings, few az — small enough the CPU reference is fast), run
      both `buildIsmMapDustCdf` (CPU, dust weight) and this GPU scan against
      it, read back the GPU prefix buffer, assert per-texel agreement within
      float tolerance (the spec's own acceptance criterion).
- [ ] `npm run galaxy-renderer:probe` → PASS.
- [ ] Commit.

## Task 7: `placeDust.wesl` + `rebuildDustMixture` wiring

**Why:** Design decision "Renorm: consume-time scale" + "RNG: slot-hash
adoption." This is the single largest algorithmic port in the plan — it
must reproduce `dustParticleCloud.ts`'s map-seeded path (`:156-317`),
including `buildClusteredDiscPlacement`'s complex/child clumping
(`clusteredDiscPlacement.ts:227-...` — **stays as a CPU function**, still
used by `armParticleCloud.ts`/`armSpurParticleCloud.ts`; this task ports its
algorithm to GPU for the dust use case, it does not touch or delete the CPU
function itself), area-preserving aspect via orientation coherence
(`dustParticleCloud.ts:225-235`, `sampleIsmMapOrientation.ts:20-35`), and the
survival floor (`DUST_SURVIVAL_FLOOR_FRAC`, `dustParticleCloud.ts:106`,
already parity-tested against the shader's own copy per
`tests/services/gpu/shaders/constants.parity.test.ts` — reuse that constant,
don't re-derive it).

**Files:**
- Create: `src/services/gpu/shaders/milkyWay/ismMap/placeDust.wesl`
- Modify: `tools/galaxy-renderer/src/engine/model/createGalaxyModel.ts:524-...`
  (`rebuildDustMixture` — its map-dependent branch, today calling
  `buildDustParticleCloud` CPU-side, encodes this compute pass into the
  rebuild's encoder instead, per Ground Prep #2's "same seam, different
  closure body")
- Create: `tools/galaxy-renderer/src/engine/ismMap/createIsmMapPlaceDust.ts`
  (dispatch host)
- Test: `tests/tools/galaxy-renderer/engine/ismMap/createIsmMapPlaceDust.test.ts`
  for any pure TS helper (budget math, uniform packing); probe-driven
  determinism/count/survival-floor assertions per the spec's Testing
  section, added to Task 5's harness

**Contract — inputs/outputs, not derivation:**
- Reads: Task 6's CDF scan output (dust-density weighted), the orientation
  texture (`createIsmMapOrientation.ts` — read its current binding shape
  before wiring a new bind group entry), `MAX_PARTICLE_COUNT = 40000`
  (`dustParticleCloud.ts:40`) as the fixed slot ceiling.
- Per invocation (one thread per particle slot): binary-search the CDF
  (reproducing `sampleIsmMapDustCdf.ts:20-29`'s upper-bound search over the
  GPU-resident prefix buffer), draw via `genRand(seed, pop, idx, slot)`
  (`generate.wesl:184-185`) in place of every `mulberry32` draw the CPU path
  made, apply the area-preserving aspect from orientation coherence, zero
  `amplitude` on a survival-floor miss rather than skipping the write.
- Writes: one `FieldComponentRec` (Task 1's struct) per slot into the
  `comps` buffer's dust slot range, via `createGrowOnlyRecordBuffer`
  (`tools/galaxy-renderer/src/engine/gpu/createGrowOnlyRecordBuffer.ts:33-68`)
  — the CPU still decides slot *count* (`MAX_PARTICLE_COUNT`), the shader
  decides slot *contents*.
- Does NOT bake the Larson mass renormalization (`massPerR2 =
  totalMass/sumR2`, `dustParticleCloud.ts:290`) into `amplitude` — raw
  `radius`-derived mass only. Task 9 supplies the missing renorm as a
  consume-time uniform multiply.

- [ ] Invoke the `wesl-shaders` skill.
- [ ] Write `placeDust.wesl`'s `cs` entry point per the contract above,
      `@workgroup_size(256)` (1D per-particle-slot dispatch, matching
      `generateDust.wesl:50`/`generateStars.wesl:58`'s v1 precedent).
- [ ] Write `createIsmMapPlaceDust.ts`'s dispatch host.
- [ ] Wire `rebuildDustMixture`'s map-dependent branch to encode this pass.
- [ ] Add probe assertions (Task 5's harness): fixed `(seed, grid)` produces
      a bit-identical record set across two runs (determinism); the written
      component count matches `MAX_PARTICLE_COUNT`'s own budget math; at
      least one record's `amplitude` reads exactly `0` for a fixture tuned
      to fail the survival floor somewhere (observable zeroing, not
      absence).
- [ ] `npm run galaxy-renderer:probe` → PASS.
- [ ] Commit.

## Task 8: `placeDigVeil.wesl` + `rebuildHiiIfSeeded` wiring

**Why:** Design decision, DIG veil half. Ports `buildDigVeil`'s
complex-then-children placement (`hiiRegions.ts:605-...`) — complexes
CDF-sampled from `armBiasedDensity`-reweighted activity
(`hiiRegions.ts:534-546`, using Task 6's arm-envelope-parametrized scan),
children scattered per-complex with coherence blending
(`scatterAxesForCoherence`, `hiiRegions.ts:554-579`). Gated on Task 2 (dead
`applyIsmMapSeeding` code removed first so this port isn't copying logic
that's about to be deleted) and Task 6 (shared CDF scan).

**Files:**
- Create: `src/services/gpu/shaders/milkyWay/ismMap/placeDigVeil.wesl`
- Modify: `tools/galaxy-renderer/src/engine/model/createGalaxyModel.ts:390-...`
  (`rebuildHiiIfSeeded` — its DIG-veil branch, today calling `buildDigVeil`
  CPU-side, encodes this compute pass instead)
- Create: `tools/galaxy-renderer/src/engine/ismMap/createIsmMapPlaceDigVeil.ts`
  (dispatch host)
- Test: probe-driven determinism/budget/survival assertions added to Task
  5's harness, same shape as Task 7's

**Contract:**
- Reads: Task 6's CDF scan output (activity-weighted, arm-biased —
  `buildArmProximityEnvelope`'s packed uniform table), `DIG_MAX_COUNT = 1440`
  (`hiiRegions.ts:109`) as the fixed complex×children slot ceiling,
  `dig.childrenPerComplex`/`dig.elongation`/`dig.coherence`/`dig.armBias`
  from `GalaxyHiiDigTuning` (see `hiiRegions.ts:605-616`'s doc for the exact
  tuning fields).
- Per complex (CDF-sampled position via `placeDigMapComplex`'s algorithm,
  `hiiRegions.ts:457-463` — `warpSurfaceFrame`, `src/utils/galaxy/warpSurfaceFrame.ts:20`,
  supplies the local flow frame the GPU shader must reproduce or read an
  equivalent of): scatter `childrenPerComplex` children along/across the
  frame, coherence-blended per `scatterAxesForCoherence`'s rotation
  (`hiiRegions.ts:554-579`), each drawn via `genRand` slot-hash, never
  `mulberry32`.
- Writes: one `FieldComponentRec` per child slot, `amplitude = 0` for any
  slot the complex/child budget doesn't fill (same liveness-by-amplitude
  discipline as Task 7).

- [ ] Invoke the `wesl-shaders` skill.
- [ ] Write `placeDigVeil.wesl`'s `cs` entry point, `@workgroup_size(256)`.
- [ ] Write `createIsmMapPlaceDigVeil.ts`'s dispatch host.
- [ ] Wire `rebuildHiiIfSeeded`'s DIG-veil branch to encode this pass.
- [ ] Add probe determinism/budget/survival assertions per Task 7's pattern.
- [ ] `npm run galaxy-renderer:probe` → PASS.
- [ ] Commit.

## Task 9: `ringReduce.wesl` — survivor-sum slice + renorm uniform

**Why:** Ground Prep #3, survivor-sum half; Design decision "Renorm:
consume-time scale, not baked mass." Task 7 deliberately left
`FieldComponentRec.amplitude` un-renormalized (raw `radius`-derived mass).
This task computes `sumR2` over Task 7's GPU-placed survivors (mirroring
`dustParticleCloud.ts:287-288`'s CPU loop, but over records `placeDust`
already wrote) and turns `massPerR2 = totalMass / sumR2`
(`dustParticleCloud.ts:290`) into a per-tier uniform scale multiplied in at
splat time.

**Files:**
- Modify: `src/services/gpu/shaders/milkyWay/ismMap/ringReduce.wesl`
  (extend with a second entry point or a second dispatch mode over the
  particle-slot domain instead of the ring×az domain — "two outputs sharing
  one dispatch shape" per the spec, implementer's call on exact structure)
- Modify: `tools/galaxy-renderer/src/engine/ismMap/createIsmMapRingReduce.ts`
  (Task 3's host — add the survivor-sum dispatch)
- Modify: `src/services/gpu/shaders/milkyWay/field/dustMap/fragment.wesl:237`
  (`coeff = dg0.w * sqrt(...)` — `dg0.w` is `amplitude`; the renorm scale
  uniform multiplies in here, or into `coeff` directly, so the record itself
  stays un-renormalized and every consumer of `comps` sees the same raw
  value)
- Modify: whichever `io.wesl`/uniform-packing file carries the dust tier's
  scalar uniforms today (locate via `grep -n dustSlices\|dustNoise
  src/services/gpu/shaders/milkyWay/field/io.wesl` — add one f32 lane for
  the renorm scale, matching how `dustNoise`/`dustCarve` are already packed
  as `vec4` uniform groups)
- Test: probe assertion (Task 5's harness) — survivor sum from the GPU
  reduction matches a CPU recomputation of `sumR2` over the same GPU-placed
  record set (read back Task 7's `comps` dust range, sum `radius**2`
  independently in the probe's Node-side code, compare to the GPU reduction
  output)

**Behaviour:** `dust.tau`'s physical meaning (galaxy's measured V-band
column) stays exact at consume time — numerically identical to the CPU
version's baked-in renorm at steady state, per the spec's own "the two are
numerically identical at steady state" note. This is a real behavior split
(bake vs. consume-time) the spec explicitly accepts, not a task to "fix."

- [ ] Invoke the `wesl-shaders` skill.
- [ ] Extend `ringReduce.wesl` with the survivor-sum reduction.
- [ ] Extend `createIsmMapRingReduce.ts`'s host.
- [ ] Add the renorm-scale uniform lane and wire it into
      `dustMap/fragment.wesl`'s `coeff` computation.
- [ ] Add the probe's survivor-sum-matches-CPU-recomputation assertion.
- [ ] `npm run galaxy-renderer:probe` → PASS.
- [ ] Commit.

## Task 10: Readback demotion

**Why:** Design decision "Readbacks demote to diagnostics." Once Tasks 7
and 8 make dust and DIG placement GPU-only, `rebuildDustMixture` and
`rebuildHiiIfSeeded` no longer need `readbacks.ismMapData`/
`readbacks.orientationData` to run — those fields become diagnostics-only
inputs. `createIsmMapReadbacks.ts`'s `mapAsync`/token-supersession machinery
itself (`createReadbackQueue.ts`) is untouched; it simply stops being
load-bearing for anything on screen.

**Files:**
- Modify: `tools/galaxy-renderer/src/engine/model/createGalaxyModel.ts:419-451`
  (`scheduleIsmMapReadback`/`scheduleOrientationReadback` — their bodies
  today call `rebuildDustMixture()`/`rebuildHiiIfSeeded()` as the "map
  landed late, rebuild placement" seam; after Tasks 7/8, placement no longer
  depends on this landing, so these two functions' calls into the rebuild
  functions come out. What they still need to do:
  `recomputeIsmMapSeedingMeans` (Task 3, if not already fully GPU-resident)
  and `orientationDiagnostics.noteCoherence(data)` (`:447`) — the
  diagnostics-only consumers — stay.)
- No change to `createIsmMapReadbacks.ts`, `createReadbackQueue.ts`,
  `orientationCoherenceStats.ts`, `createOrientationDiagnostics.ts`, or
  `ismMapPresent.wesl`'s debug-view gating — verify by grep after this
  task's edits that none of them changed.

**Behaviour:** the "seeding" debug view (`ismMapPresent.wesl`, gated behind
`viewIntensity('orientation')`/similar) and the orientation coherence
overlay still work — they read `readbacks.ismMapData`/`orientationData`
exactly as before, just from a landing that no longer also triggers a
placement rebuild.

- [ ] Read `createGalaxyModel.ts:390-460` in full before editing — the two
      schedule functions have several responsibilities interleaved
      (recompute means, rebuild dust, rebuild HII, note diagnostics); remove
      only the placement-rebuild calls, not the diagnostics ones.
- [ ] `grep -n "ismMapData\|orientationData" tools/galaxy-renderer/src/engine/model/createGalaxyModel.ts`
      after the edit — every remaining reference should be diagnostics-only
      (report functions, debug views), none on the path to
      `rebuildDustMixture`/`rebuildHiiIfSeeded`.
- [ ] `npm test -- createGalaxyModel` (or wherever its tests live) → green.
- [ ] `npm run galaxy-renderer:probe` → PASS — this is also where a
      dangling reference to a now-CPU-orphaned function would surface as a
      shader/bind-group error, since the probe drives the real tool UI
      including the debug views.
- [ ] Manually toggle the "seeding"/orientation debug views in the running
      tool (`npm run dev` equivalent for `tools/galaxy-renderer` — confirm
      the tool's own dev command) and confirm they still render — this one
      check has no automated substitute; note the result when reporting
      this task done.
- [ ] Commit.

## Task 11: Recalibration + visual pass

**Why:** Design decision "RNG: slot-hash adoption, and its cost" + the
user's explicit scope decision — ONE recalibration pass covers both the
slot-hash RNG re-roll (Tasks 7/8) and the arm-gather fix (Task 4)'s look
shift. Policy per the spec: recalibrate tool-side, once, checking that GPU
placement produces the same *kind* of result as the CPU path (CDF-correct,
survival-filtered, orientation-aspected) — not pixel-matching against the
old `mulberry32` output, which is an unreachable target now that the RNG
itself changed.

**Files:** none required — this task is a character-check + slider-nudge
pass over the running tool, plus (if nudges are needed) edits to
`tools/galaxy-renderer`'s tuning presets. If a preset file changes, cite it
here when the task closes.

**Not a task with a code diff of its own** — it is the plan's final gate,
requiring a human in the loop.

- [ ] Run the galaxy-renderer tool with the fluid ISM-map generator enabled
      (today's only shipped default).
- [ ] Character-check against `docs/research/m74-jwst/`'s existing sign-off
      criteria (the spike's own visual calibration record) — dust cloud
      placement should still read as CDF-weighted toward high-density
      texels, DIG veil should still read as a diffuse haze concentrated near
      arms when `armBias > 0`, no uniform-tail leak (the exact failure mode
      the CDF replaced bounded rejection to fix — see spec's "Rejected
      alternative" section; if this leak reappears, it is a Task 6/7/8 bug,
      not a recalibration matter).
- [ ] Toggle the arm-gather-affected view (young-stars layer) and confirm
      the sharp-line artifact from Task 4's motivating symptom is gone.
- [ ] Nudge sliders (dust cloud count, DIG fraction/coherence/armBias,
      young-stars brightness) back toward the pre-change character if the
      RNG swap shifted the felt density/brightness — a calibration knob
      change, not a code change, unless a preset default needs updating.
- [ ] User attestation: the user looks at the running tool and confirms the
      look is acceptable. Record the outcome (and any preset changes) in
      this task's checkbox notes before closing.
- [ ] Commit (only if a preset file changed).

---

## Definition of Done

- **Deliverable inventory:** `records.wesl` exists and is the `comps`
  layout authority; `packFieldComponents` is a parity-tested mirror.
  `ismMapDustCdfScan.wesl`, `placeDust.wesl`, `placeDigVeil.wesl`,
  `ringReduce.wesl` exist under `src/services/gpu/shaders/milkyWay/ismMap/`
  with TS dispatch hosts under `tools/galaxy-renderer/src/engine/ismMap/`.
  `applyIsmMapSeeding` is deleted. The stars tracer's shear+curl-only
  velocity texture exists and is wired into the fluid step.
- **Zero readback on the placement path:** `rebuildDustMixture`/
  `rebuildHiiIfSeeded`'s map-dependent branches encode compute passes; no
  `mapAsync` call sits between a rebuild and a drawn frame. Verify by
  grepping `createGalaxyModel.ts` for `ismMapData`/`orientationData` post-Task
  10 and confirming every hit is diagnostics-only.
- **Named observable behaviours for the manual pass (Task 11):** dust cloud
  placement reads CDF-weighted toward high-density texels; DIG veil
  concentrates near arms when `armBias > 0` with no uniform-tail leak; the
  young-stars layer's sharp arm-gather lines are gone; the orientation
  coherence overlay and "seeding" debug view still render correctly.
- **The deferral boundary:** per-galaxy instancing / the N-galaxies-at-60fps
  scheduler is explicitly out of scope (spec Non-goals) — this plan produces
  the zero-readback placement primitive, not the scheduler that calls it per
  catalog galaxy. `armParticleCloud.ts`/`armSpurParticleCloud.ts`/
  `youngStarChain.ts`/`dustBubblePlacements.ts`/`sfEventCatalog.ts` stay
  CPU, untouched by this plan.
- `npm run galaxy-renderer:probe` PASS on every task, and again at the end
  against the fully merged branch.
- One visual recalibration pass (Task 11), signed off by the user, closes
  the RNG-swap and arm-gather-fix look shifts.
