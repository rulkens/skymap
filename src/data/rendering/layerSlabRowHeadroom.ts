/**
 * LAYER_SLAB_ROW_HEADROOM — how many composed `SlabRow`s (`CORE_SLAB_ROWS`
 * plus every `Layer.slabs`) the frame reserves timing slots for.
 *
 * The GPU query set is sized from `SLAB_ROW_CEILING` before any Layer exists,
 * so this cannot be derived from the composition; `createLayers` asserts the
 * composition fits instead. Today: Sgr A*'s row plus three spare.
 */

export const LAYER_SLAB_ROW_HEADROOM = 4;
