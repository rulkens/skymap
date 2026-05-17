/**
 * startLoop — bootstrap phase that builds the per-frame `RunFrameDeps`
 * bag, assigns the forward-declared `frame` binding, and fires the
 * first render request so a single rAF tick happens.
 *
 * ### What this phase does
 *
 *   - Constructs the `RunFrameDeps` object, threading every closure
 *     capture the frame body needs: `canvas`, `cb`, `fpsCounter`,
 *     `lastReportedFps` (a `{current}` ref), the GPU device + context
 *     (from `phaseLocals`), every renderer (from `state.gpu.*`), and
 *     a locally-snapshotted Milky-Way iTime epoch.  The pure `cssToTexPx` helper is imported
 *     directly in `runFrame.ts` rather than threaded through deps —
 *     it captures no per-engine state.  See `runFrame.ts`'s module
 *     header for the dep-vs-state rationale.  Hover/select callbacks
 *     fan out from `state.subsystems.selection` rather than being
 *     threaded through deps (Spec D.3).  Scale-bar derivation moved
 *     to React (it's a pure function of cam + viewport CSS height) —
 *     `cb.onCameraChange` emissions from `runFrame` drive that work.
 *   - Replaces the no-op `frameRef.current` stub with the real frame
 *     body — a one-line closure that calls `runFrame(state, frameDeps,
 *     performance.now())`.  The scheduler in
 *     `state.subsystems.scheduler` was wired with
 *     `onFrame: () => frameRef.current()`, so this assignment makes
 *     every subsequent rAF tick run the real body.
 *   - Fires `state.subsystems.scheduler.requestRender()` to queue the
 *     first rAF.  After that single frame, the loop sleeps until an
 *     event handler or a setter calls `scheduler.requestRender()`
 *     again.
 *
 * ### Why this runs last
 *
 * The frame body needs:
 *   - The renderers from `initGpu` (read off `state.gpu.*`).
 *   - The thumbnail subsystem from `wireSlots`
 *     (via `state.subsystems.thumbnails`).
 *   - The orbit camera from `wireInput` (via `state.cam`).
 *
 * Firing `requestRender()` before any of those exist would either
 * crash on the first tick or render a black canvas.  Putting this
 * phase last guarantees every dependency is in place when the loop
 * starts.
 *
 * ### State writes
 *
 *   - `state.subsystems.scheduler.requestRender()` — schedules one rAF.
 *
 * ### Side effects on `deps`
 *
 *   - Mutates `deps.frameRef.current` — replaces the no-op stub with
 *     the real frame body.
 *
 * ### Async work
 *
 * None — every call here is synchronous.  The phase is `async` only
 * to match the orchestrator's `Phase` signature.
 *
 * ### Early-return semantics
 *
 * If `state.sources.catalogs.size === 0` (every load failed and the
 * synthetic fallback also produced nothing), this phase returns
 * early — `wireInput` already bailed before constructing the camera,
 * so there's no point starting the loop.  Same condition as the
 * pre-Phase-5 IIFE's mid-IIFE early-return semantics.
 */

import { runFrame } from '../frame/runFrame';
import type { RunFrameDeps } from '../../../@types/engine/frame/RunFrameDeps';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../@types/engine/BootstrapDeps';

/**
 * Bootstrap phase 4: build `RunFrameDeps`, assign the forward-declared
 * `frame` binding, fire the first render request.
 */
export async function startLoop(state: EngineState, deps: BootstrapDeps): Promise<void> {
  // Bail if no clouds reached the GPU — `wireInput` skipped camera
  // construction in that case, so there's nothing to render and the
  // pre-Phase-5 IIFE semantics were "exit silently, sit in 'loading'".
  if (state.sources.catalogs.size === 0) return;

  const phaseLocals = deps.phaseLocals!;
  // Renderers are owned by `state.gpu.*` (written by `initGpu`).  Pre-M1
  // (2026-05-11 audit) we read them off `phaseLocals` with a `!` bang
  // that silently assumed phase ordering; the explicit null-checks
  // here turn that assumption into a typed runtime error if `initGpu`
  // is ever skipped/reordered.
  const milkyWayRenderer = state.gpu.milkyWayRenderer;
  const texturedQuadRenderer = state.gpu.texturedQuadRenderer;
  const texturedDiskRenderer = state.gpu.texturedDiskRenderer;
  const proceduralDiskRenderer = state.gpu.proceduralDiskRenderer;
  if (
    milkyWayRenderer === null ||
    texturedQuadRenderer === null ||
    texturedDiskRenderer === null ||
    proceduralDiskRenderer === null
  ) {
    throw new Error(
      'startLoop: milkyWay/thumbnail/disk renderers must be initialised by initGpu before this phase runs',
    );
  }

  // ── Render loop ──────────────────────────────────────────────────────

  // Wall-clock epoch (ms) for the Milky Way impostor's iTime uniform.
  // Per-frame the shader receives `(performance.now() - epoch) * 0.001
  // * 0.25` — the outer `0.25` slow-but-alive scale makes the choice
  // of origin (engine construction vs loop start) imperceptible, so we
  // snapshot here at the loop's birth rather than threading the value
  // through BootstrapDeps from engine.ts.  See `runFrame.ts`'s
  // milkyWayITimeSec assignment for the consumer side and
  // `shaders/milkyWayImpostor.wgsl` line tagged "Match the ShaderToy's
  // TIME macro" for the inner `* 0.1` factor that runs on top.
  const milkyWayITimeEpochMs = performance.now();

  // Build the dep bag for `runFrame` once, here in the orchestrator's
  // last phase where every closure-captured local is in scope.  The bag
  // is stable across frames: `lastReportedFps` rides as a `{current}`
  // ref so the body's writes round-trip back into engine.ts; the GPU-
  // side renderers (`milkyWayRenderer`, `texturedQuadRenderer`, …) are
  // read off `state.gpu.*` directly (M1, 2026-05-11) — they used to
  // ride on `phaseLocals` too, but that mirror was redundant.  See
  // runFrame.ts's module header for the dep-vs-state rationale.
  const frameDeps: RunFrameDeps = {
    canvas: deps.canvas,
    cb: deps.cb,
    fpsCounter: deps.fpsCounter,
    lastReportedFps: deps.lastReportedFps,
    device: phaseLocals.device,
    context: phaseLocals.context,
    milkyWayRenderer,
    filamentRenderer: state.gpu.filamentRenderer!,
    texturedQuadRenderer,
    texturedDiskRenderer,
    proceduralDiskRenderer,
    milkyWayITimeEpochMs,
    // Forward the timing service hung off `state.gpu` by initGpu.
    // Always non-null; `renderFrame` gates work behind `.enabled`.
    timingService: state.gpu.timingService,
  };

  // Assign the real frame body to the forward-declared `frame`
  // binding (boxed as `frameRef` so the write crosses the module
  // boundary).  The scheduler in `state.subsystems.scheduler` was
  // wired with `onFrame: () => frameRef.current()` — that closure
  // reads the current value of `frameRef.current` lazily, so this
  // assignment makes every subsequent rAF tick run `runFrame`
  // against the dep bag built just above.  The body itself lives in
  // `runFrame.ts`; see that module's header for what counts as the
  // "frame body".
  deps.frameRef.current = () => {
    runFrame(state, frameDeps, performance.now());
  };

  // Kick off the first render.  The scheduler was already created
  // synchronously in the state literal — this just tells it to queue
  // one rAF.  The `onFrame: () => frameRef.current()` closure picks up
  // the just-assigned real frame body.  After that single frame, the
  // loop sleeps until an event handler or a setter calls
  // scheduler.requestRender().
  state.subsystems.scheduler.requestRender();
}
