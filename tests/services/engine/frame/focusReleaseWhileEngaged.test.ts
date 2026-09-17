/**
 * focusReleaseWhileEngaged — engaged on Earth, a search focus on Mars must
 * release the camera THROUGH the fold (the single regime
 * author) — conversion + commit-on-edge untouched, the follow row active next
 * frame — instead of doing nothing until a manual zoom-out past disengage.
 * Also pins the low-altitude conversion (finite, eye-preserving, targeted at
 * the RELEASED body's centre), the no-flap property (the engage test may not
 * re-capture the eye while the differing focus holds), and the same rule one
 * rung down: a switch between two ROVERS on the same planet.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../src/services/engine/wiring/reevaluateDemand', () => ({
  reevaluateDemand: vi.fn(),
}));
vi.mock('../../../../src/services/engine/frame/deriveSourceMasks', () => ({
  deriveSourceMasks: () => ({ draw: 0, pick: 0 }),
}));
vi.mock('../../../../src/services/gpu/device', () => ({
  resizeCanvasToDisplay: () => false,
}));

import { isBodyArm } from '../../../../src/services/engine/camera/rungs/isBodyArm';
import { foldToWorld } from '../../../../src/services/engine/camera/rungs/foldToWorld';
import { frameKey } from '../../../../src/services/engine/camera/rungs/frameKey';
import { poseAtHR } from '../../../helpers/camera/poseAtHR';
import { makeCameraSimHarness } from '../../../helpers/camera/makeCameraSimHarness';
import { diveUntilEngaged } from '../../../helpers/camera/diveUntilEngaged';
import { driveWheelEvents } from '../../../helpers/camera/driveWheelEvents';
import { displayedEye } from '../../../helpers/camera/displayedEye';
import { bodyFocusDistance } from '../../../../src/services/engine/camera/bodyFocusDistance';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';
import { liveWorldPose } from '../../../../src/services/engine/helpers/liveWorldPose';
import { sitePointBodyFixed } from '../../../../src/utils/camera/sitePointBodyFixed';
import { positionDriverById } from '../../../../src/data/bodies/positionDrivers';
import { bodyFootprintRadiusM } from '../../../../src/utils/scene/bodyFootprintRadiusM';
import { findByIdOrThrow } from '../../../../src/utils/object/findByIdOrThrow';
import { rotateVec3ByTightMat3 } from '../../../../src/utils/math/rotateVec3ByTightMat3';
import { normalize3 } from '../../../../src/utils/math/normalize3';
import { resume } from '../../../../src/state/time/timeSlice';
import { clipStarted, resolveClipStart } from '../../../../src/state/camera/cameraSlice';
import { tween } from '../../../../src/services/engine/animation/effectHelpers';
import { SCENE_BODIES } from '../../../../src/data/bodies/sceneBodies';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { SCENE_CELESTIAL_BODIES } from '../../../../src/data/bodies/sceneCelestialBodies';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { DEFAULT_ORIENTATION } from '../../../../src/data/defaults';
import { DEFAULT_CAMERA_TUNING as TUNING } from '../../../../src/data/camera/cameraTuning';
import { datumOnlyTerrainHeight } from '../../../../src/utils/camera/datumOnlyTerrainHeight';
import type { BodyId } from '../../../../src/@types/data/body/BodyId';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const SIM = CONST_J2000;
const BODIES = deriveBodyStates(SIM);
const EARTH = BODIES.get('earth')! as BodyState;
const MARS = BODIES.get('mars')! as BodyState;
// The outer bound, matching cameraDrivers'/focusFraming's own read of
// bodyFootprintRadiusM — not the datum, which F2's Earth relief now diverges
// from by 0.14%.
const R_MPC = bodyFootprintRadiusM(SCENE_EARTH) * SCALE_UNITS.M_TO_MPC;

function distTo(eye: Readonly<Vec3>, body: BodyState): number {
  return Math.hypot(
    eye[0]! - body.positionMpc[0]!,
    eye[1]! - body.positionMpc[1]!,
    eye[2]! - body.positionMpc[2]!,
  );
}

describe('focus release while engaged (round 10)', () => {
  it('focusing Mars from an engaged Earth camera releases, converts sanely, and follows', () => {
    const h = makeCameraSimHarness();

    // Dive through engage to h/R ≈ 0.1 (the brief's low-altitude case, deep
    // in the band).
    const events: { t: number; deltaY: number }[] = [];
    let t = 1000;
    for (let i = 0; i < 35; i += 1, t += 33) events.push({ t, deltaY: -100 });
    driveWheelEvents(h, events, t + 500);

    expect(h.state.cameraRuntime.register.pose.frame).not.toBe('absolute'); // engaged
    const eyeBefore = displayedEye(h.state);
    const marsBefore = distTo(eyeBefore, MARS);
    const hrBefore = distTo(eyeBefore, EARTH) / R_MPC - 1;
    expect(hrBefore).toBeLessThan(TUNING.engageHR); // deep in the band

    // The user's action: search-focus Mars. Without the fix nothing happens
    // until a manual zoom-out past disengage.
    h.focus('mars');
    h.frame();

    // Release frame: the fold flipped the regime through its own conversion +
    // commit site — target at the RELEASED body's centre, eye preserved,
    // everything finite at h/R ≈ 0.1.
    const base = h.store.getState().camera.base;
    expect(base.frame).toBe('absolute');
    expect(base.frame === 'absolute' && base.pose).toBeTruthy();
    const released = base.pose as CameraPose;
    for (const v of [
      released.target[0]!,
      released.target[1]!,
      released.target[2]!,
      released.yaw,
      released.pitch,
      released.distance,
      released.roll ?? 0,
    ]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(released.target[0]).toBeCloseTo(EARTH.positionMpc[0]!, 12);
    expect(released.target[1]).toBeCloseTo(EARTH.positionMpc[1]!, 12);
    expect(released.target[2]).toBeCloseTo(EARTH.positionMpc[2]!, 12);
    expect(released.distance / R_MPC).toBeCloseTo(1 + hrBefore, 6); // eye preserved

    // Follow-through: the arm stays absolute EVERY frame (no engage/release
    // flap while the eye is still inside Earth's engage range), the follow row
    // takes the frame, and the camera actually travels to Mars.
    for (let i = 0; i < 150; i += 1) {
      h.frame();
      expect(h.state.cameraRuntime.register.pose.frame).toBe('absolute');
    }
    expect(h.state.cameraRuntime.register.winner).toBe('followHold');
    const eyeAfter = displayedEye(h.state);
    expect(distTo(eyeAfter, MARS)).toBeLessThan(marsBefore * 1e-2);
  });

  const MARS_PARK: CameraPose = {
    target: [MARS.positionMpc[0]!, MARS.positionMpc[1]!, MARS.positionMpc[2]!],
    yaw: 0.7,
    pitch: 0.3,
    distance: 3390000 * 1.1 * SCALE_UNITS.M_TO_MPC, // h/R 0.1 over Mars, inside engage
    roll: 0,
  };

  it('parked at another body with a stale body focus: no engage there — follow flies to the focus (R10-1)', () => {
    // The clip-path corner: a hand-authored `flyToClip`/`flyPath` can land at
    // Mars's surface with the boot-seeded Earth focus still set. Without the
    // focus gate, a focus-blind engage would capture Mars during the
    // approach; with the gate, no engage happens, so the follow's
    // eye-preserving capture flies the camera from Mars's surface to the
    // FOCUSED body and settles absolute at its framing distance.
    const h = makeCameraSimHarness(); // focus = Earth (the boot seed)
    h.seedPose(absoluteArm(MARS_PARK));
    const startDist = distTo(displayedEye(h.state), MARS);
    for (let time = 16; time <= 1600; time += 16) {
      h.tick(time);
      expect(h.state.cameraRuntime.register.pose.frame).toBe('absolute'); // never Mars
    }
    const endDist = distTo(displayedEye(h.state), MARS);
    expect(endDist).toBeGreaterThan(startDist * 100); // gone — at Earth
    const dEarth = distTo(displayedEye(h.state), EARTH);
    const earthFraming = bodyFocusDistance(R_MPC, Math.PI / 3);
    expect(Math.abs(dEarth - earthFraming) / earthFraming).toBeLessThan(1e-3);
  });

  it('a clip that lands at a body with THAT body focused: engages, and stays', () => {
    // The ordinary tour landing, flown the way `flyAndFocusOnClip` flies it —
    // the focus cue at beat START, then the clip glides in. The clip DELIVERS
    // the framing, so it settles the debt its own cue created; if it did not,
    // the approach owed on the exit frame would fly the eye straight back out
    // to h/R 3.3, which is why this runs well past `FOCUS_TWEEN_MS`.
    const h = makeCameraSimHarness({ focusBody: null, bootHR: null, realClipPlayer: true });
    const start: CameraPose = { ...MARS_PARK, distance: bodyFocusDistance(MARS_R_MPC, FOV) };
    h.seedPose(absoluteArm(start));
    h.focus('mars');
    h.store.dispatch(
      clipStarted({
        data: resolveClipStart(
          { timeline: [tween('distance', { to: MARS_PARK.distance, over: 0.5 })] },
          start,
        ),
        frame: DEFAULT_ORIENTATION,
      }),
    );

    h.frame(40); // 640 ms: the 500 ms leg has ended and handed the camera back
    expect(h.store.getState().camera.clip).toBeNull();
    h.frame(60);

    const framed = h.state.cameraRuntime.register.pose;
    expect(isBodyArm(framed) && framed.frame.body).toBe('mars');
  });
});

/** The distinct regimes `camera.base` passed through, in order. */
function regimeTrace(h: ReturnType<typeof makeCameraSimHarness>, frames: number): string[] {
  const seq: string[] = [frameKey(h.store.getState().camera.base.frame)];
  for (let i = 0; i < frames; i += 1) {
    h.frame();
    const key = frameKey(h.store.getState().camera.base.frame);
    if (seq[seq.length - 1] !== key) seq.push(key);
  }
  return seq;
}

const MARS_ROW = SCENE_CELESTIAL_BODIES.find((row) => row.id === 'mars')!;
const MARS_R = MARS_ROW.surface.datumRadiusM;
// Framing reads the outer bound, like R_MPC above: Mars's relief moves it 27 km off the datum.
const MARS_R_MPC = bodyFootprintRadiusM(MARS_ROW) * SCALE_UNITS.M_TO_MPC;
const B = ORIENTATION_FRAMES[DEFAULT_ORIENTATION];
const RUNG_CTX = {
  bodies: BODIES as ReadonlyMap<BodyId, BodyState>,
  poseBasis: B,
  upBasis: B,
  terrainHeightAt: datumOnlyTerrainHeight,
};
const FOV = Math.PI / 3;

/** Metres between a world-Mpc eye and a world-Mpc point. */
function metresBetween(a: Readonly<Vec3>, b: Readonly<Vec3>): number {
  return Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!) / SCALE_UNITS.M_TO_MPC;
}

/** Curiosity's world position (Mpc) for the bodies a fixture is driven with. */
function roverMpc(bodies: ReadonlyMap<string, BodyState>): Vec3 {
  const driver = positionDriverById('curiosity' as BodyId);
  if (driver.kind !== 'surfaceFixed') throw new Error('curiosity is not a site');
  const p = sitePointBodyFixed(driver, MARS_R);
  const mars = bodies.get('mars')!;
  const local = rotateVec3ByTightMat3(p as Vec3, mars.orientation);
  return [
    local[0] * SCALE_UNITS.M_TO_MPC + mars.positionMpc[0]!,
    local[1] * SCALE_UNITS.M_TO_MPC + mars.positionMpc[1]!,
    local[2] * SCALE_UNITS.M_TO_MPC + mars.positionMpc[2]!,
  ];
}

/** The framing distance the rover's own approach flies to, in metres. */
const ROVER_FRAMING_M =
  bodyFocusDistance(
    bodyFootprintRadiusM(findByIdOrThrow(SCENE_BODIES, 'curiosity', 'test')) * SCALE_UNITS.M_TO_MPC,
    FOV,
  ) / SCALE_UNITS.M_TO_MPC;

describe('focus switch between two rovers on one planet (adverse 5)', () => {
  it('from a rover site, focusing another rover flies there and lands its site arm', () => {
    // Curiosity's site is 142° of Mars around from Opportunity's,
    // so the Mars arm holding Opportunity's focus could serve Curiosity only by
    // seeing through the planet. Held, no driver is live — the pin and the
    // follow pair are inert in a body arm — so the eye sat 6,400 km away
    // forever and the search row lied.
    const h = makeCameraSimHarness({ focusBody: null, bootHR: null });
    h.seedPose(
      absoluteArm(
        foldToWorld(
          {
            frame: { site: 'opportunity' as BodyId },
            pose: {
              siteId: 'opportunity' as BodyId,
              headingRad: 0.4,
              elevationRad: 0.5,
              rangeM: 60,
            },
          },
          RUNG_CTX,
        ),
      ),
    );
    h.focus('opportunity');
    h.frame(40);
    expect(frameKey(h.store.getState().camera.base.frame)).toBe('site:opportunity');

    h.focus('curiosity');
    const trace = regimeTrace(h, 900);

    // Out to the world arm — the only rung the follow approach is live in —
    // then back down Mars's band into the new rover's site arm. Asserted whole
    // because the LENGTH is half the property: the same release rule without
    // its mirror in `engage` re-enters Mars's band every frame of the crossing
    // and flaps `body:mars`/`absolute` at 60 Hz instead of descending.
    expect(trace).toEqual([
      'site:opportunity',
      'body:mars',
      'absolute',
      'body:mars',
      'site:curiosity',
    ]);
  });

  it('from the Mars arm with Mars focused, focusing a rover flies there (main parity)', () => {
    // The same knot without a site rung in it, and the regression this branch
    // introduced: on main `release` fired on `focus !== host` and the approach
    // flew to the rover, so selecting a rover from Mars orbit did something.
    const h = makeCameraSimHarness({ focusBody: null, bootHR: null });
    h.seedPose(absoluteArm(poseAtHR(MARS, MARS_R, 0.1)));
    // Mars's arm the way the app reaches it: a focus owes an approach from
    // wherever the eye is, so focusing Mars from h/R 0.1 flies OUT to its
    // framing first; the dive back through the engage band is what lands the
    // arm. Sitting still inside a freshly focused body's band is not a state.
    h.focus('mars');
    h.frame(60);
    diveUntilEngaged(h, { body: 'mars' });
    expect(frameKey(h.store.getState().camera.base.frame)).toBe('body:mars');

    h.focus('curiosity');
    const trace = regimeTrace(h, 900);

    expect(trace).toEqual(['body:mars', 'absolute', 'body:mars', 'site:curiosity']);
    expect(metresBetween(displayedEye(h.state), roverMpc(BODIES))).toBeCloseTo(ROVER_FRAMING_M, 2);
  });

  it('a hosted focus the arm can still see keeps it — the §4.8 hold', () => {
    // The other side of the rule, and why it is the horizon and not the focus
    // edge: an eye overhead of Curiosity's site IS serving Curiosity, so the arm holds
    // and a zoom-out from the rover is not yanked to framing distance.
    const h = makeCameraSimHarness({ focusBody: null, bootHR: null });
    h.seedPose(
      absoluteArm(
        foldToWorld(
          {
            frame: { site: 'curiosity' as BodyId },
            pose: {
              siteId: 'curiosity' as BodyId,
              headingRad: 0.4,
              elevationRad: 0.5,
              rangeM: 60,
            },
          },
          RUNG_CTX,
        ),
      ),
    );
    h.focus('curiosity');
    h.frame(40);
    expect(frameKey(h.store.getState().camera.base.frame)).toBe('site:curiosity');

    // Zoom out past `siteDisengageR` and stop: the Mars arm takes it and KEEPS
    // it — the rover is still under the eye.
    for (let i = 0; i < 40; i += 1) h.wheel(240);
    expect(frameKey(h.store.getState().camera.base.frame)).toBe('body:mars');
    h.frame(120);
    expect(frameKey(h.store.getState().camera.base.frame)).toBe('body:mars');
  });
});

describe('focusing the host from a rover site (adverse 10)', () => {
  /** Stand `rangeM` from the rover, off-nadir: 60 m is inside the site band, 150 m above it. */
  function seedAtCuriosity(h: ReturnType<typeof makeCameraSimHarness>, rangeM: number): void {
    h.seedPose(
      absoluteArm(
        foldToWorld(
          {
            frame: { site: 'curiosity' as BodyId },
            pose: {
              siteId: 'curiosity' as BodyId,
              headingRad: 0.4,
              elevationRad: 0.5,
              rangeM,
            },
          },
          RUNG_CTX,
        ),
      ),
    );
  }

  function standOnCuriosity() {
    const h = makeCameraSimHarness({ focusBody: null, bootHR: null });
    seedAtCuriosity(h, 60);
    h.focus('curiosity');
    h.frame(40);
    expect(frameKey(h.store.getState().camera.base.frame)).toBe('site:curiosity');
    return h;
  }

  it('flies out to the host framing, and back in to the rover on the next focus', () => {
    // The user's report: standing at Curiosity, double-clicking Mars did
    // nothing — `bodyRung.release` holds an arm whose host IS the focus, and
    // the approach that owes the framing was gated out of every arm below the
    // world's, so no driver could fly it.
    const h = standOnCuriosity();

    h.focus('mars');
    const out = regimeTrace(h, 900);
    // Whole, in order: the length is half the property — a release without the
    // approach behind it lands `body:mars` and stops there.
    expect(out).toEqual(['site:curiosity', 'body:mars', 'absolute']);
    const marsFraming = bodyFocusDistance(MARS_R_MPC, FOV);
    expect(distTo(displayedEye(h.state), MARS) / marsFraming).toBeCloseTo(1, 6);

    h.focus('curiosity');
    const back = regimeTrace(h, 900);
    expect(back).toEqual(['absolute', 'body:mars', 'site:curiosity']);
    expect(ROVER_FRAMING_M).toBeCloseTo(10.73, 2);
    expect(metresBetween(displayedEye(h.state), roverMpc(BODIES))).toBeCloseTo(ROVER_FRAMING_M, 2);
  });

  it('a wheel notch during the owed approach moves where the approach arrives', () => {
    // The regression the arm split left behind: in the world arm a notch is
    // absorbed into `followDistanceTarget`, so the wheel and the approach never
    // fight over the distance; below it the notch went to the rung's own
    // channels and the approach overwrote them, so for the ~600 ms a debt is
    // owed the wheel did nothing at all (it arrived at the bare framing).
    const h = makeCameraSimHarness({ focusBody: null, bootHR: null });
    seedAtCuriosity(h, 150); // above the site band: the notch lands in Mars's arm
    h.focus('curiosity');
    h.frame(2); // the approach owns the frame and has captured its target
    expect(h.state.cameraRuntime.register.winner).toBe('followApproach');
    expect(frameKey(h.store.getState().camera.base.frame)).toBe('body:mars');

    h.push({ kind: 'wheel', deltaY: 240, duringGesture: false, xPx: 70, yPx: 30 });
    h.frame(60); // past FOCUS_TWEEN_MS — the approach saturates at its target

    // The notch lands whole on the target the approach then flies to: e^0.24
    // for deltaY 240, untapered because a rover's pivot carries no surface
    // radius to measure an altitude above.
    const arrival = metresBetween(displayedEye(h.state), roverMpc(BODIES));
    expect(arrival).toBeCloseTo(13.646, 2);
    expect(arrival / ROVER_FRAMING_M).toBeCloseTo(Math.exp(0.24), 4);
  });

  it('a re-dispatch of the focus already framed leaves the rover centred, clock running', () => {
    // A focus row is a fresh object every dispatch (a same-body re-select
    // included), so the edge DOES fire here and the debt is re-created. With
    // the approach row free of the arm gate that has to be a no-op move, not a
    // re-frame that walks the eye off a body the clock is moving under it.
    const h = standOnCuriosity();
    h.store.dispatch(resume({ nowMs: 16 * 41 }));

    h.focus('curiosity');
    let worstOffAxisRad = 0;
    let worstRangeErr = 0;
    for (let i = 0; i < 120; i += 1) {
      h.frame();
      const rover = roverMpc(deriveBodyStates(h.state.cameraRuntime.outputs.simDays));
      const world = liveWorldPose(h.state);
      const eye = displayedEye(h.state);
      const toRover = normalize3([
        rover[0] - eye[0]!,
        rover[1] - eye[1]!,
        rover[2] - eye[2]!,
      ] as Vec3);
      const forward = normalize3([
        world.target[0]! - eye[0]!,
        world.target[1]! - eye[1]!,
        world.target[2]! - eye[2]!,
      ] as Vec3);
      const dot = toRover[0] * forward[0] + toRover[1] * forward[1] + toRover[2] * forward[2];
      worstOffAxisRad = Math.max(worstOffAxisRad, Math.acos(Math.max(-1, Math.min(1, dot))));
      worstRangeErr = Math.max(worstRangeErr, Math.abs(metresBetween(eye, rover) - 10.73));
    }
    expect(frameKey(h.store.getState().camera.base.frame)).toBe('site:curiosity');
    // Half a degree of the 60° lens: the rover stays on the crosshair.
    expect(worstOffAxisRad).toBeLessThan(0.009);
    expect(worstRangeErr).toBeLessThan(0.2);
  });
});
