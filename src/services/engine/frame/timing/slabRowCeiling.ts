/**
 * SLAB_ROW_CEILING: upper bound on body rows `deriveSlabs` can emit in one frame,
 * the composed `state.slabRows` (asserted by `createLayers` to fit in
 * `LAYER_SLAB_ROW_HEADROOM`) plus the `HOSTLESS_MESH_BODIES` core derives a row
 * for. A compile-time constant because the timing query set is sized before the
 * composition boots.
 */

import { HOSTLESS_MESH_BODIES } from '../../../../data/bodies/hostlessMeshBodies';
import { LAYER_SLAB_ROW_HEADROOM } from '../../../../data/rendering/layerSlabRowHeadroom';

export const SLAB_ROW_CEILING = HOSTLESS_MESH_BODIES.length + LAYER_SLAB_ROW_HEADROOM;
