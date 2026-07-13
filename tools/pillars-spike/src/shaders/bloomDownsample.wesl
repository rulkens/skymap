// bloomDownsample.wesl — descending half of the dual-filter bloom pyramid
// (Marius Bjørge / 'Next Generation Post Processing in Call of Duty').
// Verbatim from the galaxy-renderer's copy — see tools/galaxy-renderer/
// src/engine/shaders/bloomDownsample.wesl for the Karis-average rationale
// (level-0-only firefly suppression via 1/(1+luma) tap weights).

import package::lib::fullscreenTri::FullscreenOut;
import package::lib::fullscreenTri::fullscreenVertex;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> FullscreenOut { return fullscreenVertex(vi); }

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> u: vec4<f32>;   // xy = source texel size, z = karis flag

fn karisW(c: vec3<f32>) -> f32 { return 1.0 / (1.0 + max(c.r, max(c.g, c.b))); }

@fragment
fn fs(i: FullscreenOut) -> @location(0) vec4<f32> {
  let t = u.xy;
  let s0 = textureSample(tex, samp, i.uv).rgb;
  let s1 = textureSample(tex, samp, i.uv + vec2<f32>(-t.x, -t.y)).rgb;
  let s2 = textureSample(tex, samp, i.uv + vec2<f32>( t.x, -t.y)).rgb;
  let s3 = textureSample(tex, samp, i.uv + vec2<f32>(-t.x,  t.y)).rgb;
  let s4 = textureSample(tex, samp, i.uv + vec2<f32>( t.x,  t.y)).rgb;
  if (u.z > 0.5) {
    let w0 = 4.0 * karisW(s0); let w1 = karisW(s1); let w2 = karisW(s2); let w3 = karisW(s3); let w4 = karisW(s4);
    let c = s0 * w0 + s1 * w1 + s2 * w2 + s3 * w3 + s4 * w4;
    return vec4<f32>(c / max(w0 + w1 + w2 + w3 + w4, 0.0001), 1.0);
  }
  return vec4<f32>((s0 * 4.0 + s1 + s2 + s3 + s4) / 8.0, 1.0);
}
