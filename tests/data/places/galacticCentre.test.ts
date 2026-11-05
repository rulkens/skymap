/**
 * The Galactic Centre place, as `deriveBodyStates` carries it: a slip in the
 * RA/Dec/distance conversion moves the hole, the S-star orbits and the Milky
 * Way's hub together, so no relative test can see it.
 */

import { describe, it, expect } from 'vitest';

import { GALACTIC_CENTRE_ANCHOR } from '../../../src/data/places/galacticCentre';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../src/data/time/constJ2000';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';

const STATES = deriveBodyStates(CONST_J2000);

describe('GALACTIC_CENTRE_ANCHOR', () => {
  it('sits at the catalogue RA/Dec/distance of Sgr A*', () => {
    // The published radio position and the GRAVITY 2019 distance are the
    // external oracle; the assertion round-trips the Cartesian anchor back to
    // them rather than re-running the conversion, so a swapped axis or a
    // degrees/radians slip cannot survive it.
    const [x, y, z] = STATES.get(GALACTIC_CENTRE_ANCHOR.id)!.positionMpc;
    const rMpc = Math.hypot(x, y, z);

    expect(rMpc / SCALE_UNITS.PC_TO_MPC).toBeCloseTo(8178, 6);
    expect(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360).toBeCloseTo(266.41684, 9);
    expect((Math.asin(z / rMpc) * 180) / Math.PI).toBeCloseTo(-29.00781, 9);
  });
});
