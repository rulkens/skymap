import { describe, expect, it } from 'vitest';

import { fillEquirectNodata } from '../../../../tools/utils/image/fillEquirectNodata';

describe('fillEquirectNodata', () => {
  it('fills a multi-cell hole from its surroundings, leaving valid cells untouched', () => {
    const g = new Float32Array(5 * 3).fill(7);
    g[6] = g[7] = g[8] = NaN;
    fillEquirectNodata(g, 5, 3);
    expect([...g]).toEqual(new Array(15).fill(7));
  });

  it('wraps across the antimeridian but clamps at the poles', () => {
    const g = Float32Array.from([NaN, 1, 1, 9, /* row 1 */ 5, 5, 5, 5]);
    fillEquirectNodata(g, 4, 2);
    expect(g[0]).toBeCloseTo((1 + 9 + 5) / 3); // east, wrapped west, south; no north neighbour
  });
});
