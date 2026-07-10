import { describe, expect, it } from 'vitest';

import { MILKY_WAY_INFO } from '../../../src/data/milkyWay/milkyWayInfo';
import { MILKY_WAY_CENTER_WORLD } from '../../../src/data/milkyWay/galacticCenter';

describe('MILKY_WAY_INFO', () => {
  it("carries the 'milkyWay' tag", () => {
    // The union discriminant every FocusableTarget table / guard keys on.
    expect(MILKY_WAY_INFO.type).toBe('milkyWay');
  });

  it('x/y/z match MILKY_WAY_CENTER_WORLD', () => {
    // Single source of truth for the galaxy's position is the galactic centre.
    expect([MILKY_WAY_INFO.x, MILKY_WAY_INFO.y, MILKY_WAY_INFO.z]).toEqual(MILKY_WAY_CENTER_WORLD);
  });
});
