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
import { driveWheelEvents } from '../../../helpers/camera/driveWheelEvents';
import { displayedEye } from '../../../helpers/camera/displayedEye';
import { bodyFocusDistance } from '../../../../src/services/engine/camera/bodyFocusDistance';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { SCENE_CELESTIAL_BODIES } from '../../../../src/data/bodies/sceneCelestialBodies';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { DEFAULT_ORIENTATION } from '../../../../src/data/defaults';
import { DEFAULT_CAMERA_TUNING as TUNING } from '../../../../src/data/camera/cameraTuning';
import type { BodyId } from '../../../../src/@types/data/body/BodyId';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const SIM = CONST_J2000;
const BODIES = deriveBodyStates(SIM);
const EARTH = BODIES.get('earth')! as BodyState;
const MARS = BODIES.get('mars')! as BodyState;
const R_MPC = SCENE_EARTH.surface.datumRadiusM * SCALE_UNITS.M_TO_MPC;

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

  it('parked at a body with THAT body focused, after an earlier follow: engages on the next fold', () => {
    // The ordinary tour landing (`flyAndFocusOnClip` aligns focus with the
    // destination) in the ordinary session (the boot focus has followed
    // before any beat lands). A capture that treats the switch as a cut to
    // the framing distance yanks the eye out to h/R 3.3 and never engages.
    const h = makeCameraSimHarness();
    h.frame(3); // follow Earth first (t = 16, 32, 48)
    h.focus('mars');
    // A cut, not a flight: the reseed's fresh epochs and memory are intended.
    h.seedPose(absoluteArm(MARS_PARK));
    h.tick(64);
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

describe('focus switch between two rovers on one planet (adverse 5)', () => {
  const MARS_R = SCENE_CELESTIAL_BODIES.find((row) => row.id === 'mars')!.surface.datumRadiusM;
  const B = ORIENTATION_FRAMES[DEFAULT_ORIENTATION];
  const RUNG_CTX = { bodies: BODIES as ReadonlyMap<BodyId, BodyState>, poseBasis: B, upBasis: B };

  it('from a rover site, focusing another rover flies there and lands its site arm', () => {
    // Bradbury Landing is 142° of Mars around from Challenger Memorial Station,
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
    h.focus('mars');
    h.frame(5);
    expect(frameKey(h.store.getState().camera.base.frame)).toBe('body:mars');

    h.focus('curiosity');
    const trace = regimeTrace(h, 900);

    expect(trace).toEqual(['body:mars', 'absolute', 'body:mars', 'site:curiosity']);
  });

  it('a hosted focus the arm can still see keeps it — the §4.8 hold', () => {
    // The other side of the rule, and why it is the horizon and not the focus
    // edge: an eye overhead of Bradbury IS serving Curiosity, so the arm holds
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
