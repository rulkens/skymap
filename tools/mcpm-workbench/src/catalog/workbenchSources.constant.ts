import type { GalaxyCatalogId } from '../../../../src/layers/galaxyCatalog/@types/GalaxyCatalogId';

/**
 * The main app's full toggleable galaxy-catalog ladder (GalaxiesSection.tsx),
 * same order. `toggleCatalogSource` re-derives the sources array from this
 * fixed order every time, so clicking GLADE then 2MRS still yields
 * [2MRS, GLADE], never the click order. May legitimately go empty — the
 * zero-point path is a first-class state Viewport surfaces, not something
 * this helper guards against. Also `importParams`'s known-id ladder —
 * the one spelling of "which sources exist" both the Data-section toggles
 * and the preset validator key off.
 */
export const WORKBENCH_SOURCES: readonly GalaxyCatalogId[] = [
  'famousGalaxy',
  '2mrs',
  'sdss',
  'glade',
  'milliquas',
  'desiDeep',
  'desiWedge',
  'desiSgw',
];
