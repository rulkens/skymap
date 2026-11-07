import { describe, expect, it } from 'vitest';

import { altAzFromSpot } from '../../../src/utils/sky/altAzFromSpot';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';

describe('altAzFromSpot', () => {
  it('returns finite values at latitude 89.9°, where east/north degenerate', () => {
    const spot = {
      body: asSceneBodyId('earth'),
      lonRad: 0.3,
      latRad: 89.9 * (Math.PI / 180),
    };
    const { azimuthRad, altitudeRad } = altAzFromSpot(spot, [0, 0, 0], 2461000);
    expect(Number.isFinite(azimuthRad)).toBe(true);
    expect(Number.isFinite(altitudeRad)).toBe(true);
  });
});
