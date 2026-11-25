import type { CatalogImportSettings } from './CatalogImportSettings';
import type { CatalogPoints } from './CatalogPoints';
import type { WeightStats } from './WeightStats';

/** UserCatalog — a catalog loaded from the visitor's own file, already parsed. */
export type UserCatalog = {
  readonly points: CatalogPoints;
  readonly fileName: string;
  readonly settings: CatalogImportSettings;
  readonly weightStats: WeightStats;
};
