import { describe, it, expect } from 'vitest';
import { formatRadiusM } from '../../../src/utils/format/formatRadiusM';

describe('formatRadiusM', () => {
  it("uses km at and above 1 km, keeping today's planetary output", () => {
    expect(formatRadiusM(6371000)).toBe('6,371 km');
  });
  it('uses m in the [1, 1000) metre range', () => {
    // The whale mesh body: 6.77 m.
    expect(formatRadiusM(6.773)).toBe('6.77 m');
  });
  it('uses cm in the [0.01, 1) metre range', () => {
    // The bowl-of-petunias mesh body: 46.1 cm.
    expect(formatRadiusM(0.461)).toBe('46.1 cm');
  });
  it('uses mm below 0.01 m', () => {
    expect(formatRadiusM(0.0005)).toBe('0.5 mm');
  });
  it('picks the branch by magnitude rather than by order (boundary check)', () => {
    expect(formatRadiusM(1)).toBe('1.00 m');
    expect(formatRadiusM(0.999)).toBe('99.9 cm');
  });
});
