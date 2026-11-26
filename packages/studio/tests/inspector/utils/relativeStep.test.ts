import { describe, expect, it } from 'vitest';
import { relativeStep } from '../../../src/inspector/utils/relativeStep';

describe('relativeStep', () => {
  it('is a tenth of the leading decade, at any scale', () => {
    expect(relativeStep(300)).toBe(10);
    expect(relativeStep(0.785)).toBe(0.01);
    expect(relativeStep(3e-14)).toBeCloseTo(1e-15, 25);
    expect(relativeStep(0)).toBe(0.1);
  });
});
