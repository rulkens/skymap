/**
 * drainInput — the single per-frame input-apply site.
 *
 * Runs at the top of `runFrame`, above the store read the driver table
 * resolves against, so a gesture that began between frames is already visible
 * to this frame's produce step — the same one-frame latency the per-event
 * apply had, with no ordering left to the DOM.
 *
 * Steps arrive in order, so a wheel tick between two drags still changes the
 * rate the second drag is applied at.
 */

import { seedCameraFromBase } from '../../camera/seedCameraFromBase';
import { applyInputToCamera } from '../../camera/applyInputToCamera';
import { applyWheelZoom } from '../camera/applyWheelZoom';
import { pivotRadiusMpc } from '../camera/pivotRadiusMpc';
import { poseOf } from '../camera/poseOf';
import { selectFocusRow } from '../../../state/selection/selectors';
import {
  beginDrag,
  endDrag,
  cancelCameraTween,
  commitCameraPose,
} from '../../../state/camera/cameraSlice';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { RunFrameDeps } from '../../../@types/engine/frame/RunFrameDeps';

export function drainInput(state: EngineState, deps: RunFrameDeps, nowMs: number): void {
  const steps = state.subsystems.inputAggregator.drain();
  const cam = state.cam;
  // Pre-bootstrap there is no register and no attached recognizer, so the queue
  // is empty; drained above regardless so nothing can accumulate stale.
  if (steps.length === 0 || cam === null) return;

  const store = deps.cb.store;
  const cssHeight = deps.canvas.clientHeight || 1;

  for (const step of steps) {
    switch (step.kind) {
      case 'gestureStart':
        // Seed from the live PRODUCED pose, not `camera.base`: mid-tween those
        // differ, and only the produced pose is where the user sees the camera.
        // `cancelCameraTween` is the single cancel-on-grab path — a manual
        // orbit always wins over a focus tween.
        seedCameraFromBase(cam, state.cameraRuntime.lastPose.current);
        store.dispatch(beginDrag());
        store.dispatch(cancelCameraTween());
        break;

      case 'gestureEnd':
        // Commit BEFORE `endDrag` so the baked pose is in `base` the moment the
        // orbitDrag driver deactivates — otherwise the next frame's resting
        // driver returns the pre-gesture base and the camera snaps back.
        store.dispatch(commitCameraPose(poseOf(cam)));
        store.dispatch(endDrag());
        break;

      case 'drag':
        applyInputToCamera(cam, step, cssHeight, pivotRadiusMpc(selectFocusRow(store.getState())));
        break;

      case 'zoom': {
        if (step.duringGesture) {
          applyInputToCamera(
            cam,
            step,
            cssHeight,
            pivotRadiusMpc(selectFocusRow(store.getState())),
          );
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
          pivotRadiusMpc(selectFocusRow(root)),
        );
        if (zoomed !== null) store.dispatch(commitCameraPose(zoomed));
        break;
      }
    }
  }
}
