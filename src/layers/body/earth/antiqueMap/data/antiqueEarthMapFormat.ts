/**
 * The antique Earth map's binary (`public/antique/earth-1690.bin`, baked by
 * `tools/antique/earth/`): a 64-byte header, then realm fill vertices, their
 * indices, line vertices and signs, each GPU-ready as stored.
 *
 * Lines are polyline strips laid end to end in one vertex array; a segment is
 * vertex i with vertex i + 1 (the buffer is bound twice, one vertex apart), and
 * a strip's last vertex carries LINE_STRIP_END so the segment it would start is
 * culled. Strips are sorted by reveal level, so a level's draw is a prefix.
 * Signs keep the bake's painter order (north to south, towns over hills); the
 * vertex stage culls those the zoom has not revealed.
 *
 * | offset | field                                                       |
 * | 0      | magic `SKAE`, version                                       |
 * | 8      | fill vertex count, fill index count, line vertex count, sign count |
 * | 24     | reserved × 2                                                |
 * | 32     | line level ends (vertex counts), u32 × 8                    |
 */

export const ANTIQUE_EARTH_MAP_FILE = 'earth-1690.bin';
export const ANTIQUE_EARTH_MAP_MAGIC = 0x45414b53; // 'SKAE' little-endian
export const ANTIQUE_EARTH_MAP_VERSION = 2;
export const ANTIQUE_MAP_LEVELS = 8;
export const ANTIQUE_EARTH_MAP_HEADER_BYTES = 64;
/** Fill vertex: unit xyz, realm colour code (0 none, 1..7 pigment + 1). */
export const ANTIQUE_FILL_VERTEX_BYTES = 16;
/** Line vertex: lon, lat (radians), arc km from the strip's start, packed style u32. */
export const ANTIQUE_LINE_VERTEX_BYTES = 16;
/** Sign: lon, lat (radians), packed style u32. */
export const ANTIQUE_SIGN_BYTES = 12;
/** Line style bits: width in 1/32 units (0–7), kind (8–11), level (12–15), strip end (16). */
export const LINE_WIDTH_SCALE = 32;
export const LINE_STRIP_END = 1 << 16;
/** Sign style bits: size in 1/4 units (0–7), kind (8–15), level (16–19), and the level
 * it fades out at (20–23, 0 = never). */
export const SIGN_SIZE_SCALE = 4;
/** `AntiqueMapUniforms` (earth/antiqueMap/io.wesl), in f32s. */
export const ANTIQUE_MAP_UNIFORM_FLOATS = 24;
