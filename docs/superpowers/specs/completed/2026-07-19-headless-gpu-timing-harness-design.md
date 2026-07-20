# Headless GPU-timing perf harness — design

**Date:** 2026-07-19
**Status:** design (awaiting user review → plan)

## Problem

Per-layer GPU timings today are only visible by opening the DebugPanel
(`?gpuTimings`, press `d`) and reading the rolling-average rows by eye. There is
no way to script a measurement, compare layers across camera poses, or capture a
repeatable perf snapshot. The immediate motivation: the `orbit-trails` and
`body-glints` layers each read ~3–4 ms in the panel, which is implausible for the
handful of primitives they draw — but the panel can't tell us how much of that is
real draw cost versus the `perLayerTimed` strategy's per-pass load/store overhead
(each timed layer opens its own render pass, and on Apple Silicon every pass
boundary round-trips the full-viewport HDR target through DRAM).

We want a headless harness that drives the app in Chromium, places the camera at a
set of committed poses, and prints a per-layer / per-group timing table — with the
pass-boundary overhead separated out rather than baked into every number.

## Goals

- A `npm run perf` script that boots skymap headless, runs a committed set of
  camera scenarios, and prints a per-scenario timing report.
- Each scenario measured in **both** render strategies (the `RenderStrategy` union
is `'merged' | 'perLayerTimed'`):
  - `merged` — the production pass shape; yields honest **per-render-step group**
    timings (`hdr·NEAR0`, `foreground:0·NEAR0`, …).
  - `perLayerTimed` — one pass per layer; yields **per-layer attribution**
    (`orbit-trails`, `body-glints`, …) but each row carries the fixed per-pass
    overhead. (Report block labelled "PER-LAYER"; the strategy id is the
    `RenderStrategy` union value `'perLayerTimed'`.)
- A derived **per-pass floor estimate** so per-layer numbers can be read
  minus-overhead.
- Structured data end-to-end — no DOM/string scraping.
- The camera driven exactly as a user would drive it: place a pose, turn on
  auto-rotate, sample over the spin.

## Non-goals (YAGNI)

- No committed baselines, no pass/fail thresholds, no `--check` mode, no CI
  wiring. This is a measurement **report** you run on demand while optimizing.
  Regression gating can be layered on later if wanted.
- No virtual-time clock (unlike the tour recorder). Perf wants real GPU wall-time,
  so the harness samples in real time.
- No new imperative camera API. Poses are applied through the store actions the UI
  already dispatches.

## Ground preparation

Two engine joints the harness needs. Both are consumed **only** by the harness
(nothing else wants merged-mode group timings or a strategy override) and gate no
other feature, so per the refactor-ground rule they land as the **first two tasks
of this feature's plan**, not separate prep PRs. Recorded here so the rest of the
spec is written against the post-change architecture.

### Joint 1 — decouple render strategy from `timingService.enabled`

Today `renderFrame.ts` fuses two independent axes into one boolean:

```ts
const strategy = timingService.enabled ? 'perLayerTimed' : 'merged';
```

This makes "timing enabled **and** merged" — the harness's production-true timed
mode — unreachable. The joint doesn't exist yet (the code is entanglement-radar
clean; there has only ever been one coupling). Create it by making strategy an
explicit override at the existing `settings.debug` seam (a sibling to
`disabledPasses`, which `executeFrame` already reads):

```ts
// EngineSettingsState.debug
renderStrategy: RenderStrategy | 'auto';   // 'auto' = today's derivation
```

`renderFrame` reads it:

```ts
const override = state.settings.debug.renderStrategy;
const strategy: RenderStrategy =
  override !== 'auto'
    ? override
    : timingService.enabled
      ? 'perLayerTimed'
      : 'merged';
```

Default is `'auto'`, so production and `?gpuTimings` behaviour are byte-identical.
The perf hook dispatches to set it. A `perLayer` override with timing disabled is
harmless (opens per-layer passes, attaches no timestamps); the harness always runs
with timing enabled.

### Joint 2 — emit per-group timestamps in merged mode

`timedSlotRowsOf` (frameProgram.ts) emits one timing slot per **layer** for each
render step; the step's `groupKey` (`hdr·NEAR0`) is computed for bucketing but
never emitted as its own allocatable slot, and the `merged` branch of
`renderGroup` (executeFrame.ts) attaches no `timestampWrites`. Grow the single-walk
derivation to also push a group-key row per render step:

```ts
// inside timedSlotRowsOf, render-step branch, after pushing per-layer rows:
rows.push({ name: groupKey, groupKey }); // e.g. { name: 'hdr·NEAR0', groupKey: 'hdr·NEAR0' }
```

The query set is sized from `TIMED_SLOTS`, so it grows to hold both the per-layer
and per-group slots. `gpuTimingService.consumedSlots` already filters each frame to
the slots that actually called `descriptorFor`, so:

- in `perLayer` mode the group slots are never requested → absent from the frame;
- in `merged` mode the per-layer slots are never requested → absent.

No strategy flag leaks into the timing service. Then thread the `groupKey` into
`renderGroup` and time the merged pass:

```ts
// executeFrame renderGroup, merged branch:
const pass = encoder.beginRenderPass({
  label: `render-${target}`,
  colorAttachments: [colorAttachment(target, targetView, alreadyTouched)],
  ...depthAttachment(ctx, target, alreadyTouched),
  ...timestampSpread(timing, groupKey),   // NEW
});
```

`groupKey` is `${target}·${SLAB_NAME[slab]}` — the same key the derivation uses, so
the executor and the slot registry can't drift. The DebugPanel will gain group rows
too; in `perLayer` mode they read as stale/absent (the panel already tolerates
absent slots), and the harness reads timings through the hook, not the panel, so no
panel change is required.

### Timing-service enable gate

`initGpu.ts` allocates the timing service under `hasUrlGate('gpuTimings')`. The
harness runs under `?perf`, which must also allocate it:

```ts
createGpuTimingService(device, hasUrlGate('gpuTimings') || isPerfMode(), TIMED_SLOTS);
```

## Architecture

```
tools/perf/measurePerf.ts ──CDP──▶ Chromium (?perf) ──▶ window.__skymapPerf
  │                                                          ├─ ready       (reuse debounced predicate)
  │  for each scenario × { merged, perLayerTimed }:          ├─ setPose(pose)
  │    setPose → collectTimings(N frames) ───────────────▶   ├─ setStrategy('merged'|'perLayerTimed')
  │                                                          └─ collectTimings(frames) → PerfSample[]
  ▼
 aggregate median/p90 + floor estimate in Node → print table
```

The harness owns the Chromium lifecycle and all aggregation, exactly like
`tools/record/recordTour.ts`. The app exposes only a promise-shaped seam; the
harness never touches the store from `page.evaluate`. Chromium launch reuses
recordTour's known-good pattern: `chromium.launch({ channel: 'chromium' })` with a
`--enable-unsafe-webgpu --use-angle=metal` shell fallback.

## The seam — `window.__skymapPerf` (gated by `?perf`)

Mirrors the `?cinema` / `window.__skymapRecorder` pattern, with one deliberate
divergence from the recorder: `collectTimings` needs the **GPU timing service**,
which is *not* in the Redux store — it lives on `EngineState.gpu.timingService` and
is reachable only through the engine handle's live getter
(`engine.debug.timingService`, `engine.ts:858`). So `installPerfHook` takes both the
store and the engine handle, and is called from **`useEngine`'s effect** right after
`createEngine` (`useEngine.ts:75`) — the one site holding both — rather than from
`main.tsx` (which never holds the handle). The `?perf` gate lives inside the
installer (no-op otherwise), keeping it unit-testable and the call site branchless.

```ts
installPerfHook(store: AppStore, engine: EngineHandle): void  // ?perf-gated inside
```

```ts
export type SkymapPerfHook = {
  /** Resolves once the engine is running and loading slots have settled. */
  readonly ready: Promise<void>;
  /** Snap camera.base to the pose and turn on auto-rotate; resolves next frame. */
  readonly setPose: (pose: PerfPose) => Promise<void>;
  /** Override the render strategy (dispatches settings.debug.renderStrategy). */
  readonly setStrategy: (s: RenderStrategy) => void;
  /** Subscribe to gpuTimingService for `frames` frames; resolve with the samples. */
  readonly collectTimings: (frames: number) => Promise<PerfSample[]>;
};

export type PerfPose = {
  target: Vec3;
  yaw: number;
  pitch: number;
  distance: number;
  /** Per-frame yaw advance; omitted → the camera slice's default rate. */
  rate?: number;
};

export type PerfSample = { slot: TimingSlotName; ms: number }; // one per (slot, frame)
```

### `ready`

Reuse the recorder installer's debounced ready predicate (engine
`status.kind === 'ready'` **and** `loadProgress === null`, held stable for
`READY_STABLE_MS`). It is currently private in `installRecorderHook.ts`; rather than
duplicate the debounce, extract it to a shared `src/state/lifecycle/whenStablyReady.ts`
that both hooks import (the recorder's existing test keeps it covered). Boot runs in
real wall-clock time; the harness awaits `ready` before the first `setPose`.

### `setPose`

No new imperative camera surface. Dispatches the same actions the UI/orbit-controls
already use:

```ts
dispatch(cancelCameraTween());                                 // clear any focus tween
dispatch(commitCameraPose({ target, yaw, pitch, distance }));  // camera.base
dispatch(setAutoRotate({ active: true, rate: rate ?? PERF_AUTO_ROTATE_RATE }));
```

The camera slice's default rate (`0.000873`) is an inline literal in its initial
state, not an exported constant. Rather than reach into the slice, the installer
defines a local `PERF_AUTO_ROTATE_RATE` fallback (a scenario's `pose.rate` overrides
it); scenarios that care about spin speed set `rate` explicitly.

The `resting` camera driver applies `camera.base`; the `autoRotate` driver
(priority 20) advances yaw each frame. Because `autoRotate` is an **active animated
driver**, it holds the render-on-demand loop awake for the whole sample window —
`collectTimings` needs no manual `requestRender` pump. `setPose` resolves on the
next frame boundary so the pose is committed before timings are collected.

### `setStrategy`

Dispatches `settings.debug.renderStrategy = s`. The next frame renders under that
strategy (Joint 1).

### `collectTimings(frames)`

Subscribes to `state.gpu.timingService`, records each emitted `GpuTimingFrame`'s
`perPassMs` map as `{slot, ms}` rows until `frames` frames have arrived,
unsubscribes, and resolves with the flat sample list. Because yaw sweeps during the
window, samples span a range of viewing angles — the aggregation's median/p90 is
then a distribution over angles rather than a single pinned frame, which is both
more robust and matches how the perf is eyeballed live.

## Scenario table — `tools/perf/perfScenarios.ts`

A committed table of named poses spanning the scale ladder. Each entry is
essentially a `CameraPose` + optional rate, so a new scenario is authored by
copy-pasting `logState`'s output (the existing `l`-key camera dump).

```ts
export type PerfScenario = { readonly name: string; readonly pose: PerfPose };

export const PERF_SCENARIOS: readonly PerfScenario[] = [
  { name: 'earth-surface', pose: /* … */ },
  { name: 'solar-system',  pose: /* … */ },
  { name: 'star-field',    pose: /* … */ },
  { name: 'milky-way',     pose: /* … */ },
  { name: 'local-group',   pose: /* … */ },
  { name: 'full-survey',   pose: /* … */ },
];
```

Concrete pose values are captured during implementation by flying to each regime in
the live app and reading `logState`. `--scenario <name>` (repeatable) filters to a
subset; absent = all.

## Output — table + floor estimate

Per scenario, two blocks plus a derived floor:

```
solar-system   (1400×900 @dpr2, 30 frames, median ms | p90)
  MERGED (production pass shape)
    hdr·NEAR0 ......... 4.2 | 5.1   foreground:0·NEAR0 . 1.1 | 1.4   hdr→swap . 2.3 | 2.6
  PER-LAYER (attribution; each row includes ~FLOOR pass overhead)
    orbit-trails .. 3.6 | 4.0   body-glints .. 3.1 | 3.4   star-points .. 3.4 | 3.9
  EST. PER-PASS FLOOR ≈ 2.9 ms
    → orbit-trails ≈ 0.7 ms real   body-glints ≈ 0.2 ms real   star-points ≈ 0.5 ms real
```

### Floor-estimate math (`tools/utils/perf/`, pure + tested)

For a render-step group with per-layer median times `L₁…Lₙ` (from the perLayer run)
and a merged group median `G` (from the merged run):

```
floor ≈ (Σ Lᵢ − G) / n
realᵢ ≈ Lᵢ − floor
```

The intuition: the merged pass pays the load/store round-trip **once** for the
whole group, while the perLayer run pays it `n` times; the excess `Σ Lᵢ − G` is
`(n−1)·floor` plus the small extra work, so dividing by `n` approximates the
per-pass floor. Reported as an estimate, not a guarantee — clamped at ≥ 0 and
skipped for groups with a single layer (no floor to separate).

`--dpr <n>` (default 2) sets the device scale factor, since overhead scales with
pixel area; `--frames <n>` (default 30) the sample window.

## Determinism

Fixed poses + fixed frame count + fixed viewport/DPR. Real GPU wall-time varies
run-to-run (thermal, contention), which is why the report is medians/p90 and
carries no thresholds. No virtual-time clock.

## Testing

Test the pure pieces; do not test the Chromium drive (integration-only, no
assertion surface that a real bug would trip that the pieces don't already cover):

- **Floor-estimate math** — `(Σ Lᵢ − G)/n`, the ≥ 0 clamp, the single-layer skip.
- **Aggregation** — median / p90 over a sample list, grouping samples by slot.
- **`isPerfSearch`** — the pure `?perf` predicate over a query string.
- **`installPerfHook` gate** — no-op (nothing attached to a fake `window`) when the
  search string lacks `?perf`; attaches the hook when present.
- **`renderStrategy` override resolution** — `'auto'` reproduces the
  `timingService.enabled` derivation; an explicit value wins. (Pure helper extracted
  from `renderFrame` so it's testable without a device.)

Not tested: `setPose`/`collectTimings` behaviour end-to-end (needs a live engine +
GPU), the scenario pose values (data), the CDP loop.

## File inventory

**Ground prep (plan tasks 1–2):**
- `src/@types/settings/EngineSettingsState.d.ts` — `debug.renderStrategy` field.
- `src/state/settings/initialState.ts` — default `'auto'`.
- `src/services/engine/frame/renderFrame.ts` — read the override (extract a pure
  `resolveStrategy` helper).
- `src/services/engine/frame/frameProgram.ts` — emit per-group slot rows.
- `src/services/engine/frame/executeFrame.ts` — thread `groupKey`, time the merged
  pass.
- `src/services/engine/phases/initGpu.ts` — `|| isPerfMode()` on the wanted gate.

**Feature:**
- `src/utils/url/isPerfSearch.ts`, `src/utils/url/isPerfMode.ts`
- `src/@types/perf/{SkymapPerfHook,PerfWindow,PerfPose,PerfSample}.ts`
- `src/state/lifecycle/whenStablyReady.ts` — extracted shared ready predicate;
  `src/state/recorder/installRecorderHook.ts` re-imports it.
- `src/state/perf/installPerfHook.ts`
- `src/hooks/useEngine.ts` — one `installPerfHook(store, handle)` call after
  `createEngine` (not `main.tsx` — see the seam section's wiring note).
- `tools/perf/measurePerf.ts`, `tools/perf/perfScenarios.ts`, `tools/perf/scenarioReport.ts`
- `tools/utils/perf/*` — aggregation + floor math + report printer (one function per file).
- `package.json` — `"perf"` script.

## Open questions

- Concrete `PERF_SCENARIOS` pose values — captured during implementation via
  `logState`, not pinned here.
- Whether to also print a raw (un-floored) per-layer column for cross-checking, or
  only the floor-subtracted estimate. Lean: show both (raw is the ground truth; the
  estimate is derived).
```
