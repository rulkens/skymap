import type { CatalogImportFields } from './CatalogImportFields';

/** WeightUnitWarning — the sentence to show, and the import field whose change it suggests. */
export type WeightUnitWarning = {
  readonly field: keyof Pick<CatalogImportFields, 'weightKind' | 'scale'>;
  readonly message: string;
};
