# Headless GPU-timing Perf Harness — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`
> to execute this plan (fresh subagent per task + spec review + quality review). Each
> task is TDD: failing test first, verify it fails, minimal green, verify it passes,
> commit. Dispatch implementers with `run_in_background: true`; the **main thread** runs
> `npm test` / `npm run typecheck` and makes the commits (background subagents cannot run
> npm).
>
> **Plan style (OVERRIDES upstream `writing-plans`):**
> [`docs/superpowers/conventions/plan-style.md`](../conventions/plan-style.md) —
> **contract code yes, implementation code NO.** Type signatures and test names ARE
> contract (reproduced here); function bodies are not — cite `path:line` and let the
> implementer write the body from the test + the current file.
>
> **Testing discipline:** [`docs/superpowers/conventions/testing.md`](../conventions/testing.md).
> Round-trip / hand-computed / independent-property assertions only. NO runtime type
> tests, NO constant restatements, NO clamp-boundary mirrors, NO mirror tests. The
> Chromium CDP drive and the live `setPose` / `collectTimings` end-to-end path are NOT
> unit-tested (integration-only; no assertion surface a real bug trips that the pure
> pieces don't). Verify the live harness by **running it** (`npm run perf`), not vitest —
> each such task replaces the TDD cycle with an explicit manual/derivation verification.

**Spec:** [`docs/superpowers/specs/2026-07-19-headless-gpu-timing-harness-design.md`](../specs/2026-07-19-headless-gpu-timing-harness-design.md)
— this plan implements it faithfully; every § maps to task(s). The **Ground preparation**
section (spec §"Ground preparation") lands as **Tasks 1–2 of this plan**, not a separate
prep PR, per the refactor-ground rule (both joints are consumed only by the harness and
gate no other feature).

## Goal

A `npm run perf` script that boots skymap headless in Chromium under a new `?perf` URL
gate, drives the camera through a committed table of scale-ladder poses, and prints a
per-scenario GPU-timing report. Each scenario is measured in **both** render strategies
(the `RenderStrategy` union `'merged' | 'perLayerTimed'`): `merged` yields honest
per-render-step **group** timings (`hdr·NEAR0`, `foreground:0·NEAR0`, …); `perLayerTimed`
yields per-**layer** attribution (`orbit-trails`, `body-glints`, …) but each row carries
the fixed per-pass load/store overhead. A derived per-pass **floor estimate** lets the
per-layer numbers be read minus-overhead.

```
tools/perf/measurePerf.ts ──CDP──▶ Chromium (?perf) ──▶ window.__skymapPerf
  │                                                       ├─ ready       (shared debounced predicate)
  │  for each scenario × { merged, perLayerTimed }:       ├─ setPose(pose)
  │    setPose → setStrategy → collectTimings(N) ──────▶  ├─ setStrategy('merged'|'perLayerTimed')
  ▼                                                       └─ collectTimings(frames) → PerfSample[]
 aggregate median/p90 + floor estimate in Node → print table
```

## Resolved wiring question — how the perf hook reaches the GPU timing service

The spec's file inventory tentatively said `main.tsx — one installPerfHook(store) call`,
mirroring the recorder. **That is wrong and this plan deviates from it deliberately**, for
one concrete reason:

- The recorder needs only the **store** (`installRecorderHook(store)` at `main.tsx:98`,
  called synchronously before `createRoot`).
- The perf hook's `collectTimings` needs the **GPU timing service**, which is **not** in
  the Redux store. It lives on `EngineState.gpu.timingService` and is exposed to the app
  only through `engineHandle.debug.timingService` — a **live getter** (see
  `EngineDebugHandle.d.ts:29-64`: it re-reads the slot each call, because the async
  `initGpu` IIFE reassigns the stub with the device-aware service after `createEngine`
  returns). The engine handle is born inside `useEngine`'s effect
  (`useEngine.ts:75`), **after** React mounts — `main.tsx` never holds it.

**Resolution (option (a), corrected call site):**
`installPerfHook(store: AppStore, engine: EngineHandle): void`, called from
**`useEngine`'s effect** immediately after `const handle = createEngine(...)`
(`useEngine.ts:75-76`) — the one site holding **both** the store and the freshly-born
handle. The `?perf` gate stays **inside** the installer (no-op otherwise), exactly like
the recorder's `?cinema` gate, so the call site stays branchless and the gate stays
unit-testable. `collectTimings` reads `engine.debug.timingService` **at call time** (the
live getter returns the enabled service that `initGpu` allocated under `?perf` — Task 3);
it is always called after `ready` resolves, so the service is fully wired by then.

Why not a module-level bridge (option (b))? It would add a second, hidden channel to the
timing service that could drift from the handle getter — there is already a clean handle
path, and passing the handle to the installer at its birth site is the honest seam.

Race note: the harness waits for the hook with
`page.waitForFunction(() => window.__skymapPerf !== undefined, { polling: 100 })`
(mirroring `recordTour.ts:336`), so installing from `useEngine`'s effect (a tick after
mount, well within the 15 s hook timeout) is fine — the harness polls until it appears,
then awaits `ready`.

## Global Constraints

- **`type` aliases, never `interface`.** All new shapes are `export type`.
- **One type per file in `src/@types/`**, filename = the type name; deep relative imports,
  no barrels. New types: `src/@types/perf/{PerfPose,PerfSample,SkymapPerfHook,PerfWindow}.ts`.
- **One function per file in `src/utils/` and `tools/utils/`**, filename = export name.
  New helpers: `src/utils/url/{isPerfSearch,isPerfMode}.ts`,
  `tools/utils/perf/{median,percentile,groupSamplesBySlot,estimateFloor,formatReport}.ts`.
- **Didactic module headers** on every new file — explain WHY and the alternative, matching
  the sibling being mirrored (e.g. `isPerfSearch.ts` header mirrors `isCinemaSearch.ts`).
- **`RenderStrategy` union is exactly `'merged' | 'perLayerTimed'`** (`RenderStrategy.d.ts:18`).
  The settings override widens it to `RenderStrategy | 'auto'`; the hook's `setStrategy`
  takes the un-widened `RenderStrategy`.
- **Timing slots derive from ONE walk.** `TIMED_SLOTS`, `TIMED_SLOT_GROUPS`, and
  `PASS_GROUP_KEYS` are all projections of `timedSlotRowsOf(frameProgram(...), CONTENT_LAYERS)`
  (`frameProgram.ts:173-289`). Task 2 grows that single walk; never hand-maintain a slot list.
- **Tests mirror the `src/` tree under `tests/`** (and `tools/` under `tests/tools/`).
- Branch + PR; squash-merge. Commits use the user's git identity (Co-Authored-By trailer only).

## File Structure

**Ground prep (Tasks 1–2):**
| File | Responsibility |
| --- | --- |
| `src/@types/settings/EngineSettingsState.d.ts` (modify) | add `debug.renderStrategy: RenderStrategy \| 'auto'` |
| `src/state/settings/initialState.ts` (modify) | default `renderStrategy: 'auto'` |
| `src/state/settings/settingsSlice.ts` (modify) | `setRenderStrategy` reducer + export |
| `src/services/engine/frame/resolveStrategy.ts` (create) | pure override-resolution helper (device-free, testable) |
| `src/services/engine/frame/renderFrame.ts` (modify) | call `resolveStrategy` at `:78` |
| `src/services/engine/frame/frameProgram.ts` (modify) | emit a per-group slot row per render step |
| `src/services/engine/frame/executeFrame.ts` (modify) | thread `groupKey`, time the merged pass |
| `src/services/engine/phases/initGpu.ts` (modify) | `\|\| isPerfMode()` on the timing-service gate (`:409`) |

**Feature:**
| File | Responsibility |
| --- | --- |
| `src/utils/url/isPerfSearch.ts` / `isPerfMode.ts` (create) | pure `?perf` predicate + live wrapper |
| `src/@types/perf/PerfPose.ts` / `PerfSample.ts` / `SkymapPerfHook.ts` / `PerfWindow.ts` (create) | hook + payload types |
| `src/state/lifecycle/whenStablyReady.ts` (create) | extracted shared debounced ready predicate |
| `src/state/recorder/installRecorderHook.ts` (modify) | import the extracted predicate |
| `src/state/perf/installPerfHook.ts` (create) | the `window.__skymapPerf` seam |
| `src/hooks/useEngine.ts` (modify) | `installPerfHook(store, handle)` at `:75-76` |
| `tools/perf/perfScenarios.ts` (create) | committed scenario table (`PerfScenario[]`) |
| `tools/perf/scenarioReport.ts` (create) | `ScenarioReport` / `LayerStat` report data types |
| `tools/perf/measurePerf.ts` (create) | the CDP harness + aggregation glue |
| `tools/utils/perf/median.ts` / `percentile.ts` / `groupSamplesBySlot.ts` / `estimateFloor.ts` / `formatReport.ts` (create) | pure aggregation + floor math + report printer |
| `package.json` (modify) | `"perf": "tsx tools/perf/measurePerf.ts"` |

---

## Task 1 — Ground prep: decouple render strategy from `timingService.enabled`

Makes "timing enabled **and** merged" (the harness's production-true timed mode) reachable
by turning strategy into an explicit `settings.debug` override, defaulting to `'auto'` so
production + `?gpuTimings` are byte-identical.

**Files**
- Create: `src/services/engine/frame/resolveStrategy.ts`
- Modify: `src/@types/settings/EngineSettingsState.d.ts` (debug block, `:323-326`),
  `src/state/settings/initialState.ts` (debug block, `:184-189`),
  `src/state/settings/settingsSlice.ts` (debug reducers `:262`, export block `:440`),
  `src/services/engine/frame/renderFrame.ts` (`:78`)
- Test: `tests/services/engine/frame/resolveStrategy.test.ts`

**Interfaces**
- Produces: `resolveStrategy(override: RenderStrategy | 'auto', timingEnabled: boolean): RenderStrategy`
  Contract: `'auto'` → `timingEnabled ? 'perLayerTimed' : 'merged'` (today's derivation at
  `renderFrame.ts:78`); any explicit value is returned unchanged.
- Produces: `setRenderStrategy` action, `PayloadAction<RenderStrategy | 'auto'>`, writing
  `settings.debug.renderStrategy` (twin of `setShowPickBuffer` at `settingsSlice.ts:262`).
- Consumes: `RenderStrategy` (`@types/engine/frame/RenderStrategy`).

**Steps**
- [ ] Write `tests/services/engine/frame/resolveStrategy.test.ts` — four hand-specified
  input→output pairs of the genuine branch (acceptance criteria of the decouple; a real
  branch classifier, not a clamp/mirror):
  - `resolveStrategy('auto', true) → 'perLayerTimed'`
  - `resolveStrategy('auto', false) → 'merged'`
  - `resolveStrategy('merged', true) → 'merged'` (explicit override beats timing-on)
  - `resolveStrategy('perLayerTimed', false) → 'perLayerTimed'`
- [ ] `npm test -- resolveStrategy` → fails (module missing).
- [ ] Add `renderStrategy: RenderStrategy | 'auto';` to the `debug` block after
  `disabledPasses` (`EngineSettingsState.d.ts:326`) + `import type { RenderStrategy }` at
  the top of that file.
- [ ] Add `renderStrategy: 'auto',` to the `debug` object in `initialState.ts` (after
  `disabledPasses: {}`, `:189`).
- [ ] Add the `setRenderStrategy` reducer in the `// ── debug ──` group
  (`settingsSlice.ts:262`) and its name to the export block (`:440`).
- [ ] Create `resolveStrategy.ts` implementing the contract (didactic header: Joint 1 — one
  boolean fused two independent axes; `'auto'` preserves the old derivation).
- [ ] Wire `renderFrame.ts:78`:
  `const strategy: RenderStrategy = resolveStrategy(state.settings.debug.renderStrategy, timingService.enabled);`
  (`state` is already destructured at `:62`).
- [ ] `npm test -- resolveStrategy` → pass; `npm run typecheck`.
- [ ] Commit.

_No test for `setRenderStrategy` — a one-line Immer draft assignment is a constant/registry
restatement (testing.md); the branch that matters is `resolveStrategy`, which IS tested._

---

## Task 2 — Ground prep: emit per-group timestamps in merged mode

Grows the single-walk slot derivation to push a group-key row per render step, and attaches
`timestampWrites` to the `merged` pass so merged mode yields honest per-group timings.
`gpuTimingService.consumedSlots` already filters each frame to slots that called
`descriptorFor`, so allocating both per-layer and per-group slots is safe — unused ones are
simply absent per frame (no timing-service change needed).

**Files**
- Modify: `src/services/engine/frame/frameProgram.ts` (`timedSlotRowsOf` render branch,
  after the layer loop, `:184-188`)
- Modify: `src/services/engine/frame/executeFrame.ts` (import `SLAB_NAME`; render case
  `:186-197`; `renderGroup` param bag `p` type `:234-246`; merged branch `:253-257`)
- Test: `tests/services/engine/frame/timedSlotsGroupKeys.test.ts`

**Interfaces** — no public signature change. `timedSlotsOf(frameProgram(...), CONTENT_LAYERS)`
(hence `TIMED_SLOTS`) now contains the group keys in addition to the layer names.

**Steps**
- [ ] Write `tests/services/engine/frame/timedSlotsGroupKeys.test.ts` — an independent-property
  assertion hand-checked against the render steps in `frameProgram()` (`:59-100`). Derive
  `timedSlotsOf(frameProgram({ exposure: 1, curve: 0 }), CONTENT_LAYERS)` and assert it
  **includes** the group keys `'hdr·NEAR0'`, `'hdr·COSMO'`, and `'foreground:0·NEAR0'`
  **and still includes** at least one known per-layer slot name (i.e. the group rows are
  added, not substituted). Load-bearing: this is Joint 2's whole point, and it fails if the
  push is dropped or the key format drifts. (Derived from the walk → not a constant restatement.)
- [ ] `npm test -- timedSlotsGroupKeys` → fails.
- [ ] `frameProgram.ts`: in `timedSlotRowsOf`, render-step branch, **after** the
  `for (const layer of layers)` loop, push `{ name: groupKey, groupKey }` (`:184-188`).
- [ ] `executeFrame.ts`: add `SLAB_NAME` to the `import { slabViewOf } from './slabs'`
  line (`:67`); in the `'render'` case compute
  `const groupKey = \`${step.target}·${SLAB_NAME[step.slab] ?? String(step.slab)}\`;`
  and pass `groupKey` into the `renderGroup` arg bag (`:186-196`); add `groupKey: string`
  to the `p` param type (`:234-246`); in the `merged` branch's `beginRenderPass` add
  `...timestampSpread(timing, p.groupKey)` (`:253-257`). Leave the `perLayerTimed` branch
  (`timestampSpread(timing, layer.name)`, `:276`) unchanged.
- [ ] `npm test -- timedSlotsGroupKeys` → pass; `npm run typecheck`; run the frame test
  neighbourhood (`npm test -- frameProgram executeFrame`) to catch any group-list snapshot.
- [ ] Commit.

**Manual GPU verification (deferred to Task 8 — not vitest):** running the harness in
`merged` mode must show the group rows (`hdr·NEAR0`, …) with nonzero ms while per-layer
slots are absent; `perLayerTimed` shows the reverse. This is the correctness check for the
`timestampWrites` attachment, which has no isolated assertion surface without a GPUDevice.

---

## Task 3 — Timing-service enable gate under `?perf`

**Files**
- Modify: `src/services/engine/phases/initGpu.ts:409`

**Prereq:** Task 4 (`isPerfMode`). If executing strictly in numeric order, land Task 4's two
`src/utils/url/isPerf*.ts` files first (or in the same commit), then this one-line wiring.

**Interfaces** — consumes `isPerfMode()` (Task 4).

**Steps**
- [ ] `initGpu.ts:409`: change `hasUrlGate('gpuTimings')` → `hasUrlGate('gpuTimings') || isPerfMode()`;
  add `import { isPerfMode } from '../../../utils/url/isPerfMode';` (verify the relative depth
  against the file's existing imports).
- [ ] `npm run typecheck`.
- [ ] Commit.

_Not unit-tested: `initGpu` needs a GPUDevice, and a boolean-OR of two existing gates has no
isolated assertion surface a real bug trips. Verified live in Task 8 (timings collect under
`?perf` without `?gpuTimings`)._

---

## Task 4 — `?perf` URL predicate

Mirrors `?cinema` one-for-one.

**Files**
- Create: `src/utils/url/isPerfSearch.ts`, `src/utils/url/isPerfMode.ts`
- Test: `tests/utils/url/isPerfSearch.test.ts`

**Interfaces**
- `isPerfSearch(search: string): boolean` — binds `searchHasGate` (`searchHasGate.ts`) to the
  `'perf'` gate. Mirror `isCinemaSearch.ts`.
- `isPerfMode(): boolean` — `if (typeof window === 'undefined') return false; return isPerfSearch(window.location.search);`
  Mirror `isCinemaMode.ts`.

**Steps**
- [ ] Write `tests/utils/url/isPerfSearch.test.ts` (mirror `isCinemaSearch.test.ts`), hand-checked
  against `searchHasGate`'s `URLSearchParams.has` (presence-not-value, exact key):
  - `isPerfSearch('?perf') === true`
  - `isPerfSearch('?perf=1') === true` (valued form also counts)
  - `isPerfSearch('') === false`
  - `isPerfSearch('?cinema') === false`
  - `isPerfSearch('?performance') === false` (exact-key: `performance` ≠ `perf`)
- [ ] `npm test -- isPerfSearch` → fails.
- [ ] Create `isPerfSearch.ts` (didactic header mirroring `isCinemaSearch.ts` — pins the flag
  spelling only, parse lives in `searchHasGate`).
- [ ] Create `isPerfMode.ts` (didactic header mirroring `isCinemaMode.ts` — window guard).
- [ ] `npm test -- isPerfSearch` → pass; `npm run typecheck`.
- [ ] Commit.

_`isPerfMode` gets no separate test: a thin `window.location` wrapper over the tested pure
core would be a mirror of `isCinemaMode`'s wrapper — the codebase tests the pure core
(`isCinemaSearch`), which is what this follows._

---

## Task 5 — Perf hook types

**Files** (all create; one type per file, filename = type name, didactic headers)
- `src/@types/perf/PerfPose.ts`
- `src/@types/perf/PerfSample.ts`
- `src/@types/perf/SkymapPerfHook.ts`
- `src/@types/perf/PerfWindow.ts`

**Interfaces** (exact shapes — contract)
```ts
// PerfPose.ts   (import Vec3 from '../math/Vec3')
export type PerfPose = {
  target: Vec3;
  yaw: number;
  pitch: number;
  distance: number;
  /** Per-frame yaw advance; omitted → the installer's PERF_AUTO_ROTATE_RATE fallback. */
  rate?: number;
};

// PerfSample.ts  (import TimingSlotName from '../gpu/timing/TimingSlotName')
export type PerfSample = { slot: TimingSlotName; ms: number };

// SkymapPerfHook.ts  (import PerfPose, PerfSample, RenderStrategy from '../engine/frame/RenderStrategy')
export type SkymapPerfHook = {
  readonly ready: Promise<void>;
  readonly setPose: (pose: PerfPose) => Promise<void>;
  readonly setStrategy: (s: RenderStrategy) => void;
  readonly collectTimings: (frames: number) => Promise<PerfSample[]>;
};

// PerfWindow.ts  (mirror RecorderWindow.ts — a cast target, no interface augmentation)
export type PerfWindow = Window & { __skymapPerf?: SkymapPerfHook };
```

**Steps**
- [ ] Create the four files with the shapes above + didactic headers (`PerfWindow.ts`'s
  header mirrors `RecorderWindow.ts:1-16` — named intersection over `declare global` because
  the house style bans `interface` and the only readers are the installer's test + the
  harness's untyped `page.evaluate`).
- [ ] `npm run typecheck`.
- [ ] Commit.

_No tests: type declarations are proven by `tsc` (testing.md — no runtime type tests)._

---

## Task 6 — `installPerfHook` + shared ready predicate + `useEngine` wiring

The meaty task. Three parts: (A) extract the recorder's debounced ready predicate to a
shared home so both hooks use it (search-before-writing-helpers — do NOT duplicate the
debounce); (B) build `installPerfHook`; (C) wire it into `useEngine` per the resolved
wiring above.

**Files**
- Create: `src/state/lifecycle/whenStablyReady.ts` (extracted `whenStablyReady` +
  `READY_STABLE_MS`; `isSettled` stays private inside)
- Modify: `src/state/recorder/installRecorderHook.ts` (delete the local `isSettled` /
  `whenStablyReady` / `READY_STABLE_MS` at `:63-94`, import from the new file; keep the
  header's "debounced predicate" note but point it at the shared module)
- Modify: `tests/state/recorder/installRecorderHook.test.ts` (import `READY_STABLE_MS` from
  `../../../src/state/lifecycle/whenStablyReady` instead of `installRecorderHook`, `:29-32`)
- Create: `src/state/perf/installPerfHook.ts`
- Modify: `src/hooks/useEngine.ts` (`:75-76`)
- Test: `tests/state/perf/installPerfHook.test.ts`

**Interfaces**
- `whenStablyReady(store: AppStore): Promise<void>` + `export const READY_STABLE_MS = 1000`
  — the exact bodies currently at `installRecorderHook.ts:63-94`, relocated verbatim.
- `installPerfHook(store: AppStore, engine: EngineHandle): void` — `?perf`-gated inside:
  `if (!isPerfMode()) return;`. Builds a `SkymapPerfHook` and writes it via
  `(window as PerfWindow).__skymapPerf`.
  - `ready: whenStablyReady(store)`.
  - `PERF_AUTO_ROTATE_RATE` — a local `const = 0.000873` (mirrors the camera slice's inline
    default at `cameraSlice.ts:64`, which the slice does NOT export; a scenario's
    `pose.rate` overrides it).
  - `setPose(pose)` → dispatch `cancelCameraTween()`, then
    `commitCameraPose({ target, yaw, pitch, distance })`, then
    `setAutoRotate({ active: true, rate: pose.rate ?? PERF_AUTO_ROTATE_RATE })`
    (all three exported from `cameraSlice.ts:134-138`; `commitCameraPose` payload is a
    `CameraPose`, `setAutoRotate` payload is `{ active: boolean; rate: number }`); resolve on
    the next frame via `await new Promise<void>((r) => requestAnimationFrame(() => r()))` —
    the cheapest honest "next frame committed" signal.
  - `setStrategy(s)` → `store.dispatch(setRenderStrategy(s))` (Task 1).
  - `collectTimings(frames)` → subscribe to `engine.debug.timingService` (the live getter);
    for each emitted `GpuTimingFrame`, push `{ slot, ms }` for every `[slot, ms]` entry of
    `frame.perPassMs`; after `frames` frames arrive, unsubscribe and resolve with the flat
    `PerfSample[]`. (`autoRotate` is an active driver holding the render-on-demand loop awake
    for the whole window, so no manual render pump is needed.)

**Steps**
- [ ] **(A) Extract.** Create `src/state/lifecycle/whenStablyReady.ts` with the
  `isSettled` (private) + `whenStablyReady` + `READY_STABLE_MS` bodies moved verbatim from
  `installRecorderHook.ts:63-94` (carry the didactic header explaining the stability window).
  Update `installRecorderHook.ts` to `import { whenStablyReady, READY_STABLE_MS } from '../lifecycle/whenStablyReady'`
  and delete the local copies; `ready: whenStablyReady(store)` at `:125` stays. Update the
  recorder test import at `:29-32` to the new path.
- [ ] `npm test -- installRecorderHook` → still green (extraction is behaviour-preserving).
  `npm run typecheck`. Commit this extraction as its own commit (green recorder before new work).
- [ ] **(B) Gate test first.** Write `tests/state/perf/installPerfHook.test.ts`, mirroring
  the recorder gate tests (`installRecorderHook.test.ts:66-94`): `vi.mock` `isPerfMode`; pass
  a minimal fake engine handle whose `debug.timingService.subscribe` is `vi.fn<...>()`. Two
  assertions:
  - `installPerfHook is a no-op outside perf mode` — `isPerfMode` false → `window.__skymapPerf`
    is `undefined`.
  - `installPerfHook exposes the hook under ?perf` — `isPerfMode` true → `window.__skymapPerf`
    defined, `.ready instanceof Promise`, and `setPose` / `setStrategy` / `collectTimings`
    are functions.
- [ ] `npm test -- installPerfHook` → fails (module missing).
- [ ] Create `src/state/perf/installPerfHook.ts` per the Interfaces above (didactic header:
  mirror `installRecorderHook.ts:1-47`, plus the resolved-wiring note — why it takes the
  engine handle and installs from `useEngine`, not `main.tsx`).
- [ ] `npm test -- installPerfHook` → the two gate assertions pass; `npm run typecheck`.
- [ ] **(C) Wire.** In `useEngine.ts`, after `handleRef.current = handle` (`:76`), add
  `installPerfHook(store, handle);` and its import. (`store` is `useAppStore()` at `:59`,
  typed `AppStore`; `handle` is the `EngineHandle`.)
- [ ] `npm run typecheck` + full `npm test` (there is **no** `useEngine` test to update —
  confirmed absent).
- [ ] Commit.

_Not unit-tested: `setPose` / `setStrategy` / `collectTimings` end-to-end behaviour needs a
live engine + GPU (no assertion surface the pure pieces + the gate test don't already cover).
The `ready` debounce is already covered by the recorder test through the now-shared
`whenStablyReady` — not re-tested here._

---

## Task 7 — Aggregation + floor math (`tools/utils/perf/`, pure, tested)

**Reuse check (done):** `tools/utils/math/percentileOf.ts` is the **inverse** operation
(value → its rank in a sorted array), not value-at-percentile, so it is **not** reusable
here. No median/percentile-value helper exists. Create the ones below.

**Files** (create; one function per file)
- `tools/utils/perf/percentile.ts`, `tools/utils/perf/median.ts`
- `tools/utils/perf/groupSamplesBySlot.ts`
- `tools/utils/perf/estimateFloor.ts`
- Tests: `tests/tools/utils/perf/{percentile,median,groupSamplesBySlot,estimateFloor}.test.ts`

**Interfaces**
- `percentile(values: readonly number[], p: number): number` — type-7 linear interpolation on
  an ascending copy: `r = (p/100)*(n-1)`, `lo = floor(r)`, `frac = r - lo`,
  `result = values[lo] + frac*(values[lo+1] - values[lo])`.
- `median(values: readonly number[]): number` — delegates to `percentile(values, 50)` (no
  duplicated maths).
- `groupSamplesBySlot(samples: readonly PerfSample[]): Map<TimingSlotName, number[]>` —
  buckets `ms` by `slot`, preserving arrival order within each bucket.
- `estimateFloor(layerMedians: readonly number[], mergedGroupMedian: number): number` —
  `max(0, (sum(layerMedians) - mergedGroupMedian) / layerMedians.length)`; returns `0` when
  `layerMedians.length < 2` (single-layer group — no floor to separate; the report omits its
  floor line).

**Steps**
- [ ] `percentile.test.ts` — hand-computed (independent of the impl):
  - `percentile([1,2,3,4], 50) === 2.5`
  - `percentile([1,2,3,4,5], 50) === 3`
  - `percentile([1,2,3,4,5,6,7,8,9,10], 90)` → `r=8.1, lo=8 → 9 + 0.1*(10-9) = 9.1`
    (`toBeCloseTo(9.1, 6)`)
- [ ] `median.test.ts` — one even-length case exercising the interpolation branch:
  `median([1,2,3,4]) === 2.5` (hand-computed; not a mirror — the expectation is worked out,
  not produced by calling `percentile`).
- [ ] `groupSamplesBySlot.test.ts` — grouping/round-trip: input
  `[{slot:'a',ms:1},{slot:'b',ms:2},{slot:'a',ms:3}]` → `Map` with `a → [1,3]`, `b → [2]`.
- [ ] `estimateFloor.test.ts` — hand-computed, all three branches:
  - `estimateFloor([3.6,3.1,3.4], 4.2)` → `(10.1 - 4.2)/3 = 1.9667` (`toBeCloseTo(1.9667, 3)`)
  - clamp-at-0: `estimateFloor([1,1], 5)` → `(2-5)/2 = -1.5` → `0`
  - single-layer skip: `estimateFloor([3.4], 3.0)` → `0` (length < 2)
- [ ] `npm test -- tools/utils/perf` → all fail (modules missing).
- [ ] Implement the four helpers (didactic headers; `estimateFloor`'s header carries the
  spec's `(Σ Lᵢ − G)/n` intuition — merged pays the load/store round-trip once, perLayer
  pays it `n` times).
- [ ] `npm test -- tools/utils/perf` → pass; `npm run typecheck`.
- [ ] Commit.

---

## Task 8 — Scenario table + CDP harness

**Files** (create)
- `tools/perf/perfScenarios.ts`, `tools/perf/scenarioReport.ts`, `tools/perf/measurePerf.ts`
- Modify: `package.json` (`"perf": "tsx tools/perf/measurePerf.ts"` — matches the `record-tour`
  `tsx` runner)

**Interfaces**
```ts
// perfScenarios.ts
export type PerfScenario = { readonly name: string; readonly pose: PerfPose };
export const PERF_SCENARIOS: readonly PerfScenario[];  // 6 named entries

// scenarioReport.ts  (plain type module, no side effects — importable by measurePerf + the report test)
export type LayerStat = { slot: TimingSlotName; median: number; p90: number };
export type ScenarioReport = {
  scenario: string;
  viewport: { width: number; height: number };
  dpr: number;
  frames: number;
  merged: readonly LayerStat[];    // per-group rows (hdr·NEAR0, …) from the merged run
  perLayer: readonly LayerStat[];  // per-layer rows (orbit-trails, …) from the perLayerTimed run
  floors: readonly {
    groupKey: string;
    floor: number;
    reals: readonly { slot: TimingSlotName; real: number }[];
  }[];
};
```

**Harness flow (`measurePerf.ts`)** — mirror `recordTour.ts` structure:
- **Launch:** `launchChromium()` copied from `recordTour.ts:218-231` (`chromium.launch({ channel: 'chromium' })`,
  fallback `chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-angle=metal'] })`).
- **CLI:** bespoke argv loop (like `recordTour.ts:137-209`; `parseFlags` in
  `tools/utils/cli/args.ts` is boolean-only, so string/number flags need the loop):
  `--scenario <name>` (repeatable — filters `PERF_SCENARIOS`; absent = all),
  `--dpr <n>` (default 2), `--frames <n>` (default 30), `--url <u>` (default
  `http://localhost:5173`). Viewport `1400×900`.
- **Per scenario:** `browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: dpr })`,
  `page.goto(url + '/?perf')`, `page.waitForFunction(() => window.__skymapPerf !== undefined, { polling: 100 })`,
  `await page.evaluate(() => window.__skymapPerf.ready)`. Then for each strategy in
  `['merged', 'perLayerTimed']`: `page.evaluate` → `setStrategy(strategy)`, `await setPose(pose)`,
  `const samples = await collectTimings(frames)`; return `samples` to Node.
- **Aggregate in Node:** `groupSamplesBySlot` → per-slot `median` / `percentile(…, 90)` →
  `LayerStat[]` for each strategy. Build the name→groupKey map by flattening the rows of
  `timedSlotGroupsOf(frameProgram({ exposure: 1, curve: 0 }), CONTENT_LAYERS)` (each
  `TimedSlotRow` carries `groupKey`) — reuses the single walk, no hand-maintained mapping.
  Bucket the perLayer layer-medians by their `groupKey`, and for each bucket with a matching
  merged group median call `estimateFloor(layerMedians, mergedGroupMedian)` → `floors`.
  Assemble a `ScenarioReport` and print via `formatReport` (Task 9).

**Scenario table — data-capture, not code:** ship `PERF_SCENARIOS` with the six named
entries (`earth-surface`, `solar-system`, `star-field`, `milky-way`, `local-group`,
`full-survey`), each pose a **clearly-marked placeholder** that compiles
(`// PLACEHOLDER — replace via logState live capture`), NOT invented physical coordinates.
Then a dedicated **live-capture step** flies to each regime in the running app, reads the
`l`-key `logState` dump, and pastes the real pose into the matching entry. This is a
data-capture step; do not fabricate numbers in the plan or the initial commit.

**Steps**
- [ ] Create `scenarioReport.ts` (the two types above).
- [ ] Create `perfScenarios.ts` with the six named placeholder entries.
- [ ] Create `measurePerf.ts` per the flow above (didactic header mirroring `recordTour.ts:1-75`,
  minus virtual time — the "Determinism" spec §: real GPU wall-time, medians/p90, no
  thresholds). Add the `"perf"` script to `package.json`.
- [ ] `npm run typecheck` (tools tsconfig).
- [ ] **Manual verification (not vitest):** with `npm run dev` running, execute
  `npm run perf -- --scenario solar-system --frames 10`. Confirm: a table prints; the
  `MERGED` block shows group rows (`hdr·NEAR0`, …) with nonzero ms; the `PER-LAYER` block
  shows layer rows (`orbit-trails`, …); the two strategies produce their respective slot
  sets (this is also the deferred GPU verification for Task 2 and the enable-gate check for
  Task 3 — timings collect under `?perf` with no `?gpuTimings`).
- [ ] **Live-capture step:** fly to each of the six regimes, read `logState`, replace each
  placeholder pose in `perfScenarios.ts`. Re-run `npm run perf -- --scenario <name> --frames 10`
  per scenario to confirm the pose lands where intended.
- [ ] Commit (harness + captured poses).

---

## Task 9 — Report format (pure printer, tested)

The printed report format is the spec's §"Output" block. Implement it as a pure function so
it IS unit-testable.

**Files**
- Create: `tools/utils/perf/formatReport.ts`
- Test: `tests/tools/utils/perf/formatReport.test.ts`

**Interfaces**
- `formatReport(report: ScenarioReport): string` (imports `ScenarioReport` from
  `../../../tools/perf/scenarioReport` — adjust the relative depth). Renders, per the spec:
  a header line (`<scenario>  (<W>×<H> @dpr<N>, <frames> frames, median ms | p90)`), a
  `MERGED (production pass shape)` block of `<slot> … <median> | <p90>` rows, a
  `PER-LAYER (attribution; each row includes ~FLOOR pass overhead)` block, and per group an
  `EST. PER-PASS FLOOR ≈ <floor> ms` line with `→ <slot> ≈ <real> ms real` entries.

**Steps**
- [ ] Write `tests/tools/utils/perf/formatReport.test.ts` — **targeted branch assertions**,
  NOT a full golden snapshot (testing.md: full-object snapshots train blind re-blessing).
  Build one `ScenarioReport` fixture by hand and assert the output string:
  - contains the header with `1400×900`, `dpr2`, and `30 frames`;
  - contains a merged group row for `hdr·NEAR0` showing its `median` and `p90` (e.g. `4.2`
    and `5.1`);
  - contains a per-layer row for `orbit-trails` showing its `median`;
  - contains a floor line with the group's floor value when `floors` has a ≥2-layer entry;
  - **omits** any floor line for a report whose `floors` is empty (single-layer scenario) —
    a second fixture asserting the absence.
- [ ] `npm test -- formatReport` → fails.
- [ ] Implement `formatReport.ts` (didactic header: pure printer, so the harness's output
  format is testable without a browser). Fix numeric formatting to 1 decimal (`toFixed(1)`).
- [ ] `npm test -- formatReport` → pass; `npm run typecheck`.
- [ ] Wire `measurePerf.ts` to call `formatReport` for each scenario (if not already) and
  confirm via a `npm run perf -- --scenario solar-system --frames 10` spot-run.
- [ ] Commit.

---

## Self-Review

### Spec-coverage table
| Spec § | Task(s) |
| --- | --- |
| Goals (both strategies, floor estimate, structured data, camera-as-user) | 1, 6, 7, 8, 9 |
| Non-goals (no baselines/thresholds, no virtual clock, no new camera API) | Task 6 uses existing camera actions; Task 8 samples real time — encoded as constraints, nothing to build |
| Ground prep Joint 1 (decouple strategy) | Task 1 |
| Ground prep Joint 2 (per-group timestamps) | Task 2 |
| Timing-service enable gate (`\|\| isPerfMode()`) | Task 3 |
| Architecture (CDP harness owns Chromium + aggregation) | Task 8 |
| Seam `window.__skymapPerf` (`?perf`-gated installer) | Tasks 4, 5, 6 |
| `ready` (shared debounced predicate) | Task 6 (part A extraction) |
| `setPose` (cancelTween + commitPose + autoRotate) | Task 6 |
| `setStrategy` (dispatch renderStrategy) | Tasks 1 + 6 |
| `collectTimings` (subscribe timingService) | Task 6 (wiring resolved via engine handle) |
| Scenario table | Task 8 (placeholders + live capture) |
| Output table + floor math | Tasks 7 (math) + 9 (printer) + 8 (assembly) |
| Floor-estimate math (`(Σ Lᵢ − G)/n`, ≥0 clamp, single-layer skip) | Task 7 (`estimateFloor`) |
| Determinism (fixed poses/frames/viewport, medians/p90) | Task 8 |
| Testing (pure pieces only; not the CDP drive) | encoded per-task; live pieces verified by running |
| Open question: raw + floored per-layer columns | Task 9 report shows both raw per-layer rows AND the floor-subtracted `reals` |

### Placeholder scan
The only intentional placeholders are the six `PERF_SCENARIOS` poses (Task 8), replaced in
the same task's live-capture step. No fabricated numeric coordinates ship in code or plan.
No `TODO`/stub survives past its task. The spec's tentative `main.tsx` install line is
**superseded** (documented in "Resolved wiring question") — the install lives in `useEngine`.

### Type-consistency check across tasks
- `RenderStrategy = 'merged' | 'perLayerTimed'` (`RenderStrategy.d.ts:18`) is used un-widened by
  `SkymapPerfHook.setStrategy` (Task 5) and `resolveStrategy`'s return (Task 1); the settings
  override + `setRenderStrategy` widen to `RenderStrategy | 'auto'` (Tasks 1). `setStrategy`
  passes only `'merged' | 'perLayerTimed'`, a valid subset — consistent.
- `PerfSample = { slot: TimingSlotName; ms: number }` (Task 5) is produced by `collectTimings`
  (Task 6) and consumed by `groupSamplesBySlot` (Task 7) → `LayerStat` (Task 8) → `formatReport`
  (Task 9). `TimingSlotName = string` (`TimingSlotName.d.ts:22`) flows unchanged throughout.
- `PerfPose` (Task 5) is consumed by `setPose` (Task 6) and embedded in `PerfScenario` (Task 8);
  its `target: Vec3` matches `CameraPose.target` (`CameraPose.d.ts:8-15`), so `commitCameraPose`
  accepts the destructured `{ target, yaw, pitch, distance }` without conversion.
- `whenStablyReady` / `READY_STABLE_MS` (Task 6A) keep the exact signatures the recorder used,
  so the recorder + its test stay green after the extraction.
