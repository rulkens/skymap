/**
 * sitePointBodyFixed — the hand-computed point: ground radius + wheel lift
 * along the site's lat/lon direction.
 */

import { describe, it, expect } from 'vitest';

import { sitePointBodyFixed } from '../../../src/utils/camera/sitePointBodyFixed';
import type { SurfaceFixedSite } from '../../../src/@types/scene/SurfaceFixedSite';

describe('sitePointBodyFixed', () => {
  it('returns the hand-computed point for a fixture site', () => {
    const site: SurfaceFixedSite = {
      id: 'fixture',
      hostId: 'fixture-host',
      latDeg: 30,
      lonDeg: 60,
      altitudeM: 100,
    };
    // r = 1000 + 100 = 1100. ring = 1100·cos30 = 550√3, so
    // x = 550√3·cos60 = 275√3, y = 550√3·sin60 = 550·3/2 = 825, z = 1100·sin30 = 550.
    const p = sitePointBodyFixed(site, 1000);
    expect(p[0]).toBeCloseTo(275 * Math.sqrt(3), 9);
    expect(p[1]).toBeCloseTo(825, 9);
    expect(p[2]).toBeCloseTo(550, 9);
  });
});
