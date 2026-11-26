import type { CatalogImportChoice } from '../../../../../@types/catalog/import/CatalogImportChoice';
import type { CatalogImportSettings } from '../../../../../@types/catalog/import/CatalogImportSettings';

export const WEIGHT_CHOICES: readonly CatalogImportChoice<
  CatalogImportSettings['weight']['kind']
>[] = [
  {
    value: 'linear',
    label: 'linear',
    hint: 'Stellar mass in 10¹²\u00a0M☉.',
  },
  {
    value: 'log10MassMsun',
    label: 'log₁₀ mass',
    hint: 'Converted to stellar mass in 10¹²\u00a0M☉.',
  },
];
