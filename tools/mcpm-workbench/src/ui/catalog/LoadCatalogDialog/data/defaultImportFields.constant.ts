import type { CatalogImportFields } from '../../../../../@types/catalog/import/CatalogImportFields';

// The common H0 = 70 with Planck 2018's Ωm = 0.315; weights taken as stored.
export const DEFAULT_IMPORT_FIELDS: CatalogImportFields = {
  formatKind: 'cartesianMpc',
  weightKind: 'linear',
  h0: '70',
  omegaM: '0.315',
  scale: '1',
};
