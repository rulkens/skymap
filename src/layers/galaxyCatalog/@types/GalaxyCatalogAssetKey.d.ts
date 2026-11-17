import type { GalaxyCatalogId } from './GalaxyCatalogId';

/** The asset rows this Layer authors: one per catalog `.bin` (by its id) and its sidecars. */
export type GalaxyCatalogAssetKey =
  | GalaxyCatalogId
  | 'famousGalaxiesMeta'
  | 'pgcAlias'
  // A GPU allocation, not a fetch; its request is keyed on `layerSide`, not the tier.
  | 'hiResFamous';
