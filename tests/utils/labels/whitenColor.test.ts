import { describe, it, expect } from 'vitest';
import { whitenColor } from '../../../src/utils/labels/whitenColor';

describe('whitenColor', () => {
  it('blends rgb toward white by the amount and keeps alpha', () => {
    const out = whitenColor([0.2, 0.4, 0.0, 0.5], 0.5);
    expect(out[0]).toBeCloseTo(0.6, 12);
    expect(out[1]).toBeCloseTo(0.7, 12);
    expect(out[2]).toBeCloseTo(0.5, 12);
    expect(out[3]).toBe(0.5);
  });
});
