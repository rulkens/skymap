import { describe, it, expect } from 'vitest';
import { vMaxWeight } from '../../../src/utils/math/vMaxWeight';

describe('vMaxWeight', () => {
  it('returns a finite weight in (0, 1]', () => {
    const w = vMaxWeight({ absMag: -19, mLim: 17.77, dRefMpc: 750 });
    expect(w).toBeGreaterThan(0);
    expect(w).toBeLessThanOrEqual(1);
  });

  it('intrinsically bright galaxies have a small weight (visible far)', () => {
    // M=−24 reaches d_max far beyond dRef → weight near zero.
    const wBright = vMaxWeight({ absMag: -24, mLim: 17.77, dRefMpc: 750 });
    const wMid = vMaxWeight({ absMag: -19, mLim: 17.77, dRefMpc: 750 });
    expect(wBright).toBeLessThan(wMid);
  });

  it('faint galaxies clip at weight=1 (only visible nearby)', () => {
    // M=−14 hits flux limit very close, smaller V_max than dRef volume.
    const wFaint = vMaxWeight({ absMag: -14, mLim: 17.77, dRefMpc: 750 });
    expect(wFaint).toBe(1);
  });

  it('NaN absMag returns 0 (galaxies missing photometry)', () => {
    expect(vMaxWeight({ absMag: NaN, mLim: 17.77, dRefMpc: 750 })).toBe(0);
  });
});
