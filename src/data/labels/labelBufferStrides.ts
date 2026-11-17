/**
 * Per-label storage buffer layout, matching `struct LabelData` in io.wesl
 * (`labelData.parity` holds the two equal):
 *
 *   bytes  0..15  worldPos      vec4<f32>  — xyz = the subject, world Mpc; w = worldEmMpc × LABEL_EM_PX_RETUNE
 *   bytes 16..31  color         vec4<f32>  — premultiplied rgba (fill)
 *   bytes 32..47  sizing        vec4<f32>  — outlineEmFrac, minPx, maxPx, fadeAlpha
 *   bytes 48..63  outlineColor  vec4<f32>  — premultiplied rgba (outline stroke)
 *   bytes 64..67  occludeWeight f32        — share of the scene attenuation
 *   bytes 68..71  occludeNearKm f32        — the sampled-depth channel's cutoff
 *   bytes 72..75  leaderRgba    u32        — the leader's colour, rgba8 (`pack4x8unorm`)
 *   bytes 76..79  inkBottom     f32        — the text's ink bottom below its anchor, atlas px
 *   bytes 80..83  radiusMpc     f32        — the subject's radius (sets the lift)
 *   bytes 84..87  leaderGapPx   f32        — the leader's start above its base
 *   bytes 88..91  lift          u32        — `LABEL_LIFT`: none, or where the leader starts
 *   bytes 92..95  leaderWidthPx f32        — 0 = no leader
 *
 * `sizing.x` repurposes the legacy `pixelSize` slot (ignored by the shader
 * since the worldEmMpc migration) to carry `outlineEmFrac`.
 */
export const LABEL_DATA_BYTES = 96;

/** Byte offsets of the fields `packLabels` writes one by one. */
export const LABEL_DATA_OFFSETS = {
  worldPos: 0,
  color: 16,
  sizing: 32,
  outlineColor: 48,
  occludeWeight: 64,
  occludeNearKm: 68,
  leaderRgba: 72,
  inkBottom: 76,
  radiusMpc: 80,
  leaderGapPx: 84,
  lift: 88,
  leaderWidthPx: 92,
} as const;

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
