/**
 * Per-label storage buffer stride, matching `struct LabelData` in io.wesl:
 *
 *   bytes  0..15  worldPos      vec4<f32>  — xyz = world Mpc, w = worldEmMpc
 *   bytes 16..31  color         vec4<f32>  — premultiplied rgba (fill)
 *   bytes 32..47  sizing        vec4<f32>  — outlineEmFrac, minPx, maxPx, fadeAlpha
 *   bytes 48..63  outlineColor  vec4<f32>  — premultiplied rgba (outline stroke)
 *   bytes 64..67  occludeWeight f32        — share of the scene attenuation
 *   bytes 68..71  occludeNearKm f32        — the sampled-depth channel's cutoff
 *   bytes 80..95  subjectPos    vec4<f32>  — xyz = the depth verdict's own
 *                                             world point (falls back to
 *                                             worldPos), w unused
 *
 * The trailing vec4 needs 16-byte alignment, so bytes 72..79 are now genuine
 * padding ahead of it (not slack) and the stride is 96, not 72 rounded up.
 * `sizing.x` repurposes the legacy `pixelSize` slot (ignored by the shader
 * since the worldEmMpc migration) to carry `outlineEmFrac`, sparing a fresh
 * vec4 for one scalar.
 */
export const LABEL_DATA_BYTES = 96;

/**
 * Per-glyph instance buffer stride, matching `VsIn` attributes 1–5 in io.wesl:
 *
 *   bytes  0..7   localOffset  vec2<f32>  — pen-relative top-left in atlas px
 *   bytes  8..15  localSize    vec2<f32>  — glyph width/height in atlas px
 *   bytes 16..31  uvRect       vec4<f32>  — (u0,v0,u1,v1) atlas UV
 *   bytes 32..35  labelIndex   u32        — index into labels[] storage buffer
 *   bytes 36..39  fontIndex    u32        — texture_2d_array layer index
 *                                            (= FONT_IDS.indexOf(label.font))
 *
 * Note: `corner` (location 0) comes from a separate 4-vertex unit-quad
 * buffer with `stepMode: 'vertex'`, not from this instance buffer.
 */
export const GLYPH_INSTANCE_BYTES = 40;
