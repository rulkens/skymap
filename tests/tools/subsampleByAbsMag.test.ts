/**
 * Tests for subsampleByAbsMag — the volume-limited brightest-N cut applied at
 * build time.
 *
 * Selection rule: M_abs = m_app − 5·log10(d_Mpc) − 25 where d_Mpc is derived
 * from the parser's redshift via Hubble's law (HUBBLE_DISTANCE_MPC × z).
 * Smaller / more-negative M_abs = brighter; we keep the brightest `target`
 * records.
 *
 * Edge cases tested:
 *   - target ≥ N         → returns all records, original order preserved
 *   - target < N         → keeps brightest target, in original order
 *   - target = 0         → returns []
 *   - target = N exactly → returns all (no-op)
 *   - non-finite distance/mag → record is dropped before ranking
 *   - tie-break          → equal M_abs records sort stably by original index
 */

import { describe, expect, it } from 'vitest';
import { Source } from '../../src/data/sources';
import { subsampleByAbsMag } from '../../tools/catalog/subsampleByAbsMag';
import type { ParsedRecord } from '../../tools/parsers/common';

function rec(overrides: Partial<ParsedRecord>): ParsedRecord {
  return {
    source: Source.SDSS,
    objID: 0n,
    ra: 0,
    dec: 0,
    z: 0.05,
    magU: NaN,
    magG: 18,
    magR: NaN,
    magI: NaN,
    magZ: NaN,
    axisRatio: null,
    positionAngleDeg: null,
    diameterKpc: null,
    classByte: 0,
    parentSurveyByte: 0,
    ...overrides,
  };
}

describe('subsampleByAbsMag', () => {
  it('returns all records when target >= length', () => {
    const a = rec({ magG: 18, z: 0.05 });
    const b = rec({ magG: 17, z: 0.05 });
    expect(subsampleByAbsMag([a, b], 5)).toEqual([a, b]);
    expect(subsampleByAbsMag([a, b], 2)).toEqual([a, b]);
  });

  it('returns [] when target is 0', () => {
    expect(subsampleByAbsMag([rec({}), rec({})], 0)).toEqual([]);
  });

  it('keeps the brightest target by absolute magnitude', () => {
    // At z=0.05, distance ≈ 214.4 Mpc, mu ≈ 36.66.
    // brightest: magG=14 → M ≈ -22.66
    // mid:       magG=18 → M ≈ -18.66
    // dim:       magG=22 → M ≈ -14.66
    const bright = rec({ magG: 14, z: 0.05 });
    const mid = rec({ magG: 18, z: 0.05 });
    const dim = rec({ magG: 22, z: 0.05 });
    const out = subsampleByAbsMag([dim, mid, bright], 2);
    // Brightest two kept; original order preserved among survivors.
    expect(out).toEqual([mid, bright]);
  });

  it('drops records with non-finite distance (z<=0) before ranking', () => {
    const ok = rec({ magG: 18, z: 0.05 });
    const badZ = rec({ magG: 14, z: 0 }); // distance = 0 → undefined M_abs
    const out = subsampleByAbsMag([ok, badZ], 5);
    // badZ excluded, even with target larger than the surviving population.
    expect(out).toEqual([ok]);
  });

  it('drops records with NaN apparent magnitude before ranking', () => {
    const ok = rec({ magG: 18, z: 0.05 });
    const nanMag = rec({ magG: NaN, z: 0.05 });
    expect(subsampleByAbsMag([ok, nanMag], 5)).toEqual([ok]);
  });

  it('breaks ties stably by original input order', () => {
    // Identical mag + z → identical M_abs.  Both must survive a target=2 cut
    // (no surprise drops), in their original order.
    const a = rec({ magG: 18, z: 0.05, objID: 1n });
    const b = rec({ magG: 18, z: 0.05, objID: 2n });
    const c = rec({ magG: 18, z: 0.05, objID: 3n });
    const out = subsampleByAbsMag([a, b, c], 2);
    expect(out.map((r) => r.objID)).toEqual([1n, 2n]);
  });
});
