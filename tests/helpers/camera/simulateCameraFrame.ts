/**
 * simulateCameraFrame — one camera frame through the REAL `stepCameraRuntime`,
 * applied the way `runFrame` does: install `next`, then dispatch the step's
 * actions in order. A fixture that re-implements the stage order instead
 * drifts away from production silently, so the only thing left to the caller
 * is `clipEpoch` — the clip player advances it before the step runs, and the
 * fixtures source it differently (a hand-advanced row vs. a real player).
 */

import type { CameraState } from '../../../src/@types/camera/CameraState';
import type { BodyId } from '../../../src/@types/data/body/BodyId';
import type { BodyState } from '../../../src/@types/scene/BodyState';
import type { Epoch } from '../../../src/@types/engine/camera/Epoch';
import type { FramedCameraPose } from '../../../src/@types/camera/FramedCameraPose';
import type { CameraSimHarness } from './CameraSimHarness';

import { stepCameraRuntime } from '../../../src/services/engine/camera/stepCameraRuntime';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { commitCameraPose } from '../../../src/state/camera/cameraSlice';
import { deriveSimDays } from '../../../src/utils/time/deriveSimDays';
import { selectTimeState } from '../../../src/state/time/selectors';

export function simulateCameraFrame(
  harness: CameraSimHarness,
  nowMs: number,
  clipEpoch: Epoch<NonNullable<CameraState['clip']>>,
): { pose: FramedCameraPose; activeId: string; committed: boolean } {
  const { state, store, deps } = harness;
  const stored = store.getState();
  const simDays = deriveSimDays(selectTimeState(stored), nowMs);

  const { next, actions } = stepCameraRuntime(state.cameraRuntime, {
    nowMs,
    simDays,
    rootState: stored,
    canvasPx: [deps.canvas.clientWidth || 1, deps.canvas.clientHeight || 1],
    aspect: deps.canvas.width / deps.canvas.height,
    steps: state.subsystems.inputAggregator.drain(),
    bodies: deriveBodyStates(simDays) as ReadonlyMap<BodyId, BodyState>,
    clipEpoch,
    drivers: deps.drivers,
  });
  state.cameraRuntime = next;
  for (const action of actions) store.dispatch(action);

  return {
    pose: next.register.pose,
    activeId: next.register.winner,
    // `commitCameraPose` has three producers: `commitOnEdge`, the fold's regime
    // crossing, and `replayInput` (every at-rest wheel/drag fold). This reads the
    // edge commit only while the caller neither crosses a regime nor feeds the
    // input aggregator — true of both fixtures today; a caller that pushes input
    // must narrow it instead.
    committed: actions.some((action) => action.type === commitCameraPose.type),
  };
}
