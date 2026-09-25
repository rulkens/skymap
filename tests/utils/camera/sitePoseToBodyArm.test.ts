/**
 * sitePoseToBodyArm — the disengage's one load-bearing fact: the arm is
 * anchored at the site. Anchored at the body centre instead, the stored
 * magnitudes silently jump from rover scale to host-radius scale.
 */

import { describe, it, expect } from 'vitest';

import { sitePointBodyFixed } from '../../../src/utils/camera/sitePointBodyFixed';
import { sitePoseToBodyArm } from '../../../src/utils/camera/sitePoseToBodyArm';
import type { BodyId } from '../../../src/@types/data/body/BodyId';
import type { SurfaceFixedSite } from '../../../src/@types/scene/SurfaceFixedSite';

const SITE: SurfaceFixedSite = {
  id: 'fixture-rover',
  hostId: 'fixture-host',
  latDeg: -12,
  lonDeg: 143,
  altitudeM: 3,
  seat: 'resting',
};

describe('sitePoseToBodyArm', () => {
  it('anchors the body arm at the site', () => {
    const arm = sitePoseToBodyArm(
      { siteId: 'fixture-rover' as BodyId, headingRad: 1.2, elevationRad: 0.4, rangeM: 37 },
      SITE,
      1000,
    );
    const p = sitePointBodyFixed(SITE, 1000);
    expect(arm.anchorLocalM[0]).toBeCloseTo(p[0], 9);
    expect(arm.anchorLocalM[1]).toBeCloseTo(p[1], 9);
    expect(arm.anchorLocalM[2]).toBeCloseTo(p[2], 9);
    expect(Math.hypot(...arm.eyeRelAnchorM)).toBeCloseTo(37, 9);
    expect(arm.bodyId).toBe('fixture-host');
  });
});
