/**
 * Tests for selectTierRecords — the build-time tier selection that unions the
 * volume-limited brightest-N-by-M_abs backbone with an optional apparent-
 * magnitude flux supplement.
 *
 * The backbone alone (subsampleByAbsMag) annihilates the local volume: nearby
 * galaxies are intrinsically faint, so they lose the global M_abs ranking and
 * get cut. The flux supplement keeps every galaxy brighter than an apparent
 * `magG` limit *as well*, which a) restores the local volume and b) tapers
 * smoothly with distance (a flux limit has no spatial boundary), so it adds no
 * shell. Selection on apparent `magG` is redshift-independent, so it also
 * rescues z ≤ 0 galaxies the backbone drops outright.
 *
 * Edge cases:
 *   - no limit              → identical to subsampleByAbsMag (pure backbone)
 *   - apparently-bright, intrinsically-faint nearby galaxy → added by supplement
 *   - record in both sets   → appears exactly once (no double-count)
 *   - NaN magG              → never added by the supplement
 *   - z ≤ 0 with magG<limit → added (supplement is z-independent)
 *   - magG === limit        → excluded (strict `<`, "brighter than")
 *   - input order preserved among all survivors
 */

import { describe, expect, it } from 'vitest';
import { Source } from '../../src/data/sources';
import { selectTierRecords } from '../../tools/catalog/selectTierRecords';
import { subsampleByAbsMag } from '../../tools/catalog/subsampleByAbsMag';
import type { ParsedRecord } from '../../tools/parsers/common';

function rec(overrides: Partial<ParsedRecord>): ParsedRecord {
  return {
    source: Source.Glade,
    objID: 0n,
    ra: 0,
    dec: 0,
    z: 0.05,
    spectroscopicZ: 0.05,
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

describe('selectTierRecords', () => {
  it('with no supplement limit, matches subsampleByAbsMag exactly', () => {
    const bright = rec({ magG: 14, z: 0.05, objID: 1n });
    const mid = rec({ magG: 18, z: 0.05, objID: 2n });
    const dim = rec({ magG: 22, z: 0.05, objID: 3n });
    const records = [dim, mid, bright];
    expect(selectTierRecords(records, 2)).toEqual(subsampleByAbsMag(records, 2));
  });

  it('adds an apparently-bright but intrinsically-faint nearby galaxy the backbone drops', () => {
    // distantGiant: faint apparent mag but very luminous → wins the M_abs cut.
    const distantGiant = rec({ magG: 18, z: 0.05, objID: 1n });
    // nearbyDwarf: bright apparent mag, but so close that its M_abs is faint →
    // excluded from a target=1 backbone, yet magG=14 < 15 → supplement keeps it.
    const nearbyDwarf = rec({ magG: 14, z: 0.0005, objID: 2n });
    const out = selectTierRecords([nearbyDwarf, distantGiant], 1, 15);
    // Backbone keeps distantGiant; supplement re-adds nearbyDwarf. Input order.
    expect(out.map((r) => r.objID)).toEqual([2n, 1n]);
  });

  it('does not double-count a record that is in both the backbone and the supplement', () => {
    // giant is the backbone winner AND magG=14 < 15, so both selection paths
    // pick it; it must appear once.
    const giant = rec({ magG: 14, z: 0.05, objID: 1n });
    const other = rec({ magG: 18, z: 0.05, objID: 2n });
    const out = selectTierRecords([giant, other], 1, 15);
    expect(out.map((r) => r.objID)).toEqual([1n]);
  });

  it('never adds a record with NaN apparent magnitude via the supplement', () => {
    const ok = rec({ magG: 18, z: 0.05, objID: 1n });
    const nanNearby = rec({ magG: NaN, z: 0.0005, objID: 2n });
    const out = selectTierRecords([ok, nanNearby], 1, 15);
    expect(out.map((r) => r.objID)).toEqual([1n]);
  });

  it('adds a z<=0 galaxy via the supplement even though the backbone drops it', () => {
    const distant = rec({ magG: 18, z: 0.05, objID: 1n });
    // Negative cz (a Local Group member): subsampleByAbsMag drops it, but its
    // apparent magG=14 < 15 means the z-independent supplement rescues it.
    const negZnearby = rec({ magG: 14, z: -0.001, spectroscopicZ: -0.001, objID: 2n });
    const out = selectTierRecords([distant, negZnearby], 5, 15);
    expect(out.map((r) => r.objID)).toEqual([1n, 2n]);
  });

  it('excludes a record whose magG equals the limit (strict less-than)', () => {
    const distant = rec({ magG: 18, z: 0.05, objID: 1n });
    const edge = rec({ magG: 15, z: 0.0005, objID: 2n });
    const out = selectTierRecords([distant, edge], 1, 15);
    expect(out.map((r) => r.objID)).toEqual([1n]);
  });

  it('preserves input order among all survivors', () => {
    const a = rec({ magG: 14, z: 0.0005, objID: 1n }); // supplement
    const b = rec({ magG: 18, z: 0.05, objID: 2n }); // backbone
    const c = rec({ magG: 13, z: 0.0005, objID: 3n }); // supplement
    const out = selectTierRecords([a, b, c], 1, 15);
    expect(out.map((r) => r.objID)).toEqual([1n, 2n, 3n]);
  });
});
