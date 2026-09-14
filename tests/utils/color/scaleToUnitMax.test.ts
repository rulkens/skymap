import { describe, expect, it } from 'vitest';
import { scaleToUnitMax } from '../../../src/utils/color/scaleToUnitMax';

describe('scaleToUnitMax', () => {
  it('scales every channel by the same factor, preserving hue', () => {
    expect(scaleToUnitMax([0.1, 0.05, 0.2])).toEqual([0.5, 0.25, 1]);
  });

  it('returns white for black rather than dividing by zero', () => {
    expect(scaleToUnitMax([0, 0, 0])).toEqual([1, 1, 1]);
  });
});
