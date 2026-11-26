/**
 * Contract file, over budget on purpose: the horizon tile format, shared by the bake and
 * `lib/horizonAngleMap.wesl` (parity-tested). Bytes 0…kneeByte step 0.147°, under the Mars
 * sun radius, so low-sun shadows stay smooth; above the knee only steep walls land.
 */
export const HORIZON_ANGLE_MAP = { minDeg: -3, kneeDeg: 27, kneeByte: 204, maxDeg: 90 } as const;

/** Height's own 129-post lattice at the tile's level, each post marched from heights two levels
 *  finer; post (0,0) is the tile's north-west corner. */
export const HORIZON_POSTS_PER_TILE = 129;

/** Sector k is centred on azimuth k·360°/16, clockwise from local north. */
export const HORIZON_SECTORS = 16;
