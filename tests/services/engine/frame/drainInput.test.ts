/**
 * drainInput — the frame's single input-apply site.
 *
 * What matters here is the wiring the recognizer no longer does for itself:
 * nothing reaches the camera between frames, a gesture that ENDS mid-frame
 * still commits the moves that preceded it, the at-rest wheel goes to the
 * store rather than the invisible register, and the focused body's radius
 * reaches the zoom floor.
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

import { drainInput } from '../../../../src/services/engine/frame/drainInput';
import { createInputAggregator } from '../../../../src/services/engine/subsystems/inputAggregator';
import { createOrbitCamera } from '../../../../src/utils/camera/createOrbitCamera';
import { createCameraClock } from '../../../../src/services/engine/camera/cameraClock';
import { createSurfaceController } from '../../../../src/services/camera/surfaceController';
import { rootReducer } from '../../../../src/store/rootReducer';
import { setSelectionRow } from '../../../../src/state/selectionRows/selectionRowsSlice';
import {
  startCameraTween,
  beginDrag,
  clipStarted,
  commitCameraPose,
} from '../../../../src/state/camera/cameraSlice';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { toBodyArm } from '../../../../src/services/engine/camera/poseFrameConversion';
import { cursorRayBodyLocal } from '../../../../src/utils/camera/cursorRayBodyLocal';
import { raySphereRoots } from '../../../../src/utils/math/raySphereRoots';
import { SCENE_BODIES } from '../../../../src/data/bodies/sceneBodies';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';
import { worldArmOf } from '../../../fixtures/worldArmOf';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { RunFrameDeps } from '../../../../src/@types/engine/frame/RunFrameDeps';
import type { Vec2 } from '../../../../src/@types/math/Vec2';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { FramedCameraPose } from '../../../../src/@types/camera/FramedCameraPose';

const EARTH_RADIUS_MPC = 6371 * SCALE_UNITS.KM_TO_MPC;

function makeHarness(distance = 100) {
  const cam = createOrbitCamera({
    target: [0, 0, 0],
    distance,
    yaw: 0,
    pitch: 0,
    fovYRad: (Math.PI / 180) * 60,
    aspect: 1,
    near: 0.1,
    far: 1000,
  });
  const inputAggregator = createInputAggregator();
  const state = {
    cam,
    // The gesture seed resolves the live pose's arm, so the harness carries the
    // orientation + epoch that resolution reads.
    settings: { orientation: 'ecliptic' },
    subsystems: { inputAggregator },
    cameraRuntime: {
      clock: createCameraClock(),
      lastPose: { current: absoluteArm({ target: [0, 0, 0], yaw: 0, pitch: 0, distance }) },
      prevActiveId: { current: 'resting' },
      lastRenderedSimDays: { current: CONST_J2000 },
      upBasis: { current: ORIENTATION_FRAMES.ecliptic },
      projection: { fovYRad: Math.PI / 3, aspect: 1, near: 0.01, far: 50000 },
      surface: createSurfaceController(),
    },
  } as unknown as EngineState;

  const store = configureStore({ reducer: rootReducer });
  const deps = {
    canvas: { clientWidth: 1000, clientHeight: 1000 } as HTMLCanvasElement,
    cb: { store },
  } as unknown as RunFrameDeps;

  return { cam, agg: inputAggregator, state, deps, store };
}

/** Earth's body arm, eye `radii` Earth-radii from the centre, looking at it. */
function earthArm(radii: number): FramedCameraPose {
  const earth = deriveBodyStates(CONST_J2000).get('earth')!;
  const B = ORIENTATION_FRAMES.ecliptic;
  return {
    frame: { body: 'earth' },
    pose: toBodyArm(
      {
        target: [...earth.positionMpc] as Vec3,
        yaw: 0.7,
        pitch: 0.3,
        distance: radii * 6371000 * SCALE_UNITS.M_TO_MPC,
      },
      B,
      B,
      'earth',
      earth,
    ),
  } as FramedCameraPose;
}

/** Geocentric range of a body arm, metres — the anchor is the body centre. */
function rangeM(framed: FramedCameraPose): number {
  if (framed.frame === 'absolute') throw new Error('rangeM: not a body arm');
  return Math.hypot(...framed.pose.eyeRelAnchorM);
}

describe('drainInput', () => {
  it('applies nothing until the frame drains', () => {
    const { cam, agg, state, deps } = makeHarness();
    agg.push({ kind: 'gestureStart' });
    agg.push({ kind: 'dragAnchor', xPx: 100, yPx: 100 });
    agg.push({ kind: 'dragMove', mode: 'orbit', xPx: 150, yPx: 100 });

    expect(cam.yaw).toBe(0);

    drainInput(state, deps, 0);
    expect(cam.yaw).toBeCloseTo(-50 * 0.005, 6);
  });

  it('commits the tail of a gesture that ended mid-frame', () => {
    // The pointerup used to fire the commit synchronously, with every move
    // already applied. Deferred, the moves must still land BEFORE the commit or
    // the store bakes a pose one frame stale.
    const { agg, state, deps, store } = makeHarness();
    // The sink already flipped `dragging` at DOM time; the drain ends it.
    store.dispatch(beginDrag());
    agg.push({ kind: 'gestureStart' });
    agg.push({ kind: 'dragAnchor', xPx: 100, yPx: 100 });
    agg.push({ kind: 'dragMove', mode: 'orbit', xPx: 150, yPx: 100 });
    agg.push({ kind: 'gestureEnd' });

    drainInput(state, deps, 0);

    expect(worldArmOf(store.getState().camera.base).yaw).toBeCloseTo(-50 * 0.005, 6);
    expect(store.getState().camera.dragging).toBe(false);
  });

  it('routes a body-arm drag to the surface controller, never the register', () => {
    // The register is invisible in a body arm — `orbitDrag` is arm-gated off —
    // so committing it on release would land the whole accumulated gesture in
    // one frame, which the fold then re-engages: the register-vs-render
    // divergence at its worst. The anchored gesture is what moves the camera,
    // and it stays in the body arm the whole way.
    const { agg, state, deps, store } = makeHarness();
    const arm = earthArm(2);
    store.dispatch(commitCameraPose(arm));
    state.cameraRuntime.lastPose.current = arm;
    store.dispatch(beginDrag());

    agg.push({ kind: 'gestureStart' });
    agg.push({ kind: 'dragAnchor', xPx: 100, yPx: 100 });
    agg.push({ kind: 'dragMove', mode: 'orbit', xPx: 400, yPx: 100 });
    agg.push({ kind: 'gestureEnd' });

    drainInput(state, deps, 0);

    const committed = store.getState().camera.base;
    expect(committed.frame).toEqual({ body: 'earth' });
    // The anchored drag moved the camera; the register's world pose did not
    // land on top of it at gesture end.
    expect(committed.pose).not.toBe(arm.pose);
    expect(store.getState().camera.dragging).toBe(false);
  });

  it('carries the wheel’s cursor pixel to the body arm’s zoom anchor', () => {
    // End to end: recognizer pixel → aggregator step → surface controller pick.
    // With no pointer down there is no drag baseline to read the cursor off,
    // so the wheel event's own pixel is the whole plumbing (spec §12-R4) —
    // without it the zoom anchors at screen centre, a different point.
    const { agg, state, deps, store } = makeHarness();
    const arm = earthArm(2);
    store.dispatch(commitCameraPose(arm));
    state.cameraRuntime.lastPose.current = arm;
    if (arm.frame === 'absolute') throw new Error('fixture: not a body arm');

    const radiusM = SCENE_BODIES.find((b) => b.id === 'earth')!.radiusM;
    const cursorPx: Vec2 = [700, 500];
    const anchorFor = (px: Vec2): Vec3 => {
      const ray = cursorRayBodyLocal(arm.pose, px, [1000, 1000], Math.PI / 3);
      const t = raySphereRoots(ray.originM, ray.dir, [0, 0, 0], radiusM)![0];
      return [
        ray.originM[0] + ray.dir[0] * t,
        ray.originM[1] + ray.dir[1] * t,
        ray.originM[2] + ray.dir[2] * t,
      ];
    };
    const eyeM = arm.pose.eyeRelAnchorM; // the anchor is the body centre here
    const steppedTo = (a: Vec3, f: number): Vec3 => [
      a[0] + f * (eyeM[0] - a[0]),
      a[1] + f * (eyeM[1] - a[1]),
      a[2] + f * (eyeM[2] - a[2]),
    ];

    agg.push({ kind: 'wheel', deltaY: -100, duringGesture: false, xPx: 700, yPx: 500 });
    drainInput(state, deps, 0);

    const committed = store.getState().camera.base;
    if (committed.frame === 'absolute') throw new Error('the arm flipped');
    const got = committed.pose.eyeRelAnchorM;
    const wanted = steppedTo(anchorFor(cursorPx), Math.exp(-0.1));
    expect(Math.hypot(got[0] - wanted[0], got[1] - wanted[1], got[2] - wanted[2])).toBeLessThan(
      1e-3,
    );
    // Not a coincidence of two nearby points: the screen-centre anchor the
    // pixel-less wheel used to take lands tens of km away.
    const centred = steppedTo(anchorFor([500, 500]), Math.exp(-0.1));
    expect(
      Math.hypot(got[0] - centred[0], got[1] - centred[1], got[2] - centred[2]),
    ).toBeGreaterThan(10_000);
  });

  it('latches a body-arm gesture against the pose on screen, not a stale base', () => {
    // `base` equals what is rendered only while the resting or surface driver
    // wins: the fold commits on a REGIME edge, so mid-fly-to `base` still holds
    // the last crossing pose while `lastPose` tracks the tween. A gesture that
    // latched against `base` would take its mode, its anchor and its frozen pan
    // radius from an altitude the user never saw — and keep them, stickily, for
    // the whole gesture. `wireInput` cancels the tween at pointerdown, so
    // double-click-to-focus then grab mid-flight is the ordinary path in.
    const { agg, state, deps, store } = makeHarness();
    const stale = earthArm(5);
    const onScreen = earthArm(1.5);
    store.dispatch(commitCameraPose(stale));
    state.cameraRuntime.lastPose.current = onScreen;
    store.dispatch(beginDrag());

    agg.push({ kind: 'gestureStart' });
    agg.push({ kind: 'dragAnchor', xPx: 500, yPx: 500 });
    agg.push({ kind: 'dragMove', mode: 'orbit', xPx: 560, yPx: 500 });

    drainInput(state, deps, 0);

    // The centre pixel hits the body dead-on from either pose, so both latch
    // `pan` — a rotation about the body centre. The range is then the
    // fingerprint of which pose the gesture was applied to.
    const committed = rangeM(store.getState().camera.base);
    expect(committed / rangeM(onScreen)).toBeCloseTo(1, 9);
    expect(committed / rangeM(stale)).toBeLessThan(0.5);
  });

  it('leaves the pose alone while a clip owns the camera', () => {
    // The clip row (95) re-wins at pointerup and bakes its own final pose at
    // its commit-on-edge, so a gesture applied underneath it is discarded
    // whole. A playing clip is not interruptible by a drag in either arm.
    const { agg, state, deps, store } = makeHarness();
    const arm = earthArm(2);
    store.dispatch(commitCameraPose(arm));
    state.cameraRuntime.lastPose.current = arm;
    store.dispatch(
      clipStarted({
        data: { start: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1 }, timeline: [] },
        frame: 'ecliptic',
      }),
    );
    store.dispatch(beginDrag());

    agg.push({ kind: 'gestureStart' });
    agg.push({ kind: 'dragAnchor', xPx: 500, yPx: 500 });
    agg.push({ kind: 'dragMove', mode: 'orbit', xPx: 560, yPx: 500 });
    agg.push({ kind: 'wheel', deltaY: 240, duringGesture: false, xPx: 500, yPx: 500 });
    agg.push({ kind: 'gestureEnd' });

    drainInput(state, deps, 0);

    expect(store.getState().camera.base).toBe(arm);
  });

  it('leaves a tween started after the pointerdown alone', () => {
    // `cancelCameraTween` fires at DOM time (the emit sink), NOT here. A
    // double-tap runs pointerdown → pointerup → click → dblclick → focus →
    // `watchFocusTweenSaga` → `startCameraTween`, all before the next frame:
    // cancelling at the drain would kill the tween the same tap just asked for
    // and double-click-to-focus would select but never fly.
    const { agg, state, deps, store } = makeHarness();
    agg.push({ kind: 'gestureStart' });
    agg.push({ kind: 'dragAnchor', xPx: 100, yPx: 100 });
    agg.push({ kind: 'gestureEnd' });
    const pose = { target: [0, 0, 0] as Vec3, yaw: 1, pitch: 0, distance: 5 };
    store.dispatch(
      startCameraTween({
        from: pose,
        to: pose,
        durationMs: 800,
        easing: 'easeInOutCubic',
        frame: 'ecliptic',
      }),
    );

    drainInput(state, deps, 0);

    expect(store.getState().camera.tween).not.toBeNull();
  });

  it('routes an at-rest wheel to the store base, not the drag register', () => {
    // With no gesture the resting driver renders `base`, so a register mutation
    // would be invisible.
    const { cam, agg, state, deps, store } = makeHarness();
    const baseBefore = worldArmOf(store.getState().camera.base).distance;
    agg.push({ kind: 'wheel', deltaY: 100, duringGesture: false, xPx: 500, yPx: 500 });

    drainInput(state, deps, 0);

    expect(cam.distance).toBe(100);
    // deltaY > 0 zooms out, so the committed base grew.
    expect(worldArmOf(store.getState().camera.base).distance).toBeGreaterThan(baseBefore);
  });

  it('floors an in-gesture zoom at the focused body’s surface', () => {
    const { cam, agg, state, deps, store } = makeHarness(EARTH_RADIUS_MPC * 4);
    store.dispatch(
      setSelectionRow({
        slot: 'focus',
        row: {
          type: 'body',
          id: 'earth',
          label: 'Earth',
          positionMpc: [0, 0, 0],
          radiusM: 6371000,
        },
      }),
    );

    agg.push({ kind: 'gestureStart' });
    agg.push({ kind: 'pinchAnchor', distPx: 10 });
    agg.push({ kind: 'pinchMove', distPx: 10_000_000 });
    drainInput(state, deps, 0);

    const radii = cam.distance / EARTH_RADIUS_MPC;
    expect(radii).toBeGreaterThan(1);
    expect(radii).toBeLessThan(1.05);
  });
});
