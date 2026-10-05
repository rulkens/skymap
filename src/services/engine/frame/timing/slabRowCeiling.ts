/**
 * SLAB_ROW_CEILING — upper bound on body rows `deriveSlabs` can emit in one
 * frame: Earth (the NEAR0-adjacent body baked into `earthPass`, not a
 * `SCENE_PLANETS` row), every `SCENE_PLANETS` and `HOSTLESS_MESH_BODIES`
 * entry (the last being the mesh bodies with no host row to ride), plus the
 * composed `state.slabRows`, which `createLayers` asserts fit in
 * `LAYER_SLAB_ROW_HEADROOM`. One slot is allocated per capacity row, not per
 * row actually drawn, so the query-set size is a compile-time constant —
 * and therefore cannot read the composition, which boots later.
 */

import { SCENE_PLANETS } from '../../../../data/bodies/scenePlanets';
import { HOSTLESS_MESH_BODIES } from '../../../../data/bodies/hostlessMeshBodies';
import { LAYER_SLAB_ROW_HEADROOM } from '../../../../data/rendering/layerSlabRowHeadroom';

export const SLAB_ROW_CEILING =
  1 + SCENE_PLANETS.length + HOSTLESS_MESH_BODIES.length + LAYER_SLAB_ROW_HEADROOM;
