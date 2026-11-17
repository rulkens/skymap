// bloom/veilFragment.wesl — veiling glare, the lens-scatter wash a bright source throws
// across the frame: one separable Gaussian row (24 taps each side) over bloom4
// at its own 1/32 resolution. Drawn along x then y into the veil targets and
// folded into hdr through one bilinear tap, so the skirt is smooth by
// construction. Taps past the frame read zero: light out of frame does not scatter.

import package::bloom::io::FullscreenOut;

struct VeilUniforms {
  // One source texel along the blur axis, in uv; zero on the other axis.
  axisStep: vec2<f32>,
  sigmaTexels: f32,
  pad0: f32,
}

@group(0) @binding(0) var srcSamp: sampler;
@group(0) @binding(1) var srcTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: VeilUniforms;

fn tap(uv: vec2<f32>) -> vec3<f32> {
  let inside = all(uv >= vec2<f32>(0.0)) && all(uv <= vec2<f32>(1.0));
  return select(vec3<f32>(0.0), textureSampleLevel(srcTex, srcSamp, uv, 0.0).rgb, inside);
}

@fragment
fn fs(in: FullscreenOut) -> @location(0) vec4<f32> {
  let twoSigmaSq = 2.0 * uniforms.sigmaTexels * uniforms.sigmaTexels;
  var sum = tap(in.uv);
  var weightSum = 1.0;
  for (var tapIndex = 1; tapIndex <= 24; tapIndex++) {
    let reach = f32(tapIndex);
    let weight = exp(-reach * reach / twoSigmaSq);
    let offset = uniforms.axisStep * reach;
    sum += (tap(in.uv + offset) + tap(in.uv - offset)) * weight;
    weightSum += 2.0 * weight;
  }
  return vec4<f32>(sum / weightSum, 1.0);
}
