import { describe, expect, it } from 'vitest';
import { segmentsCross } from '../../../src/utils/math/segmentsCross';

describe('segmentsCross', () => {
  it('crosses an X, not two segments on one line or one stopping short', () => {
    expect(segmentsCross([0, 0], [2, 2], [0, 2], [2, 0])).toBe(true);
    expect(segmentsCross([0, 0], [1, 1], [2, 2], [3, 3])).toBe(false);
    expect(segmentsCross([0, 0], [2, 2], [0, 2], [0.9, 1.2])).toBe(false);
  });
});
