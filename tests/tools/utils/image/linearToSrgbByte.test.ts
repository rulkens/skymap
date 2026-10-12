import { describe, expect, it } from 'vitest';

import { linearToSrgbByte } from '../../../../tools/utils/image/linearToSrgbByte';

describe('linearToSrgbByte', () => {
  it('encodes the sRGB transfer curve and clamps out-of-range input', () => {
    expect(linearToSrgbByte(0)).toBe(0);
    expect(linearToSrgbByte(1)).toBe(255);
    expect(linearToSrgbByte(0.2158605)).toBe(128); // byte 128 decodes to 0.2158605
    expect(linearToSrgbByte(-3)).toBe(0);
    expect(linearToSrgbByte(7)).toBe(255);
  });
});
