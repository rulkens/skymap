import type { CatalogImportChoice } from '../../../../@types/CatalogImportChoice';
import type { CatalogImportSettings } from '../../../../@types/CatalogImportSettings';

export const FORMAT_CHOICES: readonly CatalogImportChoice<
  CatalogImportSettings['format']['kind']
>[] = [
  {
    value: 'cartesianMpc',
    label: 'x, y, z, weight',
    hint: 'Positions in Mpc. One galaxy per row.',
  },
  {
    value: 'raDecRedshift',
    label: 'RA, Dec, redshift, weight',
    hint: 'RA and Dec in degrees. Does not open in the native Polyphorm build.',
  },
];
