import { describe, it, expect } from 'vitest';
import { autoLodMask } from '../src/engine';
import { Source, maskHas } from '../src/data/sources';

describe('autoLodMask', () => {
  it('local view (< 200 Mpc) shows 2MRS and GLADE but hides SDSS', () => {
    // The local band is dominated by the nearby all-sky catalogs; SDSS is
    // a deep survey and contributes almost nothing this close in, so we
    // mask it out to avoid drawing a sparse smear over the local universe.
    const m = autoLodMask(150);
    expect(maskHas(m, Source.TwoMRS)).toBe(true);
    expect(maskHas(m, Source.Glade)).toBe(true);
    expect(maskHas(m, Source.SDSS)).toBe(false);
  });
  it('mid range (200–800 Mpc) shows everything', () => {
    const m = autoLodMask(500);
    for (const s of [Source.SDSS, Source.TwoMRS, Source.Glade]) {
      expect(maskHas(m, s)).toBe(true);
    }
  });
  it('deep view (> 800 Mpc) shows SDSS only', () => {
    // Past 800 Mpc only SDSS reaches with appreciable density — 2MRS and
    // GLADE both fade to near-nothing — so the deep band drops them.
    const m = autoLodMask(2000);
    expect(maskHas(m, Source.SDSS)).toBe(true);
    expect(maskHas(m, Source.TwoMRS)).toBe(false);
    expect(maskHas(m, Source.Glade)).toBe(false);
  });
  it('always includes Source.Synthetic so the synthetic fallback stays visible', () => {
    expect(maskHas(autoLodMask(50), Source.Synthetic)).toBe(true);
    expect(maskHas(autoLodMask(500), Source.Synthetic)).toBe(true);
    expect(maskHas(autoLodMask(5000), Source.Synthetic)).toBe(true);
  });
});
