import { describe, expect, it } from 'vitest';

import { shiftedFrustum } from '../../../../../../src/services/engine/camera/lens/utils/shiftedFrustum';
import { symmetricFrustum } from '../../../../../../src/utils/camera/frustum/symmetricFrustum';

const FOV = Math.PI / 3;
const ASPECT = 1.6;
const HY = Math.tan(FOV / 2);
const HX = HY * ASPECT;

describe('shiftedFrustum', () => {
  it('keeps its extents, and a zero shift is the symmetric lens exactly', () => {
    const f = shiftedFrustum(FOV, ASPECT, [0.3, -0.2]);
    expect(f.tanRight - f.tanLeft).toBeCloseTo(2 * HX, 12);
    expect(f.tanUp - f.tanDown).toBeCloseTo(2 * HY, 12);
    expect(shiftedFrustum(FOV, ASPECT, [0, 0])).toStrictEqual(symmetricFrustum(FOV, ASPECT));
  });

  it('puts the axis at the shift', () => {
    const shift = [0.3, -0.2] as const;
    const f = shiftedFrustum(FOV, ASPECT, shift);
    // NDC of tangent t across [tanLeft, tanRight] → [−1, 1].
    const ndc = (t: number, lo: number, hi: number): number => (2 * (t - lo)) / (hi - lo) - 1;
    expect(ndc(0, f.tanLeft, f.tanRight)).toBeCloseTo(shift[0], 12);
    expect(ndc(0, f.tanDown, f.tanUp)).toBeCloseTo(shift[1], 12);
  });
});
