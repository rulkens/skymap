/**
 * cameraDrivers — unit tests for the store-reading driver table and resolver.
 *
 * The five drivers read directly from the Redux store; the resolver picks the
 * highest-priority active one and calls its `pose`. Tests cover:
 *
 *   - Each driver's `isActive` reads the right slice field.
 *   - Each driver's `pose` produces the correct result (evaluateClip via
 *     tweenToClip for tween, spinAutoRotate, s.camera.base, or poseOf(cam)).
 *   - `pickWinner` selects by priority, not list order (incl. clip > orbitDrag).
 *   - `pickWinner` and `activeDriverId` always agree (invariant 1).
 *   - `runCameraDrivers` passes the winner's elapsed (tween/autoRotate use
 *     the clock in ms; clip uses the clock in seconds; orbitDrag/resting use 0).
 *
 * Fixtures use a real `RootState` built via `configureStore({ reducer:
 * rootReducer })` so the shape is always in sync with the actual slices.
 */

import { describe, it, expect, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

import { easeOutCubic } from '../../../../src/utils/math/easeOutCubic';
import { relErr } from '../../../support/relErr';

import type { CameraDriver } from '../../../../src/@types/engine/camera/CameraDriver';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { RootState } from '../../../../src/store/types';
import {
  buildCameraDrivers,
  pickWinner,
  runCameraDrivers,
} from '../../../../src/services/engine/camera/cameraDrivers';
import { activeDriverId } from '../../../../src/services/engine/camera/activeDriverId';
import { poseOf } from '../../../../src/services/engine/camera/poseOf';
import { evaluateClip } from '../../../../src/services/engine/camera/evaluateClip';
import { tweenToClip } from '../../../../src/services/engine/camera/tweenToClip';
import { spinAutoRotate } from '../../../../src/services/engine/camera/spinAutoRotate';
import { createCameraClock } from '../../../../src/services/engine/camera/cameraClock';
import { bodyLikeFraming } from '../../../../src/services/engine/camera/bodyLikeFraming';
import { shouldKeepTicking } from '../../../../src/services/engine/helpers/shouldKeepTicking';
import { distanceMpc } from '../../../../src/utils/math/distanceMpc';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { setSelectionRow } from '../../../../src/state/selectionRows/selectionRowsSlice';
import { setGlideTuning } from '../../../../src/state/settings/settingsSlice';
import { rootReducer } from '../../../../src/store/rootReducer';
import {
  beginDrag,
  endDrag,
  startCameraTween,
  cancelCameraTween,
  setAutoRotate,
  commitCameraPose,
  clipStarted,
} from '../../../../src/state/camera/cameraSlice';
import type { CameraTweenDescriptor } from '../../../../src/@types/camera/CameraTweenDescriptor';
import type { ClipData } from '../../../../src/@types/animation/ClipData';
import { DEFAULT_FOV_Y_RAD } from '../../../../src/services/engine/camera/cameraFraming';

/** A real-ish store so we can observe dispatches. */
function makeStore() {
  return configureStore({ reducer: rootReducer });
}

const BASE_POSE: CameraPose = { target: [0, 0, 0], yaw: 1.5, pitch: 0.1, distance: 100 };

const TWEEN_DESC: CameraTweenDescriptor = {
  from: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 50 },
  to: { target: [1, 2, 3], yaw: 2, pitch: 0.2, distance: 10 },
  durationMs: 1000,
  easing: 'easeOutCubic',
};

const CAM_STUB: OrbitCamera = {
  target: [5, 5, 5],
  yaw: 0.7,
  pitch: -0.1,
  distance: 200,
  position: new Float32Array([0, 0, 200]),
  fovYRad: 1,
  aspect: 1,
  near: 0.01,
  far: 50000,
} as unknown as OrbitCamera;

// `clip` and `tween` pose now read `cameraRuntime.projection.fovYRad` (Task 4)
// alongside `followBody`'s existing read — the stub needs it wherever a test
// invokes a real `pose()`, not just `isActive`/`pickWinner`.
const FAKE_ENGINE_STATE = {
  cameraRuntime: { projection: { fovYRad: DEFAULT_FOV_Y_RAD } },
} as unknown as EngineState;

// Minimal ClipData fixture — no effects, just the required timeline field.
// The clip row only needs `data` to be a non-null object for isActive; the
// actual evaluateClip call is not exercised in these structural tests.
const CLIP_DATA: ClipData = { timeline: [] };

// ── isActive: store-reading predicates ─────────────────────────────────────

describe('buildCameraDrivers — isActive reads the store', () => {
  const drivers = buildCameraDrivers(FAKE_ENGINE_STATE);
  function byId(id: string): CameraDriver {
    return drivers.find((d) => d.id === id)!;
  }

  it('orbitDrag.isActive ⇔ s.camera.dragging', () => {
    const store = makeStore();
    expect(byId('orbitDrag').isActive(store.getState() as unknown as RootState)).toBe(false);
    store.dispatch(beginDrag());
    expect(byId('orbitDrag').isActive(store.getState() as unknown as RootState)).toBe(true);
    store.dispatch(endDrag());
    expect(byId('orbitDrag').isActive(store.getState() as unknown as RootState)).toBe(false);
  });

  it('tween.isActive ⇔ s.camera.tween !== null', () => {
    const store = makeStore();
    expect(byId('tween').isActive(store.getState() as unknown as RootState)).toBe(false);
    store.dispatch(startCameraTween(TWEEN_DESC));
    expect(byId('tween').isActive(store.getState() as unknown as RootState)).toBe(true);
    store.dispatch(cancelCameraTween());
    expect(byId('tween').isActive(store.getState() as unknown as RootState)).toBe(false);
  });

  it('autoRotate.isActive ⇔ s.camera.autoRotate.active', () => {
    const store = makeStore();
    // Default is DEFAULT_AUTO_ROTATE from cameraSlice initial state.
    const defaultActive = (store.getState() as unknown as RootState).camera.autoRotate.active;
    expect(byId('autoRotate').isActive(store.getState() as unknown as RootState)).toBe(
      defaultActive,
    );
    store.dispatch(setAutoRotate({ active: !defaultActive, rate: 0.000873 }));
    expect(byId('autoRotate').isActive(store.getState() as unknown as RootState)).toBe(
      !defaultActive,
    );
  });

  it('clip.isActive ⇔ s.camera.clip !== null', () => {
    const store = makeStore();
    expect(byId('clip').isActive(store.getState() as unknown as RootState)).toBe(false);
    store.dispatch(clipStarted(CLIP_DATA));
    expect(byId('clip').isActive(store.getState() as unknown as RootState)).toBe(true);
  });

  it('resting.isActive() is always true', () => {
    const store = makeStore();
    expect(byId('resting').isActive(store.getState() as unknown as RootState)).toBe(true);
  });
});

// ── pose: correct outputs ───────────────────────────────────────────────────

describe('buildCameraDrivers — pose functions', () => {
  const drivers = buildCameraDrivers(FAKE_ENGINE_STATE);
  function byId(id: string): CameraDriver {
    return drivers.find((d) => d.id === id)!;
  }

  it('orbitDrag.pose returns poseOf(cam)', () => {
    const s = {} as RootState;
    const result = byId('orbitDrag').pose(s, CAM_STUB, 0);
    expect(result).toEqual(poseOf(CAM_STUB));
  });

  it('tween.pose returns evaluateClip(tweenToClip(descriptor), elapsed / 1000)', () => {
    // The tween driver routes through evaluateClip via tweenToClip — the
    // single camera-evaluation path after the Task-1 fold.
    const store = makeStore();
    store.dispatch(startCameraTween(TWEEN_DESC));
    const s = store.getState() as unknown as RootState;
    const elapsedMs = 300;
    const result = byId('tween').pose(s, CAM_STUB, elapsedMs);
    expect(result).toEqual(
      evaluateClip(tweenToClip(TWEEN_DESC), elapsedMs / 1000, undefined, DEFAULT_FOV_Y_RAD),
    );
  });

  it('tween row converts ms→sec correctly', () => {
    // Oracle independent of evaluateClip / tweenToClip / glidePath.
    //
    // The descriptor is a PURE ZOOM (target unchanged), so it walks the
    // geodesic's degenerate branch: w(s) = w₀·exp(±ρs) over an arc of length
    // |ln(w₁/w₀)|/ρ, hence w at arc fraction f is w₀·(w₁/w₀)^f — ρ cancels.
    // `w` is proportional to distance at a fixed FOV, so
    //   distance(f) = d₀·(d₁/d₀)^f
    // and the ease reparametrises the arc, so f = easeOutCubic(0.5) = 0.875:
    //   10·(1000/10)^0.875 = 10·10^1.75 ≈ 562.34
    // (at f = 0.5 the same form gives √(d₀·d₁) = 100 — a pure-zoom geodesic is
    // a straight line in log distance.)
    //
    // Derivation of f:
    //   durationMs = 1000 ms → duration = 1 s
    //   elapsedMs  = 500  ms → elapsedSec = 0.5 s → t = 0.5
    //   easeOutCubic(0.5) = 1 - (1-0.5)^3 = 0.875
    //
    // A forgotten /1000 would pass 500 s to a 1 s clip → saturated to `to`
    // (distance == 1000); the bounds below reject that.
    const UNIT_SLIP_DESC: CameraTweenDescriptor = {
      from: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 10 },
      to: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1000 },
      durationMs: 1000,
      easing: 'easeOutCubic',
    };

    const store = makeStore();
    store.dispatch(startCameraTween(UNIT_SLIP_DESC));
    const s = store.getState() as unknown as RootState;

    const elapsedMs = 500;
    const result = byId('tween').pose(s, CAM_STUB, elapsedMs);

    const expectedDistance = 10 * (1000 / 10) ** easeOutCubic(0.5);
    expect(result.distance).toBeCloseTo(expectedDistance, 5);

    // Slip-catching bounds: a forgotten /1000 saturates to 1000; these reject that.
    expect(result.distance).toBeGreaterThan(10);
    expect(result.distance).toBeLessThan(1000);
  });

  it('autoRotate.pose returns spinAutoRotate(base, rate, elapsed)', () => {
    const store = makeStore();
    store.dispatch(commitCameraPose(BASE_POSE));
    store.dispatch(setAutoRotate({ active: true, rate: 0.000873 }));
    const s = store.getState() as unknown as RootState;
    const elapsed = 500;
    const result = byId('autoRotate').pose(s, CAM_STUB, elapsed);
    expect(result).toEqual(spinAutoRotate(BASE_POSE, 0.000873, elapsed));
  });

  it('resting.pose returns s.camera.base', () => {
    const store = makeStore();
    store.dispatch(commitCameraPose(BASE_POSE));
    const s = store.getState() as unknown as RootState;
    const result = byId('resting').pose(s, CAM_STUB, 0);
    expect(result).toEqual(BASE_POSE);
  });
});

// ── pickWinner ──────────────────────────────────────────────────────────────

describe('pickWinner', () => {
  function makeDriver(id: string, priority: number, active: boolean): CameraDriver {
    return {
      id,
      priority,
      isActive: vi.fn<(s: RootState) => boolean>(() => active),
      pose: vi.fn<(s: RootState, cam: OrbitCamera, e: number) => CameraPose>(() => ({
        target: [0, 0, 0],
        yaw: 0,
        pitch: 0,
        distance: 1,
      })),
    };
  }

  const fakeState = {} as RootState;

  it('picks by priority, not list order', () => {
    const low = makeDriver('low', 20, true);
    const high = makeDriver('high', 60, true);

    expect(pickWinner([low, high], fakeState).id).toBe('high');
    expect(pickWinner([high, low], fakeState).id).toBe('high');
  });

  it('skips inactive drivers', () => {
    const inactive = makeDriver('inactive', 80, false);
    const active = makeDriver('active', 20, true);
    expect(pickWinner([inactive, active], fakeState).id).toBe('active');
  });

  it('defensive: returns drivers[0] for an empty-ish all-inactive list', () => {
    const only = makeDriver('only', 0, false);
    // All inactive → defensive fallback → drivers[0]
    expect(pickWinner([only], fakeState)).toBe(only);
  });

  it('clip (95) beats orbitDrag (80) when both are active', () => {
    // A real store with both camera.clip set and camera.dragging true:
    // clip@95 outranks orbitDrag@80.
    const store = makeStore();
    store.dispatch(beginDrag());
    store.dispatch(clipStarted(CLIP_DATA));
    const s = store.getState() as unknown as RootState;
    const drivers = buildCameraDrivers(FAKE_ENGINE_STATE);
    expect(pickWinner(drivers, s).id).toBe('clip');
  });
});

// ── pickWinner === activeDriverId (invariant 1) ─────────────────────────────

describe('pickWinner / activeDriverId invariant', () => {
  it('pickWinner.id === activeDriverId (same scan, same result)', () => {
    const store = makeStore();
    store.dispatch(startCameraTween(TWEEN_DESC)); // tween active
    const s = store.getState() as unknown as RootState;
    const drivers = buildCameraDrivers(FAKE_ENGINE_STATE);
    expect(pickWinner(drivers, s).id).toBe(activeDriverId(drivers, s));
  });

  it('agrees for all driver states: orbitDrag wins when dragging', () => {
    const store = makeStore();
    store.dispatch(startCameraTween(TWEEN_DESC));
    store.dispatch(beginDrag()); // orbitDrag priority 80 outranks tween 60
    const s = store.getState() as unknown as RootState;
    const drivers = buildCameraDrivers(FAKE_ENGINE_STATE);
    expect(pickWinner(drivers, s).id).toBe('orbitDrag');
    expect(activeDriverId(drivers, s)).toBe('orbitDrag');
  });
});

// ── runCameraDrivers: clock elapsed dispatch ────────────────────────────────

describe('runCameraDrivers — elapsed dispatch', () => {
  it('passes tween elapsed to the tween driver pose', () => {
    // The tween driver evaluates via evaluateClip(tweenToClip(desc), elapsedSec).
    // Verify runCameraDrivers passes the right elapsed and the result matches.
    const store = makeStore();
    store.dispatch(startCameraTween(TWEEN_DESC));
    const s = store.getState() as unknown as RootState;
    const drivers = buildCameraDrivers(FAKE_ENGINE_STATE);
    const clock = createCameraClock();
    const nowMs = 500;

    // First call — tween starts here, elapsed = 0 on first frame.
    const pose0 = runCameraDrivers(drivers, s, CAM_STUB, clock, nowMs);
    // tween wins; elapsedMs == 0 on first-ever call for a fresh descriptor.
    expect(pose0).toEqual(evaluateClip(tweenToClip(TWEEN_DESC), 0, undefined, DEFAULT_FOV_Y_RAD));

    // Second call at nowMs + 200 — same descriptor reference, elapsedMs = 200.
    const pose200 = runCameraDrivers(drivers, s, CAM_STUB, clock, nowMs + 200);
    expect(pose200).toEqual(
      evaluateClip(tweenToClip(TWEEN_DESC), 200 / 1000, undefined, DEFAULT_FOV_Y_RAD),
    );
  });

  it('passes 0 elapsed to orbitDrag (pose does not use elapsed)', () => {
    const store = makeStore();
    store.dispatch(beginDrag());
    const s = store.getState() as unknown as RootState;
    const drivers = buildCameraDrivers(FAKE_ENGINE_STATE);
    const clock = createCameraClock();

    const poseSpy = vi.fn<(s: RootState, cam: OrbitCamera, e: number) => CameraPose>(() =>
      poseOf(CAM_STUB),
    );
    // Replace just the orbitDrag driver's pose fn to capture elapsed.
    const patchedDrivers = drivers.map((d) => (d.id === 'orbitDrag' ? { ...d, pose: poseSpy } : d));

    runCameraDrivers(patchedDrivers, s, CAM_STUB, clock, 9999);
    expect(poseSpy).toHaveBeenCalledWith(s, CAM_STUB, 0);
  });

  it('passes 0 elapsed to resting (pose does not use elapsed)', () => {
    const store = makeStore();
    const s = store.getState() as unknown as RootState; // default: not dragging, no tween, autoRotate default
    const drivers = buildCameraDrivers(FAKE_ENGINE_STATE);
    const clock = createCameraClock();

    // Force resting to win by ensuring default state has autoRotate inactive.
    // (DEFAULT_AUTO_ROTATE is false, so resting wins by default.)
    const poseSpy = vi.fn<(s: RootState, cam: OrbitCamera, e: number) => CameraPose>(
      () => s.camera.base,
    );
    const patchedDrivers = drivers.map((d) => (d.id === 'resting' ? { ...d, pose: poseSpy } : d));

    runCameraDrivers(patchedDrivers, s, CAM_STUB, clock, 9999);
    // resting wins when nothing else is active; elapsed must be 0.
    if (poseSpy.mock.calls.length > 0) {
      expect(poseSpy.mock.calls[0]![2]).toBe(0);
    }
  });

  it('passes elapsed in SECONDS to the clip driver via runCameraDrivers', () => {
    // elapsedForWinner is module-private; drive the assertion through
    // runCameraDrivers + a spy on the clip row's pose, mirroring how the
    // orbitDrag-elapsed test is done above.
    const store = makeStore();
    store.dispatch(setAutoRotate({ active: false, rate: 0.001 }));
    store.dispatch(clipStarted(CLIP_DATA));
    const s = store.getState() as unknown as RootState;
    const drivers = buildCameraDrivers(FAKE_ENGINE_STATE);
    const clock = createCameraClock();
    const installMs = 1000;

    // First call — clip installs at installMs, elapsed = 0 s on the first frame.
    runCameraDrivers(drivers, s, CAM_STUB, clock, installMs);

    // Spy-patch the clip pose to capture the elapsed value passed in.
    const poseSpy = vi.fn<(s: RootState, cam: OrbitCamera, e: number) => CameraPose>(
      () => s.camera.base,
    );
    const patchedDrivers = drivers.map((d) => (d.id === 'clip' ? { ...d, pose: poseSpy } : d));

    // Second call 1500 ms later — clip still active (same reference).
    // clipElapsed returns (nowMs - clipStartMs) / 1000 = 1500 / 1000 = 1.5 s.
    runCameraDrivers(patchedDrivers, s, CAM_STUB, clock, installMs + 1500);
    expect(poseSpy).toHaveBeenCalledTimes(1);
    expect(poseSpy.mock.calls[0]![2]).toBeCloseTo(1.5, 5);
  });
});

// ── followBody driver ───────────────────────────────────────────────────────
//
// The follow driver reads the per-frame body snapshot (memoized deriveBodyStates
// at the frame's `lastRenderedSimDays`) plus the follow clock, both off the
// EngineState it closes over. A body id present in ORBITAL_ELEMENTS + SCENE_BODIES
// ('earth') is focused; the snapshot is primed by calling deriveBodyStates once.
//
// The approach GLIDES target + distance along one geodesic over a duration the
// driver derives and parks on `clock.followApproachMs`, so these tests read that
// field rather than restating a constant — there is no constant any more.

const FOLLOW_SIM_DAYS = CONST_J2000 + 3652.5; // ~10 years past epoch (not J2000).
const FOLLOW_FOV = 1.0;

/** A body focus row (radiusKm drives framing; positionMpc is unused — the driver
 * targets the LIVE snapshot position, not the row's). */
const EARTH_ROW = {
  type: 'body' as const,
  id: 'earth',
  label: 'Earth',
  positionMpc: [0, 0, 0] as [number, number, number],
  radiusKm: 6371,
};

/** Minimal EngineState carrying only the cameraRuntime fields the follow driver
 * reads. `followFrom` seeds the captured approach `from` (bypassing the live-pose
 * capture so the glide endpoints are deterministic); `followDistanceTarget` seeds
 * the distance-target un-braid state; `followPanOffset` seeds the strafe the
 * driver now adds itself. `prevActiveId` defaults to 'followBody' — the
 * steady-state (follow was already the winner), so the drag-interrupt re-capture
 * branch stays quiet unless a test names a different previous winner. */
function makeFollowEngineState(opts: {
  simDays: number;
  fovYRad: number;
  lastPose: CameraPose;
  followFrom?: CameraPose | null;
  followDistanceTarget?: number | null;
  followPanOffset?: [number, number, number];
  prevActiveId?: string;
}): EngineState {
  const clock = createCameraClock();
  clock.followFrom = opts.followFrom ?? null;
  clock.followDistanceTarget = opts.followDistanceTarget ?? null;
  if (opts.followPanOffset !== undefined) clock.followPanOffset = opts.followPanOffset;
  return {
    cameraRuntime: {
      clock,
      projection: { fovYRad: opts.fovYRad, aspect: 1, near: 0.01, far: 50000 },
      lastPose: { current: opts.lastPose },
      prevActiveId: { current: opts.prevActiveId ?? 'followBody' },
      lastRenderedSimDays: { current: opts.simDays },
    },
  } as unknown as EngineState;
}

/** The on-screen pose an approach starts from: 15.6 Mpc and ~18 decades of scale
 * away from Earth's framing pose, so target progress and distance progress are
 * both well resolved along the glide. */
const APPROACH_FROM: CameraPose = { target: [9, 9, 9], yaw: 0.2, pitch: 0.1, distance: 500 };

/** The clock the fixture handed the driver — where the derived approach duration
 * and the resolved distance target land. */
function followClock(engineState: EngineState) {
  return engineState.cameraRuntime.clock;
}

/** Run the activation frame (elapsed 0) — which is what derives and parks the
 * approach duration — and hand back that duration in ms. */
function deriveApproachMs(follow: CameraDriver, s: RootState, engineState: EngineState): number {
  follow.pose(s, CAM_STUB, 0);
  return followClock(engineState).followApproachMs!;
}

/** Long enough to be past any derived approach (the clamp ceiling is seconds). */
const SATURATED_MS = 60_000;

describe('buildCameraDrivers — followBody', () => {
  it('pose target equals the body snapshot position while active', () => {
    // The snapshot at the frame instant — the driver's target term must be THIS
    // (the live body), not the row's static positionMpc.
    const snapshot = deriveBodyStates(FOLLOW_SIM_DAYS);
    const livePos = snapshot.get('earth')!.positionMpc;

    const store = makeStore();
    store.dispatch(setSelectionRow({ slot: 'focus', row: EARTH_ROW }));
    const s = store.getState() as unknown as RootState;

    const engineState = makeFollowEngineState({
      simDays: FOLLOW_SIM_DAYS,
      fovYRad: FOLLOW_FOV,
      lastPose: BASE_POSE,
      followFrom: BASE_POSE,
    });
    const follow = buildCameraDrivers(engineState).find((d) => d.id === 'followBody')!;

    // After approach saturation the target is the live body position.
    const result = follow.pose(s, CAM_STUB, SATURATED_MS);
    expect(result.target).toEqual(livePos);
    // And it is NOT the row's static positionMpc ([0,0,0]) — proving it reads the
    // live snapshot, whose Earth sits far from the origin at this instant.
    expect(result.target).not.toEqual(EARTH_ROW.positionMpc);
  });

  it('deactivates when focus leaves the body; pickWinner hands off to the next driver', () => {
    // autoRotate off so the resting floor is the fallback winner.
    const store = makeStore();
    store.dispatch(setAutoRotate({ active: false, rate: 0.000873 }));

    const engineState = makeFollowEngineState({
      simDays: FOLLOW_SIM_DAYS,
      fovYRad: FOLLOW_FOV,
      lastPose: BASE_POSE,
    });
    const drivers = buildCameraDrivers(engineState);
    const follow = drivers.find((d) => d.id === 'followBody')!;

    // No focus → inactive → resting wins.
    let s = store.getState() as unknown as RootState;
    expect(follow.isActive(s)).toBe(false);
    expect(pickWinner(drivers, s).id).toBe('resting');

    // A non-body focus (Milky Way) → still inactive.
    store.dispatch(setSelectionRow({ slot: 'focus', row: { type: 'milkyWay' } }));
    s = store.getState() as unknown as RootState;
    expect(follow.isActive(s)).toBe(false);

    // A body focus present in the snapshot → active, and it wins over resting.
    store.dispatch(setSelectionRow({ slot: 'focus', row: EARTH_ROW }));
    s = store.getState() as unknown as RootState;
    expect(follow.isActive(s)).toBe(true);
    expect(pickWinner(drivers, s).id).toBe('followBody');

    // Focus leaves the body again → deactivates → hands back to resting.
    store.dispatch(setSelectionRow({ slot: 'focus', row: null }));
    s = store.getState() as unknown as RootState;
    expect(follow.isActive(s)).toBe(false);
    expect(pickWinner(drivers, s).id).toBe('resting');
  });

  it('the approach converges from the captured pose to the framing offset', () => {
    // Framing distance oracle — the shared body framing math, NOT the glide.
    // At elapsed 0 the pose sits at the captured `from`; by the derived approach
    // duration it has converged to the framing distance, monotonically.
    const framingDistance = bodyLikeFraming(
      deriveBodyStates(FOLLOW_SIM_DAYS).get('earth')!.positionMpc,
      EARTH_ROW.radiusKm,
      FOLLOW_FOV,
    ).distance;

    const store = makeStore();
    store.dispatch(setSelectionRow({ slot: 'focus', row: EARTH_ROW }));
    const s = store.getState() as unknown as RootState;

    const engineState = makeFollowEngineState({
      simDays: FOLLOW_SIM_DAYS,
      fovYRad: FOLLOW_FOV,
      lastPose: BASE_POSE,
      followFrom: APPROACH_FROM,
    });
    const follow = buildCameraDrivers(engineState).find((d) => d.id === 'followBody')!;

    // At activation (elapsed 0) the pose IS the captured `from` — both channels.
    const at0 = follow.pose(s, CAM_STUB, 0);
    expect(at0.distance).toBeCloseTo(APPROACH_FROM.distance, 9);
    expect(at0.target).toEqual(APPROACH_FROM.target);

    const approachMs = followClock(engineState).followApproachMs!;
    // The duration is derived per move, in MILLISECONDS. Reading seconds off
    // `durationSec` would land in [0.3, 2] and make every approach instant.
    expect(approachMs).toBeGreaterThanOrEqual(300);

    // At (and past) saturation the distance is the framing distance. RELATIVE:
    // Earth's framing distance is ~9e-16 Mpc, so `toBeCloseTo(…, 12)`'s absolute
    // 5e-13 tolerance is 500× the asserted value — it passes for 0 and for a
    // 100× error alike.
    expect(relErr(follow.pose(s, CAM_STUB, approachMs).distance, framingDistance)).toBeLessThan(
      1e-9,
    );
    expect(relErr(follow.pose(s, CAM_STUB, SATURATED_MS).distance, framingDistance)).toBeLessThan(
      1e-9,
    );

    // Monotone convergence: sampling forward in time moves strictly toward the
    // framing distance (Earth's framing distance is tiny, so distance decreases).
    const samples = [0, 0.25, 0.5, 0.75, 1].map(
      (f) => follow.pose(s, CAM_STUB, approachMs * f).distance,
    );
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]!).toBeLessThan(samples[i - 1]!);
    }
    expect(samples[0]!).toBeGreaterThan(framingDistance);
  });

  it('REGRESSION: the approach INTERPOLATES the target instead of snapping to the body', () => {
    // The defect this replaced: `followBody` declared `pivotsOnFocusedBody`, so
    // the frame loop overwrote `target` with the body position on the very first
    // focus frame — the camera's pivot teleported and only the distance moved.
    // Now follow authors its own target and glides it, so at elapsed 0 the target
    // is still where the camera was, and it reaches the body over the approach.
    const livePos = deriveBodyStates(FOLLOW_SIM_DAYS).get('earth')!.positionMpc;

    const store = makeStore();
    store.dispatch(setSelectionRow({ slot: 'focus', row: EARTH_ROW }));
    const s = store.getState() as unknown as RootState;

    const engineState = makeFollowEngineState({
      simDays: FOLLOW_SIM_DAYS,
      fovYRad: FOLLOW_FOV,
      lastPose: BASE_POSE,
      followFrom: APPROACH_FROM,
    });
    const follow = buildCameraDrivers(engineState).find((d) => d.id === 'followBody')!;

    expect(follow.pose(s, CAM_STUB, 0).target).toEqual(APPROACH_FROM.target);

    // …and somewhere along the way it is strictly BETWEEN the two — the pre-fix
    // driver was pinned to `livePos` at every elapsed, so no sample could be.
    const approachMs = followClock(engineState).followApproachMs!;
    const span = distanceMpc(APPROACH_FROM.target, livePos);
    const fractions = [0.001, 0.0025, 0.005, 0.01, 0.02, 0.05].map(
      (f) =>
        distanceMpc(APPROACH_FROM.target, follow.pose(s, CAM_STUB, approachMs * f).target) / span,
    );
    expect(fractions.some((f) => f > 0.05 && f < 0.95)).toBe(true);

    // The endpoint is still exact.
    expect(follow.pose(s, CAM_STUB, approachMs).target).toEqual(livePos);
  });

  it('target and distance are COUPLED, not two channels sharing one progress curve', () => {
    // Any independently-eased model — `lerp(from, to, e(t))` per channel — forces
    // the two channels to the SAME fraction of their span at every instant,
    // whatever curve `e` is. The geodesic parametrises by arc length instead, so
    // the target runs well ahead of the distance: the pan is cheap while the view
    // is still wide, so the camera crosses the gap before it descends.
    //
    // This is the assertion that fails if the glide is swapped back for any pair
    // of eased channels, including a well-chosen ease.
    const livePos = deriveBodyStates(FOLLOW_SIM_DAYS).get('earth')!.positionMpc;
    const framingDistance = bodyLikeFraming(livePos, EARTH_ROW.radiusKm, FOLLOW_FOV).distance;

    const store = makeStore();
    store.dispatch(setSelectionRow({ slot: 'focus', row: EARTH_ROW }));
    const s = store.getState() as unknown as RootState;

    const engineState = makeFollowEngineState({
      simDays: FOLLOW_SIM_DAYS,
      fovYRad: FOLLOW_FOV,
      lastPose: BASE_POSE,
      followFrom: APPROACH_FROM,
    });
    const follow = buildCameraDrivers(engineState).find((d) => d.id === 'followBody')!;
    const approachMs = deriveApproachMs(follow, s, engineState);

    const span = distanceMpc(APPROACH_FROM.target, livePos);
    const gaps = [0.001, 0.005, 0.01, 0.02, 0.05, 0.1, 0.25, 0.5].map((f) => {
      const pose = follow.pose(s, CAM_STUB, approachMs * f);
      const targetFrac = distanceMpc(APPROACH_FROM.target, pose.target) / span;
      const distFrac =
        (pose.distance - APPROACH_FROM.distance) / (framingDistance - APPROACH_FROM.distance);
      return targetFrac - distFrac;
    });
    expect(Math.max(...gaps)).toBeGreaterThan(0.15);
  });

  it('the DebugPanel ease reaches the follow-approach sample, not just the tween', () => {
    // The bug this guards: `followBody` used to sample `glidePath(...).at(t)`
    // with raw linear progress, so the DebugPanel's ease selector would change
    // nothing for a planet approach even though it worked for a focus tween.
    const store = makeStore();
    store.dispatch(setSelectionRow({ slot: 'focus', row: EARTH_ROW }));
    store.dispatch(setGlideTuning({ ease: 'easeOutCubic' }));
    const s = store.getState() as unknown as RootState;

    const engineState = makeFollowEngineState({
      simDays: FOLLOW_SIM_DAYS,
      fovYRad: FOLLOW_FOV,
      lastPose: BASE_POSE,
      followFrom: APPROACH_FROM,
    });
    const follow = buildCameraDrivers(engineState).find((d) => d.id === 'followBody')!;
    const approachMs = deriveApproachMs(follow, s, engineState);

    const linearStore = makeStore();
    linearStore.dispatch(setSelectionRow({ slot: 'focus', row: EARTH_ROW }));
    // Set 'linear' EXPLICITLY rather than leaning on the default: the shipped
    // default ease is a tunable, and when it stopped being 'linear' this
    // comparison silently became eased-vs-eased.
    linearStore.dispatch(setGlideTuning({ ease: 'linear' }));
    const sLinear = linearStore.getState() as unknown as RootState;
    const linearEngineState = makeFollowEngineState({
      simDays: FOLLOW_SIM_DAYS,
      fovYRad: FOLLOW_FOV,
      lastPose: BASE_POSE,
      followFrom: APPROACH_FROM,
    });
    const linearFollow = buildCameraDrivers(linearEngineState).find((d) => d.id === 'followBody')!;
    deriveApproachMs(linearFollow, sLinear, linearEngineState);

    // Mid-approach, easeOutCubic(0.5) = 0.875 ≠ 0.5 — the eased sample must
    // differ from the linear sample at the SAME elapsed fraction.
    const easedMid = follow.pose(s, CAM_STUB, approachMs * 0.5);
    const linearMid = linearFollow.pose(sLinear, CAM_STUB, approachMs * 0.5);
    // RELATIVE, not `toBeCloseTo`: an approach ends at Earth-framing distance
    // (~1e-13 Mpc), where `toBeCloseTo(…, 6)`'s absolute 5e-7 tolerance calls
    // every pair of poses equal and the assertion proves nothing.
    const spread =
      Math.abs(easedMid.distance - linearMid.distance) /
      Math.max(easedMid.distance, linearMid.distance);
    expect(spread).toBeGreaterThan(0.1);
    expect(easedMid.target).not.toEqual(linearMid.target);
  });

  it('the pan strafe rides along: follow targets body + panOffset', () => {
    // The pivot-pin used to add `clock.followPanOffset`; opting out of the pin
    // made that this driver's job. Without it, panning away from a body would
    // snap straight back to centre on the first idle frame after the drag.
    const livePos = deriveBodyStates(FOLLOW_SIM_DAYS).get('earth')!.positionMpc;
    const PAN: [number, number, number] = [0.1, -0.2, 0.3];

    const store = makeStore();
    store.dispatch(setSelectionRow({ slot: 'focus', row: EARTH_ROW }));
    const s = store.getState() as unknown as RootState;

    const engineState = makeFollowEngineState({
      simDays: FOLLOW_SIM_DAYS,
      fovYRad: FOLLOW_FOV,
      lastPose: BASE_POSE,
      followFrom: APPROACH_FROM,
      followPanOffset: PAN,
    });
    const follow = buildCameraDrivers(engineState).find((d) => d.id === 'followBody')!;

    expect(follow.pose(s, CAM_STUB, SATURATED_MS).target).toEqual([
      livePos[0] + PAN[0],
      livePos[1] + PAN[1],
      livePos[2] + PAN[2],
    ]);
    // The approach lands on the same shifted pivot, not on the bare body.
    const approachMs = followClock(engineState).followApproachMs!;
    expect(follow.pose(s, CAM_STUB, approachMs).target).toEqual([
      livePos[0] + PAN[0],
      livePos[1] + PAN[1],
      livePos[2] + PAN[2],
    ]);
  });

  it('the render-wake window is exactly the approach the driver derived', () => {
    // The cross-file contract: `shouldKeepTicking` must hold the loop open for
    // precisely as long as the driver is still moving. Duration is per-move now,
    // so any window computed independently of `clock.followApproachMs` — a flat
    // constant especially — either freezes the approach part-way (loop sleeps
    // early, resumes only on the next input) or burns frames after it lands.
    const store = makeStore();
    store.dispatch(setAutoRotate({ active: false, rate: 0.000873 }));
    store.dispatch(setSelectionRow({ slot: 'focus', row: EARTH_ROW }));
    const s = store.getState() as unknown as RootState;

    const engineState = makeFollowEngineState({
      simDays: FOLLOW_SIM_DAYS,
      fovYRad: FOLLOW_FOV,
      lastPose: BASE_POSE,
      followFrom: APPROACH_FROM,
    });
    const follow = buildCameraDrivers(engineState).find((d) => d.id === 'followBody')!;

    const START_MS = 1000;
    followClock(engineState).followStartMs = START_MS;
    const approachMs = deriveApproachMs(follow, s, engineState);

    // Everything else at rest, so the follow term alone decides.
    const idle = {
      ...engineState,
      settings: { flow: { enabled: false } },
      gpu: { renderer: null, pickRenderer: null, renderTargets: null },
      subsystems: {
        texturedDisks: null,
        fades: { isAnyAnimating: () => false },
        structureFocus: { isAwake: () => false },
      },
      assetSlots: { flow: null },
    } as unknown as EngineState;
    const noAnim = { starFadeAnimating: false, earthTilesAnimating: false };

    expect(shouldKeepTicking(idle, s, START_MS + approachMs - 1, noAnim)).toBe(true);
    expect(shouldKeepTicking(idle, s, START_MS + approachMs, noAnim)).toBe(false);
    // …and the driver stops moving on exactly that frame.
    expect(follow.pose(s, CAM_STUB, approachMs)).toEqual(follow.pose(s, CAM_STUB, SATURATED_MS));
  });

  it('a drag-committed zoom sticks: follow holds base.distance, not framing', () => {
    // Zoom-while-following. Sequence this fixture stands in for:
    //   1. Follow approaches Earth → distance target = the tiny framing distance.
    //   2. User grabs a drag (orbitDrag@80 wins) and ZOOMS OUT; on release the
    //      dragged distance is committed into `base` (COMMITTED_DIST here).
    //   3. Follow re-wins the SAME focus ref this frame — but was NOT the previous
    //      winner (prevActiveId === 'orbitDrag').
    // The follow driver must re-capture `base.distance` as the steady-state target
    // so the zoom is honoured. The OLD behaviour re-asserted the framing distance
    // every frame (snap-back), which this test rejects.
    const snapshot = deriveBodyStates(FOLLOW_SIM_DAYS);
    const livePos = snapshot.get('earth')!.positionMpc;
    const framingDistance = bodyLikeFraming(livePos, EARTH_ROW.radiusKm, FOLLOW_FOV).distance;

    // The user's committed drag-zoom — vastly larger than Earth's ~1e-15 Mpc
    // framing distance, so 'stuck to base' vs 'snapped to framing' is unambiguous.
    const COMMITTED_DIST = 500;

    const store = makeStore();
    store.dispatch(setSelectionRow({ slot: 'focus', row: EARTH_ROW }));
    // Commit the post-drag pose into base (this is what orbitDrag's gesture-end
    // bakes). Only `distance` matters for the assertion.
    store.dispatch(
      commitCameraPose({ target: [0, 0, 0], yaw: 1.2, pitch: 0.3, distance: COMMITTED_DIST }),
    );
    const s = store.getState() as unknown as RootState;

    // followDistanceTarget pre-seeded to the framing distance = 'the initial
    // approach already ran'; prevActiveId 'orbitDrag' = 'a drag just interrupted
    // and follow re-wins this frame' (the re-capture edge).
    const engineState = makeFollowEngineState({
      simDays: FOLLOW_SIM_DAYS,
      fovYRad: FOLLOW_FOV,
      lastPose: BASE_POSE,
      followFrom: APPROACH_FROM,
      followDistanceTarget: framingDistance,
      prevActiveId: 'orbitDrag',
    });
    const follow = buildCameraDrivers(engineState).find((d) => d.id === 'followBody')!;

    // The re-capture edge ALSO ends the approach, so the very first frame back
    // holds the drag's pose. Under a resumed glide the camera would be yanked
    // back onto a path measured from a `followFrom` the drag has invalidated.
    const result = follow.pose(s, CAM_STUB, 0);
    expect(followClock(engineState).followApproachMs).toBe(0);
    expect(result.distance).toBeCloseTo(COMMITTED_DIST, 9);
    // Guard the snap-back regression explicitly: the framing distance is tiny, so
    // 'equals framing' would be a hard failure the old code produced.
    expect(result.distance).not.toBeCloseTo(framingDistance, 3);
    // Orientation comes from the committed base too, not from the stale capture.
    expect(result.yaw).toBeCloseTo(1.2, 9);
    expect(result.pitch).toBeCloseTo(0.3, 9);
  });
});

// ── followBody sits BELOW autoRotate: the pivot un-braid ─────────────────────
//
// followBody no longer competes for the WHOLE pose. A focused body pins the
// pivot (via the frame-loop pivot-pin); the ORBIT terms go to whoever wins the
// table. autoRotate (20) therefore outranks followBody (10) — the auto-rotate
// button spins AROUND a focused body instead of being blocked by follow. This
// was the third live symptom.

describe('buildCameraDrivers — followBody priority under body focus', () => {
  it('autoRotate outranks followBody while a body is focused (button not blocked)', () => {
    const store = makeStore();
    store.dispatch(setSelectionRow({ slot: 'focus', row: EARTH_ROW }));
    store.dispatch(setAutoRotate({ active: true, rate: 0.001 }));
    const s = store.getState() as unknown as RootState;

    const engineState = makeFollowEngineState({
      simDays: FOLLOW_SIM_DAYS,
      fovYRad: FOLLOW_FOV,
      lastPose: BASE_POSE,
    });
    const drivers = buildCameraDrivers(engineState);

    // Both are active; the winner is autoRotate (20) over followBody (10).
    // Pre-fix followBody@70 blocked autoRotate — this assertion is the regression.
    expect(drivers.find((d) => d.id === 'followBody')!.isActive(s)).toBe(true);
    expect(pickWinner(drivers, s).id).toBe('autoRotate');
  });

  it('yaw advances over frames while auto-rotating a focused body', () => {
    const store = makeStore();
    store.dispatch(setSelectionRow({ slot: 'focus', row: EARTH_ROW }));
    store.dispatch(commitCameraPose(BASE_POSE));
    store.dispatch(setAutoRotate({ active: true, rate: 0.001 }));
    const s = store.getState() as unknown as RootState;

    const engineState = makeFollowEngineState({
      simDays: FOLLOW_SIM_DAYS,
      fovYRad: FOLLOW_FOV,
      lastPose: BASE_POSE,
    });
    const drivers = buildCameraDrivers(engineState);
    const clock = createCameraClock();

    const p0 = runCameraDrivers(drivers, s, CAM_STUB, clock, 1000);
    const p1 = runCameraDrivers(drivers, s, CAM_STUB, clock, 1500);
    // autoRotate is authoring (not blocked by follow) → yaw advances with elapsed.
    expect(p0.yaw).toBeCloseTo(BASE_POSE.yaw, 9); // elapsed 0 on the arrival frame
    expect(p1.yaw).not.toBe(p0.yaw);
  });
});
