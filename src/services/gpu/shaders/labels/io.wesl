// labels/io.wesl — shared structs + bind-group declarations for the
// MSDF labels renderer. Imported by labels/vertex.wesl and
// labels/fragment.wesl.
//
// ## What's an MSDF label?
//
// MSDF = multi-channel signed distance field. Each glyph is rasterised
// once into an atlas where the R/G/B channels each encode a slightly
// different SDF; the fragment shader takes their median to recover a
// crisp edge regardless of how the glyph is scaled. The result is
// pixel-perfect text at any zoom level from a single static atlas — no
// per-zoom re-rasterisation, no aliasing on near/far text.
//
// ## Why labels look the way they do — worldEm perspective sizing
//
// Each label sets 'worldEmMpc' (label.worldPos.w, packed already times
// LABEL_EM_PX_RETUNE): the em height in Mpc of world space.  The vertex
// stage turns it into an angle at the anchor's distance and then pixels:
//
//   pxPerEm = (worldEm / |v|) * pxPerRad      (= worldEm * focalPx / v.z, pinhole)
//
// That value is clamped to [minPixelSize, maxPixelSize], keeping labels
// legible at extreme distances (floor) and very close approach (ceiling).
// The net effect is natural perspective growth: zoom in → labels grow;
// zoom out → labels shrink, but never vanish below the floor.
//
// 'pixelSize' (sizing.x) is a LEGACY buffer slot from the previous
// pixel-anchored model.  The field still exists in LabelData (and in
// the CPU-side Label type) for layout stability and because existing
// call sites still set it, but the shader no longer reads it.  It may
// be repurposed or removed in a future cleanup once all call sites are
// migrated.
//
// ## Bind-group convention
//
// All four bindings live in @group(0) because the labels pass is
// self-contained — it doesn't share a bind group with any other
// renderer. The storage buffer + atlas texture are large enough that
// keeping them per-pass (rather than promoting to a shared @group(1))
// avoids accidentally bloating other pipelines' layouts.

import package::lib::projectLabel::OutputProjection;

// 'LabelData.lift' — must equal 'LABEL_LIFT' in src/data/labels/labelLift.ts.
const LIFT_NONE: u32 = 0u;
const LIFT_LEADER_FROM_CENTRE: u32 = 1u;
const LIFT_LEADER_FROM_RIM: u32 = 2u;

// Byte offsets in labelRenderer's LABEL_UNIFORM_OFFSETS.
struct Uniforms {
  out: OutputProjection,
  // Interim, until labels carry absolute hi/lo positions: this slab's anchors
  // (absolute on COSMO, camera-relative on NEAR0) into view space, unscaled Mpc.
  viewFromSlab: mat4x4<f32>,
  // View depth under which the old clip-space path near-clipped an anchor
  // (COSMO's near plane; 0 on NEAR0), kept so the swap changes no pixel.
  nearClipMpc: f32,
};

// Byte offsets in 'LABEL_DATA_OFFSETS' (src/data/labels/labelBufferStrides.ts).
struct LabelData {
  // worldPos.xyz = the subject in Mpc (a lifted label's text sits above it);
  // worldPos.w = worldEmMpc × the em retune
  // (PRIMARY size driver — em height in world-space Mpc, projected to pixels
  // by the vertex stage).
  worldPos: vec4<f32>,
  // Fill colour — premultiplied rgba.  The renderer pack loop multiplies
  // r/g/b by a before upload, so the shader can treat (rgb, a) as the
  // OVER-composite input directly.
  color: vec4<f32>,
  // x = outlineEmFrac (repurposed legacy pixelSize slot)
  // y = minPixelSize, z = maxPixelSize, w = fadeAlpha
  sizing: vec4<f32>,
  // Outside-stroke outline colour — premultiplied rgba.  Zero alpha
  // collapses the outline band regardless of outlineEmFrac.
  outlineColor: vec4<f32>,
  // How much per-pixel scene attenuation the occlusion fragment variant
  // applies (1 = fully, 0 = draw over the bodies).
  occludeWeight: f32,
  // Eye to the subject's NEAR surface, km: the sampled-depth channel's cutoff
  // (lib/sceneDepth.wesl), judged at worldPos.
  occludeNearKm: f32,
  // The leader's colour as drawn, rgba8 ('pack4x8unorm' order).
  leaderRgba: u32,
  // The text's ink bottom below its anchor, atlas px (+y down): with the lift
  // rule it keeps the ink clear of the subject and ends the leader under it.
  inkBottom: f32,
  // The subject's radius, Mpc: its apparent diameter sets the lift.
  radiusMpc: f32,
  // The leader's start, px above its base (the subject's rim or centre).
  leaderGapPx: f32,
  // LIFT_NONE, or where the leader starts.
  lift: u32,
  // 0 = no leader.
  leaderWidthPx: f32,
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
  // Index into the labels[] storage buffer; all glyphs of one label
  // share its world position, color, and fade.
  @location(4) labelIndex: u32,
  // GPU texture-array layer for the glyph's font.  All glyphs of one
  // label share the same font, but it's carried per-glyph because the
  // instance buffer is the only path the vertex stage has to per-label
  // data that's not already in labels[].  Equal to
  // 'FONT_IDS.indexOf(label.font)' (the renderer pre-computes this).
  @location(5) fontIndex: u32,
};

// A leader quad's varyings ('vsLeader').
struct LeaderVsOut {
  @builtin(position) pos: vec4<f32>,
  // 0..1 across the line's width; linear, though the quad is at w = 1.
  @location(0) @interpolate(linear) across: f32,
  // The leader colour, pre-multiplied by the label's fadeAlpha.
  @location(1) color: vec4<f32>,
  @location(2) occludeWeight: f32,
};

struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
  // Fill colour pre-multiplied by fadeAlpha so the fragment stage can
  // alpha-blend without re-reading fadeAlpha.
  @location(1) color: vec4<f32>,
  // Flat-interpolated so the fragment shader sees the same integer
  // layer index for every fragment of one glyph quad.  Non-flat
  // interpolation of an integer is a WGSL validation error.
  @location(2) @interpolate(flat) fontIndex: u32,
  // Outline colour pre-multiplied by fadeAlpha (same pre-fade bake as
  // the fill colour — keeps the fragment stage simple).
  @location(3) outlineColor: vec4<f32>,
  // Outline width in SDF units (atlas px / DISTANCE_RANGE_PX).
  // Converted CPU-side at the vertex stage so the fragment shader has
  // the value ready without re-deriving from per-label data.
  @location(4) outlineSdf: f32,
  // Per-label share of the scene attenuation.  'vsOcclude' resolves this to
  // 'max(LabelData.occludeWeight, the anchor-depth verdict)' before writing
  // it here; 'vs' forwards LabelData's own value unchanged.  Constant per
  // label either way, so interpolating it is exact.
  @location(5) occludeWeight: f32,
};
