import type { CatalogImportSettings } from './CatalogImportSettings';
import type { CatalogPoints } from './CatalogPoints';

/** UserCatalog — a catalog loaded from the visitor's own file, already parsed. */
export type UserCatalog = {
  readonly points: CatalogPoints;
  readonly fileName: string;
  readonly settings: CatalogImportSettings;
};
