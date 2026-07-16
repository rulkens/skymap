// starAggregateUpsample/fragment.wesl — composite the half-res survey-star
// aggregate offscreen back into the HDR accumulation, applying the star pass's
// hue-preserving knee to the SUMMED aggregate field.
//
// ## What the offscreen holds
//
// The aggregate stream ('starCatalog/fragment.wesl' fsLinear) draws every
// aggregate glow LINEAR into the half-res 'star-aggregates' target with one/one
// additive blend on BOTH colour and alpha. So each texel ends the frame with:
//
//   rgb = sum over covering glows of (tint_i * scalar_i)   -- summed tinted light
//   a   = sum over covering glows of  scalar_i             -- summed RAW scalar
//
// Storing the raw pre-knee scalar in alpha (rather than reading it back off a
// colour channel) is what lets the knee be applied to the true summed scalar
// independent of tint: the O/B blue tint is NOT r = 1 (tint.wesl), so no single
// channel is a valid scalar proxy.
//
// ## The composite = the leaf formula, applied to the sum
//
// The LEAF fragment writes 'tint * starKnee(scalar)'. Here we reproduce exactly
// that, but on the SUMMED field:
//
//   knee   = starKnee(a)            -- knee the summed scalar
//   out    = rgb * (knee / a)       -- rescale the summed tinted light to it
//
// For a lone aggregate glow (rgb = tint*scalar, a = scalar) this is
// 'tint * starKnee(scalar)' -- byte-identical to a leaf. For overlapping glows
// it knees their SUM, so an aggregate-covered region compresses like one bright
// concentrated leaf instead of a stack of sub-knee quads escaping compression
// (the LOD-symmetry fix; see starCatalog/fragment.wesl). The ratio preserves
// the scalar-weighted average hue of the contributors.
//
// ## Blend + linear sampling
//
// The pipeline blends one/one additive into HDR, so the composite ADDS its
// result exactly as if the aggregate glows had been knee'd and drawn straight
// into HDR. The linear sampler gives the 2x bilinear upscale of the low-frequency
// glow haze for free (a single tap suffices -- unlike the volume upsample there
// is no per-fragment raymarch jitter to low-pass). Where no aggregate landed
// (a = 0) the region contributes nothing: the clear is (0,0,0,0) and the guard
// below returns 0.

import package::starAggregateUpsample::io::VSOut;
import package::starCatalog::knee::starKnee;

@group(0) @binding(0) var halfTex: texture_2d<f32>;
@group(0) @binding(1) var halfSamp: sampler;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let s = textureSample(halfTex, halfSamp, in.uv);
  let scalar = s.a; // summed RAW pre-knee scalar (offscreen alpha)
  // Knee the summed scalar, then rescale the summed tinted rgb onto it, hue
  // preserved. select() guards the scalar == 0 no-coverage texel from a 0/0.
  let ratio = select(0.0, starKnee(scalar) / scalar, scalar > 0.0);
  return vec4<f32>(s.rgb * ratio, 0.0);
}
