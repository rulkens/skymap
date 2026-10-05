/**
 * LAYER_SLAB_ROW_HEADROOM — how many composed `SlabRow`s (every `Layer.slabs`)
 * the frame reserves timing slots for.
 *
 * The GPU query set is sized from `SLAB_ROW_CEILING` before any Layer exists,
 * so this cannot be derived from the composition; `createLayers` asserts the
 * composition fits instead. Today: the blackHoles Layer's Sgr A* row plus
 * three spare.
 */

// A row is a timing-query slot and a pass-group title, so this stays
// deliberately small.
export const LAYER_SLAB_ROW_HEADROOM = 4;
