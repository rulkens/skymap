import { describe, it, expect } from 'vitest';
import { rejectVec3 } from '../../../src/utils/math/rejectVec3';

describe('rejectVec3', () => {
  it('zeroes the component along axis, leaving the perpendicular part untouched', () => {
    expect(rejectVec3([1, 5, 2], [0, 1, 0])).toEqual([1, 0, 2]);
  });

  it('returns the zero vector when v is parallel to axis', () => {
    expect(rejectVec3([0, 3, 0], [0, 1, 0])).toEqual([0, 0, 0]);
  });

  it('leaves v unchanged when it is already perpendicular to axis', () => {
    expect(rejectVec3([1, 0, 1], [0, 1, 0])).toEqual([1, 0, 1]);
  });
});
