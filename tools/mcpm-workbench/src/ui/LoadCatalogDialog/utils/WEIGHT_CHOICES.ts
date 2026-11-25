import type { CatalogImportSettings } from '../../../../@types/CatalogImportSettings';

export const WEIGHT_CHOICES: readonly {
  readonly value: CatalogImportSettings['weight']['kind'];
  readonly label: string;
  readonly hint: string;
}[] = [
  {
    value: 'linear',
    label: 'linear',
    hint: 'A positive number. Built-in catalogs use stellar mass in 10¹²\u00a0M☉.',
  },
  {
    value: 'log10MassMsun',
    label: 'log₁₀ of mass in M☉',
    hint: 'Converted to stellar mass in 10¹²\u00a0M☉. Does not open in the native Polyphorm build.',
  },
];
