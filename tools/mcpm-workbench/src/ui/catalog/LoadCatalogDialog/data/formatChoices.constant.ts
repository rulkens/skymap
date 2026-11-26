import type { CatalogImportChoice } from '../../../../../@types/catalog/import/CatalogImportChoice';
import type { CatalogImportSettings } from '../../../../../@types/catalog/import/CatalogImportSettings';

export const FORMAT_CHOICES: readonly CatalogImportChoice<
  CatalogImportSettings['format']['kind']
>[] = [
  {
    value: 'cartesianMpc',
    label: 'x, y, z, weight',
    hint: 'Positions in Mpc.',
  },
  {
    value: 'raDecRedshift',
    label: 'RA, Dec, redshift, weight',
    hint: 'RA and Dec in degrees.',
  },
];
