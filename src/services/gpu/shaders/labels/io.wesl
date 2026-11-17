// labels/io.wesl — shared structs for the MSDF labels renderer, imported by
// labels/vertex.wesl and labels/fragment.wesl. MSDF = multi-channel signed
// distance field: each glyph is rasterised once into an atlas whose R/G/B each
// encode a slightly different SDF, and their median recovers a crisp edge at any
// scale, from one static atlas.

import package::lib::projectLabel::OutputProjection;

// Must equal 'LABEL_RECORD_FLAGS' (src/data/labels/labelRecordLayout.ts):
// LabelRecord.style's low half is the style index, its high half flags.
const STYLE_INDEX_MASK: u32 = 0xffffu;
const RECORD_GROUNDED: u32 = 0x10000u;

// Must equal 'LABEL_STYLE_FLAGS' (src/data/labels/labelStyleGpuLayout.ts).
const STYLE_ABOVE: u32 = 1u;
const STYLE_LEADER_FROM_RIM: u32 = 2u;
const STYLE_LEADER_FROM_CENTRE: u32 = 4u;
const STYLE_LEADER_COLOR: u32 = 8u;

// The vertex stage's uniforms; byte offsets in
// 'LABEL_RECORD_UNIFORM_OFFSETS' (src/data/labels/labelRecordUniformLayout.ts).
struct RecordUniforms {
  out: OutputProjection,
  // Packed pick words of the hovered and selected subjects; 0 = none.
  hoveredPick: u32,
  selectedPick: u32,
  // LABEL_TEXT_PX times pxScale.
  minTextPx: f32,
  maxTextPx: f32,
  emRetune: f32,
  hoveredWhiten: f32,
  selectedWhiten: f32,
};

// One LABEL_STYLES row; word offsets in 'LABEL_STYLE_GPU'
// (src/data/labels/labelStyleGpuLayout.ts). Colours are straight rgba.
struct LabelStyle {
  color: vec4<f32>,
  outlineColor: vec4<f32>,
  // Read only under STYLE_LEADER_COLOR; otherwise the leader takes the label's colour.
  leaderColor: vec4<f32>,
  outlineEmFrac: f32,
  // The em height: emMpc, or emTimesRadius times the subject's radius.
  emMpc: f32,
  emTimesRadius: f32,
  flags: u32,
  liftRadii: f32,
  liftMinPx: f32,
  leaderGapPx: f32,
  leaderWidthPx: f32,
};

// One label as core encodes it; word offsets in 'LABEL_RECORD'
// (src/data/labels/labelRecordLayout.ts), read by 'vertex.wesl'.
struct LabelRecord {
  // The position in absolute Mpc as an f32 hi/lo pair; the shader subtracts
  // the camera's own pair, which is exact near the camera.
  atHi: vec3<f32>,
  radiusMpc: f32,
  atLo: vec3<f32>,
  // The only word written per frame.
  alpha: f32,
  // Packed pick word; 0 = not clickable.
  pick: u32,
  style: u32,
  // rgba8; 0 = the style's colour.
  tint: u32,
  glyphs: u32,
  glyphCount: u32,
  rank: f32,
  revealNear: f32,
  revealFar: f32,
};

struct VsIn {
  // (0,0) (1,0) (0,1) (1,1) — unit-corner attribute, expanded into a
  // glyph quad in the vertex stage.
  @location(0) corner: vec2<f32>,
  // Pen-relative top-left of glyph, in atlas px.
  @location(1) localOffset: vec2<f32>,
  // Glyph w/h in atlas px.
  @location(2) localSize: vec2<f32>,
  // (u0, v0, u1, v1) — atlas region for this glyph.
  @location(3) uvRect: vec4<f32>,
  // Index into the records[] storage buffer; all glyphs of one label
  // share its position, style and alpha.
  @location(4) labelIndex: u32,
  // GPU texture-array layer for the glyph's font (its index in FONT_IDS).
  @location(5) fontIndex: u32,
};

// A leader quad's varyings ('vsLeader').
struct LeaderVsOut {
  @builtin(position) pos: vec4<f32>,
  // 0..1 across the line's width; linear, though the quad is at w = 1.
  @location(0) @interpolate(linear) across: f32,
  // The leader colour, pre-multiplied by the record's alpha.
  @location(1) color: vec4<f32>,
  @location(2) occludeWeight: f32,
};

struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
  // Fill colour pre-multiplied by the record's alpha.
  @location(1) color: vec4<f32>,
  // Flat-interpolated so the fragment shader sees the same integer
  // layer index for every fragment of one glyph quad.  Non-flat
  // interpolation of an integer is a WGSL validation error.
  @location(2) @interpolate(flat) fontIndex: u32,
  // Outline colour, pre-multiplied the same way.
  @location(3) outlineColor: vec4<f32>,
  // Outline width in SDF units (atlas px / DISTANCE_RANGE_PX).
  @location(4) outlineSdf: f32,
  // Per-label share of the scene attenuation: the depth verdict under
  // 'vsOcclude', 0 under 'vs'. Constant per label, so interpolating it is exact.
  @location(5) occludeWeight: f32,
};
