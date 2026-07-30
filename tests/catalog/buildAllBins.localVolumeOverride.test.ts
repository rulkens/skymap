/**
 * Local-volume distance override regression test.
 *
 * Four golden-row pins for the behaviours that matter:
 *
 *   1. Catalog-overridden row inside the cutoff: position derives from
 *      the CF4 distance, NOT from cz. M31 (PGC 2557, d ≈ 0.78 Mpc,
 *      z = −0.001) is the canonical fixture — its blueshift would
 *      otherwise put it at the mirrored cz position ~3 Mpc away.
 *
 *   2. Past-cutoff CF4 match: override is ignored, the cz path drives
 *      position (per CUTOFF_MPC docstring — Hubble error is small
 *      enough past 30 Mpc that the extra dependency isn't worth it).
 *
 *   3. Unmatched inside-cutoff row: stays on cz (Resolved decision #3,
 *      "unmatched rows stay on cz-derived distance"). A fixture with
 *      no PGC and z = 0.002 (≈ 9 Mpc) pins the cz path still fires.
 *
 *   4. spectroscopicZ is always the catalogued value, regardless of
 *      which branch fired. Carries through to the InfoCard via
 *      cloud.spectroscopicZ[idx].
 */
import { describe, it, expect } from 'vitest';
import { recordsToCloud, type LocalVolumeOverrides } from '../../tools/catalog/buildAllBins';
import { Source } from '../../src/data/sources';
import type { ParsedRecord } from '../../tools/parsers/common';
import type { Cf4Record } from '../../tools/parsers/cosmicflows4';

const M31_RA = 10.6847;
const M31_DEC = 41.2687;
const M31_Z = -0.001001; // NED
const M31_DIST_MPC = 0.785; // Cosmicflows-4 weighted distance
const M31_PGC = 2557;

function rec(partial: Partial<ParsedRecord>): ParsedRecord {
  return {
    source: Source.TwoMRS,
    objID: 0n,
    ra: 0,
    dec: 0,
    z: 0,
    spectroscopicZ: 0,
    magU: NaN,
    magG: NaN,
    magR: NaN,
    magI: NaN,
    magZ: NaN,
    axisRatio: null,
    positionAngleDeg: null,
    diameterKpc: null,
    classByte: 0,
    parentSurveyByte: 0,
    ...partial,
  };
}

function overrides(
  cf4Records: ReadonlyArray<Cf4Record>,
  seed: ReadonlyArray<[string, number]> = [],
): LocalVolumeOverrides {
  const byPgc = new Map<number, Cf4Record>();
  for (const r of cf4Records) {
    if (r.pgc !== null) byPgc.set(r.pgc, r);
  }
  const blueshiftSeed = new Map(seed.map(([massId, distMpc]) => [massId, { distMpc }]));
  return { cf4: { byPgc }, hyperLeda: new Map(), blueshiftSeed };
}

/** Recover (RA, Dec) in degrees from a cartesian position, to test direction. */
function raDecOf(x: number, y: number, z: number): { ra: number; dec: number } {
  const r = Math.hypot(x, y, z);
  let ra = (Math.atan2(y, x) * 180) / Math.PI;
  if (ra < 0) ra += 360;
  return { ra, dec: (Math.asin(z / r) * 180) / Math.PI };
}

describe('local-volume override in recordsToCloud', () => {
  it('M31: CF4 distance drives position; spectroscopicZ is the catalogued value', () => {
    const m31 = rec({
      objID: BigInt(M31_PGC),
      ra: M31_RA,
      dec: M31_DEC,
      z: M31_Z,
      spectroscopicZ: M31_Z,
    });
    const ov = overrides([
      { pgc: M31_PGC, distMpc: M31_DIST_MPC, eDistMpc: 0.04, raDeg: M31_RA, deDeg: M31_DEC },
    ]);
    const cloud = recordsToCloud([m31], ov);
    const px = cloud.positions[0]!;
    const py = cloud.positions[1]!;
    const pz = cloud.positions[2]!;
    const r = Math.sqrt(px * px + py * py + pz * pz);
    // Position should sit at the CF4 distance, not the cz-implied
    // mirror-image at ~3 Mpc on the opposite side of the sky.
    expect(r).toBeCloseTo(M31_DIST_MPC, 2);
    // Spectroscopic z is the published catalog value, not the
    // position-implied z ≈ +0.000175.
    expect(cloud.spectroscopicZ[0]).toBeCloseTo(M31_Z, 5);
  });

  it('past-cutoff CF4 row: override ignored, cz path drives position', () => {
    const distantRow = rec({
      objID: 99999n,
      ra: 180,
      dec: 0,
      z: 0.05,
      spectroscopicZ: 0.05,
    });
    const ov = overrides([
      // CF4 distance = 100 Mpc, well past CUTOFF_MPC = 30. Override is rejected.
      { pgc: 99999, distMpc: 100, eDistMpc: 1.0, raDeg: 180, deDeg: 0 },
    ]);
    const cloud = recordsToCloud([distantRow], ov);
    const r = Math.hypot(cloud.positions[0]!, cloud.positions[1]!, cloud.positions[2]!);
    // Hubble-flow distance for z = 0.05 is ~210 Mpc (cz/H0 with H0 ≈ 70).
    // Verify the cz path fired (≫ 100) instead of the rejected CF4 distance.
    expect(r).toBeGreaterThan(150);
    // Spectroscopic z still the catalogued value.
    expect(cloud.spectroscopicZ[0]).toBeCloseTo(0.05, 4);
  });

  it('unmatched inside-cutoff row: stays on cz path (Resolved decision #3)', () => {
    const orphan = rec({
      objID: 0n,
      ra: 200,
      dec: -10,
      z: 0.002,
      spectroscopicZ: 0.002,
    });
    const ov = overrides([]); // CF4 has no entries
    const cloud = recordsToCloud([orphan], ov);
    const r = Math.hypot(cloud.positions[0]!, cloud.positions[1]!, cloud.positions[2]!);
    // z = 0.002 with H0 ≈ 70 km/s/Mpc gives cz/H0 ≈ 8.5 Mpc.
    expect(r).toBeGreaterThan(7);
    expect(r).toBeLessThan(10);
    expect(cloud.spectroscopicZ[0]).toBeCloseTo(0.002, 5);
  });

  it('null overrides: legacy behaviour, every row on cz', () => {
    const m31 = rec({
      objID: BigInt(M31_PGC),
      ra: M31_RA,
      dec: M31_DEC,
      z: M31_Z,
      spectroscopicZ: M31_Z,
    });
    const cloud = recordsToCloud([m31], null);
    const r = Math.hypot(cloud.positions[0]!, cloud.positions[1]!, cloud.positions[2]!);
    // No override available → the cz path fires at |cz/H0| ≈ 3 Mpc, not the
    // CF4 distance. (Direction is now M31's true direction — see the
    // blueshift-true-direction test below — but this legacy case only pins
    // that the distance magnitude is the cz value.)
    expect(Math.abs(r - M31_DIST_MPC)).toBeGreaterThan(1);
  });
});

describe('blueshifted rows without a redshift-independent distance', () => {
  const RA = 45;
  const DEC = 30;

  it('are placed in their TRUE direction, not mirrored to the antipode', () => {
    // z < 0 with no CF4/HyperLEDA/seed match. The naive cz path would run a
    // negative Hubble radius and land the galaxy at (RA+180, -DEC). We keep
    // it in its true direction at |distance| instead.
    const blue = rec({ objID: 0n, ra: RA, dec: DEC, z: -0.0004, spectroscopicZ: -0.0004 });
    const cloud = recordsToCloud([blue], overrides([]));
    const { ra, dec } = raDecOf(cloud.positions[0]!, cloud.positions[1]!, cloud.positions[2]!);
    expect(ra).toBeCloseTo(RA, 1);
    expect(dec).toBeCloseTo(DEC, 1);
    // Distance is the |cz|/H0 magnitude (~1.7 Mpc for cz ≈ -120 km/s), positive.
    const r = Math.hypot(cloud.positions[0]!, cloud.positions[1]!, cloud.positions[2]!);
    expect(r).toBeGreaterThan(0.5);
  });

  it('re-derive physical diameter from the angular size against the ADOPTED distance', () => {
    // A blueshifted row whose cz-baked diameterKpc is null but which carries a
    // real angular size. With a seed distance of 13.5 Mpc and a 60" major
    // axis, diameter = arcsecToKpc(60, 13.5) ≈ 3.93 kpc — NOT the 30 kpc
    // fallback, and NOT sized against the cz distance.
    const massId = '12265643+1502507';
    const seeded = rec({
      objID: 0n,
      massId,
      ra: RA,
      dec: DEC,
      z: -0.0004,
      spectroscopicZ: -0.0004,
      diameterKpc: null,
      angularMajorAxisArcsec: 60,
    });
    const cloud = recordsToCloud([seeded], overrides([], [[massId, 13.5]]));
    // Position sits at the seed distance in the true direction.
    const r = Math.hypot(cloud.positions[0]!, cloud.positions[1]!, cloud.positions[2]!);
    expect(r).toBeCloseTo(13.5, 2);
    // Diameter comes from the angular size × 13.5 Mpc, not the 30 kpc default.
    expect(cloud.diameterKpc[0]).toBeCloseTo(3.93, 1);
  });
});
