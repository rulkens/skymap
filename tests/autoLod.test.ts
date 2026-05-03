import { describe, it, expect } from 'vitest';
import { autoLodMask } from '../src/engine';
import { Source, maskHas } from '../src/data/sources';

describe('autoLodMask', () => {
  it('local view (< 200 Mpc) shows 2MRS and 2MPZ but hides SDSS / 6dFGS', () => {
    const m = autoLodMask(150);
    expect(maskHas(m, Source.TwoMRS)).toBe(true);
    expect(maskHas(m, Source.TwoMPZ)).toBe(true);
    expect(maskHas(m, Source.SDSS)).toBe(false);
    expect(maskHas(m, Source.SixDFGS)).toBe(false);
  });
  it('mid range (200–800 Mpc) shows everything', () => {
    const m = autoLodMask(500);
    for (const s of [Source.SDSS, Source.TwoMRS, Source.TwoMPZ, Source.SixDFGS]) {
      expect(maskHas(m, s)).toBe(true);
    }
  });
  it('deep view (> 800 Mpc) shows SDSS only', () => {
    const m = autoLodMask(2000);
    expect(maskHas(m, Source.SDSS)).toBe(true);
    expect(maskHas(m, Source.TwoMRS)).toBe(false);
    expect(maskHas(m, Source.TwoMPZ)).toBe(false);
    expect(maskHas(m, Source.SixDFGS)).toBe(false);
  });
  it('always includes Source.Synthetic so the synthetic fallback stays visible', () => {
    expect(maskHas(autoLodMask(50), Source.Synthetic)).toBe(true);
    expect(maskHas(autoLodMask(500), Source.Synthetic)).toBe(true);
    expect(maskHas(autoLodMask(5000), Source.Synthetic)).toBe(true);
  });
});
