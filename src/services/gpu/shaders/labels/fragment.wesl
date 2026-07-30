// labels/fragment.wesl — MSDF labels fragment stage with two-band
// composite: outline (hard outside stroke) over fill (glyph body), all
// in premultiplied space.
//
// ## Bands
//
// The MSDF distance 'd' is positive inside the glyph and negative
// outside; the glyph contour sits at 'd = 0'.
//
//   fill   : smoothstep(-aa, +aa, d)
//             — one-pixel AA band straddling the contour.
//   outline: smoothstep(-aa - outlineSdf, -aa, d) * (1 - fill)
//             — covers d ∈ [-outlineSdf, 0]; the (1 - fill) factor
//               masks the inside half so the outline doesn't bleed
//               into the glyph body.
//
// 'outlineSdf' is in SDF units (the same units 'd' lives in); the
// vertex stage converts from em-fraction via
//   widthInSdfUnits = (outlineEmFrac * ATLAS_EM_PX) / DISTANCE_RANGE_PX
//
// ## Composite
//
//   out = over(outline, fill)
//
// Both band colours arrive pre-multiplied and pre-faded by fadeAlpha
// (baked at the vertex stage), so the OVER step is the canonical
//   over(A, B) = A + B * (1 - A.a)

import package::labels::io::VsOut;

// The atlas binding is a texture_2d_array<f32>: each registered font in
// src/data/fonts.ts occupies one array layer.  The per-glyph fontIndex
// varying (flat-interpolated from the vertex stage) selects the layer
// at sample time, so a single draw call can render glyphs from any mix
// of registered fonts — the GPU picks the right atlas page per fragment.
@group(0) @binding(2) var atlas: texture_2d_array<f32>;
@group(0) @binding(3) var atlasSampler: sampler;

// Median of three scalars.  The MSDF technique encodes one SDF per
// colour channel, each shifted by a sub-pixel; taking the median of
// the three recovers the glyph contour even where one channel
// disagrees (sharp corners, near-zero strokes).  It's the 'M' in MSDF.
fn median3(r: f32, g: f32, b: f32) -> f32 {
  return max(min(r, g), min(max(r, g), b));
}

// The MSDF two-band shading body, factored out of the '@fragment fn fs'
// entry so a depth-occluding variant (labels/fragmentOcclude.wesl) can
// reuse the exact same shading after its discard gate — one source of
// truth for glyph colour, two entry points that differ only in whether
// they test the scene depth first.
fn shadeMsdf(input: VsOut) -> vec4<f32> {
  let s = textureSample(atlas, atlasSampler, input.uv, i32(input.fontIndex)).rgb;
  let d = median3(s.r, s.g, s.b) - 0.5;
  let aa = fwidth(d);

  let outlineSdf = input.outlineSdf;

  // Fill mask (1 inside the glyph, 0 outside, smoothed at the edge).
  let fillMask = smoothstep(-aa, aa, d);

  // Outline mask covers d ∈ [-outlineSdf, 0] but is masked OUT inside
  // the glyph.  When outlineSdf == 0 the smoothstep collapses to a
  // single-point step at d=0 — the mask is then identically zero
  // outside the glyph (no contribution) and cancelled by (1 - fillMask)
  // inside.  So a zero outline width contributes nothing.
  let outlineBand = smoothstep(-aa - outlineSdf, -aa, d);
  let outlineMask = outlineBand * (1.0 - fillMask);

  // Per-band premultiplied colours.
  let fillPM    = input.color        * fillMask;
  let outlinePM = input.outlineColor * outlineMask;

  // Composite over(outline, fill):  result = top + bottom * (1 - top.a)
  return outlinePM + fillPM * (1.0 - outlinePM.a);
}

@fragment
fn fs(input: VsOut) -> @location(0) vec4<f32> {
  return shadeMsdf(input);
}
