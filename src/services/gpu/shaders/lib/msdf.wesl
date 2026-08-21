// lib/msdf.wesl — shared MSDF (multi-channel signed distance field) glyph
// shading: median3 + shadeMsdf, one source of truth for both labels/fragment
// and labels/fragmentOcclude (which discard-gates before calling in).
//
// The atlas bindings live HERE, not in the caller, so the binding slots are a
// contract the label3DRenderer's BGL can share (see lib/sceneDepth.wesl and
// lib/mipBlit.wesl for the precedent of a lib module owning bindings).
// 'shadeMsdf' takes scalars rather than a consumer's VsOut — a lib module
// must not import a consumer's io module.

// The atlas binding is a texture_2d_array<f32>: each registered font in
// src/data/fonts.ts occupies one array layer.  The per-glyph fontIndex
// selects the layer at sample time, so a single draw call can render glyphs
// from any mix of registered fonts — the GPU picks the right atlas page per
// fragment.
@group(0) @binding(2) var atlas: texture_2d_array<f32>;
@group(0) @binding(3) var atlasSampler: sampler;

// Median of three scalars.  The MSDF technique encodes one SDF per colour
// channel, each shifted by a sub-pixel; taking the median of the three
// recovers the glyph contour even where one channel disagrees (sharp
// corners, near-zero strokes).  It's the 'M' in MSDF.
fn median3(r: f32, g: f32, b: f32) -> f32 {
  return max(min(r, g), min(max(r, g), b));
}

// The MSDF two-band shading body: outline (hard outside stroke) over fill
// (glyph body), both in premultiplied space.
//
//   fill   : smoothstep(-aa, +aa, d)
//             — one-pixel AA band straddling the contour.
//   outline: smoothstep(-aa - outlineSdf, -aa, d) * (1 - fill)
//             — covers d in [-outlineSdf, 0]; the (1 - fill) factor masks the
//               inside half so the outline doesn't bleed into the glyph body.
//
// 'outlineSdf' is in SDF units (the same units 'd' lives in); the vertex
// stage converts from em-fraction via
//   widthInSdfUnits = (outlineEmFrac * ATLAS_EM_PX) / DISTANCE_RANGE_PX
//
// Composite is over(outline, fill): result = top + bottom * (1 - top.a).
fn shadeMsdf(
  uv: vec2<f32>,
  fontIndex: u32,
  color: vec4<f32>,
  outlineColor: vec4<f32>,
  outlineSdf: f32,
) -> vec4<f32> {
  let s = textureSample(atlas, atlasSampler, uv, i32(fontIndex)).rgb;
  let d = median3(s.r, s.g, s.b) - 0.5;
  let aa = fwidth(d);

  // Fill mask (1 inside the glyph, 0 outside, smoothed at the edge).
  let fillMask = smoothstep(-aa, aa, d);

  // Outline mask covers d in [-outlineSdf, 0] but is masked OUT inside the
  // glyph.  When outlineSdf == 0 the smoothstep collapses to a single-point
  // step at d=0 — the mask is then identically zero outside the glyph (no
  // contribution) and cancelled by (1 - fillMask) inside.  So a zero outline
  // width contributes nothing.
  let outlineBand = smoothstep(-aa - outlineSdf, -aa, d);
  let outlineMask = outlineBand * (1.0 - fillMask);

  let fillPM    = color        * fillMask;
  let outlinePM = outlineColor * outlineMask;

  return outlinePM + fillPM * (1.0 - outlinePM.a);
}
