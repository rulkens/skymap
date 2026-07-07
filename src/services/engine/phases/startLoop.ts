/**
 * startLoop — bootstrap phase that builds the per-frame `RunFrameDeps`
 * bag, assigns the forward-declared `frame` binding, and fires the
 * first render request so a single rAF tick happens.
 *
 * ### What this phase does
 *
 *   - Constructs the `RunFrameDeps` object, threading every closure
 *     capture the frame body needs: `canvas`, `cb`, the GPU device +
 *     context (from `phaseLocals`), and every renderer (from
 *     `state.gpu.*`).  The pure `cssToTexPx` helper is imported
 *     directly in `runFrame.ts` rather than threaded through deps —
 *     it captures no per-engine state.  See `runFrame.ts`'s module
 *     header for the dep-vs-state rationale.  Hover/select writes go
 *     through the Redux store via `store.dispatch`. Scale-bar derivation
 *     lives React-side
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
import type { RunFrameDeps } from '../../../@types/engine/frame/RunFrameDeps';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../@types/engine/BootstrapDeps';

/**
 * Bootstrap phase 4: build `RunFrameDeps`, assign the forward-declared
 * `frame` binding, fire the first render request.
 */
export async function startLoop(state: EngineState, deps: BootstrapDeps): Promise<void> {
  const phaseLocals = deps.phaseLocals!;
  // Renderers are owned by `state.gpu.*` (written by `initGpu`).  The
  // explicit null-checks turn the phase-ordering assumption into a
  // typed runtime error if `initGpu` is ever skipped/reordered — a `!`
  // bang would assume the ordering silently.
  const milkyWayCloudRenderer = state.gpu.milkyWayCloudRenderer;
  const horizonShellRenderer = state.gpu.horizonShellRenderer;
  const texturedDiskRenderer = state.gpu.texturedDiskRenderer;
  const proceduralDiskRenderer = state.gpu.proceduralDiskRenderer;
  if (
    milkyWayCloudRenderer === null ||
    horizonShellRenderer === null ||
    texturedDiskRenderer === null ||
    proceduralDiskRenderer === null
  ) {
    throw new Error(
      'startLoop: milkyWayCloud/horizonShell/texturedDisk/proceduralDisk renderers must be initialised by initGpu before this phase runs',
    );
  }

  // ── Render loop ──────────────────────────────────────────────────────

  // Build the dep bag for `runFrame` once, here in the orchestrator's
  // last phase where every closure-captured local is in scope.  The bag
  // is stable across frames: the GPU-side renderers (`milkyWayCloudRenderer`,
  // `texturedDiskRenderer`, …) are read off `state.gpu.*` directly —
  // mirroring them on `phaseLocals` would be redundant state.  See
  // runFrame.ts's module header for the dep-vs-state rationale.
  const frameDeps: RunFrameDeps = {
    canvas: deps.canvas,
    cb: deps.cb,
    device: phaseLocals.device,
    context: phaseLocals.context,
    milkyWayCloudRenderer,
    horizonShellRenderer,
    filamentRenderer: state.gpu.filamentRenderer!,
    texturedDiskRenderer,
    proceduralDiskRenderer,
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

  // Kick off the first render.  The scheduler was already created
  // synchronously in the state literal — this just tells it to queue
  // one rAF.  The `onFrame: () => frameRef.current()` closure picks up
  // the just-assigned real frame body.  After that single frame, the
  // loop sleeps until a channel mouth wakes it.
  state.subsystems.scheduler.requestRender();
}
