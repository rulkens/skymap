/**
 * Byte-layout file — over budget on purpose: the table is the height-tile format
 * shared by the bake's encoder, the CPU decoder and the shader. A tile is a lossless 129² RGB
 * WebP (VP8X + VP8L) carrying a Terrain-RGB code per post, plus a `SHGT` RIFF
 * chunk with the header below. Little-endian throughout.
 *
 *   SHGT payload (16 bytes)
 *   off  size       field
 *     0     2  u16  HEIGHT_TILE_VERSION
 *     2     2  u16  posts per edge = HEIGHT_POSTS_PER_TILE
 *     4     4  f32  subtreeMinM          min over this tile's whole descendant subtree
 *     8     4  f32  subtreeMaxM          max over the same
 *    12     4  f32  geometricResidualM   max |this level's bilinear − finest| in this tile
 *
 * Pixels are row-major, NORTH row first: code = R·65536 + G·256 + B and
 * heightM = HEIGHT_CODE_OFFSET_M + code · HEIGHT_CODE_STEP_M in f32. One global
 * step (never a per-tile scale) keeps shared tile edges bit-identical, which is
 * what makes adjacent patches crack-free.
 */

export const HEIGHT_TILE_VERSION = 2;

/** Posts per tile edge — a quarter of the albedo tile's 512 texels, which is
 *  what lets a height source reach two levels deeper than an albedo source of
 *  the same ground sample distance (spec §4.1). */
export const HEIGHT_POSTS_PER_TILE = 129;
export const HEIGHT_TILE_POST_COUNT = HEIGHT_POSTS_PER_TILE * HEIGHT_POSTS_PER_TILE;

export const HEIGHT_TILE_CHUNK_FOURCC = 'SHGT';
export const HEIGHT_TILE_CHUNK_BYTES = 16;

export const HEIGHT_TILE_VERSION_OFFSET = 0;
export const HEIGHT_TILE_POSTS_OFFSET = 2;
export const HEIGHT_TILE_SUBTREE_MIN_OFFSET = 4;
export const HEIGHT_TILE_SUBTREE_MAX_OFFSET = 8;
export const HEIGHT_TILE_RESIDUAL_OFFSET = 12;

export const HEIGHT_CODE_OFFSET_M = -32768;
export const HEIGHT_CODE_STEP_M = 0.1;
export const HEIGHT_CODE_MAX = 0xffffff;
