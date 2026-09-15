/**
 * Multi-constant byte-layout file (the `galaxyCatalogFormat.ts` precedent) —
 * over the comment budget on purpose: the table below IS the `shgt1` format,
 * shared by the bake's encoder and the runtime's decoder.
 *
 *   off   size            field
 *     0      4   u32      HEIGHT_TILE_MAGIC ('SHGT', little-endian)
 *     4      2   u16      HEIGHT_TILE_VERSION
 *     6      2   u16      postsX = HEIGHT_POSTS_PER_TILE
 *     8      2   u16      postsY = HEIGHT_POSTS_PER_TILE
 *    10      2   u16      reserved = 0
 *    12      4   f32      subtreeMinM          min over this tile's whole descendant subtree
 *    16      4   f32      subtreeMaxM          max over the same
 *    20      4   f32      geometricResidualM   max |this level's bilinear − finest| in this tile
 *    24  66564   f32[16641]  heightM, row-major, NORTH row first, metres above the datum
 *
 * Little-endian throughout. The 24-byte header keeps the payload 4-aligned so
 * a decoder can view it in place rather than copy 65 kB per tile. Heights are
 * raw f32 metres above the datum — never a radius, and never an integer
 * encoding, because §5.4's bit-identical shared edges are what makes adjacent
 * patches crack-free, and any per-tile affine destroys them.
 */

export const HEIGHT_TILE_MAGIC = 0x54474853;
export const HEIGHT_TILE_VERSION = 1;

/** Posts per tile edge — a quarter of the albedo tile's 512 texels, which is
 *  what lets a height source reach two levels deeper than an albedo source of
 *  the same ground sample distance (spec §4.1). */
export const HEIGHT_POSTS_PER_TILE = 129;
export const HEIGHT_TILE_POST_COUNT = HEIGHT_POSTS_PER_TILE * HEIGHT_POSTS_PER_TILE;

export const HEIGHT_TILE_MAGIC_OFFSET = 0;
export const HEIGHT_TILE_VERSION_OFFSET = 4;
export const HEIGHT_TILE_POSTS_X_OFFSET = 6;
export const HEIGHT_TILE_POSTS_Y_OFFSET = 8;
export const HEIGHT_TILE_RESERVED_OFFSET = 10;
export const HEIGHT_TILE_SUBTREE_MIN_OFFSET = 12;
export const HEIGHT_TILE_SUBTREE_MAX_OFFSET = 16;
export const HEIGHT_TILE_RESIDUAL_OFFSET = 20;

export const HEIGHT_TILE_HEADER_BYTES = 24;
export const HEIGHT_TILE_BYTES = HEIGHT_TILE_HEADER_BYTES + HEIGHT_TILE_POST_COUNT * 4;
