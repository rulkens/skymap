// labels/fragment.wesl — MSDF labels fragment stage with three-band
// composite: glow (soft outside halo) → outline (hard outside stroke)
// → fill (glyph body).  All composited OVER in premultiplied space.
//
// ## Bands
//
// The MSDF distance 'd' is positive inside the glyph and negative
// outside; the glyph contour sits at 'd = 0'.  The three bands are:
//
//   fill   : smoothstep(-aa, +aa, d)
//             — existing one-pixel AA band straddling the contour.
//   outline: smoothstep(-aa - outlineSdf, -aa, d) * (1 - fill)
//             — covers d ∈ [-outlineSdf, 0]; the (1 - fill) factor
//               masks the inside half so the outline doesn't bleed
//               into the glyph body.
//   glow   : smoothstep(-glowSdf, 0, d)
//             — soft falloff from the contour outward by glowSdf,
//               with default smoothstep cubic ease.  Overlaps the
//               outline band; the OVER composite below resolves
//               which colour wins.
//
// 'outlineSdf' and 'glowSdf' are in SDF units (the same units 'd'
// lives in); the vertex stage converts from em-fraction inputs via
// 'widthInSdfUnits = (emFrac * ATLAS_EM_PX) / DISTANCE_RANGE_PX'.
//
// ## Composite
//
//   out = over(glow, over(outline, fill))
//
// All three band colours arrive pre-multiplied (and pre-faded by
// fadeAlpha — the vertex stage bakes fadeAlpha into the rgba),
// so the OVER step is the canonical:
//
//   over(A, B) = A + B * (1 - A.a)
//
// ## Why overlap, not stack
//
// "Glow radius" matches the mental model "visible halo extent", not
// "extra halo past the outline".  Overlap also keeps the label
// silhouette stable when the outline is toggled on/off.

import package::labels::io::VsOut;

@group(0) @binding(2) var atlas: texture_2d_array<f32>;
@group(0) @binding(3) var atlasSampler: sampler;

fn median3(r: f32, g: f32, b: f32) -> f32 {
  return max(min(r, g), min(max(r, g), b));
}

@fragment
fn fs(input: VsOut) -> @location(0) vec4<f32> {
  let s = textureSample(atlas, atlasSampler, input.uv, i32(input.fontIndex)).rgb;
  let d = median3(s.r, s.g, s.b) - 0.5;
  let aa = fwidth(d);

  let outlineSdf = input.widths.x;
  let glowSdf    = input.widths.y;

  // Fill mask (1 inside the glyph, 0 outside, smoothed at the edge).
  let fillMask = smoothstep(-aa, aa, d);

  // Outline mask covers d ∈ [-outlineSdf, 0] but is masked OUT inside
  // the glyph.  When outlineSdf == 0 the smoothstep collapses to a
  // single-point step at d=0 — the mask is then identically zero
  // outside the glyph (no contribution) and identically 'fillMask'
  // inside (cancelled by '1 - fillMask').  So a zero outline width
  // correctly contributes nothing.
  let outlineBand = smoothstep(-aa - outlineSdf, -aa, d);
  let outlineMask = outlineBand * (1.0 - fillMask);

  // Glow band: smooth ramp from d = -glowSdf (alpha 0) to d = 0
  // (alpha 1).  When glowSdf == 0 the ramp degenerates to a step at
  // d=0 — multiplied by glowColor.a (which is 0 when the producer
  // doesn't set glowColor), the band's contribution stays zero.
  let glowMask = smoothstep(-glowSdf, 0.0, d);

  // Per-band premultiplied colours.  The masks scale the already-
  // premultiplied colour by the band's coverage.
  let fillPM    = input.color        * fillMask;
  let outlinePM = input.outlineColor * outlineMask;
  let glowPM    = input.glowColor    * glowMask;

  // Composite over(glow, over(outline, fill)).  Each 'over' step
  // does:  result = top + bottom * (1 - top.a)
  let layer1 = outlinePM + fillPM    * (1.0 - outlinePM.a);
  let layer2 = glowPM    + layer1    * (1.0 - glowPM.a);

  return layer2;
}
