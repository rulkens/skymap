# Flow-Field Integration — Phase C: Renderer, Compute & Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Sister documents:**
> - [`docs/superpowers/specs/2026-06-04-flow-field-integration-design.md`](../specs/2026-06-04-flow-field-integration-design.md) — the approved design. Source of truth.
> - [`docs/superpowers/conventions/renderers.md`](../conventions/renderers.md) — the renderer convention this layer follows (factory + `satisfies Renderer` + GPU resources in closure).
> - [`docs/superpowers/conventions/plan-style.md`](../conventions/plan-style.md) — contract code yes, implementation code no.
>
> **Depends on:** Phase B (the `FlowFieldStore` the renderer reads each frame; the `FlowField` type + `flowFieldSlot.commit` calling `setField`). The renderer's `setField` is the seam the Phase-B slot already calls (null-safe until now).
>
> **Conventions** (from `CLAUDE.md` + memory):
> - Be **meticulous with WESL/WGSL** — slow down on shader edits; don't claim done without visual verification.
> - No backticks in WESL comments — use single quotes for identifier refs (the wesl-plugin parser breaks on backticks).
> - Compile every new shader through `createShaderModuleWithDevLog` (iOS WebKit is stricter than Chrome's Tint; a bad pipeline silently drops the whole frame).
> - `invModel * unitWorldDir` is NOT unit length when `model` has scale — renormalize before using lengths as distances.
> - Didactic comments; `type` aliases never `interface`; deep relative imports.
> - **Use the `wesl-shaders` skill** when editing any `.wesl` file or wiring wesl-plugin into a test config.
> - Background subagents can't run npm/git; the main thread runs tests/typecheck/commits. Never `git add -A`.
> - **Commits:** conventional-commits style (shown per task); use the user's git identity (never `--author=Claude…`); end every commit body with the trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## Goal

`createFlowFieldRenderer` owns the velocity texture, the **one shared**
`part`/`trail`/`acc` buffer set, three compute pipelines (`seed` / `advect` /
`streamline`) sharing **one explicit compute bind-group layout** (never
`layout:'auto'`), and the additive ribbon render pipeline. `encodeFlowCompute`
dispatches the compute work inside the per-frame encoder (no out-of-band submit —
the seed/advect/streamline distinction is *which passes are encoded*, not a
mutable seedFlag uniform). `flowFieldPass` draws the ribbons additively in
`HDR_PASSES` after `filamentsPass`. The shaders are adapted from cosmic-flow to
consume `model`/`invModel` (registering with the galaxies + CF-4 volume) instead
of the spike's baked `[-1,1]` cube. A `flowConstants.wesl` ↔ `flowFieldConstants.ts`
parity test pins the shared tunables.

## Architecture

This is the engine's **first compute renderer** (decision §1, §5). The spike's
seed race came from a one-shot signal in a mutable shared uniform; we delete the
root cause: a dedicated `seed` compute entry point sits beside `advect` /
`streamline`, all three sharing one explicit BGL, and "reseed vs steady frame" is
expressed as *which passes encode*. `flowFieldRenderer.maybeReseed()` records
"encode the seed pass this frame" on enable / mode-switch / count-change; it's a
no-op on steady frames. The reseed rides the normal frame encoder — WebGPU
inserts the storage-buffer barrier between compute passes. One buffer set is
shared across modes (decision §3 — modes never render simultaneously; switching
triggers a reseed). The cube's `model`/`invModel` come from `buildCubeModelMatrix`
(exported from `scalarVolumeRenderer`) fed the `FlowField`'s `origin`/`voxelSize`/
`frameKind`, so flow overlays by construction.

## Tech Stack

Raw WebGPU + WESL (compute + render), wesl-plugin `?static` imports. gl-matrix
for the model/invModel. Vitest (`node`) for: the constants-parity test
(regex-read the `.wesl`), `buildCubeModelMatrix`-for-flow math, the
`maybeReseed`/`isAnimating` state machine, and the pass `enabled` gate. The full
GPU pipeline is verified by a construction smoke test + a Phase-E/Phase-D visual
probe (headless Playwright screenshot — NOT canvas readback, which returns black
on ANGLE-Mac).

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `src/services/gpu/renderers/flowFieldRenderer.ts` | Factory: velocity texture + shared buffers + 3 compute pipelines (one explicit BGL) + ribbon pipeline; `setField`, `maybeReseed`, `isAnimating`, `encodeCompute`, `draw`, `destroy`. |
| `src/services/gpu/renderers/flowFieldConstants.ts` | `MAX_PARTICLES = 40000`, `TRAIL = 32`, plus the spike's other tunables (authoritative). |
| `src/services/gpu/shaders/flow/flowConstants.wesl` | WESL mirror of the shader-shared subset. |
| `src/services/gpu/shaders/flow/flowCompute.wesl` | `seed` / `advect` / `streamline` entry points; consumes `model`/`invModel`. |
| `src/services/gpu/shaders/flow/flowRender.wesl` | `vsTrail` / `fsTrail` ribbon; consumes `model`. |
| `src/services/engine/frame/encodeFlowCompute.ts` | Per-frame compute dispatch (mirrors `encodeVolumes`). |
| `src/services/engine/frame/passes/flowFieldPass.ts` | Additive ribbon `HDR_PASSES` entry, after `filamentsPass`. |
| `src/@types/rendering/FlowFieldRenderer.d.ts` | The renderer's public type. |
| `src/@types/engine/frame/EncodeFlowComputeArgs.d.ts` | The `encodeFlowCompute` args bag. |
| `tests/services/gpu/shaders/flowConstants.parity.test.ts` | `.wesl` ↔ `constants.ts` parity. |
| `tests/services/gpu/renderers/flowFieldRenderer.test.ts` | `maybeReseed`/`isAnimating` state machine; model-matrix math. |
| `tests/services/engine/frame/passes/flowFieldPass.test.ts` | `enabled` gate. |

**Modified:**

| File | Change |
|---|---|
| `src/@types/engine/EngineGpuHandles.d.ts` | Add `flowFieldRenderer: FlowFieldRenderer \| null`. |
| `src/services/engine/phases/initGpu.ts` | Construct `flowFieldRenderer`; thread it where `encodeVolumes` is invoked. |
| `src/services/engine/frame/passes/index.ts` | Insert `flowFieldPass` after `filamentsPass` in `HDR_PASSES`; re-export. |
| `src/services/engine/frame/runFrame.ts` | Call `encodeFlowCompute` before the HDR loop; add the render-on-demand term. |
| `src/services/engine/data/createFlowFieldStore.ts` | Import `MAX_PARTICLES` from `flowFieldConstants`; delete the Phase-B local default. |

---

## Task 1: Constants module + WESL mirror + parity test

**Files:** `src/services/gpu/renderers/flowFieldConstants.ts` (create), `src/services/gpu/shaders/flow/flowConstants.wesl` (create), `tests/services/gpu/shaders/flowConstants.parity.test.ts` (create), `src/services/engine/data/createFlowFieldStore.ts` (modify)

Authoritative TS constants (ported from cosmic-flow's `constants.ts`) with the
**spec-pinned changes**: `MAX_PARTICLES = 40000` (was 100000 — capacity = slider
ceiling = default count), `TRAIL = 32` (unchanged). Keep `LIFE`, `FADE`, `DT`,
`HEAD_STEP_SCALE`, `SPEED_COLOR_MAX`, `DENS_SCALE`. The WESL mirror re-declares
only the shader-read subset; the parity test regex-reads the `.wesl` and asserts
numeric equality (the cosmic-flow pattern).

```ts
// src/services/gpu/renderers/flowFieldConstants.ts
export const TRAIL = 32;
export const MAX_PARTICLES = 40000;   // buffer capacity = slider ceiling = default count
export const LIFE = 8.0;
export const FADE = 1.4;
export const DT = 0.016;
export const HEAD_STEP_SCALE = 0.012;
export const SPEED_COLOR_MAX = 1200.0;
export const DENS_SCALE = 1.0;
```

```
// src/services/gpu/shaders/flow/flowConstants.wesl  (no backticks in comments)
const TRAIL: u32 = 32u;
const LIFE: f32 = 8.0;
const FADE: f32 = 1.4;
const DENS_SCALE: f32 = 1.0;
const SPEED_COLOR_MAX: f32 = 1200.0;
```

- [x] Create `flowFieldConstants.ts` with the values above (didactic header noting MAX_PARTICLES is buffer-sizing + slider ceiling; do not "tidy").
- [x] Create `flowConstants.wesl` mirroring TRAIL/LIFE/FADE/DENS_SCALE/SPEED_COLOR_MAX.
- [x] Parity test — model on the cosmic-flow parity test: read the `.wesl` as text, regex `const NAME: type = value;`, assert each equals the TS export of the same name. Assert all five mirrored names are covered.
- [x] In `createFlowFieldStore.ts`, import `MAX_PARTICLES` from `flowFieldConstants` and seed `count` from it; delete the Phase-B local default + its reconcile comment.
- [x] `npm test -- flowConstants.parity` → pass. `npm test -- createFlowFieldStore` → still green. `npm run typecheck` → clean.
- [x] Commit: `feat(flow): flow constants + WESL mirror + parity test`.

## Task 2: Adapt the compute + render WESL to `model`/`invModel`

**Files:** `src/services/gpu/shaders/flow/flowCompute.wesl` (create), `src/services/gpu/shaders/flow/flowRender.wesl` (create)

Port `flowCompute.wesl` / `flowRender.wesl`, with three deliberate changes from
the spike:

1. **Split the seed path into its own entry point.** The spike branches on
   `prm.seedFlag` inside `advect`/`streamline`. Replace with a dedicated `seed`
   entry point (density-weighted spawn → collapse trail onto spawn → set age),
   and remove the `seedFlag` field from `Prm`. `advect`/`streamline` become
   pure steady-frame integrators. This is the architectural core of decision §5.
2. **Consume `model`/`invModel` instead of the baked `[-1,1]` cube.** The spike's
   `gridToWorld(voxel) = (voxel - 0.5) * 2.0` is replaced: the render shader maps
   grid `[0,1]³` to world via `model * vec4(voxel,1)` (the cube's footprint).
   Particles still integrate in grid `[0,1]³` space (the texture's native space),
   so the compute shader is unchanged in grid space — only the **render** shader
   needs `model`. The `Cam` uniform gains a `model: mat4x4<f32>`.
3. **No private tonemap.** The spike's exposure/contrast knobs are cut (decision
   §6); the fragment stays `col * alpha` additive into the shared HDR target.

**`Prm` compute uniform** (seedFlag removed; 44 bytes → round to 48):

```
  dt        f32 @ 0
  trailStep f32 @ 4
  headStep  f32 @ 8
  n         u32 @ 12
  frame     u32 @ 16
  mode      u32 @ 20    (advect=0 / streamline=1; chooses pickSpawn/integrator branch only)
  bias      f32 @ 24
  wander    f32 @ 28
  (pad to 48)
```

**Compute bindings (the ONE explicit BGL — must match the TS BGL in Task 3):**

```
@group(0) @binding(0) var<storage, read_write> parts: array<vec4<f32>>;
@group(0) @binding(1) var velTex: texture_3d<f32>;
@group(0) @binding(2) var velSamp: sampler;
@group(0) @binding(3) var<uniform> prm: Prm;
@group(0) @binding(4) var<storage, read_write> trail: array<vec4<f32>>;
@group(0) @binding(5) var<storage, read_write> acc: array<f32>;   // advect only; bound for all three (explicit BGL)
```

**`Cam` render uniform** (model added):

```
  mvp    mat4x4<f32> @ 0    (64 bytes)
  model  mat4x4<f32> @ 64   (64 bytes)
  width  f32         @ 128
  aspect f32         @ 132
  phase  f32         @ 136
  mode   u32         @ 140
  (pad to 144)
```

- [ ] Create `flowCompute.wesl` with `seed` / `advect` / `streamline` entry points, importing TRAIL/LIFE/DENS_SCALE from `flowConstants` via the `?static` package path. Single-quote any WGSL identifier refs in comments.
- [ ] Move the spike's `pickSpawn` / `overdensity` / `pcgHash` helpers in unchanged; the `seed` entry point is the spike's `seedFlag==1u` block extracted; `advect`/`streamline` are the spike's steady-frame bodies with the seed branch removed.
- [ ] Create `flowRender.wesl` with `vsTrail`/`fsTrail`, the `Cam` struct above; replace `gridToWorld`'s baked `[-1,1]` with `model * vec4(voxel,1)`; keep the speed colour ramp + per-mode alpha.
- [ ] (No standalone shader test — shaders compile in the renderer smoke test, Task 3. Visual verification is the Phase-D/E probe.)
- [ ] `npm run typecheck` → clean (the `.wesl?static` imports resolve once the renderer imports them in Task 3; this task may leave the shaders unreferenced — that's fine).
- [ ] Commit: `feat(flow): adapt flow compute + render WESL to model/invModel`.

## Task 3: `flowFieldRenderer` factory

**Files:** `src/@types/rendering/FlowFieldRenderer.d.ts` (create), `src/services/gpu/renderers/flowFieldRenderer.ts` (create), `tests/services/gpu/renderers/flowFieldRenderer.test.ts` (create)

Factory per the renderer convention: GPU resources in the closure, `satisfies
Renderer`, `draw` for the per-frame ribbon encode. The three compute pipelines
share **one explicit `GPUBindGroupLayout`** (decision §5) — built from a manual
descriptor matching the WESL bindings in Task 2 — so all three reference the same
bind group (no `layout:'auto'` pipeline-specific-layout trap). One buffer set
(`part`/`trail`/`acc`), shared across modes. `setField` builds the
`model`/`invModel` from the `FlowField` meta via `buildCubeModelMatrix` (imported
from `scalarVolumeRenderer`).

```ts
// src/@types/rendering/FlowFieldRenderer.d.ts
export type FlowFieldRenderer = {
  readonly label: string;
  /** Receive the loaded velocity cube; build model/invModel, bind the texture. */
  setField(field: FlowField): void;
  /** Record "encode the seed pass next frame" on enable / mode-switch / count-change. */
  maybeReseed(): void;
  /** True while the layer is enabled + loaded (both modes animate). */
  isAnimating(): boolean;
  /** Dispatch seed?(then)integrate into the frame encoder, reading the store. */
  encodeCompute(encoder: GPUCommandEncoder, store: FlowFieldStore, frame: number): void;
  /** Additive ribbon draw into the open HDR pass. */
  draw(pass: GPURenderPassEncoder, viewProj: Mat4, viewportPx: Vec2, store: FlowFieldStore): void;
  destroy(): void;
};
```

**Factory** (named-bag per the convention — flow is a new renderer, no positional
legacy to match):

```ts
export function createFlowFieldRenderer(init: {
  device: GPUDevice;
  hdrFormat: GPUTextureFormat;
}): FlowFieldRenderer;
```

Internal state machine:
- `reseedPending: boolean` — set by `maybeReseed`, consumed (cleared) by the next
  `encodeCompute` (which encodes the `seed` pass that frame, then the integrate
  pass).
- buffers sized off `MAX_PARTICLES` + `TRAIL` from `flowFieldConstants`.
- `setField` is idempotent (destroys a prior texture); builds the explicit
  compute bind group (now that the velocity texture exists) + the render bind
  group.

**`invModel` hazard:** the compute shader integrates in grid `[0,1]³` space, so it
does NOT transform ray distances through `invModel`. The render shader uses only
`model` (forward). Note in the renderer header that if a future change samples the
field along a world-space ray, `invModel * unitWorldDir` must be **renormalized**
before its length is used as a distance (the documented project hazard). Build
`invModel` anyway (`mat4.invert`) and pass it for forward-compat, but flag that it
is currently unused by the integrator.

**Tests** (`node`, no GPU — exercise the pure state machine + matrix math; gate
GPU construction behind a device-presence check that skips in `node`):

- [ ] `maybeReseed sets reseedPending; encodeCompute clears it` — drive a fake/minimal renderer object exposing the flag, or factor the reseed state into a tiny pure helper `createReseedLatch()` and test that directly (record → consume → no-op).
- [ ] `isAnimating reflects enabled && loaded` — feed store stubs: not-enabled → false; enabled-not-loaded → false; enabled+loaded → true.
- [ ] `model matrix places the cube origin in world space` — call `buildCubeModelMatrix` with a synthetic `FlowField` meta (origin/voxelSize/frameKind=supergalactic-cartesian) and assert the transformed grid corner `(0,0,0)` lands at `origin` mapped through the SG→world rotation (reuse the existing `buildCubeModelMatrix` test fixtures as a template).
- [ ] Construct `createFlowFieldRenderer` once under a real device IF available (`navigator.gpu` present), else skip — asserts the three compute pipelines + ribbon pipeline build without a validation error (this is the iOS/Tint compile gate; `createShaderModuleWithDevLog` surfaces the real error).
- [ ] `npm test -- flowFieldRenderer` → pass. `npm run typecheck` → clean.
- [ ] Commit: `feat(flow): flowFieldRenderer (3 compute pipelines, explicit BGL, shared buffers)`.

## Task 4: `encodeFlowCompute` + initGpu construction

**Files:** `src/@types/engine/frame/EncodeFlowComputeArgs.d.ts` (create), `src/services/engine/frame/encodeFlowCompute.ts` (create), `src/@types/engine/EngineGpuHandles.d.ts` (modify), `src/services/engine/phases/initGpu.ts` (modify), `tests/services/engine/frame/encodeFlowCompute.test.ts` (create)

Mirrors `encodeVolumes`: a pre-HDR step that runs inside the single frame
encoder. It gates on `flowFieldRenderer !== null && store.enabled && store.loaded`
(the bootstrap + opt-in gate), then calls `renderer.encodeCompute(encoder, store,
frame)`. **No out-of-band submit** — the seed pass (when `reseedPending`) and the
integrate pass are both encoded into the passed-in `encoder`; WebGPU inserts the
storage barrier. This is the decision-§5 invariant.

```ts
// src/@types/engine/frame/EncodeFlowComputeArgs.d.ts
export type EncodeFlowComputeArgs = {
  encoder: GPUCommandEncoder;
  flowFieldRenderer: FlowFieldRenderer | null;
  store: FlowFieldStore;
  frame: number;
};
```

```ts
// src/services/engine/frame/encodeFlowCompute.ts
export function encodeFlowCompute(args: EncodeFlowComputeArgs): void;
```

- [ ] Add `flowFieldRenderer: FlowFieldRenderer | null` to `EngineGpuHandles`.
- [ ] Construct `flowFieldRenderer` in `initGpu` (after the HDR context exists, like `filamentRenderer`/`scalarVolumeRenderer`); write the handle onto `state.gpu`.
- [ ] Create `encodeFlowCompute` per the contract — gate, then delegate to `renderer.encodeCompute`. Didactic header: explain the no-out-of-band-submit invariant + that seed-vs-steady is which passes encode (cite decision §5).
- [ ] Wire the call into `runFrame` (or wherever `encodeVolumes` is invoked) **before** the HDR pass loop opens, passing the frame counter.
- [ ] Test — `encodeFlowCompute.test.ts`: `skips when renderer is null`; `skips when store.enabled is false`; `skips when store.loaded is false`; `delegates to encodeCompute when enabled + loaded` — use a spy renderer object (the function takes the renderer via args, so no GPU needed).
- [ ] `npm test -- encodeFlowCompute` → pass. `npm run typecheck` → clean.
- [ ] Commit: `feat(flow): encodeFlowCompute pre-HDR dispatch + initGpu construction`.

## Task 5: `flowFieldPass` in `HDR_PASSES` + render-on-demand

**Files:** `src/services/engine/frame/passes/flowFieldPass.ts` (create), `src/services/engine/frame/passes/index.ts` (modify), `src/services/engine/frame/runFrame.ts` (modify), `tests/services/engine/frame/passes/flowFieldPass.test.ts` (create)

Additive, no depth (decision §6 — the HDR pass has no depth attachment; order is
cosmetic; flow sits among the structure layers, inserted **after**
`filamentsPass`). The pass `enabled` gate mirrors `filamentsPass`: true when
`state.data.flow.enabled` (and a null-safe renderer check in `draw`). `draw`
calls `flowFieldRenderer.draw(pass, vp, viewportPx, store)`.

The render-on-demand term (decision §7): add `flow.enabled &&
flowFieldRenderer.isAnimating()` to the `runFrame` reschedule predicate (currently
ending at line ~508 — the `state.subsystems.clusterFocus.isAwake(nowMs)` OR
chain). Both modes animate, so the term keeps the loop alive whenever flow is on.

**Before/after** (the reschedule predicate, `runFrame.ts`):

```ts
const stillAnimating =
  state.settings.camera.autoRotate ||
  state.subsystems.tweens.isActive() ||
  state.subsystems.spaceMouse.hasAxes() ||
  (ready && state.subsystems.texturedDisks.hasInFlightWork()) ||
  state.subsystems.fades.isAnyAnimating(nowMs) ||
  state.subsystems.clusterFocus.isAwake(nowMs) ||
  // NEW: flow drives continuous render only when the user has opted in.
  (state.data.flow.enabled && state.gpu.flowFieldRenderer?.isAnimating() === true);
```

- [ ] Create `flowFieldPass` (`name: 'flow'`), `enabled` gating on `state.data.flow.enabled`, `draw` null-checking `deps.flowFieldRenderer` then drawing. Didactic header: additive, no depth, after filaments (cite §6).
- [ ] Insert `flowFieldPass` into `HDR_PASSES` immediately after `filamentsPass`; add the matching `export { flowFieldPass } from './flowFieldPass'`. (This auto-acquires a GPU-timing slot + DebugPanel row via `TIMED_SLOT_NAMES`.)
- [ ] Add the render-on-demand term to the `runFrame` `stillAnimating` predicate.
- [ ] Test — `flowFieldPass.test.ts`: `enabled is false when flow.enabled is false`; `enabled is true when flow.enabled is true` (use the same state-stub shape the existing pass tests use).
- [ ] `npm test -- flowFieldPass` → pass. `npm run typecheck` → clean. `npm test` → full suite green.
- [ ] Commit: `feat(flow): flowFieldPass in HDR_PASSES + render-on-demand term`.

---

## Spec coverage (Phase C)

- Decision §1 (flowFieldRenderer / encodeFlowCompute / flowFieldPass peer layer) → Tasks 3, 4, 5.
- Decision §3 (one shared buffer set, reseed on switch) → Task 3 (`maybeReseed`).
- Decision §4 (consume model/invModel via buildCubeModelMatrix; overlay by construction) → Tasks 2, 3.
- Decision §5 (delete the mutable seedFlag; dedicated seed entry point; one explicit compute BGL; reseed rides the normal encoder, no out-of-band submit) → Tasks 2, 3, 4.
- Decision §6 (additive, no depth; private tonemap cut; intensity is a pre-blend multiplier) → Tasks 2 (no private tonemap), 5 (additive pass). Intensity wiring lands here as the fragment multiplier reading `store.intensity` through the `Cam`/draw path.
- Decision §7 (render-on-demand term) → Task 5.
- Testing strategy: constants parity → Task 1; (visual probe deferred to Phase D/E).
- Risk: invModel renormalization hazard → Task 3 header note. iOS shader compile via `createShaderModuleWithDevLog` → Tasks 2, 3.

> **Intensity note:** the user-facing `intensity` slider is the pre-blend ribbon
> brightness multiplier (decision §6). It is read from `store.intensity` and packed
> into the `Cam` uniform in `draw`, then multiplied into the fragment output. Add
> the `intensity` field to the `Cam` struct (e.g. `@144`, pad to 160) in Task 2 and
> wire it in Task 3's `draw`; the Phase-D handle exposes the slider.
