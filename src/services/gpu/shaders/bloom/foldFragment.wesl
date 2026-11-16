// bloom/foldFragment.wesl — adds a glow level (upscaled by the linear sampler) into
// hdr scaled by the strength; the pipeline's ADDITIVE blend does the adding.
// Strength rides a uniform: the compositor's blend table has no slot for it.

import package::bloom::io::FullscreenOut;

struct FoldUniforms {
  strength: f32,
  pad0: f32,
  pad1: f32,
  pad2: f32,
}

@group(0) @binding(0) var srcSamp: sampler;
@group(0) @binding(1) var srcTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: FoldUniforms;

@fragment
fn fs(in: FullscreenOut) -> @location(0) vec4<f32> {
  let glow = textureSample(srcTex, srcSamp, in.uv).rgb;
  return vec4<f32>(glow * uniforms.strength, 1.0);
}
