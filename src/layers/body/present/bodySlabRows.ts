/**
 * BODY_SLAB_ROWS — the body Layer's `body-m` slab rows: Earth, then every
 * `SCENE_PLANETS` body, one row each. Static: the bodies are constants, so
 * each row exists from boot; its `activeBand` and pose decide whether it draws.
 */

import type { SlabRow } from '../../../@types/engine/frame/SlabRow';
import { SCENE_EARTH } from '../../../data/bodies/sceneEarth';
import { SCENE_PLANETS } from '../../../data/bodies/scenePlanets';
import { bodyLayerSlabRow } from './bodyLayerSlabRow';

export const BODY_SLAB_ROWS: readonly SlabRow[] = [SCENE_EARTH, ...SCENE_PLANETS].map(
  bodyLayerSlabRow,
);
