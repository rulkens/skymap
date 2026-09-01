/**
 * drainInput — the single per-frame input-apply site. Runs at the top of
 * `runFrame`, above the store read the driver table resolves against, so a
 * gesture that began between frames is visible to this frame's produce step.
 * Steps arrive in order, so a wheel tick between two drags still changes the
 * rate the second drag is applied at.
 *
 * `beginDrag` / `cancelCameraTween` are NOT here — the emit sink dispatches them
 * at DOM time (`wireInput`) so a cancel cannot outlive the tween a double-click
 * starts in the same gap.
 */

import { seedCameraFromBase } from '../../camera/seedCameraFromBase';
import { applyInputToCamera } from '../../camera/applyInputToCamera';
import { applyWheelZoom } from '../camera/applyWheelZoom';
import { pivotFraming } from '../camera/pivotRadiusMpc';
import { poseOf } from '../camera/poseOf';
import { absoluteArm } from '../../../utils/camera/absoluteArm';
import { liveWorldPose } from '../helpers/liveWorldPose';
import { selectFocusRow } from '../../../state/selection/selectors';
import { endDrag, commitCameraPose } from '../../../state/camera/cameraSlice';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { RunFrameDeps } from '../../../@types/engine/frame/RunFrameDeps';

export function drainInput(state: EngineState, deps: RunFrameDeps, nowMs: number): void {
  const steps = state.subsystems.inputAggregator.drain();
  if (steps.length === 0) return;

  const store = deps.cb.store;
  const cssHeight = deps.canvas.clientHeight || 1;
  // Pre-bootstrap `state.cam` is null and no recognizer is attached, so only the
  // register arms need the guard — the store edges fired unconditionally in the
  // callbacks this drain replaced, and stay unconditional.
  const cam = state.cam;

  for (const step of steps) {
    switch (step.kind) {
      case 'gestureStart':
        // Seed from the live PRODUCED pose, not `camera.base`: mid-tween those
        // differ, and only the produced pose is where the user sees the camera.
        if (cam !== null) seedCameraFromBase(cam, liveWorldPose(state));
        break;

      case 'gestureEnd':
        // Commit BEFORE `endDrag` so the baked pose is in `base` the moment the
        // orbitDrag driver deactivates — otherwise the next frame's resting
        // driver returns the pre-gesture base and the camera snaps back.
        if (cam !== null) store.dispatch(commitCameraPose(absoluteArm(poseOf(cam))));
        store.dispatch(endDrag());
        break;

      case 'drag':
        if (cam !== null) {
          applyInputToCamera(cam, step, cssHeight, pivotFraming(selectFocusRow(store.getState())));
        }
        break;

      case 'zoom': {
        if (step.duringGesture) {
          if (cam !== null) {
            applyInputToCamera(
              cam,
              step,
              cssHeight,
              pivotFraming(selectFocusRow(store.getState())),
            );
          }
          break;
        }
        // At rest the register is invisible — `applyWheelZoom` routes the factor
        // to whichever driver actually owns the distance this frame.
        const root = store.getState();
        const zoomed = applyWheelZoom(
          state.cameraRuntime.clock,
          state.cameraRuntime.prevActiveId.current,
          root.camera.base,
          step.factor,
          root.camera.autoRotate,
          nowMs,
          pivotFraming(selectFocusRow(root)),
        );
        if (zoomed !== null) store.dispatch(commitCameraPose(absoluteArm(zoomed)));
        break;
      }
    }
  }
}
