import { describe, expect, it } from 'vitest';

import type { SkySpot } from '../../../src/@types/camera/pose/SkySpot';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';
import { nextSunBelowAt } from '../../../src/utils/sky/nextSunBelowAt';
import { unixMsToJulianDays } from '../../../src/utils/time/unixMsToJulianDays';
import { noaaSunAltitudeDeg } from './noaaSunAltitude';

const DEG = Math.PI / 180;
const copenhagen: SkySpot = {
  body: asSceneBodyId('earth'),
  lonRad: 12.5683 * DEG,
  latRad: 55.6761 * DEG,
};

describe('nextSunBelowAt', () => {
  it('finds astronomical dark at Copenhagen within 2 min of the NOAA reference', () => {
    const start = unixMsToJulianDays(Date.parse('2026-11-07T12:00:00Z'));
    // Reference: bisect the NOAA-equation altitude (see noaaSunAltitude.ts) for −18°.
    let lo = start;
    let hi = start + 0.5;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (noaaSunAltitudeDeg(mid, 55.6761, 12.5683) <= -18) hi = mid;
      else lo = mid;
    }
    const found = nextSunBelowAt(copenhagen, start, -18 * DEG);
    expect(found).not.toBeNull();
    expect(Math.abs(found! - hi) * 1440).toBeLessThan(2);
  });

  it('returns null for a white night', () => {
    const start = unixMsToJulianDays(Date.parse('2026-06-21T12:00:00Z'));
    expect(nextSunBelowAt(copenhagen, start, -18 * DEG)).toBeNull();
  });
});
