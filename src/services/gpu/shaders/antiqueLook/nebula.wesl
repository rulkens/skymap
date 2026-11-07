// antiqueLook/nebula.wesl — the fields a galaxy is engraved from, at quarter res
// beside `wash`: x Lxs (blur radius 1 cell), y Lsm (1.6 cells, the outline's),
// z the iso-line field's input (Lsm in the faint disc, 1.3 cells above the line
// onset), w the lane reference: the local max of a light blur. Only sky cells
// (wash.a < 0) count, so a globe's light never draws iso-lines round its limb.

import package::antiqueLook::io::VSOut;
import package::antiqueLook::pigments::luma;

@group(0) @binding(0) var washTex: texture_2d<f32>;
@group(0) @binding(1) var linear: sampler;

// Mirrored in fragment.wesl: where iso-lines take over from stipple.
const LINE_ON: f32 = 0.16;

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
  let lxs = blur9(in.uv, texel, 1.0);
  let lxh = blur9(in.uv, texel, 1.3);
  let lsm = blur9(in.uv, texel, 1.6);
  // Lane reference: a 1-2-1 blur at each of the 3×3 neighbours, then their max,
  // from one 5×5 window of texels.
  let ip = vec2<i32>(in.pos.xy);
  var window: array<f32, 25>;
  for (var j = 0; j < 5; j++) {
    for (var i = 0; i < 5; i++) {
      let w = textureLoad(washTex, clamp(ip + vec2<i32>(i - 2, j - 2), vec2<i32>(0), size - 1), 0);
      window[j * 5 + i] = luma(w.rgb) * step(w.a, -0.5);
    }
  }
  var laneRef = 0.0;
  for (var j = 1; j < 4; j++) {
    for (var i = 1; i < 4; i++) {
      var b = 0.0;
      for (var dj = -1; dj <= 1; dj++) {
        for (var di = -1; di <= 1; di++) {
          b += window[(j + dj) * 5 + i + di] * f32((2 - abs(di)) * (2 - abs(dj)));
        }
      }
      laneRef = max(laneRef, b / 16.0);
    }
  }
  let lline = mix(lsm, lxh, smoothstep(LINE_ON, LINE_ON + 0.15, lxs));
  return vec4<f32>(lxs, lsm, lline, laneRef);
}
