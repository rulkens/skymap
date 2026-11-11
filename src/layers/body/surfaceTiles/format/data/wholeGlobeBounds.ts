/** The whole equirectangular globe: the bounds of any global raster or height source. */

import type { LonLatBounds } from '../@types/LonLatBounds';

export const WHOLE_GLOBE_BOUNDS: LonLatBounds = { west: -180, east: 180, south: -90, north: 90 };
