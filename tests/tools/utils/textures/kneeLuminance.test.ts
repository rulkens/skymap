import { describe, expect, it } from 'vitest';

import { kneeLuminance } from '../../../../tools/utils/textures/kneeLuminance';

describe('kneeLuminance', () => {
  it('leaves luminance at or below threshold untouched', () => {
    expect(kneeLuminance(0.2, 0.6, 1)).toBe(0.2);
    expect(kneeLuminance(0.6, 0.6, 1)).toBe(0.6);
  });

  it('is monotonic and compressive above threshold', () => {
    const threshold = 0.6;
    const softness = 1;
    const values = [0.65, 0.7, 0.8, 0.95, 1.2];
    let previous = threshold;
    for (const y1 of values) {
      const y2 = kneeLuminance(y1, threshold, softness);
      expect(y2).toBeGreaterThan(previous);
      expect(y2).toBeLessThan(y1);
      previous = y2;
    }
  });
});
