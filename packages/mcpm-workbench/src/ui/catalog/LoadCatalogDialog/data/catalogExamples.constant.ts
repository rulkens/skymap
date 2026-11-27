import type { CatalogImportSettings } from '../../../../../@types/catalog/import/CatalogImportSettings';

export const CATALOG_EXAMPLES: Readonly<
  Record<CatalogImportSettings['format']['kind'], readonly string[]>
> = {
  cartesianMpc: ['-239.4, -16.5, 201.2, 0.042', '-241.0, -12.1, 198.7, 0.013'],
  raDecRedshift: ['185.73, 12.39, 0.0044, 0.042', '186.10, 12.88, 0.0037, 0.013'],
};
