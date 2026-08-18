/**
 * Pins cOrderToXFastest's permutation against xFastestToCOrder's own
 * (already-verified, see task-T19-report.md) transpose, round-tripped on an
 * asymmetric cube (nx != nz) — a symmetric cube couldn't tell this apart
 * from a same-formula self-inverse, which is exactly how X1 (final-review.md
 * §A) went unnoticed.
 */
import { describe, expect, it } from 'vitest';
import { cOrderToXFastest } from '../../../../tools/mcpm-workbench/validate/cOrderToXFastest';
import { xFastestToCOrder } from '../../../../tools/mcpm-workbench/src/export/xFastestToCOrder';

describe('cOrderToXFastest', () => {
  it('inverts xFastestToCOrder on an asymmetric cube', () => {
    const dims: [number, number, number] = [2, 3, 4]; // nx != ny != nz
    const xFastest = new Float32Array(2 * 3 * 4);
    for (let i = 0; i < xFastest.length; i++) xFastest[i] = i;

    const cOrder = xFastestToCOrder(xFastest, dims);
    const roundTripped = cOrderToXFastest(cOrder, dims);

    expect(Array.from(roundTripped)).toEqual(Array.from(xFastest));
  });

  it('is not the identity and not xFastestToCOrder itself on an asymmetric cube', () => {
    // Guards against a regression that makes cOrderToXFastest a no-op or a
    // copy-paste of xFastestToCOrder — both would pass a symmetric-cube test.
    const dims: [number, number, number] = [2, 3, 4];
    const values = new Float32Array(24);
    for (let i = 0; i < values.length; i++) values[i] = i;

    const result = cOrderToXFastest(values, dims);

    expect(Array.from(result)).not.toEqual(Array.from(values));
    expect(Array.from(result)).not.toEqual(Array.from(xFastestToCOrder(values, dims)));
  });
});
