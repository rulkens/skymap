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
// Each label sets 'worldEmMpc' (label.worldPos.w): the em height
// expressed in Mpc of world space.  The vertex stage projects this
// through the anchor's clip.w to recover a screen-pixel height:
//
//   pxPerEm = (worldEmMpc / clip.w) * (viewportPx.y * 0.5)
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

import package::lib::camera::CameraUniforms;

struct Uniforms {
  // 80-byte universal camera prefix. Bytes 64..71 (viewportPx) carry
  // the screen pixel dimensions used by the hybrid sizing math; bytes
  // 72..79 (the pad slots) stay reserved — the CPU writer must zero
  // them so future fields don't surprise existing label buffers.
  cam: CameraUniforms,
};

struct LabelData {
  // worldPos.xyz = anchor in Mpc; worldPos.w = worldEmMpc (PRIMARY size
  // driver — em height in world-space Mpc, projected to pixels by the
  // vertex stage).
  worldPos: vec4<f32>,
  // Fill colour — premultiplied rgba.  The renderer pack loop multiplies
  // r/g/b by a before upload, so the shader can treat (rgb, a) as the
  // OVER-composite input directly.
  color: vec4<f32>,
  // x = outlineEmFrac (REPURPOSED — formerly the legacy pixelSize slot,
  //                    which the shader stopped reading at the worldEmMpc
  //                    migration; see labelRenderer.ts LABEL_DATA_BYTES
  //                    docstring for the rationale)
  // y = minPixelSize  (floor clamp on projected em height, in screen px)
  // z = maxPixelSize  (ceiling clamp on projected em height, in screen px)
  // w = fadeAlpha     (multiplied into every effect band uniformly)
  sizing: vec4<f32>,
  // Outside-stroke outline colour — premultiplied rgba.  When alpha is
  // zero (the default for labels that don't opt in), the outline band
  // contributes nothing regardless of outlineEmFrac.
  outlineColor: vec4<f32>,
  // Soft outside glow colour — premultiplied rgba.  Same opt-in semantics
  // as outlineColor: zero alpha → band collapses.
  glowColor: vec4<f32>,
  // x = glowEmFrac (band radius as a fraction of projected em height)
  // y/z/w = reserved (CPU writer keeps these zero so a future fifth/sixth
  //                   effect parameter can land without bumping the stride)
  effects: vec4<f32>,
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
  // Glow colour pre-multiplied by fadeAlpha.
  @location(4) glowColor: vec4<f32>,
  // x = outline width in SDF units (atlas px ÷ DISTANCE_RANGE_PX);
  // y = glow radius in SDF units;
  // converted CPU-side from the em-fraction inputs at the vertex
  // stage, so the fragment shader has the values it needs without
  // re-deriving from per-label data.
  @location(5) widths: vec2<f32>,
};
