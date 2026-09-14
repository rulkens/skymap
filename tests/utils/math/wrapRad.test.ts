import { describe, it, expect } from 'vitest';

import { wrapRad } from '../../../src/utils/math/wrapRad';

describe('wrapRad', () => {
  it('wraps past ±π to the short side and leaves in-range angles alone', () => {
    expect(wrapRad(Math.PI + 0.1)).toBeCloseTo(-Math.PI + 0.1, 12);
    expect(wrapRad(-4)).toBeCloseTo(2 * Math.PI - 4, 12);
    expect(wrapRad(0.5)).toBeCloseTo(0.5, 15);
  });
});
