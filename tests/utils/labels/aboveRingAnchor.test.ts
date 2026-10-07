import { describe, expect, it } from 'vitest';
import { aboveRingAnchor } from '../../../src/utils/labels/aboveRingAnchor';

describe('aboveRingAnchor', () => {
  it('the anchor sits the ring radius plus the gap above the centre along the up vector', () => {
    expect(aboveRingAnchor([1, 2, 3], [0, 0, 1], 4, 0.5)).toEqual([1, 2, 7.5]);
  });
});
