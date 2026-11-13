// bloom/foldFragment.wesl — adds bloom0 (half-res, upscaled by the linear sampler)
// into hdr scaled by the strength in u.x; the pipeline's ADDITIVE blend does the
// adding. Strength rides a uniform: the compositor's blend table has no slot for it.

import package::bloom::io::FullscreenOut;

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> u: vec4<f32>; // x: strength

@fragment
fn fs(i: FullscreenOut) -> @location(0) vec4<f32> {
  let c = textureSample(tex, samp, i.uv).rgb;
  return vec4<f32>(c * u.x, 1.0);
}
