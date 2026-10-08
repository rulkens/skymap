/**
 * structureMarkersCosmoPass: halo + ring draws for the COSMO-slab structure categories
 * into the hdr layer (additive halos tone-map alongside the point sprites), after the
 * cosmic-web-density upsample; see `createStructureMarkersPass`.
 */

import { createStructureMarkersPass } from './createStructureMarkersPass';

export const structureMarkersCosmoPass = createStructureMarkersPass({
  name: 'structure-markers-cosmo',
  scale: 'cosmic',
  rendererOf: (state) => state.gpu.structureMarkerCosmoRenderer,
});
