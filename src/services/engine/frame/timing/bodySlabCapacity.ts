/**
 * BODY_SLAB_CAPACITY — upper bound on body rows `deriveSlabs` can emit in one
 * frame: Earth (the NEAR0-adjacent body baked into `earthPass`, not a
 * `SCENE_PLANETS` row) plus every `SCENE_PLANETS` and
 * `SCENE_ANCHOR_POINT_BODIES` entry. One slot is allocated per capacity row,
 * not per row actually drawn, so the query-set size is a compile-time constant
 * — see `createGpuTimingService`.
 */

import { SCENE_PLANETS } from '../../../../data/bodies/scenePlanets';
import { SCENE_ANCHOR_POINT_BODIES } from '../../../../data/bodies/sceneAnchorPointBodies';

export const BODY_SLAB_CAPACITY = 1 + SCENE_PLANETS.length + SCENE_ANCHOR_POINT_BODIES.length;
