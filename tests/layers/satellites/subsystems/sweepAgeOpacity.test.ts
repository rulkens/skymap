import { describe, expect, it } from 'vitest';
import { sweepAgeOpacity } from '../../../../src/layers/satellites/subsystems/sweepAgeOpacity';

describe('sweepAgeOpacity', () => {
  it('stays fully drawn for a sweep one frame old at 1 h/s', () => {
    expect(sweepAgeOpacity(60_500)).toBe(1);
  });
  it('fades linearly over the next 2 minutes', () => {
    expect(sweepAgeOpacity(360_000)).toBeCloseTo(0.5, 10);
  });
  it('is gone at 7 minutes and beyond', () => {
    expect(sweepAgeOpacity(3_600_000)).toBe(0);
  });
});
