import { describe, it, expect } from 'vitest';
import {
  galaxyCatalogFluxLimit,
  galaxyCatalogSchechter,
} from '../../../src/data/galaxyCatalog/galaxyCatalogFluxLimits';
import { Source } from '../../../src/data/sources';

describe('galaxyCatalogFluxLimits', () => {
  it('SDSS m_lim is 17.77 (r-band spec completeness)', () => {
    expect(galaxyCatalogFluxLimit(Source.SDSS)).toBeCloseTo(17.77, 2);
  });
  it('2MRS m_lim is 11.75 (K_s magnitude limit)', () => {
    expect(galaxyCatalogFluxLimit(Source.TwoMRS)).toBeCloseTo(11.75, 2);
  });
  it('GLADE m_lim is 18.0 (B-band)', () => {
    expect(galaxyCatalogFluxLimit(Source.Glade)).toBeCloseTo(18.0, 2);
  });
  it('Synthetic uses the SDSS calibration', () => {
    expect(galaxyCatalogFluxLimit(Source.Synthetic)).toBe(galaxyCatalogFluxLimit(Source.SDSS));
  });
});

describe('galaxyCatalogSchechter', () => {
  it('SDSS Schechter triple matches Blanton 2003 r-band LF', () => {
    const s = galaxyCatalogSchechter(Source.SDSS);
    expect(s.mStar).toBeCloseTo(-21.18, 2);
    expect(s.alpha).toBeCloseTo(-1.16, 2);
    expect(s.phiStar).toBeCloseTo(0.0093, 4);
  });
});
