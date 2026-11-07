// antiqueLook/glow.wesl — the low band one level further down: each texel the
// mean of a 4×4 block of `wash` (1/16 of the print). At this scale a star is a
// rounding error and only true extended light — nebulae, the Milky Way,
// structure discs, dense galaxy fields — survives to drive stipple and contours.

import package::antiqueLook::io::VSOut;

@group(0) @binding(0) var washTex: texture_2d<f32>;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let origin = vec2<i32>(in.pos.xy) * 4;
  let size = vec2<i32>(textureDimensions(washTex));
  var sum = vec3<f32>(0.0);
  for (var j = 0; j < 4; j++) {
    for (var i = 0; i < 4; i++) {
      sum += textureLoad(washTex, min(origin + vec2<i32>(i, j), size - 1), 0).rgb;
    }
  }
  return vec4<f32>(sum / 16.0, 1.0);
}
