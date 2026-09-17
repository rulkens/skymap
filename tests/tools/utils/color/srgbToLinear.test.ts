import { describe, expect, it } from 'vitest';

import { srgbToLinear } from '../../../../tools/utils/color/srgbToLinear';

describe('srgbToLinear', () => {
  it('maps the endpoints exactly and is monotonic across the toe boundary', () => {
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(1)).toBeCloseTo(1, 9);
    expect(srgbToLinear(0.04)).toBeLessThan(srgbToLinear(0.041));
  });
});
