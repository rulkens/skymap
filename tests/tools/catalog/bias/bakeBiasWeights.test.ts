import { describe, expect, it } from 'vitest';

import { Source } from '../../../../src/data/sources';
import { encodeAngularWeight } from '../../../../src/utils/galaxy/encodeAngularWeight';
import { bakeBiasWeights } from '../../../../tools/catalog/bias/bakeBiasWeights';
import { recordsToCloud } from '../../../../tools/catalog/buildAllBins';
import { selectTierRecords } from '../../../../tools/catalog/selectTierRecords';
import type { ParsedRecord } from '../../../../tools/parsers/common';

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

// Three sky patches ~90° apart, so each lands in its own HEALPix cell. With
// counts {30, 10, 3} the per-shell median is 10: the 30-cluster is over-dense,
// the 3-cluster under-dense. z alternates so the cloud spans a distance range.
function clusters(): { dense: ParsedRecord[]; mid: ParsedRecord[]; sparse: ParsedRecord[] } {
  const make = (n: number, ra: number, dec: number, id0: number) =>
    Array.from({ length: n }, (_, i) =>
      rec({ ra, dec, z: i % 2 === 0 ? 0.05 : 0.0501, objID: BigInt(id0 + i), magG: 14 + i * 0.1 }),
    );
  return { dense: make(30, 10, 10, 0), mid: make(10, 100, 10, 100), sparse: make(3, 190, 10, 200) };
}

describe('bakeBiasWeights', () => {
  it("'none' maps every record to 1", () => {
    const { dense, mid, sparse } = clusters();
    const records = [...dense, ...mid, ...sparse];
    const weights = bakeBiasWeights(records, recordsToCloud(records), Source.Glade, 'none');
    expect(records.map((r) => weights.get(r))).toEqual(records.map(() => 1));
  });

  it("'angular' weights a record in the denser of two HEALPix cells below 1 and the sparser above 1", () => {
    const { dense, mid, sparse } = clusters();
    const records = [...dense, ...mid, ...sparse];
    const weights = bakeBiasWeights(records, recordsToCloud(records), Source.Glade, 'angular');
    expect(weights.get(dense[0]!)!).toBeLessThan(1);
    expect(weights.get(sparse[0]!)!).toBeGreaterThan(1);
  });

  it('a weight follows its record through selectTierRecords', () => {
    const { dense, mid, sparse } = clusters();
    const records = [...dense, ...mid, ...sparse];
    const full = bakeBiasWeights(records, recordsToCloud(records), Source.Glade, 'angular');
    const tier = selectTierRecords(records, 12);
    expect(tier.length).toBe(12);

    const cloud = recordsToCloud(tier, null, full);
    const reBaked = bakeBiasWeights(tier, recordsToCloud(tier), Source.Glade, 'angular');
    // Every tier row carries its full-set weight, not a re-bake over the tier.
    tier.forEach((r, i) => {
      expect(cloud.angularWeight[i]).toBe(encodeAngularWeight(full.get(r)!));
    });
    expect(tier.some((r) => reBaked.get(r) !== full.get(r))).toBe(true);
  });
});
