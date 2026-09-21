import { describe, expect, it } from 'vitest';

import { iceKeepWeight } from '../../../../tools/utils/textures/iceKeepWeight';
import type { AlbedoRecipe } from '../../../../tools/textures/AlbedoRecipe';

const ICE: AlbedoRecipe['ice'] = {
  minAbsLatDeg: 55,
  fadeDeg: 8,
  minWhiteness: 0.6,
  minLuminance: 0.35,
};

describe('iceKeepWeight', () => {
  it('is 1 deep inside all three gates (polar, white, bright)', () => {
    expect(iceKeepWeight(80, 1, 0.9, ICE)).toBeCloseTo(1, 6);
  });

  it('is 0 when any one gate fails, even with the other two wide open', () => {
    expect(iceKeepWeight(10, 1, 0.9, ICE)).toBe(0); // equatorial
    expect(iceKeepWeight(80, 0, 0.9, ICE)).toBe(0); // saturated colour
    expect(iceKeepWeight(80, 1, 0, ICE)).toBe(0); // dark
  });
});
