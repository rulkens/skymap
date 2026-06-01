# Cluster-Viz 4/4 — Focus Mode (Member Isolation)

> **For agentic workers:** REQUIRED SUB-SKILL — use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task.
>
> **Background-subagent constraint:** this repo dispatches implementer subagents in the background, and background subagents **cannot run npm/npx**. Each task is written so a subagent *implements* (edits files) and the **main thread** runs `npm run typecheck` / `npm test` / `npm run build` and makes the commits. Where a task says "verify", that's a main-thread action.
>
> **This plan SUPERSEDES** `docs/superpowers/plans/completed/2026-05-18-cluster-viz-4-focus-mode.md`. That file was misfiled into `completed/`, was never executed (0/75 checkboxes), and was written against APIs that have since drifted (`computeClusterMembership` → `clusterMembership`, BGLs moved from `resources/` to `bindGroupLayouts/`, the `focusOn`/`clearFocus` scatter, the `package::shaders::lib::` import prefix). Read the stale plan for *structure and intent only*; every inline signature/path/line number in it is suspect — this rewrite is the source of truth.

## Goal

When a cluster / supercluster / void POI is the current selection, non-member galaxies fade to ~8% alpha over ~400 ms (smoothstep) so the structure's membership pops out of the field. Void POIs invert (galaxies **inside** the void radius fade; surrounding walls stay bright). Other POI ring/halo markers dim to ~25% while a POI is selected. Dismissing focus (selection cleared, or selecting a galaxy / famous-galaxy POI) fades everything back.

## Architecture

Three deliberate choices, all departures from the stale plan:

1. **Selection-driven, not imperative.** The stale plan scattered `focusOn` / `clearFocus` calls across `commitPoiFocus`, empty-space, Esc, and the InfoCard close button. Selection is already the single source of truth — `state.subsystems.selection.selected()` (`src/@types/engine/subsystems/Selection.d.ts`). "A cluster POI is selected" *is* "focus active". So `clusterFocusSubsystem` exposes one per-frame `update(selectedPoi, nowMs)` that diffs the selected POI's id against the currently-focused id and drives the fade. No call sites to keep in sync.

2. **GPU re-derives membership; the CPU never computes a member list.** The spec (§4.4) considered (a) uploading a per-galaxy bitmask vs (b) re-deriving `distance(p.position, center) < radius` per-vertex on the GPU. It picked (b). Given (b), the subsystem only needs to supply `center`, `radiusMpc`, `invert`, and `blend` — **it does not need the member array at all**, so `update` takes no catalogs and never calls `clusterMembership`. This is a simplification over the stale plan's "compute + cache member arrays keyed by `(poiId, dataRev)`" design (there is no `dataRev` counter in the engine — do not invent one). The pure `clusterMembership` fn (`src/utils/cluster/clusterMembership.ts:78`, already landed in Plans 1–3) remains available if a future feature needs an explicit count/list (e.g. an InfoCard "galaxies within r" line); this plan does not call it.

3. **Singleton focus uniform, global.** Unlike `FadeUniforms` (per-source — each survey has its own opacity buffer), focus state is global: at most one POI is focused at a time and the same `FocusUniforms` apply to every survey's draw. So `pointRenderer` allocates ONE 32-byte focus buffer + ONE bind group at `@group(3)` and binds it once before the per-source loop.

Data flow per frame:

```
runFrame (has nowMs + state)
  ├─ resolve selected POI: selection.selected() → pois.findPoi(id)
  ├─ clusterFocus.update(selectedPoi, nowMs)         // state transition / fade retarget
  ├─ clusterFocus.produceFocusUniforms(nowMs)        // pure read → FocusUniformsValue
  │     └─ placed into RenderFrameSettings.focus      // threads runFrame's nowMs, ONE clock
  └─ stillAnimating ||= clusterFocus.isAwake(nowMs)   // render-on-demand
pointSpritesPass: settings.focus → PointDrawSettings.focus
pointRenderer.draw: writeBuffer(focusBuffer, packed) once; bind @group(3) once
points/vertex.wesl: out.intensity *= focusAlphaMultiplier(p.position, focus)
```

**Timestamp note — divergence from the brief.** The brief suggested calling `produceFocusUniforms` inside `pointSpritesPass`, which computes its own `performance.now()` at `pointSpritesPass.ts:79`. To avoid two clocks per frame, this plan instead produces the `FocusUniformsValue` in `runFrame` (which already owns the frame `nowMs`, see `runFrame.ts:77`), stuffs it into `RenderFrameSettings.focus`, and lets the pass forward it unchanged. One timestamp, consistent with the `isAwake` / `tick` calls in the same `runFrame` body.

## Tech stack

TypeScript, WebGPU, WESL (`wesl-plugin` Vite linker), Vitest.

## Prerequisites (Plans 1–3, all landed)

- `clusterMembership(catalogs, centerMpc, radiusMpc): ClusterMembershipResult` — `src/utils/cluster/clusterMembership.ts:78` (note the name; NOT `computeClusterMembership`). Not called by this plan, but cited for completeness.
- `PointOfInterest` discriminated union — `src/@types/engine/subsystems/PointOfInterest.d.ts`. Arms: `cluster | supercluster | void | famousGalaxy`. `physicalRadiusMpc` (required) + `apparentRadiusMpc?` exist ONLY on the extended-structure arms (`ExtendedStructurePoi`, lines 62-101). `FamousGalaxyPoi` has neither radius field.
- `selection` subsystem — `selected(): Selection | null`, where `Selection = GalaxySelection | PoiSelection` (`Selection.d.ts:20-22`); `PoiSelection = { kind: 'poi'; id: string }`.
- `pois.findPoi(id): PointOfInterest | undefined` — used at `engine.ts:604` already.
- `poiSubsystem.produceMarkers` — `poiSubsystem.ts:795`; already reads `selection.selected()` (`:808-809`) and applies the selected ring's 1.5× bump (`:939-941`).
- `createFadeController(initialOpacity=0, nowMs?)` — `src/services/animation/fadeController.ts:79`. Methods: `fadeTo(target, durationMs, nowMs?): Promise<void>`, `currentOpacity(nowMs?)`, `isAnimating(nowMs?)`, `tick(nowMs)`, `setImmediate(value)`.
- `createFadeUniformsBgl(device): FadeUniformsBgl` — `src/services/gpu/bindGroupLayouts/fadeUniforms.ts:26` (note folder: `bindGroupLayouts/`, NOT `resources/`). Type is a branded newtype: `FadeUniformsBgl = GPUBindGroupLayout & { readonly __brand: 'FadeUniformsBgl' }` (`src/@types/rendering/FadeUniformsBgl.d.ts:12`).

## Definition of Done

`npm run typecheck && npm test && npm run build` all green. Manual smoke (Task 14) confirms:

- Single-click a cluster (e.g. Virgo) → non-member galaxies fade to ~8% over ~400 ms; the cluster's members stay bright.
- Single-click a void → galaxies INSIDE the radius fade; surrounding walls stay bright.
- Clear selection (Esc / empty space / InfoCard close) → all galaxies fade back to full over ~400 ms.
- Clicking a **famous-galaxy** POI does NOT engage focus (no radius) — field stays full-bright.
- Other POI rings/halos dim to ~25% while a POI is selected; the selected ring keeps its 1.5× bump.
- The picker still works (no WebGPU validation error at `setPipeline`).

## WESL conventions reminder (read before any shader task)

Linker-level constraints that have bitten this repo before. The new shader is subtle (a per-vertex predicate folded into an alpha product), so be meticulous (`feedback_wgsl_meticulous`).

1. **`?static` on the TS side, literal `package::…::Symbol` on the WESL side.** Verified prefix in `vertex.wesl:32-42`: it uses `package::lib::<module>::<Symbol>` (e.g. `package::lib::sourceUniforms::SourceUniforms`) and `package::points::<module>::<Symbol>`. The lib dir is `src/services/gpu/shaders/lib/` (siblings: `fadeUniforms.wesl`, `sourceUniforms.wesl`, …). So the focus lib import is **`package::lib::focusUniforms::FocusUniforms`** — the stale plan's `package::shaders::lib::focusUniforms` prefix is WRONG.
2. **`@group(N) @binding(M) var<uniform> X: T` is module-local.** Each module that reads the binding re-declares it. Import the `FocusUniforms` struct from the single lib file so the layout can't drift.
3. **Never share a `GPUShaderModule` across pipelines.** Visual + pick pipelines each compile their own module from the same source string.
4. **The pick pipeline MUST bind a dummy `FocusUniforms` at `@group(3)`** to match the visual pipeline's explicit layout, exactly like the existing dummy-fade pattern (`pickRenderer.ts:99-111`). Omit it and every pick fails WebGPU validation at `setPipeline()`.
5. **No backticks in WESL comments** (`feedback_wesl_no_backticks`) — use single quotes for identifier refs.

---

## WGSL focus-uniform byte layout (32 bytes — canonical)

| offset | field | WGSL type | notes |
|---|---|---|---|
| 0  | `center`    | `vec3<f32>` | 12 B payload + 4 B trailing pad (WGSL vec3 16-byte alignment) |
| 16 | `radiusMpc` | `f32` | membership radius = `apparentRadiusMpc ?? physicalRadiusMpc` |
| 20 | `blend`     | `f32` | 0..1 smoothstep amount; 0 = no focus |
| 24 | `invert`    | `u32` | 0 = cluster/SC (inside is member); 1 = void (outside is member) |
| 28 | `_pad`      | `u32` | alignment to 32 B; never written / read |

CPU scratch write (matches the `fadeScratch` pattern at `pointRenderer.ts:401-402`): one `ArrayBuffer(32)` viewed as both `Float32Array` and `Uint32Array`; `f32[0..2]=center`, `f32[3]` stays 0 (vec3 pad), `f32[4]=radiusMpc`, `f32[5]=blend`, `u32[6]=invert`, `u32[7]` stays 0.

---

## Phase 1 — Shader contract

### Task 1: `focusUniforms.wesl` lib file

**File:** create `src/services/gpu/shaders/lib/focusUniforms.wesl`.

This is the one place full WESL is the contract (per plan-style EXCEPTION: subtle shader). Write exactly:

```wgsl
// lib/focusUniforms.wesl — shared 'which POI is focused' uniform.
//
// Written once per frame by the points pipeline from clusterFocusSubsystem
// state. When no POI is focused the CPU side writes blend=0 and the
// per-vertex multiplier collapses to 1.0 (no visible effect). When focus
// is active, members keep alpha 1.0 and non-members fade to 0.08, scaled
// by the smoothstep blend factor.
//
// @group(3) is the first free slot: @group(0) per-frame Uniforms,
// @group(1) FadeUniforms, @group(2) per-source SourceUniforms.
//
// Byte layout (32 bytes total):
//   offset  0 : center     vec3<f32>  (12 B payload + 4 B trailing pad)
//   offset 16 : radiusMpc  f32
//   offset 20 : blend      f32        0..1 smoothstep
//   offset 24 : invert     u32        0 = cluster/SC, 1 = void
//   offset 28 : _pad       u32

struct FocusUniforms {
  center: vec3<f32>,
  radiusMpc: f32,
  blend: f32,
  invert: u32,
  _pad: u32,
};

// Per-vertex focus alpha multiplier.
//   isInside = distance(worldPos, focus.center) < focus.radiusMpc
//   isMember = isInside == (focus.invert == 1u)
//     invert=0 (cluster/SC): inside  -> member
//     invert=1 (void):       outside -> member
//   baseAlpha = isMember ? 1.0 : 0.08
//   result    = mix(1.0, baseAlpha, focus.blend)
// At blend == 0 this returns 1.0 unconditionally — a branch-free no-op
// when nothing is focused.
fn focusAlphaMultiplier(worldPos: vec3<f32>, focus: FocusUniforms) -> f32 {
  let isInside = distance(worldPos, focus.center) < focus.radiusMpc;
  let isMember = isInside == (focus.invert == 1u);
  let baseAlpha = select(0.08, 1.0, isMember);
  return mix(1.0, baseAlpha, focus.blend);
}
```

- [ ] Create the file with the WESL above verbatim.
- [ ] **Main thread:** `npm run typecheck` (TS doesn't compile WESL; just confirm the repo still typechecks). Commit.

---

## Phase 2 — Types

### Task 2: `FocusUniformsBgl` type + factory

**Files:** create `src/@types/rendering/FocusUniformsBgl.d.ts`, `src/services/gpu/bindGroupLayouts/focusUniforms.ts`, `tests/services/gpu/bindGroupLayouts/focusUniforms.test.ts`.

Mirror `FadeUniformsBgl` exactly. Type: `export type FocusUniformsBgl = GPUBindGroupLayout & { readonly __brand: 'FocusUniformsBgl' };` (model on `FadeUniformsBgl.d.ts:12`). Factory `createFocusUniformsBgl(device: GPUDevice): FocusUniformsBgl` (model on `bindGroupLayouts/fadeUniforms.ts:26`) — one entry, `binding: 0`, `visibility: GPUShaderStage.VERTEX` (the multiplier is computed in the vertex stage, unlike fade which is FRAGMENT-only), `buffer: { type: 'uniform' }`.

- [ ] Add test `createFocusUniformsBgl builds one VERTEX-visible uniform binding at slot 0` (mock device capturing the descriptor; assert `entries.length === 1`, `entry.binding === 0`, `entry.visibility === GPUShaderStage.VERTEX`, `entry.buffer.type === 'uniform'`). Model on any existing BGL test if one exists; otherwise the descriptor-capture mock from the stale plan Task 2 Step 1 is a valid shape.
- [ ] Implement type + factory.
- [ ] **Main thread:** run the new test (green), commit type + factory + test together.

### Task 3: `FocusUniformsValue` type + `ClusterFocusSubsystem` type

**Files:** create `src/@types/rendering/FocusUniformsValue.d.ts`, `src/@types/engine/subsystems/ClusterFocusSubsystem.d.ts`.

`FocusUniformsValue` — CPU mirror of the 32-byte block. Use the `Vec3` alias for `center` wrapped `Readonly` (project rule `feedback_vec_aliases`; note `Vec3` is mutable `[number, number, number]` per `Vec3.d.ts:16`, so `Readonly<Vec3>` pins immutability):

```ts
import type { Vec3 } from '../math/Vec3';

export type FocusUniformsValue = {
  readonly center: Readonly<Vec3>;
  readonly radiusMpc: number;
  /** 0..1 smoothstep amount. 0 = no focus active. */
  readonly blend: number;
  /** 0 = cluster/SC (inside is member); 1 = void (outside is member). */
  readonly invert: 0 | 1;
};
```

`ClusterFocusSubsystem` — selection-driven; mirrors the `& Destroyable` latch other subsystems carry (`EngineSubsystemHandles.d.ts:144` enforces it). Note `update` takes **no catalogs** (GPU re-derives membership — see Architecture):

```ts
import type { PointOfInterest } from './PointOfInterest';
import type { FocusUniformsValue } from '../../rendering/FocusUniformsValue';
import type { Destroyable } from '../../rendering/Destroyable';

export type ClusterFocusSubsystem = {
  readonly id: 'clusterFocus';
  /**
   * Per-frame state sync. Diffs `selectedPoi?.id` against the currently
   * focused id:
   *   - changed to a focus-eligible POI (cluster|supercluster|void):
   *     latch center/radius/invert, fadeTo(1, 400).
   *   - changed to null OR a non-eligible POI (famousGalaxy): fadeTo(0, 400),
   *     keeping the last center/radius until blend settles at 0.
   *   - unchanged id: no-op (no re-fade).
   */
  update(selectedPoi: PointOfInterest | null, nowMs: number): void;
  /** Pure read: ticks the fade, returns the live uniform. All-zero (blend=0) at rest. */
  produceFocusUniforms(nowMs: number): FocusUniformsValue;
  /** True only while the fade is animating (render-on-demand). */
  isAwake(nowMs: number): boolean;
} & Destroyable;
```

- [ ] Create both `.d.ts` (one type per file — `feedback_one_type_per_file`).
- [ ] **Main thread:** `npm run typecheck`; commit both together.

---

## Phase 3 — Subsystem

### Task 4: `clusterFocusSubsystem` implementation + tests

**Files:** create `src/services/engine/subsystems/clusterFocusSubsystem.ts`, `tests/services/engine/subsystems/clusterFocusSubsystem.test.ts`.

Factory `createClusterFocusSubsystem(initialNowMs: number = performance.now()): ClusterFocusSubsystem`. Internals: one `createFadeController(0, initialNowMs)`; a `currentPoi: PointOfInterest | null` latch; `export const FOCUS_FADE_DURATION_MS = 400;`.

Behaviour contract (implementer writes bodies against these — do not paste a full impl):
- `update(poi, now)`: focus-eligible = `poi !== null && (poi.category === 'cluster' || 'supercluster' || 'void')`. If eligible and `poi.id !== currentPoi?.id`: set `currentPoi = poi`, `fade.fadeTo(1, 400, now)`. If not eligible (null or famousGalaxy) and `currentPoi !== null`: `fade.fadeTo(0, 400, now)` (keep `currentPoi` latched so `produceFocusUniforms` keeps emitting the correct predicate during fade-out). If `poi.id === currentPoi?.id`: no-op.
- `produceFocusUniforms(now)`: `fade.tick(now)`; `blend = fade.currentOpacity(now)`; lazy-drop — if `currentPoi !== null && blend === 0 && !fade.isAnimating(now)` then `currentPoi = null`. If `currentPoi === null` return the all-zero `ZERO_FOCUS` constant. Else return `{ center: [...worldPos], radiusMpc: poi.apparentRadiusMpc ?? poi.physicalRadiusMpc, blend, invert: poi.category === 'void' ? 1 : 0 }`. (Narrowing to the structure arms after the eligibility check makes the radius read type-safe.)
- `isAwake(now)`: `fade.isAnimating(now)`.
- `destroy()`: clear `currentPoi`.

Tests (names = acceptance criteria; assertions shown). Use a `makePoi(overrides)` helper; cast through `PointOfInterest`.

- [ ] `starts inactive with blend=0` — `produceFocusUniforms(0).blend === 0`; `isAwake(0) === false`.
- [ ] `update with a cluster POI fades blend 0→1 with correct center/radius/invert` — `update(cluster{worldPos:[3,4,5], physicalRadiusMpc:7}, 0)`; mid: `produceFocusUniforms(200).blend` in (0,1); settled: `produceFocusUniforms(500)` → `blend===1`, `center` deep-equals `[3,4,5]`, `radiusMpc===7`, `invert===0`.
- [ ] `apparentRadiusMpc takes precedence over physicalRadiusMpc for the membership radius` — `update(cluster{physicalRadiusMpc:2, apparentRadiusMpc:5}, 0)`; settled `radiusMpc===5`.
- [ ] `update with a void POI sets invert=1` — settled `invert===1`.
- [ ] `update with a famousGalaxy POI stays inactive` — `update(famousGalaxy, 0)`; `produceFocusUniforms(500).blend===0`; `isAwake` false.
- [ ] `update(null) after a cluster fades blend 1→0` — focus a cluster, settle at 500; `update(null, 500)`; mid `produceFocusUniforms(600).blend` in (0,1); settled `produceFocusUniforms(900).blend===0`.
- [ ] `update with the same POI id is idempotent (no re-fade dip)` — focus, settle (blend 1); `update(samePoi, 600)`; `produceFocusUniforms(601).blend===1` (no dip).
- [ ] `replacing the focused POI does not pass through blend 0` — focus virgo, settle; `update(coma, 600)`; `produceFocusUniforms(601).blend` stays ≈1 (retarget from 1→1, no dip); after settle `center` reflects coma.
- [ ] `isAwake is true mid-fade and false at rest` — false at 0; true at 200 mid fade-in; after `produceFocusUniforms(500)` settle → `isAwake(500) === false`.
- [ ] **Main thread:** run the suite (green); commit impl + test + (recall Task 3's types already committed).

---

## Phase 4 — GPU plumbing (shader + both renderers + bootstrap land together)

> **Commit-grouping note.** Tasks 5–8 change the shared vertex shader's pipeline layout, both renderer signatures, and the bootstrap call sites. Each in isolation breaks `typecheck`/`build` (the shader expects `@group(3)`; callers miss the new arg). **Implement Tasks 5–8 as one unit, then have the main thread typecheck/build green and commit them together.** This mirrors the stale plan's shader+renderers+bootstrap grouping.

### Task 5: vertex shader edit

**File:** `src/services/gpu/shaders/points/vertex.wesl`.

- [ ] Add two imports after the existing `import package::lib::orientation::diskAxes;` (`vertex.wesl:42`): `import package::lib::focusUniforms::FocusUniforms;` and `import package::lib::focusUniforms::focusAlphaMultiplier;`.
- [ ] Add the binding after `@group(2) @binding(0) var<uniform> source: SourceUniforms;` (`vertex.wesl:72`): `@group(3) @binding(0) var<uniform> focus: FocusUniforms;` with a short comment (single quotes only).
- [ ] Fold the multiplier into the existing intensity product chain (`vertex.wesl:212-218`). Add one factor: `* focusAlphaMultiplier(p.position, focus)`. (`p.position` is the world position, used at `:89`/`:104`/`:140`.)
- [ ] **Leave the Malmquist/realOnly early-out (`vertex.wesl:122-130`) UNCHANGED** — it returns offscreen with no intensity; multiplying nothing is correct, no edit needed. (Documented so the implementer doesn't double-handle it.)
- [ ] **Known nuance (no code):** the invisibility cull at `vertex.wesl:238-241` hard-culls points with `intensity < 0.005` (visual pass only). A non-member faded to 8% whose folded intensity drops under 0.005 will be culled rather than drawn dim — acceptable (already near-invisible); note it for the smoke test.

### Task 6: pointRenderer — focusBgl param, @group(3), singleton buffer, per-frame write, destroy

**Files:** `src/services/gpu/renderers/pointRenderer.ts`, `src/@types/rendering/PointDrawSettings.d.ts`.

- [ ] Import `FocusUniformsBgl` (after the `FadeUniformsBgl` import) and `FocusUniformsValue`.
- [ ] Add `focusBgl: FocusUniformsBgl` as the 4th param of `createPointRenderer` (`pointRenderer.ts:322-327`, currently `device, format, fadeBgl, sourceBgl`).
- [ ] Append `focusBgl` to the pipeline-layout `bindGroupLayouts` array (`pointRenderer.ts:337-347`, currently `[group0, fadeBgl, sourceBgl]`) → `@group(3)`.
- [ ] Allocate the singleton focus buffer + bind group after the existing `bindGroup` (`pointRenderer.ts:393-397`): 32-byte `UNIFORM | COPY_DST` buffer, one bind group `layout: focusBgl`, binding 0. Add the reusable 32-byte scratch (`ArrayBuffer` + `Float32Array` + `Uint32Array` views), mirroring `fadeScratchBuffer` at `:401-402`.
- [ ] Add `focus: FocusUniformsValue` to `PointDrawSettings` (`PointDrawSettings.d.ts`) with a doc line.
- [ ] In `draw` (`pointRenderer.ts:668`): destructure `focus` from settings; pack per the byte table above and `device.queue.writeBuffer(focusBuffer, 0, scratch)` once (alongside the existing `writeBuffer(uniformBuffer…)` at `:737`). Bind `@group(3)` once after `pass.setBindGroup(0, bindGroup)` (`:740`) and **before** the per-source loop (`:742`) — focus is global, not per-source.
- [ ] Add `focusBuffer.destroy()` to `destroy()` (`pointRenderer.ts:773-781`).

### Task 7: pickRenderer — dummy focus bind group

**File:** `src/services/gpu/renderers/pickRenderer.ts`.

The pick fragment ignores `out.intensity`, but the shared vertex shader's layout now declares `@group(3)`, so the pick pipeline layout MUST match. Mirror the dummy-fade pattern.

- [ ] Import `FocusUniformsBgl` (after the `FadeUniformsBgl` import at `:33`).
- [ ] Add `focusBgl: FocusUniformsBgl` to `createPickRenderer` — **insert it before the existing optional `clusterMarkerRenderer?` param** (`pickRenderer.ts:64-77`; new order: `device, pointRenderer, fadeBgl, sourceBgl, focusBgl, clusterMarkerRenderer?`).
- [ ] Append `focusBgl` to the pipeline-layout `bindGroupLayouts` (`pickRenderer.ts:85-97`, currently `[group0, fadeBgl, sourceBgl]`).
- [ ] Allocate a zeroed 32-byte dummy buffer + bind group after the dummy-fade block (`pickRenderer.ts:102-111`) — `UNIFORM` only (never written), `layout: focusBgl`.
- [ ] Bind `@group(3)` once in `recordPickPass` after `pass.setBindGroup(1, dummyFadeBindGroup)` (`pickRenderer.ts:303`), before the per-source loop.
- [ ] Add `dummyFocusBuffer.destroy()` to `destroy()` (`pickRenderer.ts:427-432`).

### Task 8: bootstrap call-site threading

**Files:** `src/services/engine/phases/initGpu.ts`, `src/services/engine/phases/wireInput.ts`, `src/@types/engine/handles/EngineGpuHandles.d.ts`.

- [ ] Add `focusBgl: FocusUniformsBgl | null;` to `EngineGpuHandles` (`EngineGpuHandles.d.ts:68+`, alongside `fadeBgl`/`sourceBgl` at `:77`/`:84`); import the type.
- [ ] In `initGpu.ts`, after `state.gpu.sourceBgl = createSourceUniformsBgl(device);` (`:149`): `state.gpu.focusBgl = createFocusUniformsBgl(device);` (import from `../../gpu/bindGroupLayouts/focusUniforms`).
- [ ] Thread `state.gpu.focusBgl!` as the 4th arg of `createPointRenderer` (`initGpu.ts:201-206`).
- [ ] In `wireInput.ts`, thread `state.gpu.focusBgl!` as the 5th arg of `createPickRenderer` (`:66-72`) — **before** the `?? undefined` clusterMarkerRenderer arg.
- [ ] **Main thread (Tasks 5–8 together):** `npm run typecheck && npm run build` green; commit shader + both renderers + bootstrap as one commit.

---

## Phase 5 — Subsystem registration + per-frame wiring

### Task 9: register `clusterFocus` on `state.subsystems`

**Files:** `src/services/engine/engine.ts`, `src/@types/engine/handles/EngineSubsystemHandles.d.ts`.

- [ ] Add `clusterFocus: ClusterFocusSubsystem;` (always-present, non-null — like `selection`/`pois`) to `EngineSubsystemHandles` (`:122` neighbourhood); import the type. The `_EnforceDestroyable` guard (`:144`) requires `destroy()` — already on the type.
- [ ] Construct it in the subsystems literal (`engine.ts:544-642`, near `pois: createPoiSubsystem({})` at `:642`): `clusterFocus: createClusterFocusSubsystem(),`. Import `createClusterFocusSubsystem`.
- [ ] Add `state.subsystems.clusterFocus.destroy();` to the teardown list (`engine.ts:1359-1387`, alongside `pois.destroy()` at `:1364`).
- [ ] **Main thread:** `npm run typecheck`; commit.

### Task 10: per-frame `update` + render-on-demand in runFrame

**Files:** `src/services/engine/frame/runFrame.ts`, `src/@types/engine/frame/RenderFrameSettings.d.ts`, `src/services/engine/frame/passes/pointSpritesPass.ts`.

- [ ] In `runFrame`, near the `fades.tick(nowMs)` (`runFrame.ts:575`), resolve the selected POI and sync focus:
  `const sel = state.subsystems.selection.selected(); const poi = sel?.kind === 'poi' ? (state.subsystems.pois.findPoi(sel.id) ?? null) : null; state.subsystems.clusterFocus.update(poi, nowMs);`
- [ ] Add `state.subsystems.clusterFocus.isAwake(nowMs)` to the `stillAnimating` OR-chain (`runFrame.ts:576-583`).
- [ ] Add `focus: FocusUniformsValue` to `RenderFrameSettings` (`RenderFrameSettings.d.ts`); import the type.
- [ ] Populate it in the `settings` object built in `runFrame` (`:321-347`, near `selected:` at `:324`): `focus: state.subsystems.clusterFocus.produceFocusUniforms(nowMs),` — reusing runFrame's `nowMs` (one clock).
- [ ] In `pointSpritesPass.ts` (`:82-111`), forward `focus: settings.focus` into the `renderer.draw(...)` `PointDrawSettings` object. (`settings` here is the `RenderFrameSettings` block via `ctx`/the pass signature — confirm by reading the pass's `settings` param.)
- [ ] **Main thread:** `npm run typecheck && npm test`; commit.

---

## Phase 6 — Marker dimming

### Task 11: dim non-selected POI markers to 25%

**File:** `src/services/engine/subsystems/poiSubsystem.ts` (+ extend `tests/services/engine/subsystems/poiSubsystem.test.ts`).

Keyed off `selectedPoiId !== null` (already computed at `poiSubsystem.ts:809`), NOT a `clusterFocus` dependency — keeps `poiSubsystem` decoupled from focus state.

- [ ] In `produceMarkers`, when `selectedPoiId !== null` and the current POI is NOT the selected one, multiply the baked `haloColor[3]` and `ringColor[3]` by `0.25`. Keep the existing selected-ring 1.5× bump (`:939-941`) for the selected POI. Introduce a `const NON_SELECTED_DIM = 0.25;` (or similar) near the other style constants. Apply to the alpha just before pushing the descriptor (`:920-947`), preserving the copy-on-write tuple style already used there.
- [ ] Add test `produceMarkers dims non-selected markers to 25% while a POI is selected` — build ≥2 visible POIs, select one, assert the non-selected descriptor's `ringColor[3]` / `haloColor[3]` are 0.25× their at-rest baked value and the selected one is unchanged (still 1.5× bumped). Model setup on existing `produceMarkers` tests in the same file.
- [ ] **Known v1 limitation (no code):** marker dim snaps on/off with selection (binary) while the galaxy fade is 400 ms — acceptable for v1; mention in the smoke test.
- [ ] **Main thread:** run the suite; commit.

---

## Phase 7 — Validation

### Task 12: full gate

- [ ] **Main thread:** `npm run typecheck && npm test && npm run build` — all green. (Do NOT run repo-wide `npm run format`; prettier only touched files per `feedback_format_only_touched_files`.)

### Task 13: manual smoke test (user-driven)

Ask the user to verify in the dev server (HMR; do not restart it):

- [ ] Single-click a cluster (Virgo) → non-member galaxies fade to ~8% over ~400 ms; members stay bright. Re-click the same ring → no flicker/re-fade (idempotent `update`).
- [ ] Single-click a void → galaxies INSIDE the radius fade; outside walls stay bright (invert).
- [ ] Select a different cluster while one is focused → the field re-targets to the new membership without flashing back to full bright (no blend-0 pass-through).
- [ ] Clear selection (Esc / empty space / InfoCard close) → everything fades back to full over ~400 ms.
- [ ] Click a famous-galaxy POI → field stays full bright (no focus engaged — it has no radius).
- [ ] While a POI is selected, other rings/halos visibly dim to ~25%; the selected ring keeps its 1.5× bump.
- [ ] Galaxies right at the membership boundary that fall under the 0.005 cull may vanish rather than show at 8% — expected (Task 5 nuance).
- [ ] The picker still resolves galaxies and POI rings — no WebGPU validation error in the console (confirms the pick dummy `@group(3)` matches).

---

## Self-review checklist (tasks → spec)

- [ ] Member isolation @ 8%, 400 ms smoothstep — spec §3.2, §3.4 → Tasks 1, 4, 5, 10.
- [ ] Void inversion — spec §3.3 → Tasks 1 (`invert`), 4 (`category==='void'?1:0`), 5 (predicate).
- [ ] Other markers dim to ~25%, selected ring 1.5× — spec §3.2 → Task 11 (+ existing `:939-941`).
- [ ] GPU re-derivation (option b), no CPU member list, no `dataRev` cache — spec §4.4 → Architecture + Task 4.
- [ ] Render-on-demand keeps the loop alive through the fade — spec §3.4, §8.3 → Task 10 (`isAwake`).
- [ ] Pick pipeline layout matches (dummy `@group(3)`) — spec §6 / WESL reminder 4 → Task 7.
- [ ] Famous-galaxy POIs never engage focus — spec §11.5 → Task 4 (eligibility) + Task 13.
- [ ] Strict `<` membership predicate (hard edge) — spec §11.6 → Task 1.
- [ ] Selection-driven single sync point (no scatter) — Architecture choice 1 → Task 10.

### Where this plan diverges from the original brief / corrects stated facts

- **No CPU member computation / cache.** Brief flagged this as a simplification to evaluate; resolved firmly: `update` takes no catalogs, never calls `clusterMembership`, no `(poiId, dataRev)` cache (there is no `dataRev` counter in the engine).
- **`FocusUniformsValue` is produced in `runFrame`, not `pointSpritesPass`.** Avoids the second `performance.now()` clock in the pass; threaded via `RenderFrameSettings.focus` using runFrame's `nowMs`.
- **WESL import prefix is `package::lib::focusUniforms::…`** (verified `vertex.wesl:38`), not the stale plan's `package::shaders::lib::…`.
- **BGL factory lives in `bindGroupLayouts/`**, not the stale plan's `resources/`.
- **`createPickRenderer` `focusBgl` is inserted at position 5, before the existing optional `clusterMarkerRenderer?`** (it's the last param, `pickRenderer.ts:76`).
- **`Vec3` is mutable** (`Vec3.d.ts:16`); `FocusUniformsValue.center` uses `Readonly<Vec3>`.
- **Verified line numbers** differ from the brief's estimates: `createPointRenderer` at `:322` (not 607), `draw` at `:668` (not 1143), draw loop `:742-756`, `destroy` `:773`; `createPickRenderer` at `:64`, dummy-fade `:99-111`, pick bind at `:303`, destroy `:427`.
