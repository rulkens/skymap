/**
 * Per-glyph instance buffer stride, matching `VsIn` attributes 1–5 in labels/io.wesl:
 *
 *   bytes  0..7   localOffset  vec2<f32>  — pen-relative top-left in atlas px
 *   bytes  8..15  localSize    vec2<f32>  — glyph width/height in atlas px
 *   bytes 16..31  uvRect       vec4<f32>  — (u0,v0,u1,v1) atlas UV
 *   bytes 32..35  labelIndex   u32        — index into the records[] storage buffer
 *   bytes 36..39  fontIndex    u32        — texture_2d_array layer index (FONT_IDS order)
 *
 * `corner` (location 0) comes from a separate 4-vertex unit-quad buffer.
 */
export const GLYPH_INSTANCE_BYTES = 40;
