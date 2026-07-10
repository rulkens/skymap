import { describe, it, expect } from 'vitest';
import { galaxyCatalogFluxLimit } from '../../../src/data/galaxyCatalog/galaxyCatalogFluxLimits';
import { Source } from '../../../src/data/sources';

describe('galaxyCatalogFluxLimits', () => {
  it('Synthetic uses the SDSS calibration', () => {
    expect(galaxyCatalogFluxLimit(Source.Synthetic)).toBe(galaxyCatalogFluxLimit(Source.SDSS));
  });
});
