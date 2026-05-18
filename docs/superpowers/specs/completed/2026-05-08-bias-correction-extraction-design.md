# Bias Correction Extraction (Spec E)

**Date:** 2026-05-08
**Status:** Spec
**Predecessors:**
- [Engine ↔ Renderer Boundary Tightening (Spec A)](2026-05-07-engine-renderer-boundaries-design.md) — landed 2026-05-07
- [Engine Internal Restructure (Spec B)](2026-05-08-engine-internal-restructure-design.md) — landed 2026-05-08
- [Services Folder Structure (Spec C)](2026-05-08-services-folder-structure-design.md) — landed 2026-05-08
- [Engine Deeper Abstractions (Spec D)](2026-05-08-engine-deeper-abstractions-design.md) — landed 2026-05-08

## Goal

`PointRenderer` is two things in a trenchcoat: a renderer that draws instanced point billboards (~700 lines), and a Malmquist-bias-correction subsystem that owns CPU-side weight mirrors, async worker bakes, mode-flag tracking, and re-upload coordination (~400 lines, plus three `private static` runner registries used as test-injection seams). The two halves don't read or write each other except via a narrow splice — but they share a class, so the file is 1738 lines and "what does PointRenderer do?" has no clean answer.

This spec extracts the bias-correction half into its own subsystem under `engine/subsystems/`. After the extraction:

- `PointRenderer` is ~1300 lines doing one job (draw instanced billboards, manage per-source vertex buffers).
- A new `biasCorrectionSubsystem` (~250 lines, matches `selectionSubsystem.ts`'s shape) owns mode flags, cached ratios/weights per source, the async bake state machine, and the worker runner registry.
- The seam between them is a uni-directional, layout-aware splice API on the renderer: `spliceSchechterRatios(source, ratios)`, `spliceAngularWeights(source, weights)`, `clearBiasOverlays(source?)`. The subsystem feeds finished bake data; the renderer doesn't observe.
- Test injection moves from `PointRenderer.setSchechterRatioRunner(...)` (mutating a static) to factory params (`createBiasCorrectionSubsystem({schechterRunner: stubRunner, ...})`).
- `state.bias.{mode, absMagLimit, …}` stays as the UI-facing knob bag (parallel to `state.settings`); the subsystem reads it as a trigger.

This is a follow-on to Spec D's audit of renderer responsibilities (see *Decomposition* in this session's brainstorming). The audit found that PointRenderer is the only renderer carrying state that doesn't belong to the rendering concern. Every other renderer's state is legitimately pipeline + per-frame data + (optionally) data ownership; only PointRenderer carries cross-cutting feature state. Extracting it brings the renderer fleet to a coherent shape: stateless drawers (quad/disk/proceduralDisk/milkyWay), data-owning drawers (filament + post-extraction point), and a querier (pick).

## Background

### Current state — what lives where on PointRenderer

**Pipeline infrastructure (legitimate, stays):**

```
private pipeline: GPURenderPipeline
private uniformBuffer_internal: GPUBuffer
private bindGroup: GPUBindGroup
private device: GPUDevice
```

**Per-source data (legitimate, stays — this is what makes it a data-owning renderer):**

```
private clouds: Map<Source, LoadedSource>
```

…where `LoadedSource` includes:

```ts
{
  buffer: GPUBuffer;          // per-source vertex buffer        — stays
  count: number;              // derived from cloud              — stays
  interleaved: Float32Array;  // CPU mirror, ~14 MB per SDSS     — stays (layout-aware splice
                              //                                    needs it; layout knowledge
                              //                                    is renderer concern)
  fade: CloudFade;            // per-cloud fade-in animation     — stays (rendering state)

  // ── Misplaced (moves out) ──────────────────────────────────────────
  cachedSchechterRatios: Float32Array | null;  // bias cache      → subsystem
  cachedAngularWeights: Float32Array | null;   // bias cache      → subsystem
  cloud: PointCloud;                           // back-ref for bake → subsystem
  schechter: SchechterTriple;                  // survey constant  → table lookup
  mLim: number;                                // survey constant  → table lookup
  nRef: number;                                // survey constant  → table lookup
}
```

**Bias state on the class (misplaced, moves out):**

```
private schechterModeActive = false;
private angularReweightModeActive = false;
private static schechterRunner: ...
private static angularRunner: ...
private static buildRunner: ...   // EXCEPTION — see "buildRunner stays" below
```

**Bias methods on the class (misplaced, moves out):**

```
async setBiasMode(mode: BiasMode): Promise<void>
private async bakeSchechterRatios(): Promise<void>
clearSchechterRatios(): void
private spliceSchechterIntoMirror(entry: LoadedSource, ratios: Float32Array): void
private async bakeAngularWeights(): Promise<void>
clearAngularWeights(): void
private spliceAngularIntoMirror(entry: LoadedSource, weights: Float32Array): void
```

Roughly **400 lines of bias-correction logic** that has no rendering reason to be on the renderer.

### What stays — and why `buildRunner` is the exception

`buildRunner` is wired the same way as the other two statics, but its job is fundamentally different: it builds the *initial* `interleaved` Float32Array at upload time from a `PointCloud`'s struct-of-arrays. That happens in `PointRenderer.upload(source, cloud)` and is constitutive of "construct a renderable vertex buffer from a parsed catalog". It's the renderer's responsibility, not the bias subsystem's. The fact that it sometimes computes Schechter columns inline (`mode: 'with-schechter'`) is a flag the renderer passes through to a worker — it doesn't make the worker's caller a bias-correction concern.

`buildRunner` therefore stays on the renderer (as a module-level injection point, not a class static — see *Worker injection* below).

### Why the split is uni-directional

The subsystem feeds the renderer; the renderer doesn't read the subsystem. Design property: anyone reading `PointRenderer` after the extraction can answer "what does this draw and how" without ever opening `biasCorrectionSubsystem.ts`. Anyone reading `biasCorrectionSubsystem` can answer "what bake do we run when, and what do we splice where" without opening the renderer.

This shape mirrors `selectionSubsystem` ↔ `pointRenderer` (Spec D.3 and earlier): the subsystem decides what to highlight, writes the packed identity into the per-frame uniform; the renderer doesn't know about hover/select state.

## Architecture

### Subsystem shape

```ts
// src/services/engine/subsystems/biasCorrectionSubsystem.ts

import type { BiasMode } from '../../../data/biasMode';
import type { Source } from '../../../data/sources';
import type { ComputeSchechterRatiosInput } from '../bake/computeSchechterRatios';
import type { ComputeAngularWeightsInput } from '../bake/computeAngularWeights';
import type { PointRenderer } from '../../gpu/renderers/pointRenderer';
import type { EngineState, PointCloud } from '../../../@types';

export type SchechterRunner = (input: ComputeSchechterRatiosInput) => Promise<Float32Array>;
export type AngularRunner = (input: ComputeAngularWeightsInput) => Promise<Float32Array>;

export type BiasCorrectionDeps = {
  state: EngineState;
  /** Optional override for the schechter-ratios worker. Defaults to the
   *  Vite `?worker` runner; tests pass an in-process stub. */
  schechterRunner?: SchechterRunner;
  /** Same for angular weights. */
  angularRunner?: AngularRunner;
};

export type BiasCorrectionSubsystem = {
  /** Wire the renderer once it's been constructed (during `initGpu`). */
  attachRenderer(renderer: PointRenderer): void;

  /** Switch bias mode. Triggers worker bakes for every loaded source
   *  and splices results into the renderer when each finishes.
   *  Resolves when all bakes + splices are complete. Fire-and-forget
   *  is the expected call shape from engine.ts; the Promise exists so
   *  tests can await. */
  setMode(mode: BiasMode): Promise<void>;

  /** Called when a new source uploads or re-uploads (tier swap, fresh
   *  fetch). If a bias mode is currently active, the new source is
   *  baked individually using its own cloud + survey constants. */
  onSourceUploaded(source: Source, cloud: PointCloud): void;

  /** Called when a source unloads. Drops any cached bake data and
   *  cancels any in-flight bake for that source. */
  onSourceUnloaded(source: Source): void;

  /** Test-only: snapshot of internal state. Returns the current mode,
   *  the set of sources with cached schechter ratios, and the set with
   *  cached angular weights. */
  state(): {
    mode: BiasMode;
    sourcesWithSchechter: Source[];
    sourcesWithAngular: Source[];
  };
};

export function createBiasCorrectionSubsystem(deps: BiasCorrectionDeps): BiasCorrectionSubsystem;
```

Internal (closure-captured) state:

```ts
let renderer: PointRenderer | null = null;
let mode: BiasMode = state.bias.mode;  // mirror — kept in sync with state.bias.mode
const cachedSchechter = new Map<Source, Float32Array>();
const cachedAngular = new Map<Source, Float32Array>();
// Generation counter for race-fix: each setMode increments; in-flight
// bakes capture their generation and drop their result if a newer
// generation has started.
let generation = 0;
```

### Renderer's new splice surface

`PointRenderer` gains three methods — short, layout-aware, no async, no state machine:

```ts
spliceSchechterRatios(source: Source, ratios: Float32Array): void {
  // 1. Validate length matches `clouds.get(source)!.count`.
  // 2. Walk `entry.interleaved`, write `ratios[i]` into slot 10 of row i.
  // 3. `device.queue.writeBuffer(entry.buffer, 0, entry.interleaved)`.
  //
  // No async. No worker. No mode tracking. No cache. The subsystem
  // owns all of that; this method just lays down what it's told.
}

spliceAngularWeights(source: Source, weights: Float32Array): void { ... }

clearBiasOverlays(source?: Source): void {
  // Iterate (one source or all), zero slots 10 and 11 of each row,
  // re-upload. Used when bias mode changes back to None / VolumeLimited.
}
```

The `spliceSchechterIntoMirror` and `spliceAngularIntoMirror` private methods are renamed and made public. Their bodies are essentially unchanged.

### State

`state.bias.{mode, absMagLimit, apparentMagLimit, schechterMStar, schechterAlpha}` **stays unchanged** on `EngineState`. It's the UI-facing knob bag — same role as `state.settings`. The SettingsPanel writes through `handle.setBiasMode`, the URL hash sync reads it, the InfoCard reads `bias.absMagLimit` for the volume-limited-cut display, etc. Every existing reader continues to work.

`state.subsystems.biasCorrection: BiasCorrectionSubsystem` is the new field. Constructed eagerly in the engine state literal alongside `selection`, `tweens`, `spaceMouse`, `scheduler` — no GPU dependency, can be built at t=0. The renderer is wired in during `phases/initGpu.ts` via `state.subsystems.biasCorrection.attachRenderer(pointRenderer)` once `pointRenderer` exists.

The eager-construction rule from Spec A holds: any consumer that captures `state.subsystems.biasCorrection` from t=0 onwards gets the live subsystem; its `setMode` no-ops cleanly when `renderer === null` (called before bootstrap finishes).

### Public handle changes

`handle.setBiasMode(mode)` keeps its external contract. Body becomes:

```ts
setBiasMode(mode) {
  state.bias.mode = mode;
  cb.onBiasModeChange?.(mode);
  void state.subsystems.biasCorrection.setMode(mode);
  state.subsystems.scheduler.requestRender();
}
```

The `void` discards the Promise — engine.ts doesn't await. The subsystem's `.setMode()` calls `state.subsystems.scheduler.requestRender()` itself when each source's splice completes, so the visual update appears as bakes resolve. Same observable behaviour as today.

### Worker injection

The three `private static` runner methods on PointRenderer become factory params on the subsystem (for the two bias runners) and a module-level injection on the renderer (for `buildRunner`).

**Subsystem:**

```ts
createBiasCorrectionSubsystem({
  state,
  schechterRunner = defaultSchechterRunner,  // Vite ?worker default
  angularRunner = defaultAngularRunner,
})
```

**Renderer:**

```ts
// src/services/gpu/renderers/pointRenderer.ts (module-level)

let buildRunner: BuildRunner = defaultBuildRunner;

export function setBuildBufferRunner(runner: BuildRunner | null): void {
  buildRunner = runner ?? defaultBuildRunner;
}
```

Tests update their setup:

```ts
// Before
PointRenderer.setSchechterRatioRunner(async (input) => stub(input));
const r = new PointRenderer(...);

// After
const r = createPointRenderer(...);  // (also a factory now per Spec F sequencing — but
                                     //  for this spec, the existing class stays)
const sub = createBiasCorrectionSubsystem({
  state,
  schechterRunner: async (input) => stub(input),
});
sub.attachRenderer(r);
```

`PointRenderer.setBuildBufferRunner(...)` (currently a static) becomes the module-level `setBuildBufferRunner(...)` — same call shape, no `PointRenderer.` prefix. Existing test code is one find-and-replace per call site.

### Survey constants — sibling table

Three `LoadedSource` fields are pure functions of `Source`:

```ts
schechter: SchechterTriple;  // surveySchechter(source).{mStar, alpha, phiStar}
mLim: number;                // surveyFluxLimit(source)
nRef: number;                // expectedNumberDensity({...sch, mLim, dMpc: 10})
```

These are computed at upload time, identical for every cloud of the same source, and used only in bias bakes. They move to a sibling table:

```ts
// src/services/biasCorrection/surveyConstants.ts

export type SurveyConstants = {
  schechter: SchechterTriple;
  mLim: number;
  nRef: number;
};

const TABLE: Record<Source, SurveyConstants> = {
  [Source.SDSS]: { ... },
  [Source.TwoMRS]: { ... },
  // ...
};

export function surveyConstants(source: Source): SurveyConstants {
  return TABLE[source];
}
```

`LoadedSource` drops the three fields. The subsystem looks up constants when it needs them. `expectedNumberDensity` is called once per source at module init (or lazily and cached) rather than per upload.

### File layout

```
src/services/biasCorrection/                         (new folder)
  surveyConstants.ts                                 (sibling to bake/)

src/services/engine/subsystems/
  biasCorrectionSubsystem.ts                         (new ~250-line file)

src/services/engine/bake/                            (existing, unchanged)
  computeSchechterRatios.ts
  computeSchechterRatios.worker.ts
  computeAngularWeights.ts
  computeAngularWeights.worker.ts
  buildPointInterleavedBuffer.ts
  buildPointInterleavedBuffer.worker.ts

tests/services/engine/subsystems/
  biasCorrectionSubsystem.test.ts                    (new)

tests/services/biasCorrection/
  surveyConstants.test.ts                            (new — table sanity + nRef computation)
```

`services/biasCorrection/` is a sibling to `services/loading/` and `services/gpu/`. It holds GPU-independent bias-correction logic (survey constants today; possibly more later if we extract more from the workers).

## Race behaviour — preserve exactly

The existing `setBiasMode` implementation handles three races:

1. **Fast mode toggle.** User clicks Schechter, then None, then Schechter again before the first bake finishes. The first bake's result must be discarded (it's stale by the time it lands); the second Schechter bake's result wins.

2. **Mid-bake source upload.** A tier swap completes mid-bake. The new source's data wasn't in the original bake. It must either be included in the in-flight bake (impossible — bake input is captured at start) or baked on its own when it lands.

3. **Multi-source completion ordering.** Three sources are loaded; bake fires for all three; results arrive in arbitrary order. Each source's splice must apply when its result arrives, not block on others.

The subsystem preserves these via:

- **Generation counter.** Each `setMode` increments `generation`. Each per-source bake captures the generation at start; on resolve, drops the result if `generation !== captured`. (Same shape as Spec A's tier-swap race fix in AssetSlot.)
- **`onSourceUploaded` hook.** PointRenderer's `upload(...)` calls into `subsystem.onSourceUploaded(source, cloud)` after committing. If `mode` is bias-active, the subsystem fires a per-source bake with the current generation. If `mode` is None / VolumeLimited, no-op.
- **Per-source independence.** Each source's bake is a separate Promise. Splice fires independently when each resolves.

Each race gets its own test in `biasCorrectionSubsystem.test.ts`. Tests use stub runners with `Promise` constructors to drive arbitrary completion ordering.

## Implementation phases

Five sub-PRs, each green-on-its-own. Estimated implementer time: 7–10 hours total per Spec D's velocity.

### Phase E.1 — Add splice methods to PointRenderer

**Files:** `src/services/gpu/renderers/pointRenderer.ts`, `tests/services/gpu/renderers/pointRenderer.test.ts`.

Add `spliceSchechterRatios`, `spliceAngularWeights`, `clearBiasOverlays` as new public methods. Bodies are extracted from existing private `spliceSchechterIntoMirror` / `spliceAngularIntoMirror` plus the `clearSchechterRatios` / `clearAngularWeights` body.

The existing `setBiasMode` method continues to work — it now calls the public splice methods internally instead of the private ones. **No callers added in this phase.** The new methods are dead code from the public surface's POV; they exist for E.3 to call.

Tests assert the splice methods write the right bytes at the right offsets and re-upload. Race / mode-state tests are unchanged (they exercise the existing setBiasMode path).

**Why first:** lowest risk. Pure additive change to PointRenderer. No subsystem yet, no engine.ts changes. If something's wrong with the splice surface, we find out before any caller depends on it.

### Phase E.2 — Survey constants table

**Files:** `src/services/biasCorrection/surveyConstants.ts` (new), `tests/services/biasCorrection/surveyConstants.test.ts` (new), `src/services/gpu/renderers/pointRenderer.ts` (consume the table).

Move `surveySchechter`, the flux-limit lookup, and the `nRef` computation into `surveyConstants.ts`. PointRenderer's `upload(source, cloud)` reads from the table instead of computing inline. `LoadedSource` drops the `schechter`, `mLim`, `nRef` fields.

Test: round-trip every Source through the table, assert nRef matches the live `expectedNumberDensity` computation.

**Why second:** independent of E.1, sets up E.3's subsystem which needs to look up survey constants. Could be done in parallel with E.1 in a different worktree if we wanted; for sequencing simplicity I list it second.

### Phase E.3 — Subsystem creation + renderer wiring

**Files:** `src/services/engine/subsystems/biasCorrectionSubsystem.ts` (new), `src/@types/EngineSubsystems.d.ts` (or wherever the subsystems bag type lives — add `biasCorrection`), `src/services/engine/engine.ts` (add to state literal), `src/services/engine/phases/initGpu.ts` (call `attachRenderer`), `tests/services/engine/subsystems/biasCorrectionSubsystem.test.ts` (new).

Create the subsystem. It exposes the API in *Subsystem shape* above. **Not yet called from engine.ts's `setBiasMode`** — that still goes through `pointRenderer.setBiasMode`. The subsystem is wired and idle.

Tests cover:
- `setMode(None) → setMode(Schechter) → setMode(None)` resolves cleanly with all expected splices.
- Generation race: two `setMode` calls in flight, first's stub bake completes after second's; assert no splice from the stale bake.
- Mid-bake source upload: `onSourceUploaded` during a Schechter bake fires a fresh bake for just that source.
- `attachRenderer(null)`-equivalent (subsystem gets a setMode before attachRenderer is called) → no-op, no crash, no leaked Promise rejection.

**Why third:** subsystem can be built and tested standalone without touching engine.ts's behaviour. If something's wrong with the state machine, we find out before any user-visible call path depends on it.

### Phase E.4 — Cut over engine.ts to the subsystem

**Files:** `src/services/engine/engine.ts`, `src/services/gpu/renderers/pointRenderer.ts`, `tests/services/gpu/renderers/pointRenderer.test.ts`.

Update `handle.setBiasMode` to call `state.subsystems.biasCorrection.setMode(mode)` instead of `state.gpu.renderer.setBiasMode(mode)`.

Delete from PointRenderer:
- `setBiasMode`, `bakeSchechterRatios`, `clearSchechterRatios`, `spliceSchechterIntoMirror`, `bakeAngularWeights`, `clearAngularWeights`, `spliceAngularIntoMirror`.
- `schechterModeActive`, `angularReweightModeActive` private fields.
- `cachedSchechterRatios`, `cachedAngularWeights`, `cloud` fields from `LoadedSource`.
- `static schechterRunner`, `static angularRunner`, and the two `static set*Runner` methods.

`buildRunner` stays — convert from `static` to module-level (rename `PointRenderer.setBuildBufferRunner` → `setBuildBufferRunner` exported function).

Update `pointRenderer.test.ts`:
- All bias-mode tests delete (covered now by `biasCorrectionSubsystem.test.ts`).
- `PointRenderer.setSchechterRatioRunner(...)` / `setAngularWeightRunner(...)` calls delete.
- `PointRenderer.setBuildBufferRunner(...)` becomes `setBuildBufferRunner(...)`.

Wire `pointRenderer.upload(source, cloud)` to call `state.subsystems.biasCorrection.onSourceUploaded(source, cloud)` after committing. Same for `unload(source)` → `onSourceUnloaded`.

**Why fourth:** this is the cut-over. Phases 1–3 made it safe (splice surface tested, subsystem tested, survey constants migrated). E.4 just deletes the old path and points the public-handle method at the new one. Visual smoke test is mandatory before merge — bias-mode toggles in the SettingsPanel must produce identical visual results to current.

### Phase E.5 — File-organisation polish (optional)

Consider moving `engine/bake/` to `services/biasCorrection/bake/` so all bias-correction code lives in one tree. Or leaving `bake/` where it is (it's also home to `buildPointInterleavedBuffer`, which isn't bias-specific). Decide during the PR.

**Why optional:** zero behaviour change, pure relocation. Skip if E.1–E.4 take longer than expected.

## Risks

### R1 — Race-fix divergence

The existing `setBiasMode` implementation has subtle race handling that's been correct in production for months. The extraction must preserve exactly the same race behaviour.

**Mitigation:** every race gets a named test in `biasCorrectionSubsystem.test.ts` (see *Race behaviour — preserve exactly* above). The test names are checklist items; if a race isn't represented, the cut-over (E.4) is blocked.

### R2 — Renderer reads bias state implicitly via the per-frame uniform

PointRenderer currently writes per-frame uniform values that include bias-mode-dependent constants (`schechterMStar`, `schechterAlpha`, etc., from `state.bias.*`). After extraction, the renderer keeps reading from `state.bias.*` for those uniforms. The subsystem and the renderer are both readers of the same state — that's fine, but it means `state.bias.mode` is the de-facto coordination point: the subsystem sees a mode change and bakes; the renderer sees a mode change and writes a different uniform on the next frame.

**Mitigation:** the subsystem's `setMode(mode)` is called synchronously before the next render is requested (engine.ts's `handle.setBiasMode` does both). The renderer reads `state.bias.mode` per-frame regardless. Worst case during a bake-in-flight: the renderer reads the new mode but the per-galaxy splice hasn't landed yet — same as current behaviour (the bake's render-wake happens after the splice). Document this as part of the subsystem's docstring.

### R3 — `LoadedSource` field loss breaks something we forgot

`LoadedSource.cloud` (the back-ref) and the three survey-constant fields are read by paths I haven't traced exhaustively.

**Mitigation:** ripgrep `\.schechter\b|\.mLim\b|\.nRef\b|\.cloud\b` in `pointRenderer.ts` before E.4 and verify every read site is either (a) part of a method we're deleting, or (b) cleanly replaced by `surveyConstants(source).{schechter, mLim, nRef}`. Implementer subagent must report any read site that doesn't fall into one of those buckets.

### R4 — The "buildRunner stays on the renderer" decision

Putting `buildRunner` at module scope (not on the subsystem) means `services/gpu/renderers/pointRenderer.ts` exports a top-level `setBuildBufferRunner` that callers reach via a different shape than `setSchechterRatioRunner`. Slight inconsistency — but follows from the renderer/subsystem responsibility split.

**Mitigation:** docstring on `setBuildBufferRunner` explains the why ("this builds the *initial* interleaved buffer; bias-mode bake runners live on the subsystem"). One-time onboarding cost, no behaviour risk.

## What this is not

- **Not** a class → factory conversion of PointRenderer. That's a follow-on (call it Spec F). After E.5 lands, PointRenderer is a clean Shape-2 renderer (data-owning drawer); converting it to a factory is mechanical.
- **Not** a destroy() bugfix for missing renderers. Independent — should be a small one-PR cleanup any time.
- **Not** the disk/quad/proceduralDisk dedup. Independent — call it Spec G.

This spec deliberately scopes to one cleanup: take what's misplaced inside PointRenderer and put it where it belongs. Doing the shape work without this extraction first would mean carrying ~400 lines of bias logic through the factory conversion, which is exactly the wrong order.

## Spec self-review

- **Placeholder scan:** none. Every section commits to a specific shape.
- **Internal consistency:** the subsystem's internal state mirror (`mode`, the cached maps, the generation) does not contradict the public API. The renderer's new splice surface is enumerated exactly once. The survey-constants table replaces three `LoadedSource` fields one-to-one.
- **Scope check:** five phases, each independently mergeable. Total estimated implementer time ~10h. Within the single-spec scope.
- **Ambiguity check:** `buildRunner`'s stay-on-renderer decision is the most likely "wait, why this way?" question. Section *What stays — and why `buildRunner` is the exception* and Risk R4 cover it. Survey constants going to `services/biasCorrection/` (a new folder) rather than `services/engine/biasCorrection/` is also worth a callout — placed at the sibling level because they're GPU-independent and a sibling folder matches the existing `services/loading/` precedent.
