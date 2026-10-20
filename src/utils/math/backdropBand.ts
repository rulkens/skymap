import type { FadeBand } from '../../@types/math/FadeBand';

// Full at 2x a region's extent, gone by 10x: the one shape the star backdrop and the
// body-glint backdrop share, so the two cannot drift apart.
const BACKDROP_FULL_AT_EXTENT_MULTIPLE = 2;
const BACKDROP_GONE_AT_EXTENT_MULTIPLE = 10;

export const backdropBand = (regionExtentMpc: number): FadeBand => ({
  fullAt: regionExtentMpc * BACKDROP_FULL_AT_EXTENT_MULTIPLE,
  goneAt: regionExtentMpc * BACKDROP_GONE_AT_EXTENT_MULTIPLE,
});
