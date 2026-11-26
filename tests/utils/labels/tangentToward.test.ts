import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import { tangentToward } from '../../../src/utils/labels/tangentToward';

describe('tangentToward', () => {
  it('tangentToward reports no tangent when the direction is parallel to up3', () => {
    const tangent: Vec3 = [9, 9, 9];
    expect(tangentToward([0, 0, 1], [0, 0, 1], tangent)).toBe(false);
    expect(tangent).toEqual([0, 0, 0]);
  });
});
