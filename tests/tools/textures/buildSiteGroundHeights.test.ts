import { describe, it, expect } from 'vitest';

import { anchoredSeat } from '../../../tools/textures/buildSiteGroundHeights';

const R = 6_371_000;
const DEG_TO_RAD = Math.PI / 180;

describe('anchoredSeat', () => {
  it("returns the source anchor's own height, and an up tilted by e/R for an east offset", () => {
    const anchor = { latDeg: 55.67, lonDeg: 12.53, heightM: 18.53 };
    // A site ~320 m due east of the anchor, at the same latitude.
    const metresPerDegLat = DEG_TO_RAD * R;
    const metresPerDegLon = metresPerDegLat * Math.cos(anchor.latDeg * DEG_TO_RAD);
    const site = {
      id: 'soendermarken',
      hostId: 'earth',
      latDeg: anchor.latDeg,
      lonDeg: anchor.lonDeg + 320 / metresPerDegLon,
      altitudeM: 0,
      seat: 'anchored' as const,
    };

    const { heightM, up } = anchoredSeat(site, anchor, R);

    expect(heightM).toBe(18.53);
    expect(up[0]).toBeCloseTo(-320 / R, 6);
    expect(up[1]).toBeCloseTo(0, 6);
    expect(up[2]).toBeCloseTo(1, 6);
  });
});
