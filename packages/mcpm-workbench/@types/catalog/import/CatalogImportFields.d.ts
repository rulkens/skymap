import type { CatalogImportSettings } from './CatalogImportSettings';

/** CatalogImportFields — the import dialog's fields as typed, before they become CatalogImportSettings. */
export type CatalogImportFields = {
  readonly formatKind: CatalogImportSettings['format']['kind'];
  readonly weightKind: CatalogImportSettings['weight']['kind'];
  readonly h0: string;
  readonly omegaM: string;
  readonly scale: string;
};
