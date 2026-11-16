// bloom/streakFragment.wesl — one iteration of the anamorphic streak: a horizontal
// 9-tap smear at 'stride' source texels with exponential falloff over 'falloff'
// texels. Three iterations at strides 1, 4, 16 compound into a smooth tail
// hundreds of px long. Per-channel falloff ('tint' shortens red and green) keeps
// the core white and disperses the tails toward blue. Taps past the edge read
// zero, so an edge source does not smear its clamped texel. 'threshold' > 0
// (iteration 0 only) applies the streak's own soft threshold. The band-pass seed
// goes negative where the blur outshines the fine level, so taps clamp at 0.

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

@group(0) @binding(0) var srcSamp: sampler;
@group(0) @binding(1) var srcTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: StreakUniforms;

fn tap(uv: vec2<f32>) -> vec3<f32> {
  let inside = all(uv >= vec2<f32>(0.0)) && all(uv <= vec2<f32>(1.0));
  var colour = select(vec3<f32>(0.0), textureSampleLevel(srcTex, srcSamp, uv, 0.0).rgb, inside);
  colour = max(colour, vec3<f32>(0.0));
  if (uniforms.threshold > 0.0) {
    let luma = max(colour.r, max(colour.g, colour.b));
    colour = colour * (max(0.0, luma - uniforms.threshold) / max(luma, 0.0001));
  }
  return colour;
}

@fragment
fn fs(in: FullscreenOut) -> @location(0) vec4<f32> {
  let falloffRgb = vec3<f32>(1.0 - 0.6 * uniforms.tint, 1.0 - 0.3 * uniforms.tint, 1.0) * uniforms.falloff;
  var sum = tap(in.uv);
  var weightSum = vec3<f32>(1.0);
  for (var tapIndex = 1; tapIndex <= 4; tapIndex++) {
    let reach = uniforms.stride * f32(tapIndex);
    let weight = exp(-vec3<f32>(reach) / falloffRgb);
    let offset = vec2<f32>(uniforms.texel * reach, 0.0);
    sum += (tap(in.uv + offset) + tap(in.uv - offset)) * weight;
    weightSum += 2.0 * weight;
  }
  return vec4<f32>(sum / weightSum, 1.0);
}
