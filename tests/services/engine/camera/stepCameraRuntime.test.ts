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
import { EMPTY_TILT_MEMORY } from '../../../../src/data/camera/emptyTiltMemory';
import { EMPTY_SURFACE_GESTURE_MEMORY } from '../../../../src/services/camera/surfaceStep';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { foldToWorld } from '../../../../src/services/engine/camera/rungs/foldToWorld';
import { isWorldArm } from '../../../../src/services/engine/camera/rungs/isWorldArm';
import { deriveSimDays } from '../../../../src/utils/time/deriveSimDays';
import { selectTimeState } from '../../../../src/state/time/selectors';
import { pivotFraming } from '../../../../src/services/engine/camera/pivotRadiusMpc';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';
import { eyeMpcOf } from '../../../../src/utils/camera/eyeMpcOf';
import { datumOnlyTerrainHeight } from '../../../../src/utils/camera/datumOnlyTerrainHeight';
import { commitCameraPose } from '../../../../src/state/camera/cameraSlice';
import { setOrientation } from '../../../../src/state/settings/core/orientationSlice';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { DEFAULT_ORIENTATION } from '../../../../src/data/defaults';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { makeCameraSimHarness } from '../../../helpers/camera/makeCameraSimHarness';
import { diveUntilEngaged } from '../../../helpers/camera/diveUntilEngaged';
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
    // No fixture here engages a real atlas, so the datum-only stub matches
    // production's own `?? 0` miss (F3a, spec §8.3).
    terrainHeightAt: () => 0,
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

  it('an idle frame returns the epochs, gesture, tilt and follow groups by identity', () => {
    // A body arm reached the way the app reaches one — the focus's approach
    // flown to saturation, then dived into the band. The HOLD is inert there
    // (the arm IS the hold) and the settled approach is done, so the memory
    // rides through unchanged and `notedTiltMemory` sees the host it already
    // remembers. `toBe` on all four — a group re-spread on a steady frame
    // breaks every between-frame memo keyed on it.
    const h = makeCameraSimHarness();
    h.frame(60);
    diveUntilEngaged(h, { body: 'earth' });
    const prev = h.state.cameraRuntime;
    expect(prev.register.pose.frame).toEqual({ body: 'earth' });
    expect(prev.follow).not.toBeNull();
    expect(prev.tilt.hostId).toBe('earth');

    const { next } = stepCameraRuntime(prev, inputsFor(h, h.nowMs() + 16));

    expect(next.epochs).toBe(prev.epochs);
    expect(next.gesture).toBe(prev.gesture);
    expect(next.tilt).toBe(prev.tilt);
    expect(next.follow).toBe(prev.follow);
  });

  it('the rung memory is wiped when the frame key changes and kept when it does not', () => {
    // The same-key half asserts IDENTITY: an envelope that re-wrapped the
    // memory every frame would hand the drain a fresh object each time and
    // silently break every `!==` the surface step decides a decline by.
    const h = makeCameraSimHarness({ bootHR: 0.1 });
    const prev = {
      ...h.state.cameraRuntime,
      gesture: { key: 'absolute', value: { gesture: 'down' as const } },
    };

    const crossing = stepCameraRuntime(prev, inputsFor(h, 16));
    const held = stepCameraRuntime(crossing.next, inputsFor(h, 32));

    expect(crossing.next.register.pose.frame).toEqual({ body: 'earth' });
    expect(crossing.next.gesture.key).toBe('body:earth');
    expect(crossing.next.gesture.value).toBe(EMPTY_SURFACE_GESTURE_MEMORY);
    expect(held.next.gesture.value).toBe(crossing.next.gesture.value);
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
    const rMpc = SCENE_EARTH.surface.datumRadiusM * SCALE_UNITS.M_TO_MPC;
    const render = absoluteArm({ target: [0, 0, 0], yaw: 0.3, pitch: 0.2, distance: 1.1 * rMpc });
    const project = (rememberedTiltRad: number) =>
      projectFramePose({
        render,
        authoredOverride: null,
        pivotsOnFocusedBody: true,
        focus: EARTH_ROW,
        follow: null,
        tilt: { ...EMPTY_TILT_MEMORY, rememberedTiltRad, hostId: 'earth' },
        intent,
        ctx: {
          bodies: BODIES,
          poseBasis: B,
          upBasis: B,
          terrainHeightAt: datumOnlyTerrainHeight,
          focusBodyId: 'earth',
          pivot: pivotFraming(EARTH_ROW),
          viewportPx: [1000, 1000],
          fovYRad: Math.PI / 3,
          tuning: intent.tuning,
        },
      });

    const flat = project(0);
    const tilted = project(0.5);

    expect(flat.displayed.frame).toEqual({ body: 'earth' });
    expect(flat.actions.map((a) => a.type)).toEqual([commitCameraPose.type]);
    const tiltOf = (out: typeof flat): number => {
      const world = foldToWorld(out.displayed, {
        bodies: BODIES,
        poseBasis: B,
        upBasis: B,
        terrainHeightAt: datumOnlyTerrainHeight,
      });
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

describe('a commit from outside the loop is authoritative', () => {
  it('a body-arm commit under a followed focus renders and stays, unbaked', () => {
    // A real body arm, reached the way the app reaches one (engage on close approach).
    const engaged = makeCameraSimHarness({ bootHR: 0.1 });
    engaged.frame(2);
    const bodyArm = engaged.store.getState().camera.base;
    expect(bodyArm.frame).toEqual({ body: 'earth' });

    const h = makeCameraSimHarness();
    h.frame(60);
    expect(h.state.cameraRuntime.register.winner).toBe('followHold');

    h.store.dispatch(commitCameraPose(bodyArm));
    h.frame(1);

    // Nothing baked over the commit: `followHold` is arm-gated out by the body
    // arm and `resting` (not `followHold`) reads as last frame's author, so
    // `commitOnEdge` sees no departure to bake.
    expect(h.store.getState().camera.base).toBe(bodyArm);
    expect(h.state.cameraRuntime.outputs.displayed).toEqual(bodyArm);
    expect(h.state.cameraRuntime.register.winner).toBe('resting');

    h.frame(1);
    expect(h.store.getState().camera.base).toBe(bodyArm);
  });

  it('a world-arm commit under a followed focus is adopted, distance included', () => {
    const h = makeCameraSimHarness();
    h.frame(60);
    expect(h.state.cameraRuntime.register.winner).toBe('followHold');
    const before = h.store.getState().camera.base;
    if (!isWorldArm(before)) throw new Error('expected a world arm base');

    h.store.dispatch(
      commitCameraPose(absoluteArm({ ...before.pose, distance: before.pose.distance * 2 })),
    );
    h.frame(1);

    expect(h.state.cameraRuntime.register.winner).toBe('followHold');
    const world = foldToWorld(h.state.cameraRuntime.outputs.displayed, {
      bodies: BODIES,
      poseBasis: B,
      upBasis: B,
      terrainHeightAt: datumOnlyTerrainHeight,
    });
    expect(world.distance).toBeCloseTo(before.pose.distance * 2, 5);
  });
});

describe('the loop re-encodes base on an orientation switch', () => {
  it('holds the eye and keeps a wheel zoom across the switch', () => {
    const h = makeCameraSimHarness();
    h.frame(60);
    expect(h.state.cameraRuntime.register.winner).toBe('followHold');

    const worldOf = (basis: typeof B) =>
      foldToWorld(h.state.cameraRuntime.outputs.displayed, {
        bodies: BODIES,
        poseBasis: basis,
        upBasis: basis,
        terrainHeightAt: datumOnlyTerrainHeight,
      });
    const distanceBeforeZoom = worldOf(B).distance;

    h.wheel(-100);
    h.wheel(-100);
    h.wheel(-100);

    const zoomed = worldOf(B);
    expect(zoomed.distance).toBeLessThan(distanceBeforeZoom);
    const eyeBefore = eyeMpcOf(zoomed, B);

    // Production dispatches only `setOrientation` (the saga's other effect is
    // the up-basis roll, irrelevant here): the LOOP re-encodes `base` itself,
    // on the frame it sees `settings.orientation` differ from its own record.
    const GAL = ORIENTATION_FRAMES.galactic;
    h.store.dispatch(setOrientation('galactic'));
    h.frame(2);

    const after = worldOf(GAL);
    expect(Math.abs(after.distance - zoomed.distance) / zoomed.distance).toBeLessThan(1e-6);
    const eyeAfter = eyeMpcOf(after, GAL);
    const eyeDelta = Math.hypot(
      eyeAfter[0] - eyeBefore[0],
      eyeAfter[1] - eyeBefore[1],
      eyeAfter[2] - eyeBefore[2],
    );
    expect(eyeDelta / zoomed.distance).toBeLessThan(1e-6);
  });
});

describe('a commit mid-approach', () => {
  it('lands: the loop stops flying and adopts it', () => {
    const engaged = makeCameraSimHarness({ bootHR: 0.1 });
    engaged.frame(2);
    const bodyArm = engaged.store.getState().camera.base;
    expect(bodyArm.frame).toEqual({ body: 'earth' });

    const h = makeCameraSimHarness();
    h.frame(5);
    expect(h.state.cameraRuntime.register.winner).toBe('followApproach');

    h.store.dispatch(commitCameraPose(bodyArm));
    h.frame(1);

    expect(h.store.getState().camera.base).toBe(bodyArm);
    expect(h.state.cameraRuntime.outputs.displayed).toEqual(bodyArm);
    expect(h.state.cameraRuntime.register.winner).not.toBe('followApproach');
  });
});
