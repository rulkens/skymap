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
    // The world-arm fold resolves the live pose's arm, so the harness carries
    // the orientation + epoch that resolution reads.
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
      lastZoomFactor: { current: null },
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
    const { agg, state, deps } = makeHarness();
    agg.push({ kind: 'gestureStart' });
    agg.push({ kind: 'dragAnchor', xPx: 100, yPx: 100 });
    agg.push({ kind: 'dragMove', mode: 'orbit', xPx: 150, yPx: 100 });

    expect(worldArmOf(state.cameraRuntime.lastPose.current).yaw).toBe(0);

    drainInput(state, deps, 0);
    expect(worldArmOf(state.cameraRuntime.lastPose.current).yaw).toBeCloseTo(-50 * 0.005, 6);
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

  it('routes a body-arm drag to the surface controller and commits it at gesture end', () => {
    // The anchored gesture is what moves the camera, folded into the live
    // register step by step, and it stays in the body arm the whole way; the
    // release bakes the folded pose — never a stale world-arm reading — into
    // `base`.
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
    // Which anchor the tick used, read off the range it scaled: the step takes
    // `|eye − A|` to `f·|eye − A|`, and the approach's north-up rotation is
    // about an axis through A, so that distance survives it exactly.
    const rangeTo = (a: Vec3, e: Readonly<Vec3>): number =>
      Math.hypot(e[0] - a[0], e[1] - a[1], e[2] - a[2]);

    agg.push({ kind: 'wheel', deltaY: -100, duringGesture: false, xPx: 700, yPx: 500 });
    drainInput(state, deps, 0);

    const committed = store.getState().camera.base;
    if (committed.frame === 'absolute') throw new Error('the arm flipped');
    const got = committed.pose.eyeRelAnchorM;
    const f = Math.exp(-0.1);

    const cursorAnchor = anchorFor(cursorPx);
    expect(rangeTo(cursorAnchor, got)).toBeCloseTo(f * rangeTo(cursorAnchor, eyeM), 3);
    // Not a coincidence of two nearby points: the screen-centre anchor the
    // pixel-less wheel used to take is ~500 km away and does not fit the law.
    const centreAnchor = anchorFor([500, 500]);
    expect(rangeTo(centreAnchor, cursorAnchor)).toBeGreaterThan(100_000);
    expect(Math.abs(rangeTo(centreAnchor, got) - f * rangeTo(centreAnchor, eyeM))).toBeGreaterThan(
      1000,
    );
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
    // fingerprint of which pose the gesture was applied to. Mid-gesture the
    // pose lives in the register (the store commits at gesture end).
    const folded = rangeM(state.cameraRuntime.lastPose.current);
    expect(folded / rangeM(onScreen)).toBeCloseTo(1, 9);
    expect(folded / rangeM(stale)).toBeLessThan(0.5);
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

  it('routes an at-rest wheel to the store base, where the resting driver reads it', () => {
    // With no gesture the resting driver renders `base`, so a register-only
    // write would be invisible — the STORE must carry the notch. (The live
    // register is refreshed too, so a drag later in the same drain chains
    // from the notch — the I1 regression tests below.)
    const { agg, state, deps, store } = makeHarness();
    const baseBefore = worldArmOf(store.getState().camera.base).distance;
    agg.push({ kind: 'wheel', deltaY: 100, duringGesture: false, xPx: 500, yPx: 500 });

    drainInput(state, deps, 0);

    // deltaY > 0 zooms out, so the committed base grew.
    expect(worldArmOf(store.getState().camera.base).distance).toBeGreaterThan(baseBefore);
  });

  it('folds a followed-body pan into the clock strafe offset, not double-counted', () => {
    // While a MOVING body is followed the pivot-pin owns the pose target
    // (`bodyPosition + followPanOffset`), so a pan step's own delta must land
    // on the clock offset — and an orbit step must leave it alone (its delta
    // is angular, not a strafe). The offset carries exactly the image-plane
    // translation of the drag, no body motion mixed in.
    const { agg, state, deps, store } = makeHarness();
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
    agg.push({ kind: 'dragAnchor', xPx: 100, yPx: 100 });
    agg.push({ kind: 'dragMove', mode: 'orbit', xPx: 150, yPx: 100 });
    drainInput(state, deps, 0);
    expect(state.cameraRuntime.clock.followPanOffset).toEqual([0, 0, 0]);

    agg.push({ kind: 'dragAnchor', xPx: 100, yPx: 100 });
    agg.push({ kind: 'dragMove', mode: 'pan', xPx: 150, yPx: 100 });
    drainInput(state, deps, 16);

    // 50 px at the image plane: 2 · distance · tan(fov/2) / cssHeight per px.
    const pxToWorld = (2 * 100 * Math.tan(Math.PI / 6)) / 1000;
    expect(Math.hypot(...state.cameraRuntime.clock.followPanOffset)).toBeCloseTo(50 * pxToWorld, 9);
  });

  it('a drag in the same drain as an at-rest body-arm notch chains from the notch, not before it', () => {
    // Review I1: the at-rest branch committed to the store but left the live
    // register stale, so a `[wheel, gestureStart, drag]` drain (routine in a
    // 33-50 ms frame window, or trackpad scroll → click-drag) folded the drag
    // from the PRE-notch pose and the gesture-end commit then overwrote the
    // notch — user input silently discarded.
    const { agg, state, deps, store } = makeHarness();
    const arm = earthArm(3);
    store.dispatch(commitCameraPose(arm));
    state.cameraRuntime.lastPose.current = arm;
    const rangeBefore = rangeM(arm);

    agg.push({ kind: 'wheel', deltaY: 240, duringGesture: false, xPx: 500, yPx: 500 });
    agg.push({ kind: 'gestureStart' });
    agg.push({ kind: 'dragAnchor', xPx: 500, yPx: 500 });
    agg.push({ kind: 'dragMove', mode: 'orbit', xPx: 520, yPx: 500 });
    drainInput(state, deps, 0);

    // The drag is a pan (range-preserving rotation), so the register keeps
    // the notch's range iff the drag chained from the post-notch pose. The
    // notch scales ALTITUDE by e^0.24, so range grows (1+2·1.271)/3 ≈ 1.18.
    expect(rangeM(state.cameraRuntime.lastPose.current) / rangeBefore).toBeGreaterThan(1.15);
  });

  it('a world-arm drag in the same drain as an at-rest notch chains from the notch too', () => {
    // The world-arm twin of the same staleness (pre-existing before the
    // simplification wave; fixed in the same pass). Base seeded to match the
    // register — at rest the two agree in production (runFrame restamps).
    const { agg, state, deps, store } = makeHarness();
    store.dispatch(
      commitCameraPose(absoluteArm({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: 100 })),
    );
    agg.push({ kind: 'wheel', deltaY: 100, duringGesture: false, xPx: 500, yPx: 500 });
    agg.push({ kind: 'gestureStart' });
    agg.push({ kind: 'dragAnchor', xPx: 500, yPx: 500 });
    agg.push({ kind: 'dragMove', mode: 'orbit', xPx: 520, yPx: 500 });
    drainInput(state, deps, 0);

    expect(worldArmOf(state.cameraRuntime.lastPose.current).distance).toBeGreaterThan(105);
  });

  it('an at-rest notch inside a body’s band walks the committed roll toward its frame', () => {
    // Ruling 8: the scene-frame → body-frame transition is a blend over the
    // altitude band, ridden by the wheel — the notch's commit carries a roll
    // stepped toward the body pole, never the input roll unchanged (that was
    // the height-triggered switch at engage) and never by more than the cap.
    const { agg, state, deps, store } = makeHarness();
    const earth = deriveBodyStates(CONST_J2000).get('earth')!;
    const nearEarth = absoluteArm({
      target: [...earth.positionMpc] as Vec3,
      yaw: 0.7,
      pitch: 0.3,
      distance: 2.5 * 6371000 * SCALE_UNITS.M_TO_MPC, // h/R 1.5, mid-band
      roll: 1.4,
    });
    store.dispatch(commitCameraPose(nearEarth));
    state.cameraRuntime.lastPose.current = nearEarth;

    agg.push({ kind: 'wheel', deltaY: 100, duringGesture: false, xPx: 500, yPx: 500 });
    drainInput(state, deps, 0);

    const committed = worldArmOf(store.getState().camera.base);
    const moved = Math.abs((committed.roll ?? 0) - 1.4);
    expect(moved).toBeGreaterThan(0.01);
    expect(moved).toBeLessThanOrEqual(0.1 + 1e-12);
  });

  it('a followed-body notch lands the frame alignment on base.roll', () => {
    // While followBody owns the wheel (it eases its own distance target and
    // `applyWheelZoom` commits nothing), the alignment must still ride the
    // notch — committed via `base.roll`, the term the follow pose lerps toward.
    const { agg, state, deps, store } = makeHarness();
    const earth = deriveBodyStates(CONST_J2000).get('earth')!;
    const nearEarth = absoluteArm({
      target: [...earth.positionMpc] as Vec3,
      yaw: 0.7,
      pitch: 0.3,
      distance: 2.5 * 6371000 * SCALE_UNITS.M_TO_MPC,
      roll: 1.4,
    });
    store.dispatch(commitCameraPose(nearEarth));
    state.cameraRuntime.lastPose.current = nearEarth;
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
    state.cameraRuntime.prevActiveId.current = 'followBody';
    state.cameraRuntime.clock.followDistanceTarget = 2.5 * EARTH_RADIUS_MPC;
    const targetBefore = state.cameraRuntime.clock.followDistanceTarget;

    agg.push({ kind: 'wheel', deltaY: 100, duringGesture: false, xPx: 500, yPx: 500 });
    drainInput(state, deps, 0);

    // The distance went to the follow's own slot, the roll to the base.
    expect(state.cameraRuntime.clock.followDistanceTarget).toBeGreaterThan(targetBefore);
    const committed = worldArmOf(store.getState().camera.base);
    expect(committed.distance).toBeCloseTo(2.5 * 6371000 * SCALE_UNITS.M_TO_MPC, 12);
    const moved = Math.abs((committed.roll ?? 0) - 1.4);
    expect(moved).toBeGreaterThan(0.01);
    expect(moved).toBeLessThanOrEqual(0.1 + 1e-12);
  });

  it('a FOCUSED zoom-out rides the roll back to the scene up (the default path)', () => {
    // The user's real configuration: Earth focused, followBody owns the wheel
    // (`applyWheelZoom` scales `followDistanceTarget`; the driver eases to
    // it). Feeding the ride identical pre/post poses there zeroed the target
    // delta — the ride was dead exactly on the default path, and once the
    // eased altitude left the band the notches went fully inert, freezing the
    // in-band roll (the "equatorial is still there" report). The notch's
    // authored altitude change IS the followDistanceTarget change, so the
    // ride must run across it. Ease simulated as saturated between notches
    // (the register stamped with the target-distance pose, as runFrame would).
    const { agg, state, deps, store } = makeHarness();
    const earth = deriveBodyStates(CONST_J2000).get('earth')!;
    const poseAt = (distMpc: number, roll: number) => ({
      target: [...earth.positionMpc] as Vec3,
      yaw: 0.7,
      pitch: 0.3,
      distance: distMpc,
      roll,
    });
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
    // In-band start with the band's pole-aligned roll held (the user's state
    // after an approach). Converge the roll onto the ride's own fixed point
    // first with factor-1 notches, so the recession isolates the RIDE.
    const startDist = EARTH_RADIUS_MPC * 2.5;
    store.dispatch(commitCameraPose(absoluteArm(poseAt(startDist, -0.26))));
    state.cameraRuntime.lastPose.current = absoluteArm(poseAt(startDist, -0.26));
    state.cameraRuntime.prevActiveId.current = 'followBody';
    state.cameraRuntime.clock.followDistanceTarget = startDist;
    const rollOfBase = (): number => {
      const base = store.getState().camera.base;
      if (base.frame !== 'absolute') throw new Error('expected absolute base');
      return (base.pose as { roll?: number }).roll ?? 0;
    };
    const settle = (nowMs: number): void => {
      // The saturated follow ease: register renders at the target distance
      // carrying base.roll (the follow pose lerps roll toward base).
      state.cameraRuntime.lastPose.current = absoluteArm(
        poseAt(state.cameraRuntime.clock.followDistanceTarget!, rollOfBase()),
      );
      void nowMs;
    };
    for (let i = 0; i < 60; i += 1) {
      agg.push({ kind: 'wheel', deltaY: 0, duringGesture: false, xPx: 500, yPx: 500 });
      drainInput(state, deps, i);
      settle(i);
    }
    expect(Math.abs(rollOfBase())).toBeGreaterThan(0.05); // in-band target held

    let guard = 0;
    while (
      state.cameraRuntime.clock.followDistanceTarget! / EARTH_RADIUS_MPC - 1 < 4.5 &&
      guard < 30
    ) {
      agg.push({ kind: 'wheel', deltaY: 100, duringGesture: false, xPx: 500, yPx: 500 });
      drainInput(state, deps, 1000 + guard);
      settle(1000 + guard);
      guard += 1;
    }

    // Above the band the scene frame owns the view again — no frozen residual
    // (1e-4 rad ≈ 0.006°: the live clock advancing between notches feeds the
    // decay a hair of target drift; the dead-ride bug left 5e-2 here and the
    // real-pacing case the whole band roll).
    expect(Math.abs(rollOfBase())).toBeLessThan(1e-4);
  });

  it('a gesture-held wheel notch rides the roll too — every driven zoom path', () => {
    const { agg, state, deps, store } = makeHarness();
    const earth = deriveBodyStates(CONST_J2000).get('earth')!;
    const inBand = absoluteArm({
      target: [...earth.positionMpc] as Vec3,
      yaw: 0.7,
      pitch: 0.3,
      distance: EARTH_RADIUS_MPC * 2.5,
      roll: 1.0,
    });
    store.dispatch(commitCameraPose(inBand));
    state.cameraRuntime.lastPose.current = inBand;

    agg.push({ kind: 'gestureStart' });
    agg.push({ kind: 'wheel', deltaY: 100, duringGesture: true, xPx: 500, yPx: 500 });
    drainInput(state, deps, 0);

    const folded = state.cameraRuntime.lastPose.current;
    if (folded.frame !== 'absolute') throw new Error('expected absolute register');
    const roll = (folded.pose as { roll?: number }).roll ?? 0;
    expect(Math.abs(roll - 1.0)).toBeGreaterThan(0.01);
  });

  it('floors an in-gesture zoom at the focused body’s surface', () => {
    const { agg, state, deps, store } = makeHarness(EARTH_RADIUS_MPC * 4);
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

    const radii = worldArmOf(state.cameraRuntime.lastPose.current).distance / EARTH_RADIUS_MPC;
    expect(radii).toBeGreaterThan(1);
    expect(radii).toBeLessThan(1.05);
  });
});
