# Flow-Field Integration — Phase B: Store, Loader & Demand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Sister documents:**
> - [`docs/superpowers/specs/2026-06-04-flow-field-integration-design.md`](../specs/2026-06-04-flow-field-integration-design.md) — the approved design. Source of truth.
> - [`docs/superpowers/conventions/plan-style.md`](../conventions/plan-style.md) — contract code yes, implementation code no.
>
> **Depends on:** Phase A (the generalized `scalarFieldFormat` with `value_kind`/`velocityStats` + the emitted single `public/data/flowfield.scfd`). The loader in Task 3 `decodeScalarField`s that one SCFD file — frame + stats live in its header, no JSON sidecar. You can write the store (Tasks 1–2) without Phase A, but the loader test fixtures build a `ScalarCube` matching the Phase-A shape.
>
> **Conventions** (from `CLAUDE.md` + memory):
> - Didactic comments; `type` aliases never `interface`; one type per file under `src/@types`; deep relative imports, no barrels.
> - Prefer immutability — readonly types, frozen factories, mutation isolated to named seams.
> - GPU resources live on renderers, never in stores — stores hold status/settings only.
> - Tests mirror the `src/` tree under `tests/`. Background subagents can't run npm/git; the main thread runs tests/typecheck/commits. Never `git add -A`.
> - **Commits:** conventional-commits style (shown per task); use the user's git identity (never `--author=Claude…`); end every commit body with the trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## Goal

A frozen `createFlowFieldStore()` per-type store mirrors `createFilamentStore`
exactly (getters + named mutation seams), is assembled into `EngineData` by
`createEngineData`, and is **seeded at construction** for demand-model symmetry.
A velocity-field loader (ported from cosmic-flow's `createVelocityField`) fetches
the single `flowfield.scfd`, `decodeScalarField`s it, and uploads the 128³
RGBA16F cube. A demand-driven asset slot loads the cube on the frame `enabled`
first flips true — not at boot.

## Architecture

Flow params live in a per-type store (decision §8), the state template for every
data type. The store holds `loaded`, `enabled`, `mode`, `intensity`, `count`,
`trail`, `flowSpeed`, `densityBias`, `wander` behind getters, each with a named
setter seam — the renderer reads the store every frame, the handle (Phase D)
wraps the setters. The velocity field is a GPU texture + sampler the renderer
owns; the loader returns it and the slot hands it to the renderer's `setField`
(Phase C). Demand follows the `cf4Density` precedent: a default-off field whose
slot stays idle at boot and lazy-loads when `flow.enabled` flips true.

## Tech Stack

TypeScript. Vitest (`node` env) for the store unit tests + the demand-row
predicate test. The loader's GPU upload is exercised by Phase C's construction
smoke test (no GPU in `node` vitest), so Phase B tests the loader's pure parts
(URL building, SCFD-decode → `FlowFieldMeta` mapping) only.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `src/@types/engine/data/FlowFieldStore.d.ts` | The `FlowFieldStore` type — getters + mutation seams. |
| `src/@types/data/FlowMode.d.ts` | `FlowMode = 'advect' \| 'streamline'`. |
| `src/@types/data/FlowField.d.ts` | `FlowField` GPU-handle type (textureView, sampler, meta, dispose). |
| `src/@types/data/FlowFieldMeta.d.ts` | Frame + stats derived from the decoded SCFD cube (n, voxelSize, origin, frameKind, velocityStats). |
| `src/services/engine/data/createFlowFieldStore.ts` | Frozen factory; defaults seeded; named setters. |
| `src/services/gpu/loaders/createFlowField.ts` | Fetch `flowfield.scfd`, `decodeScalarField`, upload 128³ rgba16float texture via `gpuTextureFormatForChannels(4)`, return `FlowField`. |
| `src/services/loading/fetchers/flowFieldFetcher.ts` | Slot fetcher: fetch the one `.scfd` ArrayBuffer + decode into a `FlowField`. |
| `src/services/loading/slots/flowFieldSlot.ts` | Asset slot: on commit, hand the field to `flowFieldRenderer.setField`. |
| `tests/services/engine/data/createFlowFieldStore.test.ts` | Defaults + each setter, FilamentStore-style. |
| `tests/services/engine/data/createEngineData.test.ts` (extend or new) | Asserts `data.flow` is present + seeded. |
| `tests/services/engine/wiring/flowDemand.test.ts` | The `flow` demand row loads only when `flow.enabled`. |

**Modified:**

| File | Change |
|---|---|
| `src/@types/engine/data/EngineData.d.ts` | Add `readonly flow: FlowFieldStore`. |
| `src/services/engine/data/createEngineData.ts` | Add `flow: createFlowFieldStore()`. |
| `src/services/engine/wiring/assetWiring.ts` | Add the `flow` demand+factory row. |
| `src/@types/loading/AssetKey.d.ts` (or wherever the union lives) | Add `'flow'` to the sidecar `AssetKey` union + `EngineAssetSlots`. |

---

## Task 1: `FlowMode` + `FlowFieldStore` types

**Files:** `src/@types/data/FlowMode.d.ts` (create), `src/@types/engine/data/FlowFieldStore.d.ts` (create)

One type per file. `FlowMode` is the two mutually-exclusive integration styles;
`FlowFieldStore` mirrors `FilamentStore`'s shape (getters + seams) but with the
flow param set.

```ts
// src/@types/data/FlowMode.d.ts
export type FlowMode = 'advect' | 'streamline';
```

```ts
// src/@types/engine/data/FlowFieldStore.d.ts
import type { FlowMode } from '../../data/FlowMode';

export type FlowFieldStore = {
  /** True once the velocity cube has been committed to the renderer. */
  readonly loaded: boolean;
  /** Master layer gate (default-off; flips true on user enable). */
  readonly enabled: boolean;
  /** Active integration mode (default 'advect'). */
  readonly mode: FlowMode;
  /** Pre-blend ribbon brightness multiplier, [0, 1]. */
  readonly intensity: number;
  /** Particle count actually drawn, [0, MAX_PARTICLES]. */
  readonly count: number;
  /** Ring spacing per trail point (world units). */
  readonly trail: number;
  /** Advect head distance per frame (motion speed). */
  readonly flowSpeed: number;
  /** Density-weighted seeding selectivity, [0, 1]. */
  readonly densityBias: number;
  /** Per-step direction jitter (advect only). */
  readonly wander: number;

  setLoaded(): void;
  setEnabled(v: boolean): void;
  setMode(v: FlowMode): void;
  setIntensity(v: number): void;
  setCount(v: number): void;
  setTrail(v: number): void;
  setFlowSpeed(v: number): void;
  setDensityBias(v: number): void;
  setWander(v: number): void;
};
```

- [x] Create both type files (didactic header on each).
- [x] `npm run typecheck` → clean (no consumers yet).
- [x] Commit: `feat(flow): FlowFieldStore + FlowMode types`.

## Task 2: `createFlowFieldStore` + `createEngineData` wiring

**Files:** `src/services/engine/data/createFlowFieldStore.ts` (create), `src/services/engine/data/createEngineData.ts` (modify), `src/@types/engine/data/EngineData.d.ts` (modify), `tests/services/engine/data/createFlowFieldStore.test.ts` (create), `tests/services/engine/data/createEngineData.test.ts` (create or extend)

Frozen factory with closure `let` state behind getters; each setter mutates one
field. Seeded at construction (decision §8 — a single fixed layer, but seeded for
demand-model symmetry). Defaults: `loaded=false`, `enabled=false`,
`mode='advect'`, `intensity=0.7`, `count=MAX_PARTICLES`, `trail`/`flowSpeed`/
`densityBias`/`wander` from the spike's tuned look. `setLoaded()` flips `loaded`
true (no args — mirrors the asset-commit seam). Setters clamp where a range
applies (`intensity` to `[0,1]`, `count` to `[0, MAX_PARTICLES]`); the clamp
constants come from Phase C's `flowFieldConstants.ts` once it exists — for now
seed the default `count = MAX_PARTICLES` from a local const this task introduces
and Phase C reconciles.

> **Note on `MAX_PARTICLES`:** Phase C owns the authoritative `MAX_PARTICLES = 40000`
> in `src/services/gpu/renderers/flowFieldConstants.ts`. To avoid a forward
> dependency, this task seeds `count` from a store-local default and leaves a
> `// reconciled with flowFieldConstants.ts in Phase C` comment; Phase C's first
> task imports the shared const and deletes the local. Do NOT duplicate the value
> silently — the comment is the contract.

```ts
// src/services/engine/data/createFlowFieldStore.ts
export function createFlowFieldStore(): FlowFieldStore;
```

**Test assertions** — `createFlowFieldStore.test.ts`:

- [x] `seeds default values` — `loaded===false`, `enabled===false`, `mode==='advect'`, `intensity` in `(0,1]`, `count > 0`.
- [x] `setLoaded flips loaded true`.
- [x] `setEnabled toggles enabled` — set true then false.
- [x] `setMode switches between advect and streamline`.
- [x] `setIntensity clamps to [0,1]` — assert `setIntensity(2)` → `1`, `setIntensity(-1)` → `0`.
- [x] `setCount clamps to [0, ceiling]` — assert a huge value clamps to the ceiling, a negative clamps to 0.
- [x] `setTrail / setFlowSpeed / setDensityBias / setWander each set their field`.
- [x] `store is frozen` — assert `Object.isFrozen(store)`.

**EngineData wiring:**

- [x] Add `readonly flow: FlowFieldStore` to `EngineData` (import the type).
- [x] Add `flow: createFlowFieldStore()` to `createEngineData`'s return.
- [x] Test `createEngineData includes a seeded flow store` — assert `data.flow.mode === 'advect'` and `data.flow.enabled === false`.
- [x] `npm test -- createFlowFieldStore` and `npm test -- createEngineData` → pass. `npm run typecheck` → clean.
- [x] Commit: `feat(flow): createFlowFieldStore + EngineData wiring`. **(Spike divergences followed per spec: MAX_PARTICLES=40000 not the spike's 100000; default mode 'advect' not the spike's 'streamline'.)**

## Task 3: Velocity-field loader (`createFlowField`)

**Files:** `src/@types/data/FlowField.d.ts` (create), `src/@types/data/FlowFieldMeta.d.ts` (create), `src/services/gpu/loaders/createFlowField.ts` (create), `tests/services/gpu/loaders/createFlowField.test.ts` (create)

Ported from `tools/cosmic-flow/src/field/createVelocityField.ts`, adapted to the
**SCFD** flow artifact (no JSON sidecar). Phase A emits a single `flowfield.scfd`
whose header carries the frame **and** the velocity stats; the loader
`decodeScalarField`s it to a `ScalarCube` and uploads `cube.voxels` (C-order
`[z][y][x][c]` f16 RGBA) via `writeTexture` with `bytesPerRow = n*4*2`,
`rowsPerImage = n`, `format: gpuTextureFormatForChannels(cube.channels)`.

```ts
// src/@types/data/FlowFieldMeta.d.ts — derived from the decoded SCFD cube
export type FlowFieldMeta = {
  readonly n: number;               // cube dims[0] (cube is N³)
  readonly origin: Vec3;            // SG-cartesian Mpc, cube lower corner
  readonly voxelSizeMpc: number;
  readonly frameKind: ScalarFieldFrameKind;
  readonly deltaMin: number;        // = cube.valueMin
  readonly deltaMax: number;        // = cube.valueMax
  readonly speedKmsMax: number;     // ┐
  readonly speedKmsP99: number;     // ├ from cube.velocityStats
  readonly deltaP99: number;        // ┘
};
```

```ts
// src/@types/data/FlowField.d.ts
export type FlowField = {
  readonly textureView: GPUTextureView;
  readonly sampler: GPUSampler;
  readonly meta: FlowFieldMeta;
  dispose(): void;
};
```

```ts
// src/services/gpu/loaders/createFlowField.ts
export async function createFlowField(
  device: GPUDevice,
  scfdUrl: string,            // single .scfd — no sidecar
): Promise<FlowField>;
```

The pure, GPU-free part worth testing is the **decoded-cube → `FlowFieldMeta`**
mapping. Factor it into a pure exported helper
`flowFieldMetaFromCube(cube: ScalarCube): FlowFieldMeta` (throws if the cube
isn't a velocity field — `channels !== 4` or `velocityStats` absent).

- [x] Create `FlowFieldMeta` + `FlowField` types (`Vec3` alias, not raw tuple; import `ScalarFieldFrameKind`).
- [x] Create `createFlowField` per the contract: `fetch(scfdUrl)` → `decodeScalarField(arrayBuffer)` → upload (`size: [n,n,n]`, `dimension: '3d'`, `format: gpuTextureFormatForChannels(4)`); a shared linear sampler; `dispose` destroys the texture; `meta = flowFieldMetaFromCube(cube)`.
- [x] Factor `flowFieldMetaFromCube` out and export it.
- [x] Tests — `createFlowField.test.ts` (no GPU): `flowFieldMetaFromCube maps every field` — build a `ScalarCube` fixture (channels=4 + velocityStats) and assert each `FlowFieldMeta` field; `flowFieldMetaFromCube throws on a non-velocity cube` (channels=1, or channels=4 without velocityStats).
- [x] `npm test -- createFlowField` → pass. `npm run typecheck` → clean.
- [x] Commit: `feat(flow): createFlowField velocity-field loader`.

## Task 4: Asset slot + demand row

**Files:** `src/services/loading/fetchers/flowFieldFetcher.ts` (create), `src/services/loading/slots/flowFieldSlot.ts` (create), `src/services/engine/wiring/assetWiring.ts` (modify), `src/@types/loading/AssetKey.d.ts` + `EngineAssetSlots` (modify), `tests/services/engine/wiring/flowDemand.test.ts` (create)

Follows the `cf4DensitySlot` precedent exactly: a slot that's minted
unconditionally but stays idle at boot (default-off), lazy-loading when the
demand predicate (`flow.enabled === true`) flips true. On commit, the slot hands
the loaded `FlowField` to `state.gpu.flowFieldRenderer?.setField(field)` (the
renderer + `setField` arrive in Phase C — until then the commit null-checks and
no-ops, exactly like the volume slots null-check `scalarVolumeRenderer`), flips
`state.data.flow.setLoaded()`, and requests a render.

> The fetcher must produce the GPU `FlowField`, which needs `state.gpu.device`.
> The volume slots fetch a CPU `ScalarCube` and upload on commit; mirror that —
> the **fetcher** returns the raw `.scfd` `ArrayBuffer` and the **commit** calls
> `createFlowField(device, …)`. This keeps the fetch GPU-free (testable) and the
> upload on the commit thread, matching the volume-slot split.

**Demand row** (added to `ASSET_WIRING`, after the `cf4Density` row):

```ts
{
  key: 'flow',
  factory: (deps) => createFlowFieldSlot(deps.state, deps.cb),
  req: () => undefined,                       // tier-agnostic, single file
  demand: (ctx) => ctx.flow.enabled === true, // default-off; loads on first enable
},
```

`DemandCtx` needs a `flow` read surface (the store's enabled bit). Add a
`flow: { enabled: boolean }` (or reuse a `data.flow` accessor) to `buildDemandCtx`
mirroring how `volumeField(...)` exposes volume state.

- [ ] Add `'flow'` to the sidecar `AssetKey` union and a `flow` slot field on `EngineAssetSlots`.
- [ ] Create `flowFieldFetcher` (returns the raw `.scfd` `ArrayBuffer` via `dataUrl('flowfield.scfd')` — one file, no sidecar).
- [ ] Create `flowFieldSlot` per the cf4DensitySlot shape: commit calls `createFlowField`, `renderer?.setField(field)` (null-safe), `state.data.flow.setLoaded()`, `requestRender()`.
- [ ] Extend `buildDemandCtx` + `DemandCtx` with a `flow.enabled` read surface.
- [ ] Add the `flow` row to `ASSET_WIRING`.
- [ ] Test — `flowDemand.test.ts`, driving `evaluateRows` with a stub array containing only the flow row (the `reevaluateDemand` module already factors `evaluateRows` for this): `flow slot stays idle when flow.enabled is false`; `flow slot loads when flow.enabled is true`. Use the same stub-row harness the existing demand tests use.
- [ ] `npm test -- flowDemand` → pass. `npm run typecheck` → clean.
- [ ] Commit: `feat(flow): flow asset slot + demand-on-enable row`.

---

## Spec coverage (Phase B)

- Decision §8 (`createFlowFieldStore` mirroring `createFilamentStore`; assembled into `EngineData`; seeded at construction; fields + setters) → Tasks 1, 2.
- Decision §8 (demand-driven loading — loads on first enable, asset slot like surveys/volumes) → Task 4.
- Decision §4 (velocity-field loader; the cube carries origin/extent/frameKind) → Task 3.
- Non-goal honoured: δ is loaded into the cube's alpha but only drives seeding (Phase C); the loader is δ-agnostic.
- Testing strategy: store unit tests (getters/mutators, seeded defaults) → Task 2.
