// bloom/veilFragment.wesl — veiling glare, the lens-scatter wash a bright source throws
// across the frame: one separable Gaussian row (24 taps each side) over bloom4
// at its own 1/32 resolution. Drawn along x then y into the veil targets and
// folded into hdr through one bilinear tap, so the skirt is smooth by
// construction. Taps past the frame read zero: light out of frame does not scatter.

import package::bloom::io::FullscreenOut;

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> u: vec4<f32>; // xy: one-texel step (uv) along the axis, z: sigma (texels)

fn tap(uv: vec2<f32>) -> vec3<f32> {
  let inside = all(uv >= vec2<f32>(0.0)) && all(uv <= vec2<f32>(1.0));
  return select(vec3<f32>(0.0), textureSampleLevel(tex, samp, uv, 0.0).rgb, inside);
}

@fragment
fn fs(i: FullscreenOut) -> @location(0) vec4<f32> {
  var acc = tap(i.uv);
  var total = 1.0;
  for (var k = 1; k <= 24; k++) {
    let d = f32(k);
    let w = exp(-d * d / (2.0 * u.z * u.z));
    let o = u.xy * d;
    acc += (tap(i.uv + o) + tap(i.uv - o)) * w;
    total += 2.0 * w;
  }
  return vec4<f32>(acc / total, 1.0);
}
