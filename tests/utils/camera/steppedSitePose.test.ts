/**
 * steppedSitePose — the turntable's feel. The level-horizon case is the one
 * that would have caught the incumbent world arm's rolling horizon.
 */

import { describe, it, expect } from 'vitest';

import { sitePointBodyFixed } from '../../../src/utils/camera/sitePointBodyFixed';
import { sitePoseToBodyArm } from '../../../src/utils/camera/sitePoseToBodyArm';
import { steppedSitePose } from '../../../src/utils/camera/steppedSitePose';
import { SITE_RUNG } from '../../../src/data/camera/siteRung';
import { cross3 } from '../../../src/utils/math/cross3';
import { dot3 } from '../../../src/utils/math/dot3';
import { normalize3 } from '../../../src/utils/math/normalize3';
import type { BodyId } from '../../../src/@types/data/body/BodyId';
import type { InputStep } from '../../../src/@types/camera/InputStep';
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

const SITE: SurfaceFixedSite = {
  id: 'fixture-rover',
  hostId: 'fixture-host',
  latDeg: 52.3,
  lonDeg: -17.8,
  altitudeM: 1.1,
};
const HOST_RADIUS_M = 3_389_500;

const VIEWPORT = [800, 600] as const;
const FOV_Y_RAD = 0.8;

const POSE: SitePose = {
  siteId: 'fixture-rover' as BodyId,
  headingRad: 0,
  elevationRad: 0.4,
  rangeM: 50,
};

function drag(dx: number, dy: number): InputStep {
  return { kind: 'drag', mode: 'orbit', startPx: [100, 100], endPx: [100 + dx, 100 + dy] };
}

function step(pose: SitePose, input: InputStep): SitePose {
  return steppedSitePose(pose, input, ROVER, VIEWPORT, FOV_Y_RAD);
}

describe('steppedSitePose', () => {
  it('turns the turntable by one FOV for a drag of one screen height, at any range', () => {
    for (const rangeM of [12, 400]) {
      const out = step({ ...POSE, rangeM }, drag(600, 0));
      expect(out.headingRad).toBeCloseTo(FOV_Y_RAD, 12);
      expect(out.rangeM).toBe(rangeM);
    }
  });

  it('drag signs: +Δx raises the heading and +Δy raises the eye', () => {
    const out = step(POSE, drag(60, 30));
    expect(out.headingRad).toBeGreaterThan(POSE.headingRad);
    expect(out.elevationRad).toBeGreaterThan(POSE.elevationRad);
  });

  it('keeps the horizon level, and the eye above the ground, through a mixed sequence', () => {
    const p = sitePointBodyFixed(SITE, HOST_RADIUS_M);
    const radial = normalize3(p);
    const eyeFloorM = SITE_RUNG.eyeFloorBoundingRadii * ROVER.boundingRadiusM;
    const sequence: readonly InputStep[] = [
      drag(220, -140),
      drag(-90, -600),
      { kind: 'zoom', factor: 0.3, duringGesture: false, cursorPx: null },
      drag(-410, 305),
      drag(770, 48),
      { kind: 'zoom', factor: 5, duringGesture: true, cursorPx: [10, 10] },
      drag(33, -720),
    ];

    let pose = POSE;
    for (const input of sequence) {
      pose = step(pose, input);
      const arm = sitePoseToBodyArm(pose, SITE, HOST_RADIUS_M);
      const sightline = normalize3(arm.eyeRelAnchorM);
      const basisUp: Vec3 = [arm.basisLocal[3], arm.basisLocal[4], arm.basisLocal[5]];
      // In the plane of the radial and the sightline ⇔ orthogonal to their
      // normal. Any roll tips `up` out of that plane.
      const planeNormal = cross3(radial, sightline);
      expect(dot3(basisUp, planeNormal)).toBeCloseTo(0, 9);
      expect(pose.rangeM * Math.sin(pose.elevationRad)).toBeGreaterThanOrEqual(eyeFloorM - 1e-9);
    }
  });

  it('a zoom-in burst stops at the range floor', () => {
    let pose: SitePose = { ...POSE, rangeM: 100 };
    for (let i = 0; i < 10; i += 1) {
      // 0.01 folds through the per-notch clamp to 0.5, so this is 100 × 0.5^10.
      pose = step(pose, { kind: 'zoom', factor: 0.01, duringGesture: false, cursorPx: null });
    }
    expect(pose.rangeM).toBeCloseTo(ROVER.standoffRadii * ROVER.boundingRadiusM, 12);
  });

  it('a non-drag, non-zoom input returns its pose by reference', () => {
    expect(step(POSE, { kind: 'gestureStart' })).toBe(POSE);
    expect(step(POSE, { kind: 'gestureEnd' })).toBe(POSE);
  });
});
