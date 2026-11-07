// antiqueLook/nebula.wesl — the light a galaxy is engraved from, at quarter res
// beside `wash`: x the light blurred over 1 cell; y, z and w unused. Only sky cells
// (wash.a < 0) count, so a globe's light never stipples a halo round its limb.

import package::antiqueLook::io::VSOut;
import package::antiqueLook::pigments::luma;

@group(0) @binding(0) var washTex: texture_2d<f32>;
@group(0) @binding(1) var linear: sampler;

// The plate's 9-tap pattern (centre 4, axes 2, diagonals 1) at `r` cells, sky-weighted.
fn blur9(uv: vec2<f32>, texel: vec2<f32>, r: f32) -> f32 {
  var sum = 0.0;
  var weight = 0.0;
  for (var k = 0; k < 9; k++) {
    let a = f32(k) * 0.7853982;
    let at = select(uv + vec2<f32>(cos(a), sin(a)) * texel * r, uv, k == 8);
    let w = select(select(1.0, 2.0, (k & 1) == 0), 4.0, k == 8);
    let s = textureSampleLevel(washTex, linear, at, 0.0);
    let sky = clamp(-s.a, 0.0, 1.0) * w;
    sum += luma(s.rgb) * sky;
    weight += sky;
  }
  return sum / max(weight, 1e-3);
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let size = vec2<i32>(textureDimensions(washTex));
  let texel = 1.0 / vec2<f32>(size);
  return vec4<f32>(blur9(in.uv, texel, 1.0), 0.0, 0.0, 0.0);
}
