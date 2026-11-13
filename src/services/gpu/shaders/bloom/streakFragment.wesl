// bloom/streakFragment.wesl — one iteration of the anamorphic streak: a horizontal
// 9-tap smear at 'u.stride' source texels with exponential falloff over
// 'u.falloff' texels. Three iterations at strides 1, 4, 16 compound into a
// smooth tail hundreds of px long. Per-channel falloff ('u.tint' shortens red
// and green) keeps the core white and disperses the tails toward blue. Taps
// past the edge read zero, so an edge source does not smear its clamped texel.
// 'u.threshold' > 0 (iteration 0 only) applies the streak's own soft threshold.

import package::bloom::io::FullscreenOut;

// Mirrors StreakTaps (32 bytes).
struct StreakUniforms {
  texel: f32,
  stride: f32,
  threshold: f32,
  falloff: f32,
  tint: f32,
  pad0: f32,
  pad1: f32,
  pad2: f32,
}

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> u: StreakUniforms;

fn tap(uv: vec2<f32>) -> vec3<f32> {
  let inside = all(uv >= vec2<f32>(0.0)) && all(uv <= vec2<f32>(1.0));
  var c = select(vec3<f32>(0.0), textureSampleLevel(tex, samp, uv, 0.0).rgb, inside);
  if (u.threshold > 0.0) {
    let l = max(c.r, max(c.g, c.b));
    c = c * (max(0.0, l - u.threshold) / max(l, 0.0001));
  }
  return c;
}

@fragment
fn fs(i: FullscreenOut) -> @location(0) vec4<f32> {
  let scale = vec3<f32>(1.0 - 0.6 * u.tint, 1.0 - 0.3 * u.tint, 1.0) * u.falloff;
  var acc = tap(i.uv);
  var total = vec3<f32>(1.0);
  for (var k = 1; k <= 4; k++) {
    let d = u.stride * f32(k);
    let w = exp(-vec3<f32>(d) / scale);
    let o = vec2<f32>(u.texel * d, 0.0);
    acc += (tap(i.uv + o) + tap(i.uv - o)) * w;
    total += 2.0 * w;
  }
  return vec4<f32>(acc / total, 1.0);
}
