import { describe, expect, it } from 'vitest';

import type { SkySpot } from '../../../src/@types/camera/pose/SkySpot';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';
import { nextRiseAt } from '../../../src/utils/sky/nextRiseAt';
import { unixMsToJulianDays } from '../../../src/utils/time/unixMsToJulianDays';
import { noaaSunAltitudeDeg } from './noaaSunAltitude';

const DEG = Math.PI / 180;
const copenhagen: SkySpot = {
  body: asSceneBodyId('earth'),
  lonRad: 12.5683 * DEG,
  latRad: 55.6761 * DEG,
};

describe('nextRiseAt', () => {
  it('finds sunrise at Copenhagen within 3 min of the NOAA geometric horizon crossing', () => {
    const start = unixMsToJulianDays(Date.parse('2026-11-07T00:00:00Z'));
    let lo = start;
    let hi = start + 0.5;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (noaaSunAltitudeDeg(mid, 55.6761, 12.5683) >= 0) hi = mid;
      else lo = mid;
    }
    const found = nextRiseAt(copenhagen, start, () => [0, 0, 0], 1);
    expect(found).not.toBeNull();
    expect(Math.abs(found! - hi) * 1440).toBeLessThan(3);
  });

  it('returns null when nothing rises inside the horizon', () => {
    const start = unixMsToJulianDays(Date.parse('2026-11-07T00:00:00Z'));
    expect(nextRiseAt(copenhagen, start, () => [0, 0, 0], 0.01)).toBeNull();
  });
});
