/**
 * EngineGalaxyCatalogsHandle — galaxy catalog label controls.
 *
 * `setLabelEnabled` writes the galaxy catalog's item row in the store and
 * fires the label fade for label-bearing catalogs (the famous-galaxy
 * `galaxyNames` layer today).
 */

import type { GalaxyCatalogId } from '../data/GalaxyCatalogId';

export type EngineGalaxyCatalogsHandle = {
  /** Show/hide the text labels for a galaxy catalog (famous-galaxy names today). */
  setLabelEnabled(galaxyCatalog: GalaxyCatalogId, enabled: boolean): void;
};
