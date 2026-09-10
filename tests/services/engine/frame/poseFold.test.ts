/**
 * poseFold — the per-frame regime fold as `runFrame` runs it (spec §7 steps
 * 5-6): one world-arm resolution, the predicate skipped whole while a gesture
 * is in flight, and the normalized arm committed to `camera.base` on the flip.
 *
 * The fixture is minimal on purpose — `gpu.galaxyPointRenderer` stays null, so
 * `deriveFrameContext`'s ready gate bails immediately after the fold, which is
 * the entire slice under test. Fixtures sit at a real body's live position
 * (Earth at J2000, ~1 AU out) because that magnitude is where the ruled
 * conversion floor is stated.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

// Spies that DELEGATE to the real modules: the fold's placement is a call-order
// property, so the frame has to run its production path while the probe records
// where each step landed. `state` is the live EngineState, read inside the
// regimeArmFor spy to prove `register.pose` has not been updated yet at fold time.
const probe = vi.hoisted(() => ({
  order: [] as string[],
  lastPoseAtFold: [] as unknown[],
  drawnPoses: [] as unknown[],
  state: null as unknown,
}));

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
vi.mock('../../../../src/services/engine/camera/applyFocusedBodyPivot', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../../../src/services/engine/camera/applyFocusedBodyPivot')
    >();
  return {
    ...actual,
    applyFocusedBodyPivot: (...args: Parameters<typeof actual.applyFocusedBodyPivot>) => {
      probe.order.push('pin');
      return actual.applyFocusedBodyPivot(...args);
    },
  };
});
vi.mock('../../../../src/services/engine/camera/regimeArmFor', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../src/services/engine/camera/regimeArmFor')>();
  return {
    ...actual,
    regimeArmFor: (...args: Parameters<typeof actual.regimeArmFor>) => {
      probe.order.push('fold');
      probe.lastPoseAtFold.push((probe.state as EngineState | null)?.cameraRuntime.register.pose);
      return actual.regimeArmFor(...args);
    },
  };
});
vi.mock('../../../../src/services/engine/frame/frameContext', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../src/services/engine/frame/frameContext')>();
  return {
    ...actual,
    deriveFrameContext: (...args: Parameters<typeof actual.deriveFrameContext>) => {
      probe.order.push('deriveFrameContext');
      probe.drawnPoses.push(args[2]);
      return actual.deriveFrameContext(...args);
    },
  };
});

import { runFrame } from '../../../../src/services/engine/frame/runFrame';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { toBodyArm } from '../../../../src/services/engine/camera/poseFrameConversion';
import { makeCameraSimHarness } from '../../../helpers/camera/makeCameraSimHarness';
import { poseAtHR } from '../../../helpers/camera/poseAtHR';
import {
  beginDrag,
  endDrag,
  commitCameraPose,
  startCameraTween,
} from '../../../../src/state/camera/cameraSlice';
import { setSelectionRow } from '../../../../src/state/selectionRows/selectionRowsSlice';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';
import { eyeMpcOf } from '../../../../src/utils/camera/eyeMpcOf';
import { imagePlaneBasis } from '../../../../src/utils/camera/imagePlaneBasis';
import { frameUp } from '../../../../src/utils/camera/frameUp';
import { normalize3 } from '../../../../src/utils/math/normalize3';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { DEFAULT_ORIENTATION } from '../../../../src/data/defaults';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import type { BodyId } from '../../../../src/@types/data/body/BodyId';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { FramedCameraPose } from '../../../../src/@types/camera/FramedCameraPose';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const B = ORIENTATION_FRAMES[DEFAULT_ORIENTATION];
const SIM = CONST_J2000;
const EARTH: BodyState = deriveBodyStates(SIM).get('earth')!;
const EARTH_ARM = { body: 'earth' as BodyId };

/** Eye, sightline and screen-up — the three quantities §4 rules continuous. */
function renderedCamera(pose: CameraPose) {
  const eye = eyeMpcOf(pose, B);
  const forward = normalize3([
    pose.target[0]! - eye[0]!,
    pose.target[1]! - eye[1]!,
    pose.target[2]! - eye[2]!,
  ] as Vec3);
  const { up } = imagePlaneBasis(forward, pose.roll ?? 0, frameUp(B));
  return { eye, forward, up };
}

/**
 * Build the fixture bag fresh per test — Earth unfocused, no boot pose (each
 * test seeds its own via `seedPose`), matching the union of what every test
 * below needs from `runFrame`'s ready-gated slice.
 */
function makeHarness() {
  return makeCameraSimHarness({ focusBody: null, bootHR: null });
}

/** Seed both pose homes with the same world-arm pose, the bootstrap posture. */
function seedPose(
  store: ReturnType<typeof makeHarness>['store'],
  state: EngineState,
  pose: CameraPose,
): void {
  store.dispatch(commitCameraPose(absoluteArm(pose)));
  state.cameraRuntime = {
    ...state.cameraRuntime,
    register: { ...state.cameraRuntime.register, pose: absoluteArm(pose) },
  };
}

/** Geocentric range of a body-arm pose, metres — the anchor is the centre. */
function rangeOf(framed: FramedCameraPose): number {
  if (framed.frame === 'absolute') throw new Error('rangeOf: not a body arm');
  return Math.hypot(...framed.pose.eyeRelAnchorM);
}

function commitCalls(spy: { mock: { calls: readonly (readonly unknown[])[] } }): unknown[] {
  return spy.mock.calls
    .map((call) => call[0] as { type?: string })
    .filter((action) => action.type === commitCameraPose.type);
}

beforeEach(() => {
  probe.order.length = 0;
  probe.lastPoseAtFold.length = 0;
  probe.drawnPoses.length = 0;
  probe.state = null;
});

describe('runFrame — the regime fold', () => {
  it('runs after the pivot pin and before register.pose is updated', () => {
    // FW-G: a fold above driver arbitration is discarded by whatever writes the
    // pose after it. Its two neighbours pin it exactly — below the pivot pin
    // (the last pose writer) and above the `register.pose` update, which is
    // why the pose the fold sees in `register.pose` is still the PREVIOUS frame's.
    const { store, state, deps } = makeHarness();
    probe.state = state;
    const PREVIOUS = absoluteArm({ target: [1, 2, 3], yaw: 0.1, pitch: 0.2, distance: 5 });
    const PRODUCED = poseAtHR(EARTH, SCENE_EARTH.radiusM, 12);
    state.cameraRuntime = {
      ...state.cameraRuntime,
      register: { ...state.cameraRuntime.register, pose: PREVIOUS },
    };
    store.dispatch(commitCameraPose(absoluteArm(PRODUCED)));

    runFrame(state, deps, 0);

    expect(probe.order).toEqual(['pin', 'fold', 'deriveFrameContext']);
    expect(probe.lastPoseAtFold).toEqual([PREVIOUS]);
    expect(state.cameraRuntime.register.pose).not.toBe(PREVIOUS);
  });

  it('commits the engaged arm to camera.base once, then holds it', () => {
    // `camera.base.frame` IS the regime (spec §4), so the fold has to land the
    // new arm there — that is what makes the arm-gated drivers, the wheel and
    // the pin see it on the next frame. Once only: re-committing every frame
    // would churn the store and reset every base-identity-keyed clock.
    const { store, state, deps } = makeHarness();
    seedPose(store, state, poseAtHR(EARTH, SCENE_EARTH.radiusM, 0.1));
    const spy = vi.spyOn(store, 'dispatch');

    runFrame(state, deps, 0);

    expect(store.getState().camera.base.frame).toEqual(EARTH_ARM);
    expect(commitCalls(spy)).toHaveLength(1);

    spy.mockClear();
    runFrame(state, deps, 16);

    expect(store.getState().camera.base.frame).toEqual(EARTH_ARM);
    expect(commitCalls(spy)).toHaveLength(0);
  });

  it('a driver that authors the absolute arm inside the band commits once, not per frame', () => {
    // The regime is `camera.base.frame`, never the arm the winning driver
    // authored: tween@60 and clip@95 are not arm-gated and always produce
    // absolute poses. Keyed on the produced pose, the fold would re-convert and
    // re-dispatch on every frame of an animation that ends inside the band —
    // a 60 Hz store write through every saga channel — and would feed the
    // predicate `'absolute'`, swapping §4's disengage test for the engage one.
    const { store, state, deps } = makeHarness();
    const FROM = poseAtHR(EARTH, SCENE_EARTH.radiusM, 0.1);
    // Yaw-only, so every frame of the tween sits at the same h/R: the arm must
    // hold across all four, not re-engage on each.
    const TO: CameraPose = { ...FROM, yaw: FROM.yaw + 0.4 };
    seedPose(store, state, FROM);
    store.dispatch(
      startCameraTween({
        from: FROM,
        to: TO,
        durationMs: 4000,
        easing: 'linear',
        frame: DEFAULT_ORIENTATION,
      }),
    );
    const spy = vi.spyOn(store, 'dispatch');

    for (const nowMs of [0, 16, 32, 48]) runFrame(state, deps, nowMs);

    expect(commitCalls(spy)).toHaveLength(1);
    expect(store.getState().camera.base.frame).toEqual(EARTH_ARM);
  });

  it('hands back to the absolute arm above the disengage threshold', () => {
    // The other half of the hysteresis: an engaged arm carried out past
    // `disengageHR` converts back and re-commits, or the camera is stuck in a
    // body frame forever.
    const { store, state, deps } = makeHarness();
    const FAR = poseAtHR(EARTH, SCENE_EARTH.radiusM, 5);
    const arm = {
      frame: EARTH_ARM,
      pose: toBodyArm(FAR, B, B, EARTH_ARM.body, EARTH),
    } as const;
    store.dispatch(commitCameraPose(arm));
    state.cameraRuntime = {
      ...state.cameraRuntime,
      register: { ...state.cameraRuntime.register, pose: arm },
    };

    runFrame(state, deps, 0);

    expect(store.getState().camera.base.frame).toBe('absolute');
    expect(state.cameraRuntime.register.pose.frame).toBe('absolute');
  });

  it('disengaging with a moving body focused keeps the eye continuous past the pivot pin', () => {
    // Pop-2: the disengage commit and the pivot pin must agree on what an
    // absolute pose's target MEANS near a focused body — the body centre.
    // Committing the fold's on-ray surface target instead let the flip frame
    // render continuously while the NEXT frame's pin re-read `target` as the
    // centre and rebuilt the eye from `target + dir·distance`: a one-body-
    // radius (6,371 km) eye teleport on the first at-rest frame after the flip.
    const { store, state, deps } = makeHarness();
    probe.state = state;
    // Body arm just inside the band, tilt 0 (looking at the centre) — the pose
    // every driven recession reaches the boundary with. 0.39 sits just below
    // ruling 19's disengageHR (0.4).
    const NEAR_EDGE = poseAtHR(EARTH, SCENE_EARTH.radiusM, 0.39);
    const arm = {
      frame: EARTH_ARM,
      pose: toBodyArm(NEAR_EDGE, B, B, EARTH_ARM.body, EARTH),
    } as const;
    store.dispatch(commitCameraPose(arm));
    state.cameraRuntime = {
      ...state.cameraRuntime,
      register: { ...state.cameraRuntime.register, pose: arm },
    };
    // Earth focused and MOVING (in ORBITAL_ELEMENTS): the pin fires at rest.
    store.dispatch(
      setSelectionRow({
        slot: 'focus',
        row: {
          type: 'body',
          id: 'earth',
          label: 'Earth',
          positionMpc: [EARTH.positionMpc[0]!, EARTH.positionMpc[1]!, EARTH.positionMpc[2]!],
          radiusM: SCENE_EARTH.radiusM,
        },
      }),
    );

    // One wheel notch out (factor e^0.24 ≈ 1.27 on altitude ⇒ crosses 0.4).
    state.subsystems.inputAggregator.push({
      kind: 'wheel',
      deltaY: 240,
      duringGesture: false,
      xPx: 50,
      yPx: 50,
    });
    runFrame(state, deps, 0); // frame N: the zoom lands, the fold flips
    runFrame(state, deps, 16); // frame N+1: at rest, the pin re-reads the target

    expect(state.cameraRuntime.register.pose.frame).toBe('absolute');
    const flip = renderedCamera(probe.drawnPoses[0] as CameraPose);
    const pinned = renderedCamera(probe.drawnPoses[1] as CameraPose);
    for (let i = 0; i < 3; i++) {
      // The same conversion-floor bound the engage no-snap test uses; the bug
      // this pins was a 6.4e6 m jump, eleven decades above it.
      const eyeDriftM = Math.abs(pinned.eye[i]! - flip.eye[i]!) * SCALE_UNITS.MPC_TO_M;
      expect(eyeDriftM).toBeLessThan(5e-5);
      // Tilt 0 at the crossing ⇒ the retarget is view-exact too.
      expect(Math.abs(pinned.forward[i]! - flip.forward[i]!)).toBeLessThan(1e-9);
    }
  });

  it('a gesture in flight cannot change the arm', () => {
    // Ruled Q6 / spec §4: the predicate is SKIPPED while a gesture is live and
    // re-evaluated at gesture end — which subsumes the mid-drag wheel guard and
    // the gesture-scoped latch two earlier fix waves reached for.
    const { store, state, deps } = makeHarness();
    const ENGAGING = poseAtHR(EARTH, SCENE_EARTH.radiusM, 0.1);
    seedPose(store, state, ENGAGING);
    // The drag register is what `orbitDrag` renders, so it carries the same
    // engaging pose — otherwise the arm would hold for want of altitude, not
    // for want of the skip.
    state.cam!.target = new Float32Array(ENGAGING.target) as unknown as Vec3;
    state.cam!.yaw = ENGAGING.yaw;
    state.cam!.pitch = ENGAGING.pitch;
    state.cam!.distance = ENGAGING.distance;
    store.dispatch(beginDrag());

    runFrame(state, deps, 0);

    expect(probe.order).not.toContain('fold');
    expect(state.cameraRuntime.register.pose.frame).toBe('absolute');
    expect(store.getState().camera.base.frame).toBe('absolute');

    store.dispatch(endDrag());
    runFrame(state, deps, 16);

    expect(state.cameraRuntime.register.pose.frame).toEqual(EARTH_ARM);
  });

  it('crossing the engage threshold does not move the rendered camera', () => {
    // The no-snap acceptance criterion (spec §11, FW-E). Frame 1 renders the
    // world arm and engages; frame 2 renders the stored body arm resolved back
    // out. Both frames' poses are captured as `deriveFrameContext` received
    // them — the pose the draw path actually used.
    //
    // Floor: the ruled ≈2 ulp at heliocentric magnitude (≈50 µm at 1 AU), where
    // this fixture sits. Measured residual is 0 m on the eye and ~2e-13 on the
    // unit sightline; a real snap (a dropped roll, the wrong basis, a missed
    // anchor fold) is metres to megametres, decades above either bound.
    const { store, state, deps } = makeHarness();
    seedPose(store, state, poseAtHR(EARTH, SCENE_EARTH.radiusM, 0.1));

    runFrame(state, deps, 0);
    runFrame(state, deps, 16);

    expect(state.cameraRuntime.register.pose.frame).toEqual(EARTH_ARM);
    const before = renderedCamera(probe.drawnPoses[0] as CameraPose);
    const after = renderedCamera(probe.drawnPoses[1] as CameraPose);
    for (let i = 0; i < 3; i++) {
      const eyeDriftM = Math.abs(after.eye[i]! - before.eye[i]!) * SCALE_UNITS.MPC_TO_M;
      expect(eyeDriftM).toBeLessThan(5e-5);
      expect(Math.abs(after.forward[i]! - before.forward[i]!)).toBeLessThan(1e-9);
      expect(Math.abs(after.up[i]! - before.up[i]!)).toBeLessThan(1e-9);
    }
  });

  it('the pivot pin and the follow driver are inert in a body arm', () => {
    // Spec §7 step 4: a body arm co-rotates, so "keep the moving body centred"
    // is structurally satisfied — the pin has nothing to do and the follow
    // driver's approach ease and idle hold have no meaning.
    const { store, state, deps } = makeHarness();
    seedPose(store, state, poseAtHR(EARTH, SCENE_EARTH.radiusM, 0.1));
    store.dispatch(
      setSelectionRow({
        slot: 'focus',
        row: {
          type: 'body',
          id: 'earth',
          label: 'Earth',
          positionMpc: [0, 0, 0],
          radiusM: SCENE_EARTH.radiusM,
        },
      }),
    );

    // Frame 1: the absolute arm, so followBody wins and the fold engages.
    runFrame(state, deps, 0);
    expect(state.cameraRuntime.register.winner).toBe('followBody');
    const engaged = state.cameraRuntime.register.pose;
    expect(engaged.frame).toEqual(EARTH_ARM);

    runFrame(state, deps, 16);

    expect(state.cameraRuntime.register.winner).toBe('resting');
    // Untouched by reference: the pin rebuilds the pose whenever it applies.
    expect(state.cameraRuntime.register.pose).toBe(engaged);
  });

  it('the wheel does not route through applyWheelZoom in a body arm', () => {
    // Spec §7: the three world-arm distance owners are simply not consulted —
    // in a body arm the range belongs to the anchored zoom gesture, which keeps
    // the pose in body-fixed metres. `applyWheelZoom`'s answer would arrive as
    // an ABSOLUTE arm, which is what the frame assertion below rules out.
    const { store, state, deps } = makeHarness();
    seedPose(store, state, poseAtHR(EARTH, SCENE_EARTH.radiusM, 0.1));

    runFrame(state, deps, 0);
    const engaged = state.cameraRuntime.register.pose;
    expect(engaged.frame).toEqual(EARTH_ARM);

    const spy = vi.spyOn(store, 'dispatch');
    state.subsystems.inputAggregator.push({
      kind: 'wheel',
      deltaY: 240,
      duringGesture: false,
      xPx: 500,
      yPx: 500,
    });
    runFrame(state, deps, 16);

    const commits = commitCalls(spy) as { payload: FramedCameraPose }[];
    expect(commits).toHaveLength(1);
    expect(commits[0]!.payload.frame).toEqual(EARTH_ARM);
    // deltaY > 0 zooms out, in metres off the body centre.
    expect(rangeOf(store.getState().camera.base)).toBeGreaterThan(rangeOf(engaged));
  });
});
