/**
 * sitePoseFromBodyArm — the engage. Round-trip exactness one way, eye
 * projection the other: asserting full symmetry would pin the wrong contract.
 */

import { describe, it, expect } from 'vitest';

import { canonicalBasisAt } from '../../../src/utils/camera/canonicalBasisAt';
import { siteEyeFrame } from '../../../src/utils/camera/siteEyeFrame';
import { sitePointBodyFixed } from '../../../src/utils/camera/sitePointBodyFixed';
import { sitePoseFromBodyArm } from '../../../src/utils/camera/sitePoseFromBodyArm';
import { sitePoseToBodyArm } from '../../../src/utils/camera/sitePoseToBodyArm';
import { SITE_RUNG } from '../../../src/data/camera/siteRung';
import type { BodyId } from '../../../src/@types/data/body/BodyId';
import type { MeshBody } from '../../../src/@types/scene/MeshBody';
import type { SitePose } from '../../../src/@types/camera/SitePose';
import type { SurfaceFixedSite } from '../../../src/@types/scene/SurfaceFixedSite';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const ROVER: MeshBody = {
  id: 'fixture-rover',
  label: 'Fixture rover',
  boundingRadiusM: 2.479,
  albedo: [1, 1, 1],
  meshKey: 'fixture',
  standoffRadii: 2,
};

const HOST_RADIUS_M = 3_389_500;
const RANGE_FLOOR_M = ROVER.standoffRadii * ROVER.boundingRadiusM;
const RELEASE_EDGE_M = 80 * ROVER.boundingRadiusM;

function site(latDeg: number, lonDeg: number): SurfaceFixedSite {
  return { id: 'fixture-rover', hostId: 'fixture-host', latDeg, lonDeg, altitudeM: 1.7 };
}

const SITES = [site(90, 0), site(0, 0), site(-4.59, 137.44)];

const POSES: readonly SitePose[] = [
  // Elevation at the floor, range at the floor.
  {
    siteId: 'fixture-rover' as BodyId,
    headingRad: 0.7,
    elevationRad: Math.asin(
      (SITE_RUNG.eyeFloorBoundingRadii * ROVER.boundingRadiusM) / RANGE_FLOOR_M,
    ),
    rangeM: RANGE_FLOOR_M,
  },
  // Elevation at the ceiling, range at the release edge.
  {
    siteId: 'fixture-rover' as BodyId,
    headingRad: -2.5,
    elevationRad: SITE_RUNG.elevationCeilRad,
    rangeM: RELEASE_EDGE_M,
  },
  { siteId: 'fixture-rover' as BodyId, headingRad: 3.0, elevationRad: 0.5, rangeM: 50 },
];

function expectRoundTrip(s: SurfaceFixedSite, hostRadiusM: number, pose: SitePose): void {
  const back = sitePoseFromBodyArm(sitePoseToBodyArm(pose, s, hostRadiusM), s, hostRadiusM, ROVER);
  expect(back.siteId).toBe(pose.siteId);
  expect(back.headingRad).toBeCloseTo(pose.headingRad, 9);
  expect(back.elevationRad).toBeCloseTo(pose.elevationRad, 9);
  expect(Math.abs(back.rangeM / pose.rangeM - 1)).toBeLessThan(1e-6);
}

describe('sitePoseFromBodyArm', () => {
  it('a site pose survives a round trip through the body arm', () => {
    for (const s of SITES) for (const pose of POSES) expectRoundTrip(s, HOST_RADIUS_M, pose);
  });

  it('a site on a non-Mars host round-trips identically', () => {
    // A 1 km host: nothing in the conversions may be Mars-typed or Mars-scaled.
    const tiny: SurfaceFixedSite = {
      id: 'fixture-rover',
      hostId: 'tiny-host',
      latDeg: 61,
      lonDeg: -21,
      altitudeM: 0.5,
    };
    for (const pose of POSES) expectRoundTrip(tiny, 1000, pose);
  });

  it('entering the site rung keeps the screen orientation and moves the eye', () => {
    const s = SITES[2]!;
    const pose = POSES[2]!;
    const arm = sitePoseToBodyArm(pose, s, HOST_RADIUS_M);
    const p = sitePointBodyFixed(s, HOST_RADIUS_M);
    // Same eye, basis swung a quarter turn off the site: the heading rides the
    // basis, so the turntable answers the quarter turn and the eye follows it.
    const aimedAway = {
      ...arm,
      basisLocal: canonicalBasisAt(
        siteEyeFrame(p),
        pose.headingRad + Math.PI / 2,
        Math.PI / 2 - pose.elevationRad,
      ),
    };

    const entered = sitePoseFromBodyArm(aimedAway, s, HOST_RADIUS_M, ROVER);
    expect(entered.headingRad).toBeCloseTo(pose.headingRad - Math.PI / 2, 9);
    expect(entered.elevationRad).toBeCloseTo(pose.elevationRad, 9);
    expect(entered.rangeM).toBeCloseTo(pose.rangeM, 6);

    const reEntered = sitePoseToBodyArm(entered, s, HOST_RADIUS_M);
    for (const i of [0, 1, 2] as const) {
      expect(reEntered.anchorLocalM[i]).toBeCloseTo(arm.anchorLocalM[i], 6);
    }
    // Right and up are the first two columns: the swung screen orientation held.
    for (const i of [0, 1, 2, 3, 4, 5] as const) {
      expect(reEntered.basisLocal[i]).toBeCloseTo(aimedAway.basisLocal[i], 9);
    }
    // Forward is the third column: it still points from the (moved) eye at the site.
    const range = Math.hypot(...reEntered.eyeRelAnchorM);
    for (const i of [0, 1, 2] as const) {
      expect(reEntered.basisLocal[6 + i]).toBeCloseTo(-reEntered.eyeRelAnchorM[i] / range, 9);
    }
  });

  it('an overhead engage takes its heading from the basis, not from eye noise', () => {
    // Adverse 8: the engage lands at the remembered top-down tilt, where the
    // eye's azimuth about the site is sub-millimetre float noise — two eyes a
    // tenth of a millimetre apart used to hand back headings π apart, so the
    // rover landed spun by a different angle every time the user zoomed in.
    const s = SITES[2]!;
    const p = sitePointBodyFixed(s, HOST_RADIUS_M);
    const frame = siteEyeFrame(p);
    const HEADING_RAD = 0.7;
    const RANGE_M = 50;
    const basisLocal = canonicalBasisAt(frame, HEADING_RAD + Math.PI, 0);
    const headingFor = (offsetM: number): number => {
      const eyeRelAnchorM = [0, 1, 2].map(
        (i) => RANGE_M * frame.localUp[i]! + offsetM * frame.east[i]!,
      ) as Vec3;
      return sitePoseFromBodyArm(
        { bodyId: 'fixture-host' as BodyId, anchorLocalM: p, eyeRelAnchorM, basisLocal },
        s,
        HOST_RADIUS_M,
        ROVER,
      ).headingRad;
    };

    expect(headingFor(1e-4)).toBeCloseTo(HEADING_RAD, 9);
    expect(headingFor(-1e-4)).toBeCloseTo(HEADING_RAD, 9);
  });
});
