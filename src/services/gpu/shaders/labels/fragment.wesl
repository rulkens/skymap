// labels/fragment.wesl — MSDF labels fragment stage.
//
// Samples the multi-channel signed-distance atlas, takes the median
// across R/G/B to recover the glyph edge, then anti-aliases the edge
// with a screen-space-derivative width. Output is premultiplied — the
// blend state on the renderer side expects (rgb*a, a).

import package::labels::io::VsOut;

@group(0) @binding(2) var atlas: texture_2d<f32>;
@group(0) @binding(3) var atlasSampler: sampler;

// Median of three scalars. The MSDF technique encodes one SDF per
// colour channel, each shifted by a sub-pixel; taking the median of
// the three recovers the glyph contour even where one channel
// disagrees (sharp corners, near-zero strokes). It's the 'M' in MSDF.
fn median3(r: f32, g: f32, b: f32) -> f32 {
  return max(min(r, g), min(max(r, g), b));
}

@fragment
fn fs(input: VsOut) -> @location(0) vec4<f32> {
  let s = textureSample(atlas, atlasSampler, input.uv).rgb;
  // Distance from the glyph contour: positive inside, negative outside,
  // zero exactly on the edge.
  let d = median3(s.r, s.g, s.b) - 0.5;
  // 'fwidth' gives roughly one pixel's worth of distance at this
  // fragment's scale, so the smoothstep band is exactly one pixel
  // wide regardless of zoom — that's what keeps MSDF text crisp at
  // any size.
  let aa = fwidth(d);
  let alpha = smoothstep(-aa, aa, d) * input.color.a;
  return vec4<f32>(input.color.rgb * alpha, alpha);
}
