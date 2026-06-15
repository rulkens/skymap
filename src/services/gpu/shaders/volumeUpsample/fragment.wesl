// volumeUpsample/fragment.wesl — sample the downsampled offscreen with
// a 4-tap rotated-grid low-pass kernel and emit the result for additive
// blending into HDR.
//
// ## Why filter, not just bilinear-sample
//
// The scalar-volume raymarch jitters its step phase per fragment via
// 'hash21Hq(fragCoord + frame * irrationals)' to break the otherwise-
// visible step grid.  That's an unbiased-integral trick: across many
// rays the jitter averages out, but on any single fragment it shows
// up as high-frequency grain.  Aggressive downsampling magnifies the
// grain because each offscreen texel now covers many screen pixels.
//
// A small spatial low-pass cuts the noise variance roughly in
// proportion to the kernel footprint, with no impact on the underlying
// signal (the volume is bandlimited — the low-pass only removes the
// stochastic jitter).
//
// ## Why a 4-tap rotated grid
//
// Each tap is offset ±0.5 texel in u and v.  The GPU's linear sampler
// turns each tap into a 2×2 weighted texel read; four taps at the
// corners overlap into a roughly 3×3 effective footprint.  That's
// equivalent to ≈9 texture reads of variance reduction for only 4
// actual sampler invocations — the best-bang-for-buck spatial filter
// on a hardware-bilinear-capable rgba16float target.
//
// ## Why this is safe to filter
//
// Every scalar-volume field draws into the offscreen with additive
// blending '(one, one)' for color AND alpha (see volumeFieldRenderer's
// pipeline state), so the offscreen holds the additive sum of every
// field's contribution.  Averaging four bilinear-filtered samples is
// still a low-pass reconstruction of that same sum.  The pipeline's
// own additive blend ((one, one) for both color and alpha) then adds
// this filtered value to HDR.

import package::volumeUpsample::io::VSOut;

@group(0) @binding(0) var halfTex: texture_2d<f32>;
@group(0) @binding(1) var halfSamp: sampler;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  // 1 / textureDimensions == size of one texel in [0,1] uv space.
  // textureDimensions returns the LOD-0 size for a non-mipmapped 2D
  // texture, matching what the linear sampler sees.
  let dims = vec2<f32>(textureDimensions(halfTex));
  let texel = vec2<f32>(1.0) / dims;
  // Rotated-grid offsets at ±0.5 texel.  Each lands at a texel corner,
  // so the linear sampler reads a 2×2 block of texels per tap; four
  // such taps overlap into a ~3×3 effective box filter.
  let o = 0.5 * texel;
  let s0 = textureSample(halfTex, halfSamp, in.uv + vec2<f32>( o.x,  o.y));
  let s1 = textureSample(halfTex, halfSamp, in.uv + vec2<f32>( o.x, -o.y));
  let s2 = textureSample(halfTex, halfSamp, in.uv + vec2<f32>(-o.x,  o.y));
  let s3 = textureSample(halfTex, halfSamp, in.uv + vec2<f32>(-o.x, -o.y));
  return 0.25 * (s0 + s1 + s2 + s3);
}
