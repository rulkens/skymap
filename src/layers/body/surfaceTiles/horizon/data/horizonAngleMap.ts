/**
 * The horizon product's contract, shared by the bake (`tools/textures/surfaceHorizon/`) and
 * `lib/horizonAngleMap.wesl`, which hand-mirrors `HORIZON_ANGLE_MAP` (a parity test pins it).
 * One byte per angle on a piecewise-linear map: bytes 0…kneeByte span minDeg…kneeDeg at
 * 0.147° a step, under the Mars sun radius, so low-sun shadows stay smooth; the rest of the
 * byte range spans kneeDeg…maxDeg, where only steep walls land.
 */
export const HORIZON_ANGLE_MAP = { minDeg: -3, kneeDeg: 27, kneeByte: 204, maxDeg: 90 } as const;

/** Height's 129-post lattice decimated by 4; post (0,0) is the tile's north-west corner. */
export const HORIZON_POSTS_PER_TILE = 33;

/** Sector k is centred on azimuth k·360°/16, clockwise from local north. */
export const HORIZON_SECTORS = 16;
