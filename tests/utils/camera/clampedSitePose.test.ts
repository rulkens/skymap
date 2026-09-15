/**
 * clampedSitePose — the rung's ground. The floor ORDER is the thing under test:
 * the eye floor is range-dependent, so a range clamp applied afterwards would
 * leave the eye under the ground.
 */

import { describe, it, expect } from 'vitest';

import { clampedSitePose } from '../../../src/utils/camera/clampedSitePose';
import type { MeshBody } from '../../../src/@types/scene/MeshBody';
import type { SitePose } from '../../../src/@types/camera/SitePose';
import type { BodyId } from '../../../src/@types/data/body/BodyId';

const BODY: MeshBody = {
  id: 'fixture',
  label: 'Fixture',
  boundingRadiusM: 1,
  albedo: [1, 1, 1],
  meshKey: 'fixture',
  standoffRadii: 2,
};

const POSE: SitePose = {
  siteId: 'curiosity' as BodyId,
  headingRad: 0.4,
  elevationRad: 0,
  rangeM: 10,
};

describe('clampedSitePose', () => {
  it('lifts a ground-grazing eye to the floor height', () => {
    // 0.2 bounding radii of eye height at 10 m of range ⇒ sin(elev) = 0.02.
    const out = clampedSitePose(POSE, BODY);
    expect(out.rangeM).toBe(10);
    expect(out.elevationRad).toBeCloseTo(Math.asin(0.02), 12);
    expect(out.headingRad).toBe(POSE.headingRad);
  });

  it('floors the range and re-applies the elevation floor at the new range', () => {
    const out = clampedSitePose({ ...POSE, rangeM: 1 }, BODY);
    expect(out.rangeM).toBeCloseTo(2, 12);
    // sin(elev) = 0.2 / 2, not 0.2 / 1 — the floor is evaluated at the FLOORED range.
    expect(out.elevationRad).toBeCloseTo(Math.asin(0.1), 12);
    expect(out.elevationRad).not.toBeCloseTo(Math.asin(0.2), 6);
  });

  it('a straight-overhead request keeps the heading defined', () => {
    const out = clampedSitePose({ ...POSE, elevationRad: Math.PI / 2 }, BODY);
    expect(out.elevationRad).toBeLessThan(Math.PI / 2);
    // The horizontal component `atan2` reads the heading back off stays finite.
    expect(Math.cos(out.elevationRad)).toBeGreaterThan(1e-6);
  });
});
