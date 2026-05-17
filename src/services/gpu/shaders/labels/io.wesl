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
// ## Why labels look the way they do — pixel-anchored sizing
//
// Each label declares a target em pixel height ('pixelSize').  The
// vertex stage clamps that to [minPixelSize, maxPixelSize] and then
// scales the atlas-baked glyph quad so one em renders at exactly the
// clamped size in screen pixels.  Labels DO NOT grow with the camera
// approaching — they stay at their declared pixel size regardless of
// depth.  Proximity cues (e.g. the "You are here" pin) are driven by
// 'fadeAlpha' instead.
//
// 'worldEmMpc' (label.worldPos.w) is a vestigial channel from the
// previous depth-perspective sizing model.  It's still written by
// labelRenderer.ts to keep the binary layout stable, but the shader
// ignores it.  May be repurposed for fade-distance logic later.
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
  // worldPos.xyz = anchor in Mpc; worldPos.w = worldEmMpc, deprecated
  // (kept for layout stability — see module docblock).
  worldPos: vec4<f32>,
  // color.rgb premultiplied; color.a = base alpha (multiplied by fadeAlpha).
  color: vec4<f32>,
  // x = pixelSize (target on-screen em pixel height)
  // y = minPixelSize, z = maxPixelSize, w = fadeAlpha
  sizing: vec4<f32>,
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
  @location(1) color: vec4<f32>,
  // Flat-interpolated so the fragment shader sees the same integer
  // layer index for every fragment of one glyph quad.  Non-flat
  // interpolation of an integer is a WGSL validation error.
  @location(2) @interpolate(flat) fontIndex: u32,
};
