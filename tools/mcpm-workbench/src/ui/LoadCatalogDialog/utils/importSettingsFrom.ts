import type { CatalogImportFields } from '../../../../@types/CatalogImportFields';
import type { CatalogImportSettings } from '../../../../@types/CatalogImportSettings';

/** The settings the typed fields describe; call it only once importFieldProblems finds none. */
export function importSettingsFrom(fields: CatalogImportFields): CatalogImportSettings {
  return {
    format:
      fields.formatKind === 'cartesianMpc'
        ? { kind: 'cartesianMpc' }
        : { kind: 'raDecRedshift', h0KmSMpc: Number(fields.h0), omegaM: Number(fields.omegaM) },
    weight:
      fields.weightKind === 'linear'
        ? { kind: 'linear', scale: Number(fields.scale) }
        : { kind: 'log10MassMsun' },
  };
}
