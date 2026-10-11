/**
 * structureMarkersCosmoPass: halo + ring draws for the COSMO-slab structure categories
 * into the hdr layer (additive halos tone-map alongside the point sprites), after the
 * cosmic-web-density upsample; see `createStructureMarkersPass`.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { StructureRuntime } from '../@types/StructureRuntime';
import { createStructureMarkersPass } from '../render/createStructureMarkersPass';
import { structureMarkersPlanner } from '../frame';

export function structureMarkersCosmoPass(runtime: StructureRuntime): ContentPass {
  return createStructureMarkersPass({
    name: 'structure-markers-cosmo',
    scale: 'cosmic',
    renderer: runtime.cosmoRenderer,
    planner: structureMarkersPlanner(runtime),
  });
}
