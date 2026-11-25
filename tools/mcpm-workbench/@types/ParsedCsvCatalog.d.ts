import type { CatalogPoints } from './CatalogPoints';
import type { WeightStats } from './WeightStats';

/** ParsedCsvCatalog — a CSV's rows as the catalog stores them, with the stored weights' range. */
export type ParsedCsvCatalog = {
  readonly kind: 'parsed';
  readonly points: CatalogPoints;
  readonly weightStats: WeightStats;
};
