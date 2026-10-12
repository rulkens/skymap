/**
 * startLoop — builds `RunFrameDeps`, assigns the forward-declared `frame`
 * binding, runs the frame-order boot check, fires the first render. LAST phase
 * because the body needs `initGpu`'s renderers, `wireSlots`' thumbnails and
 * `wireInput`'s boot pose; igniting earlier crashes tick 1 or paints black.
 * Empty catalogs are no reason to hold it — runFrame still draws MW + overlays.
 */

import { runFrame } from '../frame/runFrame';
import { checkFrameOrder } from '../frame/checkFrameOrder';
import { VIEW_RIGS } from '../../../data/rendering/viewRigs';
import { CONTROL_SCHEMES } from '../camera/controlSchemes';
import type { RunFrameDeps } from '../../../@types/engine/frame/RunFrameDeps';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../@types/engine/BootstrapDeps';

export async function startLoop(state: EngineState, deps: BootstrapDeps): Promise<void> {
  if (deps.phaseLocals === undefined) {
    throw new Error('startLoop: initGpu must run before startLoop (phaseLocals is missing)');
  }
  const phaseLocals = deps.phaseLocals;

  // Against the ASSEMBLED rows: a freshly derived table would be a second
  // answer. Every rig's program, not just the live `state.viewRig` — a pass
  // only the dome rig draws must still pass boot before the user ever
  // switches to it.
  checkFrameOrder(
    Object.values(VIEW_RIGS).map((rig) => rig.program),
    state.passes,
    state.computes,
    state.planners,
    // Non-null: `runBootstrapPhases` awaits `initGpu`, which assigns it, first.
    state.gpu.renderTargets!.specs,
  );

  // Renderers are absent by design: each `ContentPass.draw` reads its own off
  // `state.gpu.*`; mirroring them here would be redundant state.
  const frameDeps: RunFrameDeps = {
    canvas: deps.canvas,
    cb: deps.cb,
    device: phaseLocals.device,
    context: phaseLocals.context,
    timingService: state.gpu.timingService,
    controlSchemes: CONTROL_SCHEMES,
  };

  // The scheduler was wired with `onFrame: () => frameRef.current()`, reading the
  // box lazily — this assignment is what makes rAF run the body, not the stub.
  deps.frameRef.current = () => {
    runFrame(state, frameDeps, performance.now());
  };

  // Boot ignition: the clock went live in `arrivalSaga`, which covers the
  // clock, not frame 1 (D8). After this frame the loop sleeps until a wake.
  state.subsystems.scheduler.requestRender();
}
