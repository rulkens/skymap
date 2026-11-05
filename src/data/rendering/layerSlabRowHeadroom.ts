/**
 * LAYER_SLAB_ROW_HEADROOM — how many composed `SlabRow`s (every `Layer.slabs`)
 * the frame reserves timing slots for.
 *
 * The GPU query set is sized from `SLAB_ROW_CEILING` before any Layer exists,
 * so this cannot be derived from the composition; `createLayers` asserts the
 * composition fits instead. Today: Earth and every planet row the body Layer
 * declares, the blackHoles Layer's Sgr A* row, three spare.
 */

import { SCENE_PLANETS } from '../bodies/scenePlanets';

export const LAYER_SLAB_ROW_HEADROOM = 1 + SCENE_PLANETS.length + 4;
