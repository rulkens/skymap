/**
 * makeEllipsoidUnionFilter — the sculpted-membership predicate built from a
 * smooth union of ellipsoids with a smoothstep-feathered probabilistic accept.
 *
 * The predicate is DETERMINISTIC (a per-row position+seed hash drives the
 * accept), so these tests pin the extremes exactly rather than a mid-band count:
 *   - a galaxy at an ellipsoid centre is kept for any seed (keepProb ≈ 1);
 *   - a galaxy far outside every ellipsoid is rejected (keepProb ≈ 0);
 *   - two filters built with the same seed agree on every point;
 *   - a feather-band point yields the same verdict across repeat calls and
 *     across instances (stable, hash-consistent).
 *
 * To place a galaxy exactly at an ellipsoid centre without hand-computing the
 * spherical→Cartesian conversion, the tests build the ellipsoid centre from the
 * SAME `raDecZToCartesian` the filter uses, then query that (ra, dec, z).
 */

import { describe, it, expect } from 'vitest';
import { makeEllipsoidUnionFilter } from '../../../../tools/utils/math/makeEllipsoidUnionFilter';
import { raDecZToCartesian } from '../../../../src/utils/math/raDecZToCartesian';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

// A representative sky direction + depth inside the SGW shell.
const RA = 175;
const DEC = 1.5;
const Z = 0.075;

/** The Cartesian centre of an ellipsoid placed exactly on (RA, DEC, Z). */
const CENTRE: Vec3 = raDecZToCartesian(RA, DEC, Z);

describe('makeEllipsoidUnionFilter', () => {
  it('keeps a galaxy at an ellipsoid centre, for any seed', () => {
    // At the centre dx=dy=dz=0 → the SDF is the (negative) interior distance,
    // deep inside the feather band, so keepProb saturates at 1 and rng() < 1 is
    // always true regardless of which hash the seed selects.
    for (const seed of [1, 42, 20260709, 999999]) {
      const keep = makeEllipsoidUnionFilter(
        [{ center: CENTRE, radii: [95, 130, 55] }],
        { blendMpc: 100, falloffMpc: 25, seed },
      );
      expect(keep(RA, DEC, Z)).toBe(true);
    }
  });

  it('rejects a galaxy far outside every ellipsoid (same sky direction, deep background)', () => {
    // z=0.5 sits ~1500 Mpc beyond the shell in the same sky direction, so the
    // union field is large-positive → keepProb 0 → rejected for any seed.
    for (const seed of [1, 42, 20260709]) {
      const keep = makeEllipsoidUnionFilter(
        [{ center: CENTRE, radii: [95, 130, 55] }],
        { blendMpc: 100, falloffMpc: 25, seed },
      );
      expect(keep(RA, DEC, 0.5)).toBe(false);
    }
  });

  it('rejects a galaxy a thousand Mpc off the centre in Cartesian space', () => {
    // Build an ellipsoid whose centre is 1000 Mpc away from where the query
    // (RA, DEC, Z) lands, so the query is far outside → rejected.
    const farCentre: Vec3 = [CENTRE[0] + 1000, CENTRE[1], CENTRE[2]];
    const keep = makeEllipsoidUnionFilter(
      [{ center: farCentre, radii: [95, 130, 55] }],
      { blendMpc: 100, falloffMpc: 25, seed: 7 },
    );
    expect(keep(RA, DEC, Z)).toBe(false);
  });

  it('is deterministic: two filters with the same seed agree on every point', () => {
    const build = () =>
      makeEllipsoidUnionFilter(
        // A wide feather (falloffMpc large) puts many nearby points in the
        // probabilistic band, so this exercises the fractional keepProb path
        // rather than just the saturated extremes.
        [{ center: CENTRE, radii: [50, 50, 50] }],
        { blendMpc: 100, falloffMpc: 1000, seed: 12345 },
      );
    const a = build();
    const b = build();
    for (let dRa = -3; dRa <= 3; dRa++) {
      for (let dDec = -3; dDec <= 3; dDec++) {
        const ra = RA + dRa * 0.5;
        const dec = DEC + dDec * 0.5;
        expect(a(ra, dec, Z)).toBe(b(ra, dec, Z));
      }
    }
  });

  it('gives a stable, hash-consistent verdict for a feather-band galaxy', () => {
    // A sphere with a wide falloff so the centre sits in the probabilistic band
    // (keepProb strictly between 0 and 1). The verdict must be stable across
    // repeat calls (each call re-seeds a fresh PRNG from the same hash) and
    // across independent filter instances with the same seed.
    const params = {
      radii: [50, 50, 50] as Vec3,
      opts: { blendMpc: 100, falloffMpc: 1000, seed: 20260709 },
    };
    const keep1 = makeEllipsoidUnionFilter([{ center: CENTRE, radii: params.radii }], params.opts);
    const keep2 = makeEllipsoidUnionFilter([{ center: CENTRE, radii: params.radii }], params.opts);
    const first = keep1(RA, DEC, Z);
    expect(keep1(RA, DEC, Z)).toBe(first);
    expect(keep1(RA, DEC, Z)).toBe(first);
    expect(keep2(RA, DEC, Z)).toBe(first);
  });

  it('different seeds thin the feather differently (seed is load-bearing)', () => {
    // Over a spread of feather-band points, two different seeds should not
    // produce byte-identical accept patterns — the seed genuinely perturbs the
    // per-row hash. (A handful of individual points may coincide; the full
    // pattern must differ.)
    const mk = (seed: number) =>
      makeEllipsoidUnionFilter(
        [{ center: CENTRE, radii: [50, 50, 50] }],
        { blendMpc: 100, falloffMpc: 1000, seed },
      );
    const a = mk(1);
    const b = mk(2);
    const pattern = (keep: (ra: number, dec: number, z: number) => boolean) => {
      const bits: boolean[] = [];
      for (let i = -6; i <= 6; i++) bits.push(keep(RA + i * 0.4, DEC, Z));
      return bits.join('');
    };
    expect(pattern(a)).not.toBe(pattern(b));
  });
});
