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
import {
  recordsToCloud,
  type LocalVolumeOverrides,
} from '../../tools/catalog/buildAllBins';
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

function overrides(cf4Records: ReadonlyArray<Cf4Record>): LocalVolumeOverrides {
  const byPgc = new Map<number, Cf4Record>();
  for (const r of cf4Records) {
    if (r.pgc !== null) byPgc.set(r.pgc, r);
  }
  return { cf4: { byPgc }, hyperLeda: new Map() };
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
    // No override available → the linear-sign fallback in redshiftToDistanceMpc
    // mirrors M31 to the anti-Andromeda side at ~|cz/H0| ≈ 3 Mpc. Just assert
    // the position is NOT at the CF4 distance.
    expect(Math.abs(r - M31_DIST_MPC)).toBeGreaterThan(1);
  });
});
