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

// Spies that DELEGATE to the real modules: the fold's placement is a call-order
// property, so the frame has to run its production path while the probe records
// where each step landed. `state` is the live EngineState, read inside the
// stepRung spy to prove `register.pose` has not been updated yet at fold time.
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
vi.mock('../../../../src/services/engine/camera/rungs/stepRung', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../src/services/engine/camera/rungs/stepRung')>();
  return {
    ...actual,
    stepRung: (...args: Parameters<typeof actual.stepRung>) => {
      probe.order.push('fold');
      probe.lastPoseAtFold.push((probe.state as EngineState | null)?.cameraRuntime.register.pose);
      return actual.stepRung(...args);
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
import { isBodyArm } from '../../../../src/services/engine/camera/rungs/isBodyArm';
import { isSiteArm } from '../../../../src/services/engine/camera/rungs/isSiteArm';
import { foldToWorld } from '../../../../src/services/engine/camera/rungs/foldToWorld';
import { frameKey } from '../../../../src/services/engine/camera/rungs/frameKey';
import { FOCUS_TWEEN_MS } from '../../../../src/services/engine/camera/focusTweenDuration';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { toBodyArm } from '../../../../src/services/engine/camera/poseFrameConversion';
import { bodyFixedEyeM } from '../../../../src/utils/camera/bodyFixedEyeM';
import { tiltFromNadirRad } from '../../../../src/utils/camera/tiltFromNadirRad';
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
import { DEFAULT_CAMERA_TUNING as TUNING } from '../../../../src/data/camera/cameraTuning';
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

/**
 * The wheel's cursor pixel for the two hand-back cases. OFF centre on purpose:
 * a focused rover sits at screen centre, so a cursor there makes the cursor
 * pick and the rover coincide and hides every pivot defect they exist for.
 */
const WHEEL_PX = { xPx: 70, yPx: 30 } as const;

/** Angle between the last DRAWN sightline and the rover — off screen centre. */
function offRoverRad(rover: BodyState): number {
  const drawn = renderedCamera(probe.drawnPoses[probe.drawnPoses.length - 1] as CameraPose);
  const toRover = normalize3([
    rover.positionMpc[0]! - drawn.eye[0]!,
    rover.positionMpc[1]! - drawn.eye[1]!,
    rover.positionMpc[2]! - drawn.eye[2]!,
  ] as Vec3);
  return Math.acos(
    Math.min(
      1,
      drawn.forward[0]! * toRover[0]! +
        drawn.forward[1]! * toRover[1]! +
        drawn.forward[2]! * toRover[2]!,
    ),
  );
}

/** Geocentric range of a body-arm pose, metres — the anchor is the centre. */
function rangeOf(framed: FramedCameraPose): number {
  if (!isBodyArm(framed)) throw new Error('rangeOf: not a body arm');
  return Math.hypot(...framed.pose.eyeRelAnchorM);
}

/**
 * Park in Curiosity's site arm with the rover focused and the approach
 * saturated — the two frames a follow-tween apart are what captures the follow
 * memory's distance, which the hand-back cases below need (a memory taken
 * fresh at a flip is eye-preserving by construction and hides them).
 */
function parkAtCuriositySite(h: ReturnType<typeof makeHarness>): void {
  const site = { site: 'curiosity' as BodyId } as const;
  const parked = foldToWorld(
    { frame: site, pose: { siteId: site.site, headingRad: 0.4, elevationRad: 0.5, rangeM: 2e5 } },
    { bodies: deriveBodyStates(SIM) as ReadonlyMap<BodyId, BodyState>, poseBasis: B, upBasis: B },
  );
  h.seedPose(absoluteArm(parked));
  h.focus('curiosity');
  h.tick(0);
  h.tick(FOCUS_TWEEN_MS + 16);
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
    const PRODUCED = poseAtHR(EARTH, SCENE_EARTH.surface.datumRadiusM, 12);
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
    seedPose(store, state, poseAtHR(EARTH, SCENE_EARTH.surface.datumRadiusM, 0.1));
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
    const FROM = poseAtHR(EARTH, SCENE_EARTH.surface.datumRadiusM, 0.1);
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
    const FAR = poseAtHR(EARTH, SCENE_EARTH.surface.datumRadiusM, 5);
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
    // every driven recession reaches the boundary with. A tenth of the edge
    // below it, derived so a band re-tune keeps the premise.
    const NEAR_EDGE = poseAtHR(EARTH, SCENE_EARTH.surface.datumRadiusM, TUNING.disengageHR * 0.9);
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
        },
      }),
    );

    // One wheel notch out: factor e^0.24 ≈ 1.27 on the ALTITUDE (the anchor is
    // the sub-eye footprint), so 0.9 of the edge clears it with margin.
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

  it('disengaging from a body that only HOSTS the focus keeps the eye continuous', () => {
    // Pop-3, pop-2's sibling under §4.8: a rover focus KEEPS its planet's arm,
    // so the arm's host (Mars) and the body an absolute `target` means to the
    // rows that re-read it (Curiosity) differ. Normalizing the disengage onto
    // the host committed a Mars-centre distance that the next frame re-applied
    // from the rover, teleporting the eye one Mars radius (3,390 km) out.
    //
    // The wheel-out is run from the site arm rather than seeded at the band
    // edge because the pop needs a follow memory with a captured distance: a
    // memory taken fresh at the flip is eye-preserving by construction and
    // hides it, exactly as the user's approach-then-zoom-out does not.
    const h = makeHarness();
    parkAtCuriositySite(h);

    let crossing = -1;
    for (let i = 0; i < 80 && crossing < 0; i++) {
      h.push({ kind: 'wheel', deltaY: 240, duringGesture: false, xPx: 50, yPx: 50 });
      h.frame(1);
      if (h.store.getState().camera.base.frame === 'absolute') {
        crossing = probe.drawnPoses.length - 1;
      }
    }
    expect(crossing).toBeGreaterThan(0);
    h.frame(1); // quiet: no notch, so any eye motion here is the hand-back's

    // The eye keeps pop-2's conversion floor (0 m measured; the bug was 3.4e6 m).
    // The sightline's bound is ONE PIXEL of the fixture's viewport, 1.0e-2 rad
    // against 8.6e-13 measured — the hand-back's arm holds the rover on its
    // sightline (the case below), so the normalization's re-aim is a no-op.
    const onePixelRad =
      h.state.cameraRuntime.outputs.projection.fovYRad /
      (h.deps.canvas as { height: number }).height;
    const flip = renderedCamera(probe.drawnPoses[crossing] as CameraPose);
    const settled = renderedCamera(probe.drawnPoses[crossing + 1] as CameraPose);
    for (let i = 0; i < 3; i++) {
      const eyeDriftM = Math.abs(settled.eye[i]! - flip.eye[i]!) * SCALE_UNITS.MPC_TO_M;
      expect(eyeDriftM).toBeLessThan(5e-5);
      expect(Math.abs(settled.forward[i]! - flip.forward[i]!)).toBeLessThan(onePixelRad);
    }
  });

  it('the site hand-back keeps the focused rover on the sightline as the tilt ramps out', () => {
    // The adverse eye check: zooming out from Opportunity, the rover left the
    // frame the moment the site arm handed back to Mars's. The ramp itself is
    // right (ruling 12: the body arm's display tilt settles to the remembered
    // 0, so the disengage is view-exact) — but `settledZoomPose` turned the
    // basis about the EYE on a recession, and the arm the hand-back builds is
    // anchored AT the rover with the rover on its sightline. Tilt and heading
    // each spent their 0.1-rad-per-log-zoom cap per notch, swinging the rover
    // 0.31 → 0.74 rad off centre — 1.4 half-FOVs, off screen — before the
    // recession's own geometry walked it back.
    //
    // The bound: a settle that turns about the rover cannot move the rover off
    // the sightline AT ALL, so this is the fixture's own ONE PIXEL
    // (fovY/height, 1.0e-2 rad) against 2.1e-8 measured.
    //
    // The residual the first fix left: the turns pivoted about the rover while
    // the eye still TRANSLATED about the cursor pick, so the rover walked off
    // by the parallax between them — 0.32 rad at this cursor, 0.46 at (80,20),
    // 0 only when the cursor sits on the rover. Six resting frames mid-ramp
    // pin the other half: nothing moves a body arm without an input step.
    const h = makeHarness();
    parkAtCuriositySite(h);
    const rover = h.bodies.get('curiosity')!;

    const offRover: number[] = [];
    const tiltRad: number[] = [];
    let restedTilt: number[] = [];
    let crossed = false;
    for (let i = 0; i < 80 && !crossed; i++) {
      h.push({ kind: 'wheel', deltaY: 240, duringGesture: false, ...WHEEL_PX });
      h.frame(1);
      const arm = h.state.cameraRuntime.register.pose;
      if (isBodyArm(arm)) {
        const eyeM = bodyFixedEyeM(arm.pose);
        const b = arm.pose.basisLocal;
        tiltRad.push(tiltFromNadirRad([b[6]!, b[7]!, b[8]!], eyeM));
        offRover.push(offRoverRad(rover));
        if (tiltRad.length === 3) {
          for (let r = 0; r < 6; r++) {
            h.frame(1);
            const rested = h.state.cameraRuntime.register.pose;
            if (!isBodyArm(rested)) throw new Error('a resting frame changed the arm');
            const rb = rested.pose.basisLocal;
            restedTilt.push(tiltFromNadirRad([rb[6]!, rb[7]!, rb[8]!], bodyFixedEyeM(rested.pose)));
            offRover.push(offRoverRad(rover));
          }
        }
      }
      crossed = h.store.getState().camera.base.frame === 'absolute';
    }
    expect(crossed).toBe(true);

    const onePixelRad =
      h.state.cameraRuntime.outputs.projection.fovYRad /
      (h.deps.canvas as { height: number }).height;
    for (const off of offRover) expect(off).toBeLessThan(onePixelRad);
    // A frame with no input steps no rung, so the ramp cannot advance on one —
    // the clock alone must not move the pose by so much as an ulp.
    restedTilt = [...new Set(restedTilt)];
    expect(restedTilt).toHaveLength(1);
    // Not vacuous: the ramp still runs its whole course — 45° of pose tilt
    // spent down to nothing — or holding the rover centred by freezing the
    // settle would pass all of the above too.
    expect(tiltRad[0]!).toBeGreaterThan(0.7);
    expect(tiltRad[tiltRad.length - 1]!).toBeLessThan(onePixelRad);
  });

  it('diving back into the site arm engages with nothing to re-aim', () => {
    // The adverse eye check's other half: zooming back IN from Mars's arm to
    // the rover popped. `sitePoseFromBodyArm` DISCARDS the incoming basis (the
    // rung looks at the site by construction), so whatever the body arm's
    // sightline missed the rover by is spent in the engage frame — 0.63 rad
    // (36°) against neighbouring notches at 1.9e-6, because the dive pivoted
    // about the cursor pick. The eye is continuous across it either way, so
    // this bound is on the sightline alone.
    const h = makeHarness();
    parkAtCuriositySite(h);
    const rover = h.bodies.get('curiosity')!;

    // Out of the site arm first — the park's own frame is what engages it, so
    // the test is AFTER the frame, never before it.
    for (let i = 0; i < 40; i++) {
      h.push({ kind: 'wheel', deltaY: 240, duringGesture: false, ...WHEEL_PX });
      h.frame(1);
      if (!isSiteArm(h.state.cameraRuntime.register.pose)) break;
    }
    for (let i = 0; i < 12; i++) {
      h.push({ kind: 'wheel', deltaY: 240, duringGesture: false, ...WHEEL_PX });
      h.frame(1);
    }
    expect(isBodyArm(h.state.cameraRuntime.register.pose)).toBe(true);

    const fwdStep: number[] = [];
    const offRover: number[] = [];
    let prev = renderedCamera(probe.drawnPoses[probe.drawnPoses.length - 1] as CameraPose);
    let engaged = 0;
    for (let i = 0; i < 60 && engaged < 3; i++) {
      h.push({ kind: 'wheel', deltaY: -240, duringGesture: false, ...WHEEL_PX });
      h.frame(1);
      const drawn = renderedCamera(probe.drawnPoses[probe.drawnPoses.length - 1] as CameraPose);
      fwdStep.push(
        Math.hypot(
          drawn.forward[0]! - prev.forward[0]!,
          drawn.forward[1]! - prev.forward[1]!,
          drawn.forward[2]! - prev.forward[2]!,
        ),
      );
      offRover.push(offRoverRad(rover));
      prev = drawn;
      if (isSiteArm(h.state.cameraRuntime.register.pose)) engaged += 1;
    }
    expect(engaged).toBe(3);

    const onePixelRad =
      h.state.cameraRuntime.outputs.projection.fovYRad /
      (h.deps.canvas as { height: number }).height;
    for (const step of fwdStep) expect(step).toBeLessThan(onePixelRad);
    for (const off of offRover) expect(off).toBeLessThan(onePixelRad);
    // Not vacuous: the descent really closed, three orders of magnitude of it.
    const range = h.state.cameraRuntime.register.pose;
    if (!isSiteArm(range)) throw new Error('the dive did not engage the site arm');
    expect(range.pose.rangeM).toBeLessThan(1e2);
  });

  it('a gesture in flight cannot change the arm', () => {
    // Ruled Q6 / spec §4: the predicate is SKIPPED while a gesture is live and
    // re-evaluated at gesture end — which subsumes the mid-drag wheel guard and
    // the gesture-scoped latch two earlier fix waves reached for.
    const { store, state, deps } = makeHarness();
    const ENGAGING = poseAtHR(EARTH, SCENE_EARTH.surface.datumRadiusM, 0.1);
    seedPose(store, state, ENGAGING);
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
    seedPose(store, state, poseAtHR(EARTH, SCENE_EARTH.surface.datumRadiusM, 0.1));

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
    seedPose(store, state, poseAtHR(EARTH, SCENE_EARTH.surface.datumRadiusM, 0.1));
    store.dispatch(
      setSelectionRow({
        slot: 'focus',
        row: {
          type: 'body',
          id: 'earth',
          label: 'Earth',
          positionMpc: [0, 0, 0],
        },
      }),
    );

    // Frame 1: the absolute arm, so the follow approach wins and the fold engages.
    runFrame(state, deps, 0);
    expect(state.cameraRuntime.register.winner).toBe('followApproach');
    const engaged = state.cameraRuntime.register.pose;
    expect(engaged.frame).toEqual(EARTH_ARM);

    runFrame(state, deps, 16);

    expect(state.cameraRuntime.register.winner).toBe('resting');
    // Untouched by reference: the pin rebuilds the pose whenever it applies.
    expect(state.cameraRuntime.register.pose).toBe(engaged);
  });

  it('an approach owns the rung until it reaches its focus, then descends one rung per frame', () => {
    // §4.8, both halves at once: engaging Mars mid-approach kills the ease at
    // Mars's engage band, ~1500 km short of a rover framed in metres; and the
    // descent that follows is TWO frames, one rung each.
    const { store, state, deps } = makeHarness();
    const site = { site: 'curiosity' as BodyId } as const;
    const ctx = {
      bodies: deriveBodyStates(SIM) as ReadonlyMap<BodyId, BodyState>,
      poseBasis: B,
      upBasis: B,
    };
    // 30 m out at 0.5 rad elevation: inside the site band, above its floors.
    const parked = foldToWorld(
      { frame: site, pose: { siteId: site.site, headingRad: 0.4, elevationRad: 0.5, rangeM: 30 } },
      ctx,
    );
    seedPose(store, state, parked);
    const rover = deriveBodyStates(SIM).get('curiosity')!;
    store.dispatch(
      setSelectionRow({
        slot: 'focus',
        row: {
          type: 'body',
          id: 'curiosity',
          label: 'Curiosity',
          positionMpc: [rover.positionMpc[0]!, rover.positionMpc[1]!, rover.positionMpc[2]!],
        },
      }),
    );

    const frames = [0, FOCUS_TWEEN_MS, FOCUS_TWEEN_MS + 16, FOCUS_TWEEN_MS + 32].map((nowMs) => {
      runFrame(state, deps, nowMs);
      return frameKey(store.getState().camera.base.frame);
    });

    expect(frames).toEqual(['absolute', 'body:mars', 'site:curiosity', 'site:curiosity']);
  });

  it('the wheel does not route through applyWheelZoom in a body arm', () => {
    // Spec §7: the three world-arm distance owners are simply not consulted —
    // in a body arm the range belongs to the anchored zoom gesture, which keeps
    // the pose in body-fixed metres. `applyWheelZoom`'s answer would arrive as
    // an ABSOLUTE arm, which is what the frame assertion below rules out.
    const { store, state, deps } = makeHarness();
    seedPose(store, state, poseAtHR(EARTH, SCENE_EARTH.surface.datumRadiusM, 0.1));

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
