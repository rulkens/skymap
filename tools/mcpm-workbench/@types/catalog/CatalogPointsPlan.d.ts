import type { GalaxyCatalogId } from '../../../../src/layers/galaxyCatalog/@types/GalaxyCatalogId';
import type { Tier } from '../../../../src/@types/data/Tier';
import type { UserCatalog } from './UserCatalog';

/** CatalogPointsPlan — where the sim's points come from: the probe's synthetic set, or a load. */
export type CatalogPointsPlan =
  | { readonly kind: 'synthetic' }
  | {
      readonly kind: 'load';
      readonly sources: readonly GalaxyCatalogId[];
      readonly tier: Tier;
      readonly userCatalog: UserCatalog | null;
    };
