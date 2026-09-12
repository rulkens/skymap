/**
 * BODY_SLAB_CAPACITY — upper bound on body rows `deriveSlabs` can emit in one
 * frame: Earth (the NEAR0-adjacent body baked into `earthPass`, not a
 * `SCENE_PLANETS` row) plus every `SCENE_PLANETS`, `SCENE_ANCHOR_POINT_BODIES`
 * and `HOSTLESS_MESH_BODIES` entry (the last being the mesh bodies with no
 * host row to ride). One slot is allocated per capacity row, not per row
 * actually drawn, so the query-set size is a compile-time constant
 * — see `createGpuTimingService`.
 */

import { SCENE_PLANETS } from '../../../../data/bodies/scenePlanets';
import { SCENE_ANCHOR_POINT_BODIES } from '../../../../data/bodies/sceneAnchorPointBodies';
import { HOSTLESS_MESH_BODIES } from '../../../../data/bodies/hostlessMeshBodies';

export const BODY_SLAB_CAPACITY =
  1 + SCENE_PLANETS.length + SCENE_ANCHOR_POINT_BODIES.length + HOSTLESS_MESH_BODIES.length;
