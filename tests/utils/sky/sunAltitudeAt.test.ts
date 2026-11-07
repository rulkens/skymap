import { describe, expect, it } from 'vitest';

import type { SkySpot } from '../../../src/@types/camera/pose/SkySpot';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import { dot3 } from '../../../src/utils/math/dot3';
import { rotationRowById } from '../../../src/data/bodies/rotationElements';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';
import { sunAltitudeAt } from '../../../src/utils/sky/sunAltitudeAt';
import { unixMsToJulianDays } from '../../../src/utils/time/unixMsToJulianDays';
import { rotationFromIau } from '../../../src/utils/orbit/rotationFromIau';
import { noaaSunAltitudeDeg } from './noaaSunAltitude';

const DEG = Math.PI / 180;
const copenhagen: SkySpot = {
  body: asSceneBodyId('earth'),
  lonRad: 12.5683 * DEG,
  latRad: 55.6761 * DEG,
};

describe('sunAltitudeAt', () => {
  it.each([
    ['noon', '2026-11-07T12:00:00Z'],
    ['22:00', '2026-11-07T22:00:00Z'],
  ])('matches the NOAA solar-position reference at Copenhagen, %s UTC', (_label, iso) => {
    const jd = unixMsToJulianDays(Date.parse(iso));
    const reference = noaaSunAltitudeDeg(jd, 55.6761, 12.5683);
    expect(Math.abs(sunAltitudeAt(copenhagen, jd) / DEG - reference)).toBeLessThan(0.3);
  });

  it("uses Mars's own rotation on Mars", () => {
    const jd = unixMsToJulianDays(Date.parse('2026-11-07T12:00:00Z'));
    const spot: SkySpot = { body: asSceneBodyId('mars'), lonRad: 40 * DEG, latRad: -20 * DEG };
    const row = rotationRowById('mars');
    if (row === null || (row.kind !== undefined && row.kind !== 'iau-pole')) {
      throw new Error('mars has no IAU rotation row');
    }
    // Independent route: IAU elements → R, the Sun direction in body axes, sin(alt) = d · radial.
    const R = rotationFromIau(row, row.primeMeridianDeg + row.spinRateDegPerDay * (jd - 2451545));
    const pos = deriveBodyStates(jd).get(asSceneBodyId('mars') as never)!.positionMpc;
    const len = Math.hypot(...pos);
    const w: Vec3 = [-pos[0] / len, -pos[1] / len, -pos[2] / len];
    const d: Vec3 = [0, 1, 2].map((i) =>
      dot3([R[i * 3]!, R[i * 3 + 1]!, R[i * 3 + 2]!], w),
    ) as Vec3;
    const radial: Vec3 = [
      Math.cos(spot.latRad) * Math.cos(spot.lonRad),
      Math.cos(spot.latRad) * Math.sin(spot.lonRad),
      Math.sin(spot.latRad),
    ];
    const expected = Math.asin(dot3(d, radial));
    expect(sunAltitudeAt(spot, jd)).toBeCloseTo(expected, 6);
  });
});
