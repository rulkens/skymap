/**
 * Beat 02 lands side-on to the Earth–Moon gap: the eye as far from Earth as
 * from the Moon, so their discs keep their true size ratio, and both near half
 * lit. A date change that breaks either fails here, not only in a shot.
 */
import { describe, it, expect } from 'vitest';

import { earthAndMoon } from '../../../../../src/data/animation/tours/grandTour/earthAndMoon';
import { TOUR_NIGHT_SIM_DAYS } from '../../../../../src/data/animation/tours/grandTour/tourNightSimDays';
import { ORIENTATION_FRAMES } from '../../../../../src/data/orientation/orientationFrames';
import { resolveClipFoci } from '../../../../../src/services/engine/animation/resolveClipFoci';
import { compileClip } from '../../../../../src/services/engine/animation/compileClip';
import { evaluateClip } from '../../../../../src/services/engine/camera/clips/evaluateClip';
import { resolveClipStart } from '../../../../../src/state/camera/cameraSlice';
import { bodyPositionMpcAt } from '../../../../../src/utils/exhibits/mission/bodyPositionMpcAt';
import { eyeMpcOf } from '../../../../../src/utils/camera/orbitPose/eyeMpcOf';
import { selectionResolverOver } from '../../../../support/selectionResolverOver';
import type { CameraPose } from '../../../../../src/@types/camera/pose/CameraPose';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

const RESOLVER = selectionResolverOver({ byId: () => null, byCategory: () => [] });
const BASIS = ORIENTATION_FRAMES.galactic;
const LIVE: CameraPose = { target: [0, 0, 0], yaw: 0.4, pitch: 0.2, distance: 1e-13, roll: 0 };

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const length = (v: Vec3) => Math.hypot(...v);
/** Lit fraction of a sphere's face toward the eye. */
const litFraction = (body: Vec3, sun: Vec3, eye: Vec3) => {
  const toSun = sub(sun, body);
  const toEye = sub(eye, body);
  const cos =
    (toSun[0] * toEye[0] + toSun[1] * toEye[1] + toSun[2] * toEye[2]) /
    (length(toSun) * length(toEye));
  return (1 + cos) / 2;
};

describe('beat 02, Earth and Moon', () => {
  const resolved = resolveClipFoci(earthAndMoon, RESOLVER, 1, LIVE, TOUR_NIGHT_SIM_DAYS, BASIS);
  const landed = evaluateClip(
    resolveClipStart(resolved, LIVE),
    compileClip(resolved).durationSec,
    BASIS,
  );
  const eye = eyeMpcOf(landed, BASIS);
  const earth = bodyPositionMpcAt('earth', TOUR_NIGHT_SIM_DAYS);
  const moon = bodyPositionMpcAt('moon', TOUR_NIGHT_SIM_DAYS);
  const sun = bodyPositionMpcAt('sun', TOUR_NIGHT_SIM_DAYS);

  // Within 3%: the pull-back hands over short of the view's range, which the aim's
  // slide along the gap is sized for, and the dwell's orbit has begun.
  it('lands as far from Earth as from the Moon', () => {
    expect(Math.abs(length(sub(earth, eye)) / length(sub(moon, eye)) - 1)).toBeLessThan(0.03);
  });

  it.each([
    ['Earth', earth],
    ['the Moon', moon],
  ])('shows %s near half lit', (_name, body) => {
    const lit = litFraction(body, sun, eye);
    expect(lit).toBeGreaterThan(0.3);
    expect(lit).toBeLessThan(0.7);
  });
});
