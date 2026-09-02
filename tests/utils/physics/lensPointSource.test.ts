/**
 * lensPointSource — the finite-distance lens solved on an exact bending angle.
 *
 * The solver and the bending-angle table are tested apart. Handed the weak
 * field's OWN alpha = 2/b, the solve must reproduce the textbook closed form to
 * round-off — a hand-computed literal (the Einstein radii below were worked out
 * on paper) anchors the geometry, and the closed form then pins every root and
 * magnification the solver returns. Handed the real Schwarzschild table, the
 * claims that matter are the ones the weak field cannot make at all: nothing
 * inside the shadow, and a secondary that fades to nothing continuously.
 *
 * Geometry is built in a deliberately skew frame (the axis is not a basis
 * vector) so an implementation that quietly assumes an axis-aligned lens fails.
 */

import { describe, it, expect } from 'vitest';

import { lensPointSource } from '../../../src/utils/physics/lensPointSource';
import { buildSchwarzschildDeflectionLut } from '../../../src/utils/lensing/buildSchwarzschildDeflectionLut';
import { sampleSchwarzschildDeflection } from '../../../src/utils/lensing/sampleSchwarzschildDeflection';
import { CRITICAL_IMPACT_PARAM_RS } from '../../../src/utils/lensing/criticalImpactParamRs';
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

const LUT = buildSchwarzschildDeflectionLut(4096);
const schwarzschild = (impactParamRs: number) => sampleSchwarzschildDeflection(LUT, impactParamRs);
/** The weak field's own deflection: 4GM/c^2 b = 2 r_s / b. */
const weakField = (impactParamRs: number) => 2 / impactParamRs;

/**
 * Signed angle off the axis, positive on PERP's side. Via atan2 on the
 * rejection, not acos on the dot — at the milliradian scale these images live
 * at, acos loses seven digits and would read as a solver error.
 */
const signedAngle = (direction: Readonly<Vec3>): number => {
  const along = dot(direction, AXIS);
  const lateral = Math.hypot(
    direction[0] - AXIS[0] * along,
    direction[1] - AXIS[1] * along,
    direction[2] - AXIS[2] * along,
  );
  return Math.atan2(lateral, along) * Math.sign(dot(direction, PERP));
};

describe('lensPointSource', () => {
  it('reproduces the weak-field closed form when handed the weak field', () => {
    // r_s = 0.085, D_l = 3000, D_s = 6000 => D_ls = 3000 and
    // theta_E = sqrt(2 * 0.085 * 3000 / (3000 * 6000)) = sqrt(0.17/6000) rad.
    // The AT-INFINITY radius (D_ls/D_s -> 1) would be sqrt(2*0.085/3000) =
    // 0.0075277 rad — 41% larger — which is the whole reason this function
    // exists rather than the textbook far-source form.
    const einsteinRad = 0.00532290647422;

    // beta stops at 20 theta_E because past that the closed form's secondary
    // falls INSIDE the shadow, where 2/b is fiction and no image exists.
    for (const betaOverEinstein of [1e-3, 0.5, 3, 20]) {
      const betaRad = betaOverEinstein * einsteinRad;
      const [primary, secondary] = lensPointSource({
        eye: EYE,
        lens: lensAt(3000),
        source: sourceAt(6000, betaRad),
        schwarzschildRadius: R_S_AU,
        deflection: weakField,
      });

      // theta^2 - beta theta - theta_E^2 = 0, and mu = |1 - (theta_E/theta)^4|^-1.
      const root = Math.sqrt(betaRad * betaRad + 4 * einsteinRad * einsteinRad);
      const expected = [(betaRad + root) / 2, (betaRad - root) / 2];
      const magnificationAt = (theta: number) => Math.abs(1 / (1 - (einsteinRad / theta) ** 4));

      for (const [image, thetaRad] of [
        [primary!, expected[0]!],
        [secondary!, expected[1]!],
      ] as const) {
        expect(signedAngle(image.direction) / einsteinRad).toBeCloseTo(thetaRad / einsteinRad, 9);
        expect(image.magnification / magnificationAt(thetaRad)).toBeCloseTo(1, 6);
      }
    }
  });

  it('puts an on-axis source on an Einstein ring a little wider than the weak field predicts', () => {
    // D_l = 300, D_s = 600 => theta_E = sqrt(2 * 0.085 * 300 / (300 * 600)) =
    // sqrt(51/180000) = 0.0168325 rad in the weak field. The exact deflection is
    // stronger, and the table's pinned 1/b tail (sampleSchwarzschildDeflection)
    // adds ~3% on top of 2/b out where this ring sits (b ~ 60 r_s), so the true
    // ring lands ~1.5% wider. Both images sample that one ring at antipodes.
    const images = lensPointSource({
      eye: EYE,
      lens: lensAt(300),
      source: sourceAt(600, 0),
      schwarzschildRadius: R_S_AU,
      deflection: schwarzschild,
    });

    const einsteinRad = 0.0168325082306;
    expect(images).toHaveLength(2);
    for (const image of images) {
      expect(Math.abs(signedAngle(image.direction)) / einsteinRad).toBeCloseTo(1.0152, 3);
    }
    expect(dot(images[0]!.direction, PERP) * dot(images[1]!.direction, PERP)).toBeLessThan(0);
  });

  it('never puts an image inside the shadow, and fades the secondary out continuously', () => {
    // The defect this replaced the weak-field solve for: 2/b keeps the secondary
    // bright right down to the photon sphere, so a brightness floor or a shadow
    // cull had to switch it off — and the switch POPPED. The exact deflection
    // diverges there instead, so the image walks in toward the shadow edge and
    // its magnification falls away to nothing on its own.
    const shadowRad = (CRITICAL_IMPACT_PARAM_RS * R_S_AU) / 300;
    const sweep = Array.from({ length: 50 }, (_, i) => 1e-3 + (1.4 - 1e-3) * (i / 49)).map(
      (betaRad) =>
        lensPointSource({
          eye: EYE,
          lens: lensAt(300),
          source: sourceAt(600, betaRad),
          schwarzschildRadius: R_S_AU,
          deflection: schwarzschild,
        }),
    );

    let fadedBy = -1;
    for (const [i, [primary, secondary]] of sweep.entries()) {
      const offAxis = Math.abs(signedAngle(secondary!.direction));
      expect(offAxis).toBeGreaterThan(shadowRad);
      expect(Math.abs(signedAngle(primary!.direction))).toBeGreaterThan(shadowRad);
      expect(primary!.magnification).toBeGreaterThanOrEqual(1);
      expect(secondary!.magnification).toBeGreaterThan(0);
      if (i > 0) {
        const previous = sweep[i - 1]![1]!;
        expect(offAxis).toBeLessThan(Math.abs(signedAngle(previous.direction)));
        expect(secondary!.magnification).toBeLessThan(previous.magnification);
      }
      if (fadedBy < 0 && secondary!.magnification < 1e-6) fadedBy = i;
    }

    // Faded to nothing while still a clear 1% off the shadow edge: by the time
    // the image reaches the rim it has nothing left to pop out of.
    expect(fadedBy).toBeGreaterThan(0);
    const faded = sweep[fadedBy]![1]!;
    expect(Math.abs(signedAngle(faded.direction))).toBeGreaterThan(1.01 * shadowRad);
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
      deflection: schwarzschild,
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
      deflection: schwarzschild,
    });
    const trueDir = normalize3([source[0] - EYE[0], source[1] - EYE[1], source[2] - EYE[2]]);
    const planeNormal = normalize3(cross3(AXIS, trueDir));

    for (const image of images) {
      expect(Math.hypot(...image.direction)).toBeCloseTo(1, 12);
      expect(dot(image.direction, planeNormal)).toBeCloseTo(0, 12);
    }
  });
});
