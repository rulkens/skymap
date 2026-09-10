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
import { commitCameraPose } from '../../../../src/state/camera/cameraSlice';
import { setSelectionRow } from '../../../../src/state/selectionRows/selectionRowsSlice';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { earthArm } from '../../../fixtures/earthArm';
import { worldArmOf } from '../../../fixtures/worldArmOf';
import type { BodyId } from '../../../../src/@types/data/body/BodyId';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import type { FramedCameraPose } from '../../../../src/@types/camera/FramedCameraPose';
import type { InputStep } from '../../../../src/@types/camera/InputStep';
import type { SelectionRow } from '../../../../src/@types/engine/SelectionRow';
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
  overrides: { readonly winnerLastFrame?: string; readonly nowMs?: number } = {},
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
  };
}

const atRestZoom = (factor: number): InputStep => ({
  kind: 'zoom',
  factor,
  duringGesture: false,
  cursorPx: [500, 500],
});

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
    // Frozen deep: the strafe's `off[0] + …` and the register's `.current`
    // are where an in-place write would hide, and the module is strict-mode,
    // so such a write throws right here. The world at-rest notch, a followed
    // pan and the gesture edges cover every accumulator field.
    const store = makeStore();
    store.dispatch(setSelectionRow({ slot: 'focus', row: EARTH_ROW }));
    const prev = deepFreeze({
      register: absoluteArm({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: 100 }),
      surface: { ...EMPTY_SURFACE_MEMORY },
      follow: { from: null, distanceTarget: 42, panOffset: [1, 2, 3] as Vec3 },
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
    expect(body.surface.pointerDown).toBe(false);

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
    };
    const ride = replayInput(
      { register: nearEarth, surface: EMPTY_SURFACE_MEMORY, follow },
      [atRestZoom(Math.exp(0.1))],
      ctxOf(followStore, { winnerLastFrame: 'followBody' }),
    );
    expect(ride.actions.map((a) => a.type)).toEqual(['camera/commitCameraPose']);
    const committed = worldArmOf(ride.actions[0]!.payload as FramedCameraPose);
    expect(committed.distance).toBe(2.5 * EARTH_RADIUS_MPC);
    expect(committed.roll).not.toBe(1.4);
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
});
