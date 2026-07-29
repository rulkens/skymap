// additiveUpsample/fragment.wesl — sample a reduced-resolution offscreen
// with a 4-tap rotated-grid low-pass kernel and emit the result for
// additive blending into HDR.
//
// ## Why filter, not just magnify
//
// Every caller renders its contribution at a fraction of screen
// resolution and pays for it in high-frequency error: whatever noise the
// producing pass carries per offscreen texel is magnified along with the
// signal, because each texel now covers several screen pixels.
//
// The scalar-volume raymarch is the sharpest instance of that.  It
// jitters its step phase per fragment via
// 'hash21Hq(fragCoord + frame * irrationals)' to break the otherwise-
// visible step grid — an unbiased-integral trick where the jitter
// averages out across many rays but shows up on any single fragment as
// grain.  Aggressive downsampling then magnifies the grain.  Other
// sources arrive with their own error term (a sparse sum of glow
// billboards is noisy wherever the sprite count per texel is low), so
// the filter is not volume-specific bookkeeping; it is what makes
// reduced-resolution rendering viable at all.
//
// A small spatial low-pass cuts that error's variance roughly in
// proportion to the kernel footprint.  It costs nothing in signal
// fidelity because the sources this pass serves are bandlimited well
// below the offscreen's Nyquist limit — volumetric accumulation and glow
// haze are smooth by construction, so the only thing above that band is
// the sampling error we are trying to remove.  Hand this pass a source
// with genuine high-frequency detail and the filter WOULD soften it;
// that is the contract's second clause, not an oversight.
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
// Every contributor draws into the offscreen with additive blending
// '(one, one)' for color AND alpha, so the offscreen holds a plain
// per-fragment SUM rather than an order-dependent composite.  A sum is
// linear, and a low-pass of a sum is the sum of the low-passes —
// averaging four bilinear-filtered samples therefore reconstructs the
// same quantity, just band-limited.  The pipeline's own additive blend
// ((one, one) for both color and alpha) then adds that value to HDR.
// Break the additivity at either end and the equivalence goes with it.

import package::additiveUpsample::io::VSOut;

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
