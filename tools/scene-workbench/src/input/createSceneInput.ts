/**
 * createSceneInput — `createViewportInput.ts` minus the gizmo half: no
 * hit-testing, no drag state, every gesture routes straight into the
 * aggregator. The live drag register commits to the store once, at
 * `gestureEnd` or a rest-wheel tick, never per move.
 *
 * Pan reads `sceneCameraView`'s `rightM`/`upM` — the SAME basis the
 * billboard expansion uses — so the two can't drift apart.
 */
import { createInputAggregator } from '../../../../src/services/engine/subsystems/inputAggregator';
import { attachOrbitControls } from '../../../../src/services/camera/orbitControls';
import type { InputStep } from '../../../../src/@types/camera/InputStep';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { orbitDragDelta } from '../../../utils/camera/orbitDragDelta';
import { commitCameraPose, PITCH_LIMIT, type SceneCamera } from '../state/view/viewSlice';
import type { SceneStore } from '../store/types';
import { sceneCameraView } from '../render/sceneCameraView';
import { clampSceneDistanceM } from '../scene/clampSceneDistanceM';

// rad/px and screen-constant pan rate — same family as mcpm-workbench/flow-workbench.
const DRAG_SPEED = 0.005;
const PAN_SPEED = 0.0016;

export type SceneInput = {
  /** Applies one frame's aggregated gesture steps to the camera register
   *  (committing at a gesture boundary or rest-wheel). Returns whether any
   *  step was applied. */
  drain(): boolean;
  /** The live camera: the register mid-gesture, the committed store value
   *  otherwise (store→register adoption below keeps them equal at rest). */
  getCameraPose(): SceneCamera;
  destroy(): void;
};

export type SceneInputDeps = {
  readonly canvas: HTMLCanvasElement;
  readonly store: SceneStore;
  readonly markDirty: () => void;
};

function cloneTarget(t: Readonly<Vec3>): Vec3 {
  return [t[0], t[1], t[2]];
}

export function createSceneInput(deps: SceneInputDeps): SceneInput {
  const { canvas, store, markDirty } = deps;
  const aggregator = createInputAggregator();

  let lastSeenCamera = store.getState().view.camera;
  const register: SceneCamera = {
    yaw: lastSeenCamera.yaw,
    pitch: lastSeenCamera.pitch,
    distanceM: lastSeenCamera.distanceM,
    targetM: cloneTarget(lastSeenCamera.targetM),
  };

  // Brackets a whole pointer-down..up gesture (attachOrbitControls emits these
  // only at the 0→1 / 1→0 pointer-count transitions, so a mid-pinch second
  // contact never re-fires them) — gates the store→register adoption below.
  let inGesture = false;

  function getCameraPose(): SceneCamera {
    return register;
  }

  function currentPose(): SceneCamera {
    return {
      yaw: register.yaw,
      pitch: register.pitch,
      distanceM: register.distanceM,
      targetM: cloneTarget(register.targetM),
    };
  }

  function applyDragStep(step: Extract<InputStep, { kind: 'drag' }>): void {
    const dx = step.endPx[0] - step.startPx[0];
    const dy = step.endPx[1] - step.startPx[1];

    if (step.mode === 'pan') {
      const { rightM, upM } = sceneCameraView(register, [canvas.clientWidth, canvas.clientHeight]);
      const k = register.distanceM * PAN_SPEED;
      register.targetM = [
        register.targetM[0] + (-rightM[0] * dx + upM[0] * dy) * k,
        register.targetM[1] + (-rightM[1] * dx + upM[1] * dy) * k,
        register.targetM[2] + (-rightM[2] * dx + upM[2] * dy) * k,
      ];
      return;
    }

    const { dYaw, dPitch } = orbitDragDelta(dx, dy, DRAG_SPEED);
    register.yaw -= dYaw;
    register.pitch = Math.min(PITCH_LIMIT, Math.max(-PITCH_LIMIT, register.pitch + dPitch));
  }

  function drain(): boolean {
    const steps = aggregator.drain();
    if (steps.length === 0) return false;

    for (const step of steps) {
      switch (step.kind) {
        case 'gestureStart':
          inGesture = true;
          break;
        case 'gestureEnd':
          inGesture = false;
          store.dispatch(commitCameraPose(currentPose()));
          break;
        case 'drag':
          applyDragStep(step);
          break;
        case 'zoom':
          register.distanceM = clampSceneDistanceM(register.distanceM * step.factor);
          if (!step.duringGesture) store.dispatch(commitCameraPose(currentPose()));
          break;
      }
    }
    markDirty();
    return true;
  }

  const unsubscribeAdopt = store.subscribe(() => {
    const camera = store.getState().view.camera;
    if (camera === lastSeenCamera) return;
    lastSeenCamera = camera;
    // Mid-gesture the register is authoritative — an external write (preset
    // import, reset) during a drag must not yank the camera out of the hand.
    if (inGesture) return;
    register.yaw = camera.yaw;
    register.pitch = camera.pitch;
    register.distanceM = camera.distanceM;
    register.targetM = cloneTarget(camera.targetM);
  });

  const detachRecognizer = attachOrbitControls(canvas, (event) => aggregator.push(event));

  return {
    drain,
    getCameraPose,
    destroy(): void {
      detachRecognizer();
      unsubscribeAdopt();
      aggregator.destroy();
    },
  };
}
