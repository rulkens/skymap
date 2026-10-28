/**
 * SLAB_ROW_CEILING — upper bound on body rows `deriveSlabs` can emit in one
 * frame: the composed `state.slabRows`, which `createLayers` asserts fit in
 * `LAYER_SLAB_ROW_HEADROOM`, plus the `HOSTLESS_MESH_BODIES` core derives a
 * row for (the mesh bodies with no host row to ride). One slot is allocated
 * per capacity row, not per row actually drawn, so the query-set size is a
 * compile-time constant — and therefore cannot read the composition, which
 * boots later.
 */

import { HOSTLESS_MESH_BODIES } from '../../../../data/bodies/hostlessMeshBodies';
import { LAYER_SLAB_ROW_HEADROOM } from '../../../../data/rendering/layerSlabRowHeadroom';

export const SLAB_ROW_CEILING = HOSTLESS_MESH_BODIES.length + LAYER_SLAB_ROW_HEADROOM;
