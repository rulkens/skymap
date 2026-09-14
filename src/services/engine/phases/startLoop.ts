/**
 * startLoop — builds `RunFrameDeps`, assigns the forward-declared `frame`
 * binding, runs the frame-order boot check, fires the first render. LAST phase
 * because the body needs `initGpu`'s renderers, `wireSlots`' thumbnails and
 * `wireInput`'s boot pose; igniting earlier crashes tick 1 or paints black.
 * Empty catalogs are no reason to hold it — runFrame still draws MW + overlays.
 */

import { runFrame } from '../frame/runFrame';
import { checkFrameOrder } from '../frame/checkFrameOrder';
import { FRAME_ORDER } from '../frame/frameOrder';
import { CONTENT_PASSES } from '../frame/passes';
import { CAMERA_DRIVERS } from '../camera/cameraDrivers';
import { goLiveNowAction } from '../../../state/time/goLiveNowAction';
import { selectTimeState } from '../../../state/time/selectors';
import type { RunFrameDeps } from '../../../@types/engine/frame/RunFrameDeps';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../@types/engine/BootstrapDeps';

export async function startLoop(state: EngineState, deps: BootstrapDeps): Promise<void> {
  if (deps.phaseLocals === undefined) {
    throw new Error('startLoop: initGpu must run before startLoop (phaseLocals is missing)');
  }
  const phaseLocals = deps.phaseLocals;

  // Against the ASSEMBLED rows: a freshly derived table would be a second answer.
  checkFrameOrder(
    FRAME_ORDER,
    CONTENT_PASSES,
    // Non-null: `runBootstrapPhases` awaits `initGpu`, which assigns it, first.
    state.gpu.renderTargets!.specs.map((spec) => spec.id),
  );

  // Renderers are absent by design: each `ContentPass.draw` reads its own off
  // `state.gpu.*`; mirroring them here would be redundant state.
  const frameDeps: RunFrameDeps = {
    canvas: deps.canvas,
    cb: deps.cb,
    device: phaseLocals.device,
    context: phaseLocals.context,
    timingService: state.gpu.timingService,
    drivers: CAMERA_DRIVERS,
  };

  // The scheduler was wired with `onFrame: () => frameRef.current()`, reading the
  // box lazily — this assignment is what makes rAF run the body, not the stub.
  deps.frameRef.current = () => {
    runFrame(state, frameDeps, performance.now());
  };

  // Makes a bare load show the sky RIGHT NOW (the slice seeds at J2000). Guarded
  // on clock intent: a `#t=` deep link lands manual+paused in the arrival read,
  // which runs BEFORE this async phase — an unconditional snap clobbers it.
  if (selectTimeState(deps.cb.store.getState()).mode !== 'manual') {
    deps.cb.store.dispatch(goLiveNowAction());
  }

  // Boot ignition, independent of `goLiveNowAction` (that covers the clock, not
  // frame 1 — D8). After this frame the loop sleeps until a wake.
  state.subsystems.scheduler.requestRender();
}
