/**
 * Side of one slot in the galaxy thumbnail atlas, in texture px. Shared with
 * `fetchGalaxyBitmap`, which resizes every network image to exactly this during
 * decode — the two must stay in lockstep, and the fetcher is a `utils/` module
 * that may not reach into a Layer for it.
 */
export const GALAXY_ATLAS_SLOT_SIDE = 128;
