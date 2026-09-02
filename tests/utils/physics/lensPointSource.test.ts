/**
 * lensPointSource — the finite-distance point-mass lens.
 *
 * Every expectation here is hand-computed from the closed form, never from the
 * source's own expression: the Einstein radii below were worked out on paper
 * (sqrt(2 r_s D_ls / (D_l D_s)) at the stated geometry) and pasted as literals,
 * so a wrong formula fails rather than agreeing with itself.
 *
 * Geometry is built in a deliberately skew frame (the axis is not a basis
 * vector) so an implementation that quietly assumes an axis-aligned lens fails.
 */

import { describe, it, expect } from 'vitest';

import { lensPointSource } from '../../../src/utils/physics/lensPointSource';
import { normalize3 } from '../../../src/utils/math/normalize3';
import { cross3 } from '../../../src/utils/math/cross3';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const EYE: Vec3 = [7, -3, 11];
/** A skew unit axis — no coordinate plane is special to the lens. */
const AXIS = normalize3([2, -1, 2]);
/** A unit vector perpendicular to AXIS, the plane the two images must share. */
const PERP = normalize3(cross3(AXIS, [0, 0, 1]));

const dot = (a: Readonly<Vec3>, b: Readonly<Vec3>): number =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** A point at axial distance `axial` from the eye, offset `beta` off the axis. */
function sourceAt(axial: number, betaRad: number): Vec3 {
  const lateral = axial * Math.tan(betaRad);
  return [
    EYE[0] + AXIS[0] * axial + PERP[0] * lateral,
    EYE[1] + AXIS[1] * axial + PERP[1] * lateral,
    EYE[2] + AXIS[2] * axial + PERP[2] * lateral,
  ];
}

const lensAt = (distance: number): Vec3 => [
  EYE[0] + AXIS[0] * distance,
  EYE[1] + AXIS[1] * distance,
  EYE[2] + AXIS[2] * distance,
];

/** Sgr A*'s r_s in AU, to two figures — the scale the S-star band actually runs at. */
const R_S_AU = 0.085;

describe('lensPointSource', () => {
  it('splits an on-axis source into two images one finite-distance Einstein radius off the axis', () => {
    // r_s = 0.085, D_l = 300, D_s = 600 => D_ls = 300 and
    // theta_E = sqrt(2 * 0.085 * 300 / (300 * 600)) = sqrt(51/180000) rad.
    // The AT-INFINITY radius (D_ls/D_s -> 1) would be sqrt(2*0.085/300) =
    // 0.023805 rad — 41% larger — which is the whole reason this function
    // exists rather than the textbook far-source form.
    const images = lensPointSource({
      eye: EYE,
      lens: lensAt(300),
      source: sourceAt(600, 0),
      schwarzschildRadius: R_S_AU,
    });

    expect(images).toHaveLength(2);
    for (const image of images) {
      expect(Math.acos(dot(image.direction, AXIS))).toBeCloseTo(0.0168325082306, 10);
    }
    // Opposite sides of the axis: an Einstein ring sampled at two antipodes.
    expect(dot(images[0]!.direction, images[1]!.direction)).toBeLessThan(1);
    expect(dot(images[0]!.direction, PERP) * dot(images[1]!.direction, PERP)).toBeLessThan(0);
  });

  it('far off-axis: the primary is the source barely displaced and unmagnified, the secondary is negligible', () => {
    // r_s = 0.085, D_l = 3000, D_s = 6000 => theta_E = sqrt(0.17/6000) =
    // 0.00532290647 rad. At beta = 100 theta_E the primary sits theta_E^2/beta
    // = 5.32e-5 rad outside the true direction and the secondary collapses onto
    // the axis with flux ~beta^-4.
    const einsteinRad = 0.00532290647422;
    const betaRad = 100 * einsteinRad;
    const source = sourceAt(6000, betaRad);
    const trueDir = normalize3([source[0] - EYE[0], source[1] - EYE[1], source[2] - EYE[2]]);

    const [primary, secondary] = lensPointSource({
      eye: EYE,
      lens: lensAt(3000),
      source,
      schwarzschildRadius: R_S_AU,
    });

    expect(Math.acos(dot(primary!.direction, trueDir))).toBeLessThan(1e-4);
    expect(primary!.magnification).toBeCloseTo(1, 6);
    // Displaced AWAY from the lens, never towards it.
    expect(Math.acos(dot(primary!.direction, AXIS))).toBeGreaterThan(betaRad);

    expect(secondary!.magnification).toBeLessThan(1e-4);
    expect(Math.acos(dot(secondary!.direction, AXIS))).toBeLessThan(betaRad);
  });

  it('leaves a source in front of the lens plane unlensed — one image, unit magnification', () => {
    // Axial distance 150 against a lens at 300: the light never passes the mass,
    // so there is nothing to deflect and no second image to invent.
    const source = sourceAt(150, 0.2);
    const images = lensPointSource({
      eye: EYE,
      lens: lensAt(300),
      source,
      schwarzschildRadius: R_S_AU,
    });

    expect(images).toHaveLength(1);
    expect(images[0]!.magnification).toBe(1);
    const trueDir = normalize3([source[0] - EYE[0], source[1] - EYE[1], source[2] - EYE[2]]);
    expect(dot(images[0]!.direction, trueDir)).toBeCloseTo(1, 12);
  });

  it('returns unit directions coplanar with the axis and the true source direction', () => {
    const source = sourceAt(600, 0.35);
    const images = lensPointSource({
      eye: EYE,
      lens: lensAt(300),
      source,
      schwarzschildRadius: R_S_AU,
    });
    const trueDir = normalize3([source[0] - EYE[0], source[1] - EYE[1], source[2] - EYE[2]]);
    const planeNormal = normalize3(cross3(AXIS, trueDir));

    for (const image of images) {
      expect(Math.hypot(...image.direction)).toBeCloseTo(1, 12);
      expect(dot(image.direction, planeNormal)).toBeCloseTo(0, 12);
    }
  });
});
