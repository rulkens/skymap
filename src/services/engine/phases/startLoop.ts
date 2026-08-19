/**
 * startLoop — bootstrap phase that builds the per-frame `RunFrameDeps`
 * bag, assigns the forward-declared `frame` binding, and fires the
 * first render request so a single rAF tick happens.
 *
 * ### What this phase does
 *
 *   - Constructs the `RunFrameDeps` object, threading every closure
 *     capture the frame body needs: `canvas`, `cb`, the GPU device +
 *     context (from `phaseLocals`), the timing service, and the camera
 *     drivers.  Every renderer is read straight off `state.gpu.*` by the
 *     `ContentLayer` that draws with it, so none is threaded through this
 *     bag.  The pure `cssToTexPx` helper is imported directly in
 *     `runFrame.ts` rather than threaded through deps — it captures no
 *     per-engine state.  See `runFrame.ts`'s module header for the
 *     dep-vs-state rationale.  Hover/select writes go through the Redux
 *     store via `store.dispatch`. Scale-bar derivation lives React-side
 *     (it's a pure function of cam + viewport CSS height) —
 *     the frame loop's per-frame `engineScaleChanged` dispatch drives it.
 *   - Replaces the no-op `frameRef.current` stub with the real frame
 *     body — a one-line closure that calls `runFrame(state, frameDeps,
 *     performance.now())`.  The scheduler in
 *     `state.subsystems.scheduler` was wired with
 *     `onFrame: () => frameRef.current()`, so this assignment makes
 *     every subsequent rAF tick run the real body.
 *   - Fires `state.subsystems.scheduler.requestRender()` to queue the
 *     first rAF.  After that single frame, the loop sleeps until a
 *     channel mouth wakes it (see runFrame's frame-tail comment for
 *     the enumeration).
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
 * The loop starts unconditionally — empty catalogs are fine, runFrame
 * draws the Milky Way + overlays and skips per-source point draws.
 */

import { runFrame } from '../frame/runFrame';
import { buildCameraDrivers } from '../camera/cameraDrivers';
import { goLiveNowAction } from '../../../state/time/goLiveNowAction';
import type { RunFrameDeps } from '../../../@types/engine/frame/RunFrameDeps';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../@types/engine/BootstrapDeps';

/**
 * Bootstrap phase 4: build `RunFrameDeps`, assign the forward-declared
 * `frame` binding, fire the first render request.
 */
export async function startLoop(state: EngineState, deps: BootstrapDeps): Promise<void> {
  const phaseLocals = deps.phaseLocals!;
  // Renderers are owned by `state.gpu.*` (written by `initGpu`).  This
  // explicit null-check turns the phase-ordering assumption into a typed
  // runtime error if `initGpu` is ever skipped/reordered, failing loudly
  // HERE at the construction site rather than deferring to a `ContentLayer`
  // silently no-op'ing on a null renderer five frames later.  None of these
  // renderers are threaded through `RunFrameDeps` any more (every
  // `ContentLayer.draw` reads its renderer straight off `state.gpu.*` — see
  // `passes/index.ts`), but the readiness guard itself is still worth
  // failing fast on: independent of whether the value gets forwarded
  // anywhere, "was GPU init actually finished before the loop starts?" is
  // the invariant this phase exists to guarantee.
  if (
    state.gpu.milkyWayCloudRenderer === null ||
    state.gpu.horizonShellRenderer === null ||
    state.gpu.texturedDiskRenderer === null ||
    state.gpu.proceduralDiskRenderer === null
  ) {
    throw new Error(
      'startLoop: milkyWayCloud/horizonShell/texturedDisk/proceduralDisk renderers must be initialised by initGpu before this phase runs',
    );
  }

  // ── Render loop ──────────────────────────────────────────────────────

  // Build the dep bag for `runFrame` once, here in the orchestrator's
  // last phase where every closure-captured local is in scope.  The bag
  // carries only what the frame body's non-GPU-state closures need
  // (`canvas`, `cb`, the raw device/context, the timing service, the
  // camera drivers) — every renderer (`milkyWayCloudRenderer`,
  // `texturedDiskRenderer`, …) is read off `state.gpu.*` directly by each
  // `ContentLayer.draw` (see `passes/index.ts`), so mirroring them here
  // would be redundant state.  See runFrame.ts's module header for the
  // dep-vs-state rationale.
  const frameDeps: RunFrameDeps = {
    canvas: deps.canvas,
    cb: deps.cb,
    device: phaseLocals.device,
    context: phaseLocals.context,
    // Forward the timing service hung off `state.gpu` by initGpu.
    // Always non-null; `renderFrame` gates work behind `.enabled`.
    timingService: state.gpu.timingService,
    // Wrap the engine's camera movers as drivers once, here. The
    // wrappers close over the live `state`, so the list never needs
    // rebuilding — toggled settings and subsystem state are read fresh
    // each frame through the closures.
    drivers: buildCameraDrivers(state),
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

  // Snap the sim clock to the real wall-clock instant, exactly once, at loop
  // start. The time slice seeds at J2000 as a deterministic static anchor; this
  // single dispatch is what makes a bare load show the sky as it is RIGHT NOW.
  // No re-fire guard is needed — `startLoop` is the terminal bootstrap phase and
  // runs exactly once per engine, so this can never re-dispatch every frame.
  deps.cb.store.dispatch(goLiveNowAction());

  // Kick off the first render.  The scheduler was already created
  // synchronously in the state literal — this just tells it to queue
  // one rAF.  The `onFrame: () => frameRef.current()` closure picks up
  // the just-assigned real frame body.  After that single frame, the
  // loop sleeps until a channel mouth wakes it.
  // Boot ignition: independent of whether `goLiveNowAction` above joins a wake-vote route — that dispatch covers the clock, not the first frame (D8).
  state.subsystems.scheduler.requestRender();
}
