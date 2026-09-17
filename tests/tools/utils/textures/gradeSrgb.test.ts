import { describe, expect, it } from 'vitest';

import { gradeSrgb } from '../../../../tools/utils/textures/gradeSrgb';
import type { AlbedoRecipe } from '../../../../tools/textures/AlbedoRecipe';

const NEUTRAL: AlbedoRecipe['grade'] = {
  exposureEv: 0,
  gain: [1, 1, 1],
  offset: [0, 0, 0],
  contrast: 1,
  saturation: 1,
  gamma: 1,
};

describe('gradeSrgb', () => {
  it('is the identity at neutral settings', () => {
    const out = gradeSrgb([0.2, 0.5, 0.9], NEUTRAL);
    expect(out[0]).toBeCloseTo(0.2, 9);
    expect(out[1]).toBeCloseTo(0.5, 9);
    expect(out[2]).toBeCloseTo(0.9, 9);
  });

  it('saturation 0 yields R = G = B', () => {
    const out = gradeSrgb([0.1, 0.6, 0.9], { ...NEUTRAL, saturation: 0 });
    expect(out[0]).toBeCloseTo(out[1], 9);
    expect(out[1]).toBeCloseTo(out[2], 9);
  });
});
