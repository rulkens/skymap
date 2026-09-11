/**
 * replayInput — the pure fold of one frame's input steps. What the drain's own
 * tests cannot pin: nothing is mutated, a step reads the commit the step before
 * it emitted (the effective intent, not the store), the dispatch sites come
 * back as an ordered action list, and a declined step emits nothing.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

import { replayInput } from '../../../../src/services/engine/camera/replayInput';
import * as surfaceStepModule from '../../../../src/services/camera/surfaceStep';
import { EMPTY_SURFACE_MEMORY } from '../../../../src/services/camera/surfaceStep';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { rootReducer } from '../../../../src/store/rootReducer';
import {
  clipStarted,
  commitCameraPose,
  setAutoRotate,
} from '../../../../src/state/camera/cameraSlice';
import { setSelectionRow } from '../../../../src/state/selectionRows/selectionRowsSlice';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';
import { cursorRayBodyLocal } from '../../../../src/utils/camera/cursorRayBodyLocal';
import { raySphereRoots } from '../../../../src/utils/math/raySphereRoots';
import { SCENE_BODIES } from '../../../../src/data/bodies/sceneBodies';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { DEFAULT_CAMERA_TUNING } from '../../../../src/data/camera/cameraTuning';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { earthArm } from '../../../fixtures/earthArm';
import { worldArmOf } from '../../../fixtures/worldArmOf';
import type { BodyId } from '../../../../src/@types/data/body/BodyId';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import type { FramedCameraPose } from '../../../../src/@types/camera/FramedCameraPose';
import type { InputStep } from '../../../../src/@types/camera/InputStep';
import type { DriverId } from '../../../../src/@types/engine/camera/DriverId';
import type { SelectionRow } from '../../../../src/@types/engine/SelectionRow';
import type { Vec2 } from '../../../../src/@types/math/Vec2';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const EARTH_RADIUS_MPC = 6371 * SCALE_UNITS.KM_TO_MPC;
const BODIES = deriveBodyStates(CONST_J2000) as ReadonlyMap<BodyId, BodyState>;
const B = ORIENTATION_FRAMES.ecliptic;

function makeStore() {
  return configureStore({ reducer: rootReducer });
}

const EARTH_ROW: SelectionRow = {
  type: 'body',
  id: 'earth',
  label: 'Earth',
  positionMpc: [0, 0, 0],
  radiusM: 6371000,
};

/** The replay's frame context with the store snapshot taken NOW. */
function ctxOf(
  store: ReturnType<typeof makeStore>,
  overrides: { readonly winnerLastFrame?: DriverId; readonly nowMs?: number } = {},
) {
  return {
    rootState: store.getState(),
    nowMs: overrides.nowMs ?? 0,
    canvasPx: [1000, 1000] as const,
    projection: { fovYRad: Math.PI / 3, aspect: 1, near: 0.01, far: 50000 },
    upBasis: B,
    poseBasis: B,
    bodies: BODIES,
    winnerLastFrame: overrides.winnerLastFrame ?? 'resting',
    autoRotateEpoch: { ref: null, startMs: null },
    tuning: store.getState().camera.tuning,
  };
}

const atRestZoom = (factor: number): InputStep => ({
  kind: 'zoom',
  factor,
  duringGesture: false,
  cursorPx: [500, 500],
});

/** Geocentric range of a body arm, metres — the anchor is the body centre. */
function rangeM(framed: FramedCameraPose): number {
  if (framed.frame === 'absolute') throw new Error('rangeM: not a body arm');
  return Math.hypot(...framed.pose.eyeRelAnchorM);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

describe('replayInput', () => {
  afterEach(() => vi.restoreAllMocks());

  it('mutates nothing', () => {
    // Frozen deep: the strafe's `off[0] + …` and the register itself
    // are where an in-place write would hide, and the module is strict-mode,
    // so such a write throws right here. The world at-rest notch, a followed
    // pan and the gesture edges cover every accumulator field.
    const store = makeStore();
    store.dispatch(setSelectionRow({ slot: 'focus', row: EARTH_ROW }));
    const prev = deepFreeze({
      register: absoluteArm({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: 100 }),
      surface: { ...EMPTY_SURFACE_MEMORY },
      follow: { from: null, distanceTarget: 42, panOffset: [1, 2, 3] as Vec3, saturated: false },
    });
    const steps = deepFreeze<readonly InputStep[]>([
      atRestZoom(1.5),
      { kind: 'gestureStart' },
      { kind: 'drag', mode: 'pan', startPx: [100, 100], endPx: [150, 100] },
      { kind: 'gestureEnd' },
    ]);
    const snapshot = structuredClone({ prev, steps });

    const next = replayInput(prev, steps, ctxOf(store));

    expect({ prev, steps }).toEqual(snapshot);
    expect(next.register).not.toBe(prev.register);
    expect(next.follow).not.toBe(prev.follow);
    expect(next.follow!.panOffset).not.toEqual([1, 2, 3]);
    // The strafe knows nothing about the follow distance.
    expect(next.follow!.distanceTarget).toBe(42);
  });

  it('a step sees the commit dispatched by the step before it', () => {
    // Two at-rest notches in one drain: the second zooms the base the FIRST
    // committed — the effective intent — not the store's stale base, so the
    // distances compound. Then a drag chains from the register the notch wrote.
    const store = makeStore();
    store.dispatch(
      commitCameraPose(absoluteArm({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: 100 })),
    );
    const prev = {
      register: store.getState().camera.base,
      surface: EMPTY_SURFACE_MEMORY,
      follow: null,
    };

    const next = replayInput(
      prev,
      [
        atRestZoom(1.5),
        atRestZoom(1.5),
        { kind: 'gestureStart' },
        { kind: 'drag', mode: 'orbit', startPx: [100, 100], endPx: [150, 100] },
      ],
      ctxOf(store),
    );

    const commits = next.actions.map((a) => worldArmOf(a.payload as FramedCameraPose).distance);
    expect(commits).toEqual([150, 225]);
    // The store never saw either commit — the fold is local.
    expect(worldArmOf(store.getState().camera.base).distance).toBe(100);
    const register = worldArmOf(next.register);
    expect(register.distance).toBe(225);
    expect(register.yaw).toBeCloseTo(-50 * 0.005, 6);
  });

  it('the returned actions are the four dispatch sites, in order', () => {
    // Body arm: an at-rest notch commits itself, a drag folds into the
    // register only, and the release commits the register THEN ends the drag.
    const store = makeStore();
    const arm = earthArm(2);
    store.dispatch(commitCameraPose(arm));
    const body = replayInput(
      { register: arm, surface: EMPTY_SURFACE_MEMORY, follow: null },
      [
        atRestZoom(Math.exp(-0.1)),
        { kind: 'gestureStart' },
        { kind: 'drag', mode: 'orbit', startPx: [100, 100], endPx: [400, 100] },
        { kind: 'gestureEnd' },
      ],
      ctxOf(store),
    );
    expect(body.actions.map((a) => a.type)).toEqual([
      'camera/commitCameraPose',
      'camera/commitCameraPose',
      'camera/endDrag',
    ]);
    expect(body.actions[0]!.payload).not.toBe(arm);
    expect(body.actions[1]!.payload).toBe(body.register);
    expect(body.surface.gesture).toBe(null);

    // The follow roll ride: the notch is resolved to a distance for the driver
    // to adopt and its commit carries only the ridden roll.
    const followStore = makeStore();
    const earth = BODIES.get('earth')!;
    const nearEarth = absoluteArm({
      target: [...earth.positionMpc] as Vec3,
      yaw: 0.7,
      pitch: 0.3,
      distance: 2.5 * EARTH_RADIUS_MPC,
      roll: 1.4,
    });
    followStore.dispatch(commitCameraPose(nearEarth));
    followStore.dispatch(setSelectionRow({ slot: 'focus', row: EARTH_ROW }));
    const follow = {
      from: null,
      distanceTarget: 2.5 * EARTH_RADIUS_MPC,
      panOffset: [0, 0, 0] as Vec3,
      saturated: false,
    };
    const ride = replayInput(
      { register: nearEarth, surface: EMPTY_SURFACE_MEMORY, follow },
      [atRestZoom(Math.exp(0.1))],
      ctxOf(followStore, { winnerLastFrame: 'followHold' }),
    );
    expect(ride.actions.map((a) => a.type)).toEqual(['camera/commitCameraPose']);
    const committed = worldArmOf(ride.actions[0]!.payload as FramedCameraPose);
    expect(committed.distance).toBe(2.5 * EARTH_RADIUS_MPC);
    // Stepped toward the pole, never past the 0.1 cap.
    const moved = Math.abs((committed.roll ?? 0) - 1.4);
    expect(moved).toBeGreaterThan(0.01);
    expect(moved).toBeLessThanOrEqual(0.1 + 1e-12);
    expect(ride.followDistanceTarget!).toBeGreaterThan(2.5 * EARTH_RADIUS_MPC);
    expect(ride.follow).toBe(follow);
    expect(ride.register).toBe(nearEarth);
  });

  it('a declined step emits no action', () => {
    // The at-rest body notch's commit is gated on IDENTITY: a step that
    // declines hands its input back by reference, and an equality gate would
    // still commit a value-equal copy. No production zoom declines today, so
    // the decline is staged on the step itself.
    const store = makeStore();
    const arm = earthArm(2);
    store.dispatch(commitCameraPose(arm));
    vi.spyOn(surfaceStepModule, 'surfaceStep').mockImplementation((prev, pose) => ({
      pose,
      next: prev,
    }));

    const next = replayInput(
      { register: arm, surface: EMPTY_SURFACE_MEMORY, follow: null },
      [atRestZoom(Math.exp(-0.1))],
      ctxOf(store),
    );

    expect(next.actions).toEqual([]);
    expect(next.register.pose).toBe(arm.pose);
  });

  it('carries the notch’s cursor pixel to the body arm’s zoom anchor', () => {
    // Without the step's own pixel the zoom anchors at screen centre — a
    // different point ~500 km away that does not fit the scaling law.
    const store = makeStore();
    const arm = earthArm(2);
    store.dispatch(commitCameraPose(arm));
    if (arm.frame === 'absolute') throw new Error('fixture: not a body arm');
    const radiusM = SCENE_BODIES.find((b) => b.id === 'earth')!.radiusM;
    const anchorFor = (px: Vec2): Vec3 => {
      const ray = cursorRayBodyLocal(arm.pose, px, [1000, 1000], Math.PI / 3);
      const t = raySphereRoots(ray.originM, ray.dir, [0, 0, 0], radiusM)![0];
      return [
        ray.originM[0] + ray.dir[0] * t,
        ray.originM[1] + ray.dir[1] * t,
        ray.originM[2] + ray.dir[2] * t,
      ];
    };
    // Which anchor the tick used, read off the range it scaled: the step takes
    // `|eye − A|` to `f·|eye − A|`, and the approach's north-up rotation is
    // about an axis through A, so that distance survives it exactly.
    const rangeTo = (a: Vec3, e: Readonly<Vec3>): number =>
      Math.hypot(e[0] - a[0], e[1] - a[1], e[2] - a[2]);
    const eyeM = arm.pose.eyeRelAnchorM;
    const f = Math.exp(-0.1);

    const next = replayInput(
      { register: arm, surface: EMPTY_SURFACE_MEMORY, follow: null },
      [{ kind: 'zoom', factor: f, duringGesture: false, cursorPx: [700, 500] }],
      ctxOf(store),
    );

    const committed = next.actions[0]!.payload as FramedCameraPose;
    if (committed.frame === 'absolute') throw new Error('the arm flipped');
    const got = committed.pose.eyeRelAnchorM;
    const cursorAnchor = anchorFor([700, 500]);
    expect(rangeTo(cursorAnchor, got)).toBeCloseTo(f * rangeTo(cursorAnchor, eyeM), 3);
    const centreAnchor = anchorFor([500, 500]);
    expect(rangeTo(centreAnchor, cursorAnchor)).toBeGreaterThan(100_000);
    expect(Math.abs(rangeTo(centreAnchor, got) - f * rangeTo(centreAnchor, eyeM))).toBeGreaterThan(
      1000,
    );
  });

  it('latches a body-arm gesture against the register, not a stale base', () => {
    // Mid-fly-to `base` still holds the last crossing pose while the register
    // tracks the tween; a gesture latched against `base` would take its mode,
    // anchor and frozen pan radius from an altitude the user never saw. The
    // centre pixel hits the body from either pose, so both latch `pan` (a
    // rotation about the centre) and the range fingerprints which pose the
    // drag was applied to.
    const store = makeStore();
    const stale = earthArm(5);
    const onScreen = earthArm(1.5);
    store.dispatch(commitCameraPose(stale));

    const next = replayInput(
      { register: onScreen, surface: EMPTY_SURFACE_MEMORY, follow: null },
      [
        { kind: 'gestureStart' },
        { kind: 'drag', mode: 'orbit', startPx: [500, 500], endPx: [560, 500] },
      ],
      ctxOf(store),
    );

    const folded = rangeM(next.register);
    expect(folded / rangeM(onScreen)).toBeCloseTo(1, 9);
    expect(folded / rangeM(stale)).toBeLessThan(0.5);
  });

  it('discards every move while a clip owns the camera, in both arms', () => {
    // The clip row re-wins at pointerup and bakes its own final pose at its
    // commit-on-edge; only the gesture boundary reaches the store.
    const store = makeStore();
    const arm = earthArm(2);
    store.dispatch(commitCameraPose(arm));
    store.dispatch(
      clipStarted({
        data: { start: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1 }, timeline: [] },
        frame: 'ecliptic',
      }),
    );

    const next = replayInput(
      { register: arm, surface: EMPTY_SURFACE_MEMORY, follow: null },
      [
        { kind: 'gestureStart' },
        { kind: 'drag', mode: 'orbit', startPx: [500, 500], endPx: [560, 500] },
        atRestZoom(Math.exp(0.24)),
        { kind: 'gestureEnd' },
      ],
      ctxOf(store),
    );

    expect(next.actions.map((a) => a.type)).toEqual(['camera/endDrag']);
    expect(next.register).toBe(arm);
  });

  it('a notch after auto-rotate switched off between frames folds no stale spin', () => {
    // `winnerLastFrame` still reads 'autoRotate' and the epoch still holds
    // last frame's start, but the spin is OFF: the wheel must fold the spin as
    // THIS frame's advance will see it (elapsed 0), or the committed yaw jumps
    // by a spin nobody renders.
    const store = makeStore();
    store.dispatch(setAutoRotate({ active: false, rate: 0.01 }));
    const base = store.getState().camera.base;
    const yawBefore = worldArmOf(base).yaw;

    const next = replayInput(
      { register: base, surface: EMPTY_SURFACE_MEMORY, follow: null },
      [atRestZoom(Math.exp(0.1))],
      {
        ...ctxOf(store, { winnerLastFrame: 'autoRotate', nowMs: 500 }),
        autoRotateEpoch: { ref: base, startMs: 0 },
      },
    );

    expect(worldArmOf(next.actions[0]!.payload as FramedCameraPose).yaw).toBe(yawBefore);
  });

  it('folds a followed-body pan into the strafe offset; an orbit leaves it alone', () => {
    // While a MOVING body is followed the pivot-pin owns the target, so the
    // pan's own delta lands on the follow offset — exactly the image-plane
    // translation of the drag, no body motion mixed in — and an orbit step's
    // angular delta never touches it.
    const store = makeStore();
    store.dispatch(setSelectionRow({ slot: 'focus', row: EARTH_ROW }));
    const prev = {
      register: absoluteArm({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: 100 }),
      surface: EMPTY_SURFACE_MEMORY,
      follow: null,
    };

    const orbited = replayInput(
      prev,
      [
        { kind: 'gestureStart' },
        { kind: 'drag', mode: 'orbit', startPx: [100, 100], endPx: [150, 100] },
      ],
      ctxOf(store),
    );
    expect(orbited.follow).toBeNull();

    const panned = replayInput(
      { ...prev, register: orbited.register },
      [{ kind: 'drag', mode: 'pan', startPx: [100, 100], endPx: [150, 100] }],
      ctxOf(store),
    );
    // 50 px at the image plane: 2 · distance · tan(fov/2) / cssHeight per px.
    const pxToWorld = (2 * 100 * Math.tan(Math.PI / 6)) / 1000;
    expect(Math.hypot(...panned.follow!.panOffset)).toBeCloseTo(50 * pxToWorld, 9);
  });

  it('a drag in the same drain as an at-rest body-arm notch chains from the notch', () => {
    // The body-arm twin of the world case above: a `[wheel, gestureStart,
    // drag]` drain (routine in a 33-50 ms frame window) must fold the drag
    // from the POST-notch register, or the gesture-end commit overwrites the
    // notch. The drag is a pan (range-preserving), so the register keeps the
    // notch's range iff it chained: altitude ×e^0.24 → range (1+2·1.271)/3 ≈ 1.18.
    const store = makeStore();
    const arm = earthArm(3);
    store.dispatch(commitCameraPose(arm));

    const next = replayInput(
      { register: arm, surface: EMPTY_SURFACE_MEMORY, follow: null },
      [
        atRestZoom(Math.exp(0.24)),
        { kind: 'gestureStart' },
        { kind: 'drag', mode: 'orbit', startPx: [500, 500], endPx: [520, 500] },
      ],
      ctxOf(store),
    );

    expect(rangeM(next.register) / rangeM(arm)).toBeGreaterThan(1.15);
  });

  it('an at-rest notch inside a body’s band walks the committed roll toward its frame', () => {
    // Ruling 8: the scene-frame → body-frame transition is a blend over the
    // altitude band, ridden by the wheel. h/R 0.35 sits near the band's
    // scene-up end (weight ≈ 0.097), so the step is strictly UNDER the 0.1
    // cap — pinning either weight extreme would saturate it instead.
    const store = makeStore();
    const earth = BODIES.get('earth')!;
    const nearEarth = absoluteArm({
      target: [...earth.positionMpc] as Vec3,
      yaw: 0.7,
      pitch: 0.3,
      distance: 1.35 * EARTH_RADIUS_MPC,
      roll: 1.4,
    });
    store.dispatch(commitCameraPose(nearEarth));

    const next = replayInput(
      { register: nearEarth, surface: EMPTY_SURFACE_MEMORY, follow: null },
      [atRestZoom(Math.exp(0.1))],
      ctxOf(store),
    );

    const moved = Math.abs(
      (worldArmOf(next.actions[0]!.payload as FramedCameraPose).roll ?? 0) - 1.4,
    );
    expect(moved).toBeGreaterThan(0.01);
    expect(moved).toBeLessThan(0.09);
  });

  it('routes the notch to the base while follow holds no captured target yet', () => {
    // A follow row won last frame but captured no distance (first frame after
    // the focus-edge drop): the notch takes the plain base-commit path rather
    // than resolving against a target the driver never captured.
    const store = makeStore();
    const base = store.getState().camera.base;

    const next = replayInput(
      { register: base, surface: EMPTY_SURFACE_MEMORY, follow: null },
      [atRestZoom(Math.exp(0.1))],
      ctxOf(store, { winnerLastFrame: 'followHold' }),
    );

    expect(next.followDistanceTarget).toBeNull();
    expect(worldArmOf(next.actions[0]!.payload as FramedCameraPose).distance).toBeGreaterThan(
      worldArmOf(base).distance,
    );
  });

  it('floors a swallowed notch at the focused body’s surface', () => {
    // The notch the follow driver adopts is resolved HERE, so the focused
    // pivot has to reach that resolution or the wheel walks the driver's
    // target inside the planet (the absolute floor is 0.048 Earth radii).
    const store = makeStore();
    const earth = BODIES.get('earth')!;
    const nearEarth = absoluteArm({
      target: [...earth.positionMpc] as Vec3,
      yaw: 0.7,
      pitch: 0.3,
      distance: 4 * EARTH_RADIUS_MPC,
    });
    store.dispatch(commitCameraPose(nearEarth));
    store.dispatch(setSelectionRow({ slot: 'focus', row: EARTH_ROW }));
    const follow = {
      from: null,
      distanceTarget: 4 * EARTH_RADIUS_MPC,
      panOffset: [0, 0, 0] as Vec3,
      saturated: false,
    };

    // A dive steep enough to blow through the surface in one notch.
    const next = replayInput(
      { register: nearEarth, surface: EMPTY_SURFACE_MEMORY, follow },
      [atRestZoom(Math.exp(-10))],
      ctxOf(store, { winnerLastFrame: 'followHold' }),
    );

    const radii = next.followDistanceTarget! / EARTH_RADIUS_MPC;
    expect(radii).toBeGreaterThan(1);
    expect(radii).toBeLessThan(1.05);
  });

  it('a FOCUSED zoom-out rides the roll back to the scene up (the default path)', () => {
    // Earth focused, the follow row owns the wheel: the notch's authored altitude
    // change IS the `distanceTarget` change, so the ride must run across it —
    // identical pre/post poses would zero the delta and leave the in-band
    // roll frozen once the eased altitude left the band. `runFrame`'s
    // adoption played by hand: the actions go to the store, the driver takes
    // the resolved distance into its memory, the register renders at the
    // target distance carrying `base.roll` (the saturated follow ease).
    const store = makeStore();
    const earth = BODIES.get('earth')!;
    const poseAt = (distMpc: number, roll: number) =>
      absoluteArm({
        target: [...earth.positionMpc] as Vec3,
        yaw: 0.7,
        pitch: 0.3,
        distance: distMpc,
        roll,
      });
    store.dispatch(setSelectionRow({ slot: 'focus', row: EARTH_ROW }));
    // Half an engage-edge down, so the in-band roll is fully authored (w = 1)
    // before the recession starts, wherever ruling 19's band is tuned to.
    const startHR = DEFAULT_CAMERA_TUNING.engageHR * 0.5;
    const startDist = EARTH_RADIUS_MPC * (1 + startHR);
    store.dispatch(commitCameraPose(poseAt(startDist, -0.26)));
    const rollOfBase = (): number => worldArmOf(store.getState().camera.base).roll ?? 0;

    let target = startDist;
    let register = poseAt(startDist, -0.26);
    const notch = (deltaY: number, nowMs: number): void => {
      const next = replayInput(
        {
          register,
          surface: EMPTY_SURFACE_MEMORY,
          follow: { from: null, distanceTarget: target, panOffset: [0, 0, 0], saturated: false },
        },
        [atRestZoom(Math.exp(deltaY * 0.001))],
        ctxOf(store, { winnerLastFrame: 'followHold', nowMs }),
      );
      for (const action of next.actions) store.dispatch(action);
      target = next.followDistanceTarget!;
      register = poseAt(target, rollOfBase());
    };
    // Converge the roll onto the ride's own fixed point first, so the
    // recession isolates the RIDE. The settle spends only what the zoom spends
    // (ruling 2026-09-10), so the pre-converge is a DITHER at one altitude
    // rather than a run of factor-1 notches.
    for (let i = 0; i < 60; i += 1) {
      notch(30, 2 * i);
      notch(-30, 2 * i + 1);
    }
    expect(Math.abs(rollOfBase())).toBeGreaterThan(0.05); // in-band target held

    // Ride clear of disengage — a quarter-band of overshoot, and a guard sized
    // to that ride's length in e^0.1 altitude notches so a wider band still
    // completes it rather than timing out mid-blend.
    const rideToHR = DEFAULT_CAMERA_TUNING.disengageHR * 1.25;
    const guardMax = Math.ceil(Math.log(rideToHR / startHR) / 0.1) + 4;
    let guard = 0;
    while (target / EARTH_RADIUS_MPC - 1 < rideToHR && guard < guardMax) {
      notch(100, 1000 + guard);
      guard += 1;
    }

    // Above the band the scene frame owns the view again — no frozen residual
    // (a dead ride would leave 5e-2 here, and the real-pacing case the whole
    // band roll).
    expect(Math.abs(rollOfBase())).toBeLessThan(1e-4);
  });

  it('a gesture-held zoom rides the roll too — every driven zoom path', () => {
    const store = makeStore();
    const earth = BODIES.get('earth')!;
    const inBand = absoluteArm({
      target: [...earth.positionMpc] as Vec3,
      yaw: 0.7,
      pitch: 0.3,
      distance: 2.5 * EARTH_RADIUS_MPC,
      roll: 1.0,
    });
    store.dispatch(commitCameraPose(inBand));

    const next = replayInput(
      { register: inBand, surface: EMPTY_SURFACE_MEMORY, follow: null },
      [
        { kind: 'gestureStart' },
        { kind: 'zoom', factor: Math.exp(0.1), duringGesture: true, cursorPx: [500, 500] },
      ],
      ctxOf(store),
    );

    expect(Math.abs((worldArmOf(next.register).roll ?? 0) - 1.0)).toBeGreaterThan(0.01);
  });

  it('floors an in-gesture zoom at the focused body’s surface', () => {
    // A pinch spread far enough to blow through the surface in one step.
    const store = makeStore();
    store.dispatch(setSelectionRow({ slot: 'focus', row: EARTH_ROW }));

    const next = replayInput(
      {
        register: absoluteArm({
          target: [0, 0, 0],
          yaw: 0,
          pitch: 0,
          distance: 4 * EARTH_RADIUS_MPC,
        }),
        surface: EMPTY_SURFACE_MEMORY,
        follow: null,
      },
      [
        { kind: 'gestureStart' },
        { kind: 'zoom', factor: 1e-6, duringGesture: true, cursorPx: null },
      ],
      ctxOf(store),
    );

    const radii = worldArmOf(next.register).distance / EARTH_RADIUS_MPC;
    expect(radii).toBeGreaterThan(1);
    expect(radii).toBeLessThan(1.05);
  });
});
