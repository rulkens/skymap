import { describe, expect, it } from 'vitest';
import { starTrailTint } from '../../../src/utils/color/starTrailTint';

describe('starTrailTint', () => {
  it("keeps a star's hue under the additive trail ceiling", () => {
    for (const temperatureK of [3000, 5800, 30000]) {
      expect(Math.max(...starTrailTint(temperatureK))).toBeCloseTo(0.5, 6);
    }
  });
});
