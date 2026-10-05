import { describe, it, expect } from 'vitest';

import { raycastTerrain } from '../../../src/utils/camera/raycastTerrain';
import { raySphereRoots } from '../../../src/utils/math/raySphereRoots';
import { distance3 } from '../../../src/utils/math/distance3';
import { normalize3 } from '../../../src/utils/math/normalize3';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import type { GroundRadiusLookup } from '../../../src/@types/camera/GroundRadiusLookup';

// Earth-scale bounds (spec §8.1's [-430, 8849] relief, rounded for readable
// fixtures) — every expectation below is derived from raySphereRoots (an
// independently-pinned closed form) or from the returned pick's own field
// value, never from a value recorded by running raycastTerrain itself.
const DATUM_M = 6_371_000;
const INNER_RADIUS_M = DATUM_M - 500;
const OUTER_RADIUS_M = DATUM_M + 9000;
const CENTRE_M: Vec3 = [0, 0, 0];

describe('raycastTerrain', () => {
  it('matches the analytic sphere root for a flat field, near-nadir ray', () => {
    // 100 km up, aimed 5° off nadir. The tilt is load-bearing: a ray straight
    // down the z axis meets the datum exactly where the eye's OWN radial does,
    // so it cannot tell a march along the ray from an answer that merely drops
    // the eye onto the ground — leaving the signed field's sign unconstrained.
    // At 5° the two land ~8.7 km apart, orders past the 1 m assertion.
    const origin: Vec3 = [0, 0, DATUM_M + 100_000];
    const tiltRad = (5 * Math.PI) / 180;
    const dir: Vec3 = [Math.sin(tiltRad), 0, -Math.cos(tiltRad)];
    const flatField: GroundRadiusLookup = () => DATUM_M;
    const roots = raySphereRoots(origin, dir, CENTRE_M, DATUM_M);
    expect(roots).not.toBeNull();
    const expected: Vec3 = [
      origin[0] + dir[0] * roots![0],
      origin[1] + dir[1] * roots![0],
      origin[2] + dir[2] * roots![0],
    ];

    const pick = raycastTerrain(
      { originM: origin, dir },
      INNER_RADIUS_M,
      OUTER_RADIUS_M,
      flatField,
      1,
    );
    expect(pick).not.toBeNull();
    expect(distance3(pick!.pointM, expected)).toBeLessThanOrEqual(1);
  });

  it('matches the analytic sphere root for a flat field, 60°-from-nadir ray', () => {
    // dir tilted 60° off nadir: dot([0,0,-1], dir) = 0.5 = cos(60°).
    const origin: Vec3 = [0, 0, DATUM_M + 100_000];
    const dir: Vec3 = [Math.sqrt(3) / 2, 0, -0.5];
    const flatField: GroundRadiusLookup = () => DATUM_M;
    const roots = raySphereRoots(origin, dir, CENTRE_M, DATUM_M);
    expect(roots).not.toBeNull();
    const expected: Vec3 = [
      origin[0] + dir[0] * roots![0],
      origin[1] + dir[1] * roots![0],
      origin[2] + dir[2] * roots![0],
    ];

    const pick = raycastTerrain(
      { originM: origin, dir },
      INNER_RADIUS_M,
      OUTER_RADIUS_M,
      flatField,
      1,
    );
    expect(pick).not.toBeNull();
    expect(distance3(pick!.pointM, expected)).toBeLessThanOrEqual(1);
  });

  it('hits the near face of a ridge, not the ground beyond it', () => {
    // Ridge radius sphere gives an exact analytic near-crossing point
    // (pRidge); a band of ±5° around its own angle — arc length ~556 km,
    // two orders of magnitude past the ~166 m step cap this bracket
    // produces — puts that point inside "ridge terrain" without also
    // exercising the step cap, so a step-cap bug can't masquerade as a
    // first-crossing bug (or vice versa).
    const ridgeHeightM = 4000;
    const ridgeRadiusM = DATUM_M + ridgeHeightM;
    const origin: Vec3 = [0, 0, DATUM_M + 50_000];
    const dir = normalize3([1, 0, -2]);

    const ridgeRoots = raySphereRoots(origin, dir, CENTRE_M, ridgeRadiusM);
    expect(ridgeRoots).not.toBeNull();
    const tRidge = ridgeRoots![0];
    const pRidge: Vec3 = [
      origin[0] + dir[0] * tRidge,
      origin[1] + dir[1] * tRidge,
      origin[2] + dir[2] * tRidge,
    ];
    const angleRidge = Math.atan2(pRidge[0], pRidge[2]);
    const halfWidthRad = (5 * Math.PI) / 180;

    const ridgeField: GroundRadiusLookup = (p) => {
      const angle = Math.atan2(p[0], p[2]);
      const inBand = angle >= angleRidge - halfWidthRad && angle <= angleRidge + halfWidthRad;
      return inBand ? ridgeRadiusM : DATUM_M;
    };

    const pick = raycastTerrain(
      { originM: origin, dir },
      INNER_RADIUS_M,
      OUTER_RADIUS_M,
      ridgeField,
      0.5,
    );
    expect(pick).not.toBeNull();
    expect(distance3(pick!.pointM, pRidge)).toBeLessThanOrEqual(1);
  });

  it('answers the eye-own nadir point when the eye starts below the field', () => {
    // Eye at radius DATUM+1000 under a (uniform, for simplicity) ground
    // radius of DATUM+2000 — embedded 1000 m below "terrain", looking
    // further down. The correct answer is straight up the local radial
    // to DATUM+2000, i.e. [0,0,DATUM+2000] exactly, since the ray here is
    // already parallel to that radial. A march that ignored this case
    // would instead hunt for an exit face along -z, far below.
    const origin: Vec3 = [0, 0, DATUM_M + 1000];
    const dir: Vec3 = [0, 0, -1];
    const groundRadiusM = DATUM_M + 2000;
    const embeddedField: GroundRadiusLookup = () => groundRadiusM;

    const pick = raycastTerrain(
      { originM: origin, dir },
      INNER_RADIUS_M,
      OUTER_RADIUS_M,
      embeddedField,
      0.5,
    );
    expect(pick).not.toBeNull();
    expect(distance3(pick!.pointM, [0, 0, groundRadiusM])).toBeLessThanOrEqual(0.5);
  });

  it('returns null for a ray that never reaches the outer shell', () => {
    // Horizontal ray 50 km up: closest approach to centre is that same
    // 50 km-up radius everywhere along it, always past OUTER_RADIUS_M, so
    // raySphereRoots has no real solution (discriminant < 0).
    const origin: Vec3 = [0, 0, DATUM_M + 50_000];
    const dir: Vec3 = [1, 0, 0];
    const flatField: GroundRadiusLookup = () => DATUM_M;
    expect(raySphereRoots(origin, dir, CENTRE_M, OUTER_RADIUS_M)).toBeNull();

    const pick = raycastTerrain(
      { originM: origin, dir },
      INNER_RADIUS_M,
      OUTER_RADIUS_M,
      flatField,
      1,
    );
    expect(pick).toBeNull();
  });

  it('returns null for a ray aimed away from the body, not a behind-the-eye hit', () => {
    const origin: Vec3 = [0, 0, DATUM_M + 50_000];
    const dir: Vec3 = [0, 0, 1];
    const flatField: GroundRadiusLookup = () => DATUM_M;
    const roots = raySphereRoots(origin, dir, CENTRE_M, OUTER_RADIUS_M);
    expect(roots).not.toBeNull();
    expect(roots![1]).toBeLessThan(0); // both crossings behind the eye

    const pick = raycastTerrain(
      { originM: origin, dir },
      INNER_RADIUS_M,
      OUTER_RADIUS_M,
      flatField,
      1,
    );
    expect(pick).toBeNull();
  });

  it('the step cap keeps a grazing ray from skipping a ridge narrower than its raw step', () => {
    // A ray tangent to radius DATUM at t=L (origin on the +x axis, dir along
    // +z, so |p(t)|² = DATUM²+(L-t)² is minimised exactly at t=L): the
    // outer-shell chord is ~677 km (spec's "~670 km on Earth" grazing
    // figure), so a raw f/closingRate step early on is ~170 km — many times
    // the ridge's ~2×8 km band — while the cap holds every step to the
    // bracket's own ~10.6 km share. tRidge is where the tangent parabola
    // first reaches DATUM+ridgeHeightM, solved directly from that identity
    // (not from raycastTerrain): (L-t)² = ridgeHeightM·(2·DATUM+ridgeHeightM).
    const L = 400_000;
    const origin: Vec3 = [DATUM_M, 0, -L];
    const dir: Vec3 = [0, 0, 1];
    const ridgeHeightM = 2000;
    const tRidge = L - Math.sqrt(ridgeHeightM * (2 * DATUM_M + ridgeHeightM));
    const pRidge: Vec3 = [DATUM_M, 0, -L + tRidge];
    const angleRidge = Math.atan2(pRidge[0], pRidge[2]);
    // Band half-width in angle, derived from a numeric d(angle)/dt at tRidge
    // times an 8000 m half-width in t — comfortably above the ~10.6 km
    // step cap's own scale so cap-paced sampling cannot straddle it.
    const dt = 1;
    const angleAt = (t: number) => Math.atan2(DATUM_M, -L + t);
    const dAngleDt = (angleAt(tRidge + dt) - angleAt(tRidge - dt)) / (2 * dt);
    const halfWidthRad = Math.abs(dAngleDt) * 8000;

    const ridgeField: GroundRadiusLookup = (p) => {
      const angle = Math.atan2(p[0], p[2]);
      const inBand = angle >= angleRidge - halfWidthRad && angle <= angleRidge + halfWidthRad;
      return inBand ? DATUM_M + ridgeHeightM : DATUM_M;
    };

    const pick = raycastTerrain(
      { originM: origin, dir },
      INNER_RADIUS_M,
      OUTER_RADIUS_M,
      ridgeField,
      0.5,
    );
    expect(pick).not.toBeNull();
    expect(distance3(pick!.pointM, pRidge)).toBeLessThanOrEqual(50);
  });

  it('honours a tight tolerance across a steep (cliff) field', () => {
    // A hard step in groundRadiusAtM at the x = 0 lip, aimed at so the bracket
    // the refinement resolves STRADDLES it — the point of the case: land deep
    // in the plateau instead and the field is locally constant, so any
    // tolerance is met for free. Geometry (y = 0, so a radius on the z axis is
    // just z, and the field's sign is the sign of x): dir drops 4 m of z per
    // 1 m of x, so an origin 1000 m west of the lip and 4000 m above it clears
    // the lip by EDGE_CLEARANCE_M. West of the lip the ground is the datum
    // 3 km down, so every step runs at the ~138 m cap and the march brackets
    // x = -29 m (f ≈ +3116) against x = +5 m (f ≈ -18) — |f| jumps ~3000 m
    // across the step. The root is EDGE_CLEARANCE_M of altitude past the lip,
    // i.e. x = 0.25 m on the 4:1 slope, which the second assertion pins so a
    // re-aim that drifts back into the plateau fails instead of passing free.
    const cliffHeightM = 3000;
    const cliffRadiusM = DATUM_M + cliffHeightM;
    const EDGE_CLEARANCE_M = 1;
    const origin: Vec3 = [-1000, 0, cliffRadiusM + EDGE_CLEARANCE_M + 4000];
    const dir = normalize3([1, 0, -4]);
    const toleranceM = 0.001;
    const cliffField: GroundRadiusLookup = (p) =>
      Math.atan2(p[0], p[2]) >= 0 ? cliffRadiusM : DATUM_M;

    const pick = raycastTerrain(
      { originM: origin, dir },
      INNER_RADIUS_M,
      OUTER_RADIUS_M,
      cliffField,
      toleranceM,
    );
    expect(pick).not.toBeNull();
    const radiusM = Math.hypot(pick!.pointM[0], pick!.pointM[1], pick!.pointM[2]);
    expect(Math.abs(radiusM - cliffField(pick!.pointM))).toBeLessThanOrEqual(toleranceM);
    expect(pick!.pointM[0]).toBeGreaterThan(0);
    expect(pick!.pointM[0]).toBeLessThan(1);
  });
});
