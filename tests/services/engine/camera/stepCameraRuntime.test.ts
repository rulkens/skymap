/**
 * stepCameraRuntime — the camera frame as a pure step: `prev` untouched,
 * unchanged groups back by identity, the fold below the pin and the tilt
 * projection (FW-G, restated against `projectFramePose`'s output), and the
 * projection re-derived from the frame's own canvas size and FOV.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../src/services/engine/wiring/reevaluateDemand', () => ({
  reevaluateDemand: vi.fn(),
}));
vi.mock('../../../../src/services/engine/frame/deriveSourceMasks', () => ({
  deriveSourceMasks: () => ({ draw: 0, pick: 0 }),
}));
// Reads window.devicePixelRatio, which the node environment has no window for.
vi.mock('../../../../src/services/gpu/device', () => ({
  resizeCanvasToDisplay: () => false,
}));

import { stepCameraRuntime } from '../../../../src/services/engine/camera/stepCameraRuntime';
import { projectFramePose } from '../../../../src/services/engine/frame/projectFramePose';
import { CAMERA_DRIVERS } from '../../../../src/services/engine/camera/cameraDrivers';
import { NEAR_CLIP_MPC, FAR_CLIP_MPC } from '../../../../src/services/engine/camera/cameraFraming';
import { EMPTY_SURFACE_MEMORY } from '../../../../src/services/camera/surfaceStep';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { resolveWorldArm } from '../../../../src/services/engine/camera/poseFrameConversion';
import { deriveSimDays } from '../../../../src/utils/time/deriveSimDays';
import { selectTimeState } from '../../../../src/state/time/selectors';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';
import { eyeMpcOf } from '../../../../src/utils/camera/eyeMpcOf';
import { commitCameraPose } from '../../../../src/state/camera/cameraSlice';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { DEFAULT_ORIENTATION } from '../../../../src/data/defaults';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { makeCameraSimHarness } from '../../../helpers/camera/makeCameraSimHarness';
import { tiltOfPose } from '../../../helpers/camera/tiltOfPose';
import { deepFreeze } from '../../../helpers/deepFreeze';
import type { CameraSimHarness } from '../../../helpers/camera/CameraSimHarness';
import type { BodyId } from '../../../../src/@types/data/body/BodyId';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import type { SelectionRow } from '../../../../src/@types/engine/SelectionRow';
import type { StepInputs } from '../../../../src/@types/engine/camera/StepInputs';

const B = ORIENTATION_FRAMES[DEFAULT_ORIENTATION];
const BODIES = deriveBodyStates(CONST_J2000) as ReadonlyMap<BodyId, BodyState>;
const EARTH = BODIES.get('earth')!;
const EARTH_ROW: SelectionRow = {
  type: 'body',
  id: 'earth',
  label: 'Earth',
  positionMpc: [EARTH.positionMpc[0]!, EARTH.positionMpc[1]!, EARTH.positionMpc[2]!],
  radiusM: SCENE_EARTH.radiusM,
};

/** The frame's inputs as `runFrame` would build them, off the harness's live store and aggregator. */
function inputsFor(h: CameraSimHarness, nowMs: number, over: Partial<StepInputs> = {}): StepInputs {
  const rootState = h.store.getState();
  const simDays = deriveSimDays(selectTimeState(rootState), nowMs);
  return {
    nowMs,
    simDays,
    rootState,
    canvasPx: [100, 100],
    aspect: 1,
    steps: h.state.subsystems.inputAggregator.drain(),
    bodies: deriveBodyStates(simDays) as ReadonlyMap<BodyId, BodyState>,
    clipEpoch: h.state.cameraRuntime.epochs.clip,
    drivers: CAMERA_DRIVERS,
    ...over,
  };
}

describe('stepCameraRuntime', () => {
  it('does not mutate prev', () => {
    // Every group and nested object frozen; a write anywhere throws under ESM
    // strict mode. The frame exercises every writer: a notch, a pan under a
    // followed body (the follow memory's `panOffset`), a gesture edge (the
    // surface memory) and the follow capture.
    const h = makeCameraSimHarness();
    h.frame(2);
    const prev = deepFreeze(h.state.cameraRuntime);
    h.push({ kind: 'wheel', deltaY: 100, duringGesture: false, xPx: 50, yPx: 50 });
    h.push({ kind: 'gestureStart' });
    h.push({ kind: 'dragAnchor', xPx: 50, yPx: 50 });
    h.push({ kind: 'dragMove', mode: 'pan', xPx: 60, yPx: 50 });
    h.push({ kind: 'gestureEnd' });

    const { next } = stepCameraRuntime(prev, inputsFor(h, 48));

    expect(next).not.toBe(prev);
    expect(next.register.pose).not.toBe(prev.register.pose);
    expect(next.follow?.panOffset).not.toEqual([0, 0, 0]);
  });

  it('an idle frame returns the epochs, surface and follow groups by identity', () => {
    // A body arm: the follow driver is inert there, so its memory rides
    // through unchanged and `noteBody` sees the body it already remembers.
    // `toBe` on all three — a group re-spread on a steady frame breaks every
    // between-frame memo keyed on it.
    const h = makeCameraSimHarness({ bootHR: 0.1 });
    h.frame(3);
    const prev = h.state.cameraRuntime;
    expect(prev.register.pose.frame).toEqual({ body: 'earth' });
    expect(prev.follow).not.toBeNull();
    expect(prev.surface.memoryBodyId).toBe('earth');

    const { next } = stepCameraRuntime(prev, inputsFor(h, 64));

    expect(next.epochs).toBe(prev.epochs);
    expect(next.surface).toBe(prev.surface);
    expect(next.follow).toBe(prev.follow);
  });

  it('the fold runs after the pin and the tilt projection', () => {
    // FW-G against the stage's output. A produced pose whose eye sits 1.1 R
    // from the ORIGIN engages only once the pin re-targets it onto Earth; a
    // fold above the pin would judge the un-pinned eye (a solar radius out)
    // and stay absolute. The remembered tilt reaches the engaged arm only if
    // the projection ran before the conversion (ruling 13): a fold above it
    // converts the untilted image and the arm comes out looking at nadir.
    const h = makeCameraSimHarness({ focusBody: null, bootHR: null });
    const intent = h.store.getState().camera;
    const rMpc = SCENE_EARTH.radiusM * SCALE_UNITS.M_TO_MPC;
    const render = absoluteArm({ target: [0, 0, 0], yaw: 0.3, pitch: 0.2, distance: 1.1 * rMpc });
    const project = (rememberedTiltRad: number) =>
      projectFramePose({
        render,
        authoredOverride: null,
        pivotsOnFocusedBody: true,
        focus: EARTH_ROW,
        follow: null,
        surface: { ...EMPTY_SURFACE_MEMORY, rememberedTiltRad, memoryBodyId: 'earth' },
        intent,
        bodies: BODIES,
        poseBasis: B,
        upBasis: B,
        tuning: intent.tuning,
      });

    const flat = project(0);
    const tilted = project(0.5);

    expect(flat.displayed.frame).toEqual({ body: 'earth' });
    expect(flat.actions.map((a) => a.type)).toEqual([commitCameraPose.type]);
    const tiltOf = (out: typeof flat): number => {
      const world = resolveWorldArm(out.displayed, BODIES, B, B);
      return tiltOfPose(world, eyeMpcOf(world, B), EARTH);
    };
    expect(tiltOf(flat)).toBeLessThan(1e-6);
    expect(tiltOf(tilted)).toBeGreaterThan(0.3);
  });

  it('the projection follows a canvas resize and a FOV change within the frame that caused it', () => {
    // The FOV slider changes on frames with no resize event, and the aspect is
    // the BACKING store's (not the CSS size the cursor maps through); a
    // projection carried from `prev` would draw the old lens for a frame.
    const h = makeCameraSimHarness({ focusBody: null, bootHR: null });
    const prev = h.state.cameraRuntime;
    expect(prev.outputs.projection.aspect).toBe(1);
    const stored = h.store.getState();
    const rootState = {
      ...stored,
      settings: { ...stored.settings, camera: { ...stored.settings.camera, fovDeg: 90 } },
    };

    const { next } = stepCameraRuntime(prev, inputsFor(h, 16, { rootState, aspect: 2 }));

    expect(next.outputs.projection).toEqual({
      fovYRad: Math.PI / 2,
      aspect: 2,
      near: NEAR_CLIP_MPC,
      far: FAR_CLIP_MPC,
    });
  });
});
