import { describe, it, expect } from 'vitest';

import { regionRelativeDistanceMpc } from '../../../src/utils/scene/regionRelativeDistanceMpc';
import { BODY_REGIONS } from '../../../src/data/bodies/bodyRegions';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../src/data/time/constJ2000';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import type { BodyRegion } from '../../../src/@types/scene/BodyRegion';
import type { BodyState } from '../../../src/@types/scene/BodyState';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const PC = SCALE_UNITS.PC_TO_MPC;

const anchorState = (positionMpc: Vec3): BodyState => ({
  positionMpc,
  orientation: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  meanAnomalyRad: 0,
});

// Sgr A* is authored ahead of its seed, so a synthetic stands in for the off-origin
// case the real table cannot yet exercise.
const GALACTIC_CENTRE_AT: Vec3 = [8178 * PC, 0, 0];
const syntheticRegion: BodyRegion = {
  id: 'galactic-centre',
  label: 'Galactic Centre',
  anchorId: 'sgr-a-star',
  memberIds: ['sgr-a-star'],
  extentMpc: 0,
};

describe('regionRelativeDistanceMpc', () => {
  it('a Sun-anchored region keys identically to hypot(camPos)', () => {
    // The zero-behaviour-change property of the repoint: the two bands that now
    // key on a region read the SAME number they read from the render origin,
    // because the Sun anchor sits at [0,0,0].
    const neighbourhood = BODY_REGIONS.find((region) => region.id === 'solar-neighbourhood')!;
    const states = deriveBodyStates(CONST_J2000);
    const camPos: Vec3 = [0.003, -0.004, 0.012];

    expect(regionRelativeDistanceMpc(camPos, neighbourhood, states)).toBe(
      Math.hypot(camPos[0], camPos[1], camPos[2]),
    );
  });

  it('an off-origin region keys on distance to its own anchor', () => {
    // The whole point: a camera a parsec from the Galactic Centre is a parsec
    // from THAT region, not the 8178 pc the render origin would report — which
    // is off the far end of every near-field band.
    const states = new Map<string, BodyState>([['sgr-a-star', anchorState(GALACTIC_CENTRE_AT)]]);
    const camPos: Vec3 = [8179 * PC, 0, 0];

    expect(regionRelativeDistanceMpc(camPos, syntheticRegion, states) / PC).toBeCloseTo(1, 6);
    expect(Math.hypot(camPos[0], camPos[1], camPos[2]) / PC).toBeCloseTo(8179, 6);
  });

  it('an unresolvable anchor reads as maximally far, not as arrived', () => {
    // The live case until the feature plan seeds Sgr A*. Returning 0 here would
    // read as "the camera has arrived" and switch absent content fully on, since
    // the region-scoped bands are full at their small-distance edge.
    expect(regionRelativeDistanceMpc([0, 0, 0], syntheticRegion, new Map())).toBe(Infinity);
  });
});
