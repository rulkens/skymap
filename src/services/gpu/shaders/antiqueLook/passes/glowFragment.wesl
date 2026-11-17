// antiqueLook/passes/glowFragment.wesl — the low band one level further down: each texel the
// mean of a 4×4 block of `wash` (1/16 of the print). At this scale a star is a
// rounding error and only true extended light — nebulae, the Milky Way,
// structure discs, dense galaxy fields — survives to drive stipple and contours.
// Alpha: 1, or −1 where the block holds no sky, which the field floor
// (`skyFloor.wesl`) skips.

import package::antiqueLook::io::VSOut;
import package::antiqueLook::shared::pigments::luma;

@group(0) @binding(0) var washTex: texture_2d<f32>;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let origin = vec2<i32>(in.pos.xy) * 4;
  let size = vec2<i32>(textureDimensions(washTex));
  // Sky cells only (wash.a < 0): a lit globe's light must not spill into the
  // sky's outline colour round its limb.
  var sum = vec3<f32>(0.0);
  var skyCount = 0.0;
  for (var tapY = 0; tapY < 4; tapY++) {
    for (var tapX = 0; tapX < 4; tapX++) {
      let washTexel = textureLoad(washTex, clamp(origin + vec2<i32>(tapX, tapY), vec2<i32>(0), size - 1), 0);
      let sky = select(1.0, 0.0, washTexel.a >= 0.0);
      sum += washTexel.rgb * sky;
      skyCount += sky;
    }
  }
  return vec4<f32>(sum / max(skyCount, 1.0), select(-1.0, 1.0, skyCount > 0.0));
}
