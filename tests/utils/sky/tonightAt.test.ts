import { describe, expect, it } from 'vitest';
import { tonightAt } from '../../../src/utils/sky/tonightAt';
import { sunAltitudeAt } from '../../../src/utils/sky/sunAltitudeAt';
import { unixMsToJulianDays } from '../../../src/utils/time/unixMsToJulianDays';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';
import { radToDeg } from '../../../src/utils/math/radToDeg';

const COPENHAGEN = { body: asSceneBodyId('earth'), lonRad: 0.2186, latRad: 0.9716 };

describe('tonightAt', () => {
  it("lands at the Sun's lowest point on a white night that never reaches 18° down", () => {
    const noon = unixMsToJulianDays(Date.UTC(2026, 5, 21, 12));
    const t = tonightAt(COPENHAGEN, noon);
    const alt = radToDeg(sunAltitudeAt(COPENHAGEN, t));
    expect(alt).toBeGreaterThan(-18);
    expect(alt).toBeLessThan(0);
    const halfHour = 30 / 1440;
    expect(radToDeg(sunAltitudeAt(COPENHAGEN, t - halfHour))).toBeGreaterThan(alt);
    expect(radToDeg(sunAltitudeAt(COPENHAGEN, t + halfHour))).toBeGreaterThan(alt);
  });
});
