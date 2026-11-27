import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import { brickCoordsOf } from '../../../src/utils/volume/brickCoordsOf';
import { brickId } from '../../../src/utils/volume/brickId';

describe('brickId', () => {
  it('brick ids are x-fastest and round-trip', () => {
    // The ids are keys in files on R2, so the expected values are worked by hand.
    const mcpmGrid: Vec3 = [14, 24, 14];
    expect(brickId([13, 23, 13], mcpmGrid)).toBe(4703);
    expect(brickId([1, 2, 3], mcpmGrid)).toBe(1037);
    expect(brickCoordsOf(4703, mcpmGrid)).toEqual([13, 23, 13]);
    expect(brickCoordsOf(1037, mcpmGrid)).toEqual([1, 2, 3]);
  });
});
