/**
 * subjectOccludedByBodies — the per-subject depth gate behind the overlay
 * shaders' per-pixel scene attenuation. The regression it pins: the segment is
 * CLOSED at the subject, so a body the line of sight would meet BEYOND the
 * subject (a whale 400 km up, Earth behind it) occludes nothing.
 *
 * Geometry is Earth-scale in the Mpc frame — the numbers the caller feeds it.
 */

import { describe, expect, it } from 'vitest';

import { subjectOccludedByBodies } from '../../../src/utils/scene/subjectOccludedByBodies';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const EARTH_RADIUS_KM = 6371;
const EARTH = [{ positionMpc: [0, 0, 0] as Vec3, radiusM: EARTH_RADIUS_KM * 1000 }];

/** A point `km` out along +x (or the given direction) in the Mpc frame. */
function at(x: number, y = 0, z = 0): Vec3 {
  const k = SCALE_UNITS.KM_TO_MPC;
  return [x * k, y * k, z * k];
}

function occluded(camKm: Vec3, subjectKm: Vec3): boolean {
  return subjectOccludedByBodies({ subjectMpc: subjectKm, camPosMpc: camKm, bodies: EARTH });
}

describe('subjectOccludedByBodies', () => {
  it('occludes a subject the body stands in front of', () => {
    expect(occluded(at(20000), at(-20000))).toBe(true);
  });

  it('leaves a subject in FRONT of the body unoccluded', () => {
    // The whale's geometry: 400 km up, eye a little further out still.
    expect(occluded(at(7000), at(EARTH_RADIUS_KM + 400))).toBe(false);
  });

  it('leaves the body behind the EYE unoccluded', () => {
    expect(occluded(at(7000), at(20000))).toBe(false);
  });

  it('ignores a body beside the line of sight', () => {
    expect(occluded(at(20000), at(20000, 30000))).toBe(false);
  });

  it('never lets a body occlude a subject inside its own radius', () => {
    // Earth's own caption is anchored at Earth's centre; a sphere containing
    // the subject is its own, and must not blank the name it carries.
    expect(occluded(at(20000), at(0))).toBe(false);
  });
});
