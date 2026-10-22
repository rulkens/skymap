import { describe, it, expect } from 'vitest';

import { buildObjIdLookup } from '../../../src/utils/galaxy/buildObjIdLookup';

describe('buildObjIdLookup', () => {
  it('answers the lowest row holding an id, and -1 for an id no row holds', () => {
    // Unsorted, with a duplicate whose later copy sorts first by row order.
    const lookup = buildObjIdLookup(new BigUint64Array([30n, 10n, 20n, 10n, 1n << 63n]));
    expect([30n, 10n, 20n, 1n << 63n].map(lookup)).toEqual([0, 1, 2, 4]);
    expect([0n, 15n, 31n].map(lookup)).toEqual([-1, -1, -1]);
  });
});
