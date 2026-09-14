/**
 * OVERLAY_PICK_SLAB — the pseudo-slab the overlay pick pass is keyed by, folded
 * ahead of every real slab (`pickProgram`'s `pickablesBySlab`). Negative so it
 * can never collide with a real `Slab.index` (0, 1, 2…), and so
 * `isBodySlabIndex` keeps it out of the shared body target.
 */

export const OVERLAY_PICK_SLAB = -1;
