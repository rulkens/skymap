// bloom/upsampleFragment.wesl — the ascending half of the dual-filter bloom
// pyramid: an 8-tap tent (axis taps at ±2 texels x1, diagonals at ±1 x2, /12) that
// spreads a coarse level onto the next finer one. The pipeline blends it
// ADDITIVELY, so each level adds its wider blur and the sum gives bloom its wide
// multi-scale falloff. The texel is the coarse level's, so the tent widens at
// each step up.

import package::bloom::io::FullscreenOut;

struct UpsampleUniforms {
  texel: vec2<f32>,
  pad0: f32,
  pad1: f32,
}

@group(0) @binding(0) var srcSamp: sampler;
@group(0) @binding(1) var srcTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: UpsampleUniforms;

@fragment
fn fs(in: FullscreenOut) -> @location(0) vec4<f32> {
  let texel = uniforms.texel;
  var sum = textureSample(srcTex, srcSamp, in.uv + vec2<f32>(-texel.x * 2.0, 0.0)).rgb;
  sum += textureSample(srcTex, srcSamp, in.uv + vec2<f32>(-texel.x, texel.y)).rgb * 2.0;
  sum += textureSample(srcTex, srcSamp, in.uv + vec2<f32>(0.0, texel.y * 2.0)).rgb;
  sum += textureSample(srcTex, srcSamp, in.uv + vec2<f32>(texel.x, texel.y)).rgb * 2.0;
  sum += textureSample(srcTex, srcSamp, in.uv + vec2<f32>(texel.x * 2.0, 0.0)).rgb;
  sum += textureSample(srcTex, srcSamp, in.uv + vec2<f32>(texel.x, -texel.y)).rgb * 2.0;
  sum += textureSample(srcTex, srcSamp, in.uv + vec2<f32>(0.0, -texel.y * 2.0)).rgb;
  sum += textureSample(srcTex, srcSamp, in.uv + vec2<f32>(-texel.x, -texel.y)).rgb * 2.0;
  return vec4<f32>(sum / 12.0, 1.0);
}
