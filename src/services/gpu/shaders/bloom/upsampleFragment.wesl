// bloom/upsampleFragment.wesl — the ascending half of the dual-filter bloom
// pyramid: an 8-tap tent (axis taps at ±2t x1, diagonals at ±t x2, /12) that
// spreads a coarse level onto the next finer one. The pipeline blends it
// ADDITIVELY, so each level adds its wider blur and the sum gives bloom its wide
// multi-scale falloff. t (u.xy) is the coarse level's texel size, so the tent
// widens at each step up.

import package::bloom::io::FullscreenOut;

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> u: vec4<f32>;   // xy = source texel size

@fragment
fn fs(i: FullscreenOut) -> @location(0) vec4<f32> {
  let t = u.xy;
  var c = textureSample(tex, samp, i.uv + vec2<f32>(-t.x * 2.0, 0.0)).rgb;
  c += textureSample(tex, samp, i.uv + vec2<f32>(-t.x,  t.y)).rgb * 2.0;
  c += textureSample(tex, samp, i.uv + vec2<f32>( 0.0,  t.y * 2.0)).rgb;
  c += textureSample(tex, samp, i.uv + vec2<f32>( t.x,  t.y)).rgb * 2.0;
  c += textureSample(tex, samp, i.uv + vec2<f32>( t.x * 2.0, 0.0)).rgb;
  c += textureSample(tex, samp, i.uv + vec2<f32>( t.x, -t.y)).rgb * 2.0;
  c += textureSample(tex, samp, i.uv + vec2<f32>( 0.0, -t.y * 2.0)).rgb;
  c += textureSample(tex, samp, i.uv + vec2<f32>(-t.x, -t.y)).rgb * 2.0;
  return vec4<f32>(c / 12.0, 1.0);
}
