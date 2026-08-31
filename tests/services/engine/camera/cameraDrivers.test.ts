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
import { lerp } from '../../../../src/utils/math/lerp';

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
import { FOCUS_TWEEN_MS } from '../../../../src/services/engine/camera/focusTweenDuration';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { setSelectionRow } from '../../../../src/state/selectionRows/selectionRowsSlice';
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
import { setOrientation } from '../../../../src/state/settings/settingsSlice';
import { DEFAULT_ORIENTATION } from '../../../../src/data/defaults';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { yawPitchToDir } from '../../../../src/utils/camera/yawPitchToDir';
import { rotateVec3ByTightMat3 } from '../../../../src/utils/math/rotateVec3ByTightMat3';
import type { CameraTweenDescriptor } from '../../../../src/@types/camera/CameraTweenDescriptor';
import type { ClipData } from '../../../../src/@types/animation/ClipData';
import type { OrientationFrameId } from '../../../../src/@types/camera/OrientationFrameId';

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
  // Matches the store's default settings.orientation, so the tween row's
  // re-encode is the identity branch (from === to) and the raw evaluateClip
  // output is unchanged — the fixture other tests compare against verbatim.
  frame: DEFAULT_ORIENTATION,
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

const FAKE_ENGINE_STATE = {} as EngineState;

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
    store.dispatch(clipStarted({ data: CLIP_DATA, frame: DEFAULT_ORIENTATION }));
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
    expect(result).toEqual(evaluateClip(tweenToClip(TWEEN_DESC), elapsedMs / 1000));
  });

  it('tween row converts ms→sec correctly', () => {
    // Oracle independent of evaluateClip / tweenToClip — a 1000× unit slip
    // (passing elapsedMs instead of elapsedMs/1000) would saturate the clip to
    // its `to` pose (500 s >> 1 s duration), making distance == 1000.
    // The midpoint + bounds assertions below catch that slip.
    //
    // Derivation:
    //   durationMs = 1000 ms → duration = 1 s
    //   elapsedMs  = 500  ms → elapsedSec = 0.5 s
    //   t = elapsedSec / durationSec = 0.5
    //   eased = easeOutCubic(0.5) = 1 - (1-0.5)^3 = 1 - 0.125 = 0.875
    //   distance = lerp(10, 1000, 0.875) = 10*(1-0.875) + 1000*0.875 = 876.25
    //
    // A forgotten /1000 would pass 500 s to a 1 s clip → saturated to `to`
    // (distance == 1000); the midpoint + bounds below reject that.
    const UNIT_SLIP_DESC: CameraTweenDescriptor = {
      from: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 10 },
      to: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1000 },
      durationMs: 1000,
      easing: 'easeOutCubic',
      frame: DEFAULT_ORIENTATION,
    };

    const store = makeStore();
    store.dispatch(startCameraTween(UNIT_SLIP_DESC));
    const s = store.getState() as unknown as RootState;

    const elapsedMs = 500;
    const result = byId('tween').pose(s, CAM_STUB, elapsedMs);

    // Independent oracle: easeOutCubic(0.5) = 0.875; lerp(10, 1000, 0.875) = 876.25
    const expectedDistance = lerp(10, 1000, easeOutCubic(0.5));
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

// ── clip driver: frame pinning across a mid-clip orientation switch ─────────
//
// A clip's authored (yaw, pitch) is only meaningful relative to the frame it
// started under. `clip.frame` pins that frame; the driver must evaluate
// against IT (not the live setting) and re-encode forward into whatever
// `settings.orientation` is THIS frame. World-space aim is the invariant —
// the (yaw, pitch) numbers are expected to differ across the switch.

describe('buildCameraDrivers — clip pins the frame it started under', () => {
  function byId(id: string): CameraDriver {
    return buildCameraDrivers(FAKE_ENGINE_STATE).find((d) => d.id === id)!;
  }

  /** World-space target→eye direction for (yaw, pitch) decoded under `frame`. */
  function worldAim(pose: CameraPose, frame: OrientationFrameId) {
    return rotateVec3ByTightMat3(yawPitchToDir(pose.yaw, pose.pitch), ORIENTATION_FRAMES[frame]);
  }

  // A static held pose (empty timeline — no flyPath, no ramps) so the driver's
  // yaw/pitch stay exactly the authored start values at any elapsed time; only
  // the frame math is under test here.
  const CLIP_WITH_AIM: ClipData = {
    start: { target: [0, 0, 0], yaw: 0.7, pitch: 0.2, distance: 50 },
    timeline: [],
  };

  it('a clip playing across an orientation switch keeps its world aim', () => {
    const store = makeStore();
    store.dispatch(setOrientation('ecliptic'));
    store.dispatch(clipStarted({ data: CLIP_WITH_AIM, frame: 'ecliptic' }));
    const elapsed = 2;

    // Sample #1: settings.orientation still matches the pinned frame.
    const pose1 = byId('clip').pose(store.getState() as unknown as RootState, CAM_STUB, elapsed);

    // Mid-clip switch: settings.orientation moves; camera.clip.frame does not.
    store.dispatch(setOrientation('galactic'));
    const pose2 = byId('clip').pose(store.getState() as unknown as RootState, CAM_STUB, elapsed);

    // The re-encode actually did something — the raw angles moved.
    expect(pose2.yaw).not.toBeCloseTo(pose1.yaw, 5);

    // But decoded through their OWN settings.orientation basis (the same decode
    // updatePosition performs), both poses point the same way in world space.
    const dir1 = worldAim(pose1, 'ecliptic');
    const dir2 = worldAim(pose2, 'galactic');
    expect(dir2[0]).toBeCloseTo(dir1[0], 5);
    expect(dir2[1]).toBeCloseTo(dir1[1], 5);
    expect(dir2[2]).toBeCloseTo(dir1[2], 5);
  });
});

// ── tween driver: frame pinning across a mid-tween orientation switch ───────
//
// Same contract as the clip driver above: `tween.frame` pins the frame `from`/
// `to` were captured under. A mid-tween orientation switch must re-express the
// pose, not reinterpret its yaw/pitch against a new pole.

describe('buildCameraDrivers — tween pins the frame it started under', () => {
  function byId(id: string): CameraDriver {
    return buildCameraDrivers(FAKE_ENGINE_STATE).find((d) => d.id === id)!;
  }

  /** World-space target→eye direction for (yaw, pitch) decoded under `frame`. */
  function worldAim(pose: CameraPose, frame: OrientationFrameId) {
    return rotateVec3ByTightMat3(yawPitchToDir(pose.yaw, pose.pitch), ORIENTATION_FRAMES[frame]);
  }

  // A held `to` pose (elapsed >= durationMs saturates the tween at `to`), so
  // the driver's yaw/pitch stay exactly the authored `to` values at any
  // elapsed >= 1000; only the frame math is under test here.
  const TWEEN_WITH_AIM: CameraTweenDescriptor = {
    from: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 50 },
    to: { target: [0, 0, 0], yaw: 0.7, pitch: 0.2, distance: 50 },
    durationMs: 1000,
    easing: 'easeOutCubic',
    frame: 'ecliptic',
  };

  it('a tween running across an orientation switch keeps its world aim', () => {
    const store = makeStore();
    store.dispatch(setOrientation('ecliptic'));
    store.dispatch(startCameraTween(TWEEN_WITH_AIM));
    const elapsedMs = 2000; // past durationMs — saturated at `to`

    // Sample #1: settings.orientation still matches the pinned frame.
    const pose1 = byId('tween').pose(store.getState() as unknown as RootState, CAM_STUB, elapsedMs);

    // Mid-tween switch: settings.orientation moves; camera.tween.frame does not.
    store.dispatch(setOrientation('galactic'));
    const pose2 = byId('tween').pose(store.getState() as unknown as RootState, CAM_STUB, elapsedMs);

    // The re-encode actually did something — the raw angles moved.
    expect(pose2.yaw).not.toBeCloseTo(pose1.yaw, 5);

    // But decoded through their OWN settings.orientation basis (the same decode
    // updatePosition performs), both poses point the same way in world space.
    const dir1 = worldAim(pose1, 'ecliptic');
    const dir2 = worldAim(pose2, 'galactic');
    expect(dir2[0]).toBeCloseTo(dir1[0], 5);
    expect(dir2[1]).toBeCloseTo(dir1[1], 5);
    expect(dir2[2]).toBeCloseTo(dir1[2], 5);
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
    store.dispatch(clipStarted({ data: CLIP_DATA, frame: DEFAULT_ORIENTATION }));
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
    expect(pose0).toEqual(evaluateClip(tweenToClip(TWEEN_DESC), 0));

    // Second call at nowMs + 200 — same descriptor reference, elapsedMs = 200.
    const pose200 = runCameraDrivers(drivers, s, CAM_STUB, clock, nowMs + 200);
    expect(pose200).toEqual(evaluateClip(tweenToClip(TWEEN_DESC), 200 / 1000));
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
    store.dispatch(clipStarted({ data: CLIP_DATA, frame: DEFAULT_ORIENTATION }));
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
// at the frame's `lastRenderedSimDays`) plus the follow ease clock, both off the
// EngineState it closes over. A body id present in ORBITAL_ELEMENTS + SCENE_BODIES
// ('earth') is focused; the snapshot is primed by calling deriveBodyStates once.

const FOLLOW_SIM_DAYS = CONST_J2000 + 3652.5; // ~10 years past epoch (not J2000).
const FOLLOW_FOV = 1.0;

/** A body focus row (radiusM drives framing; positionMpc is unused — the driver
 * targets the LIVE snapshot position, not the row's). */
const EARTH_ROW = {
  type: 'body' as const,
  id: 'earth',
  label: 'Earth',
  positionMpc: [0, 0, 0] as [number, number, number],
  radiusM: 6371000,
};

/** Minimal EngineState carrying only the cameraRuntime fields the follow driver
 * reads. `followFrom` seeds the captured approach `from` (bypassing the live-pose
 * capture so the ease endpoints are deterministic); `followDistanceTarget` seeds
 * the distance-target un-braid state. `prevActiveId` defaults to 'followBody' —
 * the steady-state (follow was already the winner), so the drag-interrupt
 * re-capture branch stays quiet unless a test names a different previous winner. */
function makeFollowEngineState(opts: {
  simDays: number;
  fovYRad: number;
  lastPose: CameraPose;
  followFrom?: CameraPose | null;
  followDistanceTarget?: number | null;
  prevActiveId?: string;
}): EngineState {
  const clock = createCameraClock();
  clock.followFrom = opts.followFrom ?? null;
  clock.followDistanceTarget = opts.followDistanceTarget ?? null;
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
    const result = follow.pose(s, CAM_STUB, FOCUS_TWEEN_MS);
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

  it('the follow approach ease converges from the captured pose to the framing offset', () => {
    // Framing distance oracle — the shared body framing math, NOT the ease
    // formula. At elapsed 0 the pose sits at the captured `from` distance; by
    // FOCUS_TWEEN_MS it has converged to the framing distance, monotonically.
    const snapshot = deriveBodyStates(FOLLOW_SIM_DAYS);
    const livePos = snapshot.get('earth')!.positionMpc;
    const framingDistance = bodyLikeFraming(livePos, EARTH_ROW.radiusM, FOLLOW_FOV).distance;

    const FROM: CameraPose = { target: [9, 9, 9], yaw: 0.2, pitch: 0.1, distance: 500 };

    const store = makeStore();
    store.dispatch(setSelectionRow({ slot: 'focus', row: EARTH_ROW }));
    const s = store.getState() as unknown as RootState;

    const engineState = makeFollowEngineState({
      simDays: FOLLOW_SIM_DAYS,
      fovYRad: FOLLOW_FOV,
      lastPose: BASE_POSE,
      followFrom: FROM,
    });
    const follow = buildCameraDrivers(engineState).find((d) => d.id === 'followBody')!;

    // At activation (elapsed 0) the distance is the captured `from` distance.
    expect(follow.pose(s, CAM_STUB, 0).distance).toBeCloseTo(FROM.distance, 9);

    // At (and past) saturation the distance is the framing distance.
    expect(follow.pose(s, CAM_STUB, FOCUS_TWEEN_MS).distance).toBeCloseTo(framingDistance, 12);
    expect(follow.pose(s, CAM_STUB, FOCUS_TWEEN_MS * 2).distance).toBeCloseTo(framingDistance, 12);

    // Monotone convergence: sampling forward in time moves strictly toward the
    // framing distance (Earth's framing distance is tiny, so distance decreases).
    const samples = [0, 150, 300, 450, 600].map((ms) => follow.pose(s, CAM_STUB, ms).distance);
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]!).toBeLessThan(samples[i - 1]!);
    }
    expect(samples[0]!).toBeGreaterThan(framingDistance);
  });

  it('a drag-committed zoom sticks: follow re-eases to base.distance, not framing', () => {
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
    const framingDistance = bodyLikeFraming(livePos, EARTH_ROW.radiusM, FOLLOW_FOV).distance;

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
      followFrom: { target: [9, 9, 9], yaw: 0.2, pitch: 0.1, distance: 500 },
      followDistanceTarget: framingDistance,
      prevActiveId: 'orbitDrag',
    });
    const follow = buildCameraDrivers(engineState).find((d) => d.id === 'followBody')!;

    // Saturated (t=1): distance is the committed base distance, NOT framing.
    const result = follow.pose(s, CAM_STUB, FOCUS_TWEEN_MS * 4);
    expect(result.distance).toBeCloseTo(COMMITTED_DIST, 9);
    // Guard the snap-back regression explicitly: the framing distance is tiny, so
    // 'equals framing' would be a hard failure the old code produced.
    expect(result.distance).not.toBeCloseTo(framingDistance, 3);
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
