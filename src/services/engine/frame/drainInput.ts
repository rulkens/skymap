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
import { SCENE_BODIES } from '../../../data/bodies/sceneBodies';

import type { BodyFixedPose } from '../../../@types/camera/BodyFixedPose';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { InputStep } from '../../../@types/camera/InputStep';
import type { RunFrameDeps } from '../../../@types/engine/frame/RunFrameDeps';

export function drainInput(state: EngineState, deps: RunFrameDeps, nowMs: number): void {
  const steps = state.subsystems.inputAggregator.drain();
  if (steps.length === 0) return;

  const store = deps.cb.store;
  const cssHeight = deps.canvas.clientHeight || 1;

  /** What this drain last handed the surface controller; null before the first. */
  let armPose: BodyFixedPose | null = null;

  /**
   * The engaged arm's input owner (spec §6): anchored gestures, committed
   * straight into `base` because a body arm has no register to render from;
   * `false` hands the step back to the untouched world-arm path. The GATE is
   * the stored regime (`base.frame`, T15); the POSE is the live produced one,
   * because the fold commits on a regime EDGE only — mid-tween `base` holds the
   * last crossing pose while `lastPose` tracks the animation, and a latch taken
   * against a pose the user never saw sticks for the whole gesture (FW-G).
   */
  const routeToSurface = (step: InputStep): boolean => {
    const root = store.getState();
    const base = root.camera.base;
    if (base.frame === 'absolute') return false;
    // A playing clip owns the camera in both arms (the driver table's rule).
    if (root.camera.clip !== null) return true;
    // Unreachable: the fold only ever names a body it resolved.
    const body = SCENE_BODIES.find((row) => row.id === base.frame.body);
    if (body === undefined) return true;
    const live = state.cameraRuntime.lastPose.current;
    const from =
      armPose ??
      (live.frame !== 'absolute' && live.frame.body === base.frame.body ? live.pose : base.pose);
    const next = state.cameraRuntime.surface.apply(
      from,
      step,
      [deps.canvas.clientWidth || 1, cssHeight],
      state.cameraRuntime.projection.fovYRad,
      body.radiusM,
    );
    armPose = next;
    // Identity, not equality: a declined step returns its input by reference
    // (`anchoredZoomStep` always allocates, so a floored wheel still writes an
    // equal pose — harmless, nothing subscribes). `frame` rides along BY
    // REFERENCE: one fact in two fields, and the body never changes here.
    if (next !== base.pose) store.dispatch(commitCameraPose({ frame: base.frame, pose: next }));
    return true;
  };
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
        state.cameraRuntime.surface.onGestureStart();
        break;

      case 'gestureEnd':
        // Commit BEFORE `endDrag` so the baked pose is in `base` the moment the
        // orbitDrag driver deactivates — otherwise the next frame's resting
        // driver returns the pre-gesture base and the camera snaps back.
        //
        // World arm only: in a body arm `orbitDrag` never won, so the register
        // holds a pose nothing rendered, and committing it would land the whole
        // held gesture in one frame — while the surface controller has been
        // committing the real thing all along (spec §6).
        if (cam !== null && store.getState().camera.base.frame === 'absolute') {
          store.dispatch(commitCameraPose(absoluteArm(poseOf(cam))));
        }
        state.cameraRuntime.surface.onGestureEnd();
        store.dispatch(endDrag());
        break;

      case 'drag':
        if (routeToSurface(step)) break;
        if (cam !== null) {
          applyInputToCamera(cam, step, cssHeight, pivotFraming(selectFocusRow(store.getState())));
        }
        break;

      case 'zoom': {
        // Both zoom owners route to the anchored step in a body arm: it owns
        // its range, so `applyWheelZoom`'s three owners go unconsulted (§7).
        if (routeToSurface(step)) break;
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
