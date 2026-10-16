import { describe, it, expect } from 'vitest';
import { parseFloatOrNaN } from '../../../../tools/utils/math/parseFloatOrNaN';

describe('parseFloatOrNaN', () => {
  it('treats any width of dash run, blanks and junk as missing', () => {
    for (const s of ['-', '--', '---   ', '   ', '', 'abc']) {
      expect(parseFloatOrNaN(s), JSON.stringify(s)).toBeNaN();
    }
  });

  it('keeps real negatives and padded numbers', () => {
    expect(parseFloatOrNaN('-0.001')).toBe(-0.001);
    expect(parseFloatOrNaN('  7.34 ')).toBe(7.34);
    expect(parseFloatOrNaN('2.02279e-01')).toBeCloseTo(0.202279, 9);
  });
});
