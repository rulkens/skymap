/**
 * perseveranceToSondermarken — the clip must open on the rover link, land on
 * sondermarkenFlyout's opening pose (the two play back to back), frame both
 * planets at the system hold, and never put the eye under either surface: an
 * aim swung at the wrong altitude, or a missed planet rotation, each leaves a
 * plausible-looking but wrong shot.
 */

import { describe, it, expect } from 'vitest';
import {
  perseveranceToSondermarken,
  PERSEVERANCE_POSE,
} from '../../../../src/data/animation/clips/perseveranceToSondermarken';
import { sondermarkenFlyout } from '../../../../src/data/animation/clips/sondermarkenFlyout';
import { evaluateClip } from '../../../../src/services/engine/camera/evaluateClip';
import { resolveClipFoci } from '../../../../src/services/engine/animation/resolveClipFoci';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { DEFAULT_FOV_Y_RAD } from '../../../../src/services/engine/camera/cameraFraming';
import { linkedPoseToWorld } from '../../../../src/utils/camera/linkedPoseToWorld';
import { yawPitchToDir } from '../../../../src/utils/camera/yawPitchToDir';
import { frameUp } from '../../../../src/utils/camera/frameUp';
import { normalize3 } from '../../../../src/utils/math/normalize3';
import { rotateVec3ByTightMat3 } from '../../../../src/utils/math/rotateVec3ByTightMat3';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { SelectionResolver } from '../../../../src/@types/engine/selection/SelectionResolver';

const BASIS = ORIENTATION_FRAMES.ecliptic;
// The clip names no subject, so the resolver is never asked.
const NO_SELECTION = {} as SelectionResolver;
const SIM_DAYS = CONST_J2000 + 9763.2;
const MID_HOLD_SEC = 50;
const END_SEC = 97;

const sub = (a: Readonly<Vec3>, b: Readonly<Vec3>): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Readonly<Vec3>, b: Readonly<Vec3>): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

function eyeMpc(pose: CameraPose): Vec3 {
  const toEye = rotateVec3ByTightMat3(yawPitchToDir(pose.yaw, pose.pitch), BASIS);
  return [0, 1, 2].map((i) => pose.target[i]! + pose.distance * toEye[i]!) as Vec3;
}

/** Eye position in metres relative to `centreMpc`, and the unit view direction. */
function eyeAndView(pose: CameraPose, centreMpc: Readonly<Vec3>) {
  const eye = eyeMpc(pose);
  return {
    eyeM: sub(eye, centreMpc).map((v) => v * SCALE_UNITS.MPC_TO_M) as Vec3,
    view: normalize3(sub(pose.target as Vec3, eye)),
  };
}

function expectSameShot(actual: CameraPose, expected: CameraPose, centreMpc: Vec3): void {
  const a = eyeAndView(actual, centreMpc);
  const e = eyeAndView(expected, centreMpc);
  for (let i = 0; i < 3; i++) expect(a.eyeM[i]!).toBeCloseTo(e.eyeM[i]!, 0);
  for (let i = 0; i < 3; i++) expect(a.view[i]!).toBeCloseTo(e.view[i]!, 5);
}

describe('perseveranceToSondermarken', () => {
  const clip = perseveranceToSondermarken(SIM_DAYS);
  const start = clip.data.start as CameraPose;
  const resolved = resolveClipFoci(clip.data, NO_SELECTION, 1, start, SIM_DAYS, BASIS);
  const bodies = deriveBodyStates(SIM_DAYS);
  const mars = bodies.get('mars')!.positionMpc;
  const earth = bodies.get('earth')!.positionMpc;

  it('opens on the Perseverance link pose', () => {
    expectSameShot(start, linkedPoseToWorld(PERSEVERANCE_POSE, SIM_DAYS, BASIS), mars);
  });

  it('lands on the pose sondermarkenFlyout opens on', () => {
    const next = sondermarkenFlyout(SIM_DAYS).data.start as CameraPose;
    expectSameShot(evaluateClip(resolved, END_SEC, BASIS), next, earth);
  });

  it('frames both Earth and Mars at the system hold', () => {
    const pose = evaluateClip(resolved, MID_HOLD_SEC, BASIS);
    const eye = eyeMpc(pose);
    const forward = normalize3(sub(pose.target as Vec3, eye));
    const right = normalize3(cross(forward, frameUp(BASIS)));
    const up = cross(right, forward);
    // A square frame at the default vertical FOV: the tightest the shot may be cut to.
    const half = Math.tan(DEFAULT_FOV_Y_RAD / 2);
    for (const planet of [earth, mars]) {
      const d = sub(planet, eye);
      const z = dot(d, forward);
      expect(z).toBeGreaterThan(0);
      expect(Math.abs(dot(d, right) / z)).toBeLessThan(half * 0.8);
      expect(Math.abs(dot(d, up) / z)).toBeLessThan(half * 0.8);
    }
  });

  // Where the aim swings relative to each site's horizon depends on the planets'
  // spin and orbits, so one instant proves little: sweep a day and a Mars year.
  it.each([0, 0.3, 0.6, 0.9, 170, 340, 510])(
    'keeps the eye above both ground points’ radii the whole way (+%s d)',
    (offsetDays) => {
      const simDays = SIM_DAYS + offsetDays;
      const c = perseveranceToSondermarken(simDays);
      const data = resolveClipFoci(c.data, NO_SELECTION, 1, c.data.start as CameraPose, simDays, BASIS);
      const b = deriveBodyStates(simDays);
      const [m, e] = [b.get('mars')!.positionMpc, b.get('earth')!.positionMpc];
      // The opening eye is ~1.3 m above the rover's radius, the tightest moment by design.
      const grounds: [Vec3, number][] = [
        [m, Math.hypot(...sub(b.get('perseverance')!.positionMpc, m))],
        [e, Math.hypot(...sub(evaluateClip(data, END_SEC, BASIS).target as Vec3, e))],
      ];
      let tightestM = Infinity;
      for (let t = 0; t <= END_SEC; t += 0.05) {
        const eye = eyeMpc(evaluateClip(data, t, BASIS));
        for (const [centre, radiusMpc] of grounds) {
          const altM = (Math.hypot(...sub(eye, centre)) - radiusMpc) * SCALE_UNITS.MPC_TO_M;
          tightestM = Math.min(tightestM, altM);
        }
      }
      expect(tightestM).toBeGreaterThan(0.5);
    },
  );
});
