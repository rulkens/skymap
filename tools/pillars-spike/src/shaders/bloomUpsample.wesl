// bloomUpsample.wesl — ascending half of the dual-filter bloom pyramid: an
// 8-tap tent filter drawn with ADDITIVE blending (the blend state lives in
// the pipeline), so each coarse level folds its progressively-wider blur
// onto the finer one. Verbatim from the galaxy-renderer's copy — see
// tools/galaxy-renderer/src/engine/shaders/bloomUpsample.wesl.

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
