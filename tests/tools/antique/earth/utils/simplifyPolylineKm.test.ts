/** Wiggles under the tolerance go, a bend over it stays, and the ends always stay. */

import { describe, it, expect } from 'vitest';

import { simplifyPolylineKm } from '../../../../../tools/antique/earth/utils/simplifyPolylineKm';

const R = 6371;
const KM_DEG = 180 / (Math.PI * R);

describe('simplifyPolylineKm', () => {
  it('drops a 0.5 km wiggle and keeps a 3 km bend along a 180 km line', () => {
    const line: [number, number][] = [
      [0, 0],
      [0.4, 0.5 * KM_DEG],
      [0.8, 0],
      [1.2, 3 * KM_DEG],
      [1.6, 0],
    ];
    expect(simplifyPolylineKm(line, 1, R)).toEqual([line[0], line[2], line[3], line[4]]);
  });
});
