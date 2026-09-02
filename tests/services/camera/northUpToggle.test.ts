/**
 * northUpToggle — ruling 11's on/off for the north-up framing authority,
 * heading + roll ONLY: with it off a zoom notch may not touch the basis'
 * heading or roll on either arm, while the C1 tilt wall keeps squeezing an
 * above-ceiling tilt (its tilt-0-at-disengage bake is load-bearing for the
 * fold retarget and is explicitly NOT gated).
 */

import { describe, it, expect, afterEach } from 'vitest';

import { createSurfaceController } from '../../../src/services/camera/surfaceController';
import { frameAlignedRoll } from '../../../src/services/engine/camera/frameAlignedRoll';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { ORIENT_TUNING } from '../../../src/data/camera/orientTuning';
import { ORIENTATION_FRAMES } from '../../../src/data/orientation/orientationFrames';
import { DEFAULT_ORIENTATION } from '../../../src/data/defaults';
import { SCENE_EARTH } from '../../../src/data/bodies/sceneEarth';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { CONST_J2000 } from '../../../src/data/time/constJ2000';
import type { BodyFixedPose } from '../../../src/@types/camera/BodyFixedPose';
import type { BodyId } from '../../../src/@types/data/body/BodyId';
import type { BodyState } from '../../../src/@types/scene/BodyState';
import type { CameraPose } from '../../../src/@types/camera/CameraPose';
import type { InputStep } from '../../../src/@types/camera/InputStep';
import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { Vec2 } from '../../../src/@types/math/Vec2';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const VIEWPORT: Vec2 = [100, 100];
const FOV = Math.PI / 2;
const POLE: Vec3 = [0, 0, 1];

afterEach(() => {
  ORIENT_TUNING.northUp = true;
});

/** Roll-free basis at heading ψ / tilt θ for an eye on +Z (see surfaceController fixtures). */
function basisAt(psi: number, theta: number): Mat3 {
  const ch = Math.cos(psi);
  const sh = Math.sin(psi);
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const horiz: Vec3 = [sh, ch, 0];
  return [ch, -sh, 0, horiz[0] * ct, horiz[1] * ct, st, horiz[0] * st, horiz[1] * st, -ct] as Mat3;
}

function poseAt(eyeM: Vec3, basisLocal: Mat3): BodyFixedPose {
  return { bodyId: 'earth', anchorLocalM: [0, 0, 0], eyeRelAnchorM: eyeM, basisLocal };
}

function zoomOut(): InputStep {
  return { kind: 'zoom', factor: Math.exp(0.1), duringGesture: false, cursorPx: null };
}

function tiltOf(pose: BodyFixedPose): number {
  const e = pose.eyeRelAnchorM;
  const m = Math.hypot(...e);
  const lu: Vec3 = [e[0] / m, e[1] / m, e[2] / m];
  const b = pose.basisLocal;
  const vert = b[6] * lu[0] + b[7] * lu[1] + b[8] * lu[2];
  return Math.acos(Math.max(-1, Math.min(1, -vert)));
}

describe('north-up toggle', () => {
  it('off: an engaged notch leaves heading and roll untouched (control: on moves them)', () => {
    const start = () => poseAt([0, 0, 2.2], basisAt(0.4, 0));

    ORIENT_TUNING.northUp = false;
    const off = createSurfaceController().apply(start(), zoomOut(), VIEWPORT, FOV, 1, POLE);
    expect([...off.basisLocal]).toEqual([...start().basisLocal]); // bit-untouched

    ORIENT_TUNING.northUp = true;
    const on = createSurfaceController().apply(start(), zoomOut(), VIEWPORT, FOV, 1, POLE);
    // At tilt 0 the heading lives in the UP column (forward is straight down).
    const headingOn = Math.atan2(on.basisLocal[3], on.basisLocal[4]);
    expect(headingOn).toBeCloseTo(0.3, 9); // one 0.25·0.4 decay step toward north
  });

  it('off: the tilt wall still squeezes an above-ceiling recession (C1 not gated)', () => {
    ORIENT_TUNING.northUp = false;
    const pose = poseAt([0, 0, 3.0], basisAt(0, 1.5)); // h/R 2.0, tilt over the ceiling
    const out = createSurfaceController().apply(pose, zoomOut(), VIEWPORT, FOV, 1, POLE);
    expect(tiltOf(out)).toBeLessThan(1.5 - 1e-4);
  });

  it('off: the world arm holds the roll verbatim', () => {
    ORIENT_TUNING.northUp = false;
    const B = ORIENTATION_FRAMES[DEFAULT_ORIENTATION];
    const bodies = deriveBodyStates(CONST_J2000) as ReadonlyMap<BodyId, BodyState>;
    const earth = bodies.get('earth')!;
    const poseAtHR = (hr: number): CameraPose => ({
      target: [earth.positionMpc[0]!, earth.positionMpc[1]!, earth.positionMpc[2]!],
      yaw: 0.7,
      pitch: 0.3,
      distance: SCENE_EARTH.radiusM * (1 + hr) * SCALE_UNITS.M_TO_MPC,
      roll: 0.7,
    });
    expect(frameAlignedRoll(poseAtHR(2.0), poseAtHR(2.2), bodies, B, B)).toBe(0.7);
  });
});
