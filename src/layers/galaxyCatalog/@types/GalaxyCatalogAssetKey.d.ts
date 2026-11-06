import type { GalaxyCatalogSourceType } from './GalaxyCatalogSourceType';

/** The asset rows this Layer authors: one per catalog `.bin` (by its source code) and its sidecars. */
export type GalaxyCatalogAssetKey =
  | GalaxyCatalogSourceType
  | 'famousGalaxiesMeta'
  | 'pgcAlias'
  // A GPU allocation, not a fetch; its request is keyed on `layerSide`, not the tier.
  | 'hiResFamous';
