/**
 * earthTexelMetres — the anchor the whole pyramid ladder hangs on.
 *
 * One assertion worth having: level 4 must come out at the same ground
 * resolution as the whole-globe 8192 × 4096 base texture skymap ships today.
 * That equality is the reason the virtual texture can start at level 5 and be
 * strictly ADDITIVE on top of an existing image rather than replacing it. If the
 * base-width constant were ever nudged, the ladder would silently shift and
 * level 5 would either duplicate the base or skip a doubling — neither of which
 * fails anything else in the suite.
 */

import { describe, it, expect } from 'vitest';

import { earthTexelMetres } from '../../../src/utils/scene/earthTexelMetres';
import { EARTH_EQUATORIAL_CIRCUMFERENCE_M } from '../../../src/data/bodies/earthTileParams';

describe('earthTexelMetres', () => {
  it('puts level 4 at exactly the 8192-wide base texture resolution', () => {
    expect(earthTexelMetres(4)).toBeCloseTo(EARTH_EQUATORIAL_CIRCUMFERENCE_M / 8192, 6);
    expect(earthTexelMetres(4)).toBeCloseTo(4892, 0);
  });
});
