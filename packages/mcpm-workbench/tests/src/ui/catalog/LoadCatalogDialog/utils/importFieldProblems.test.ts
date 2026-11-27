import { describe, expect, it } from 'vitest';
import type { CatalogImportFields } from '../../../../../../@types/catalog/import/CatalogImportFields';
import { importFieldProblems } from '../../../../../../src/ui/catalog/LoadCatalogDialog/utils/importFieldProblems';

const radecLinear: CatalogImportFields = {
  formatKind: 'raDecRedshift',
  weightKind: 'linear',
  h0: '70',
  omegaM: '0.315',
  scale: '1',
};

describe('importFieldProblems', () => {
  it('refuses a scale of 0, a negative scale and text', () => {
    for (const scale of ['0', '-1', 'abc', ''])
      expect(importFieldProblems({ ...radecLinear, scale })).toHaveProperty('scale');
  });

  it('refuses a blank Ωm, which Number() would read as 0', () => {
    expect(importFieldProblems({ ...radecLinear, omegaM: ' ' })).toHaveProperty('omegaM');
    expect(importFieldProblems({ ...radecLinear, omegaM: '0' })).toEqual({});
  });

  it('ignores the fields the choices hide', () => {
    expect(
      importFieldProblems({
        formatKind: 'cartesianMpc',
        weightKind: 'log10MassMsun',
        h0: '',
        omegaM: '7',
        scale: '0',
      }),
    ).toEqual({});
  });
});
