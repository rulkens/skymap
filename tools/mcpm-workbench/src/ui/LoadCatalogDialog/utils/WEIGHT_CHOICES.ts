import type { CatalogImportChoice } from '../../../../@types/CatalogImportChoice';
import type { CatalogImportSettings } from '../../../../@types/CatalogImportSettings';

export const WEIGHT_CHOICES: readonly CatalogImportChoice<
  CatalogImportSettings['weight']['kind']
>[] = [
  {
    value: 'linear',
    label: 'linear',
    hint: 'Built-in catalogs use stellar mass in 10¹²\u00a0M☉.',
  },
  {
    value: 'log10MassMsun',
    label: 'log₁₀ mass',
    hint: 'Converted to stellar mass in 10¹²\u00a0M☉. Does not open in the native Polyphorm build.',
  },
];
