// bloomUpsample.wesl — the ascending half of the dual-filter bloom pyramid.
// A 9-tap tent filter (corners ×1, edge midpoints ×2, taps at ±t and ±2t on
// the axes, /12) that spreads a coarse level back onto the next finer level.
//
// Drawn with ADDITIVE blending — the blend state lives in the pipeline, NOT
// this shader, which just emits the tent-filtered colour. Each pyramid level
// therefore ADDS its progressively-wider blur onto the finer one, and the
// accumulation of all levels is what gives bloom its characteristic wide,
// soft, multi-scale falloff rather than a single fixed-radius blur.
//
// 'u.xy' is the source texel size, so the ±t / ±2t offsets are measured in
// the coarse level's texels — the tent widens naturally at each step up.

import package::lib::fullscreenTri::FullscreenOut;
import package::lib::fullscreenTri::fullscreenVertex;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> FullscreenOut { return fullscreenVertex(vi); }

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
