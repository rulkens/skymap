import { describe, expect, it } from 'vitest';

import type { ColumnAggregate } from '../../../tools/@types/octree/ColumnAggregate';
import { AGGREGATE_RULES } from '../../../tools/octree/aggregateRules';

/** Runs one rule over own records (value, flux) in a single row, then forms that row's blob. */
function blobOf(kind: ColumnAggregate, records: readonly [number, number][]): number {
  const rule = AGGREGATE_RULES[kind];
  const sums = Array.from({ length: rule.sums }, () => new Float64Array(1));
  const out = new Float32Array(records.length + 1);
  let subFlux = 0;
  records.forEach(([value, flux], rec) => {
    rule.own({ value: () => value, flux, boxMin: [0, 0, 0], edge: 1 }, out, rec, sums, 0);
    subFlux += flux;
  });
  const blob = { subFlux, subCount: records.length, boxMin: [0, 0, 0], edge: 1 };
  rule.blob(blob, out, records.length, sums, 0);
  return out[records.length]!;
}

describe('AGGREGATE_RULES', () => {
  it('axial mean of 175° and 5° at equal flux is 0°, not 90°', () => {
    expect(
      blobOf('axialFluxMean', [
        [175, 1],
        [5, 1],
      ]),
    ).toBeCloseTo(0, 5);
  });

  it('axial mean weights by flux', () => {
    // Doubled: 3·(cos 20°, sin 20°) + (cos 80°, sin 80°) = (2.9927, 2.0109) → atan2 33.89°, halved 16.95°.
    expect(
      blobOf('axialFluxMean', [
        [10, 3],
        [40, 1],
      ]),
    ).toBeCloseTo(16.947, 2);
  });

  it('the none rule writes 0 and takes no sums', () => {
    expect(AGGREGATE_RULES.none.sums).toBe(0);
    expect(
      blobOf('none', [
        [3, 1],
        [1, 2],
      ]),
    ).toBe(0);
  });
});
