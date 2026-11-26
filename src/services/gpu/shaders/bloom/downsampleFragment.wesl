// bloom/downsampleFragment.wesl — the descending half of the dual-filter bloom
// pyramid (Bjorge, 'Next Generation Post Processing in Call of Duty'): halves
// resolution with a 5-tap blur (centre x4 + four diagonals, /8); the texel is the
// SOURCE texel size so the diagonals land on its texel corners.
//
// Level 0 only (karis > 0.5) takes the Karis average, 1/(1 + max-channel): a
// lone sub-pixel firefly would otherwise dominate the coarser texel and swing it
// frame to frame as it drifts (bloom flicker). Deeper levels are already smooth,
// so they take the cheaper /8 path.

import package::bloom::io::FullscreenOut;

struct DownsampleUniforms {
  texel: vec2<f32>,
  karis: f32,
  pad0: f32,
}

@group(0) @binding(0) var srcSamp: sampler;
@group(0) @binding(1) var srcTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: DownsampleUniforms;

fn karisWeight(colour: vec3<f32>) -> f32 {
  return 1.0 / (1.0 + max(colour.r, max(colour.g, colour.b)));
}

@fragment
fn fs(in: FullscreenOut) -> @location(0) vec4<f32> {
  let texel = uniforms.texel;
  let centre = textureSample(srcTex, srcSamp, in.uv).rgb;
  let upLeft = textureSample(srcTex, srcSamp, in.uv + vec2<f32>(-texel.x, -texel.y)).rgb;
  let upRight = textureSample(srcTex, srcSamp, in.uv + vec2<f32>(texel.x, -texel.y)).rgb;
  let downLeft = textureSample(srcTex, srcSamp, in.uv + vec2<f32>(-texel.x, texel.y)).rgb;
  let downRight = textureSample(srcTex, srcSamp, in.uv + vec2<f32>(texel.x, texel.y)).rgb;
  if (uniforms.karis > 0.5) {
    let centreWeight = 4.0 * karisWeight(centre);
    let upLeftWeight = karisWeight(upLeft);
    let upRightWeight = karisWeight(upRight);
    let downLeftWeight = karisWeight(downLeft);
    let downRightWeight = karisWeight(downRight);
    let weighted = centre * centreWeight + upLeft * upLeftWeight + upRight * upRightWeight
      + downLeft * downLeftWeight + downRight * downRightWeight;
    let weightSum = centreWeight + upLeftWeight + upRightWeight + downLeftWeight + downRightWeight;
    return vec4<f32>(weighted / max(weightSum, 0.0001), 1.0);
  }
  return vec4<f32>((centre * 4.0 + upLeft + upRight + downLeft + downRight) / 8.0, 1.0);
}
