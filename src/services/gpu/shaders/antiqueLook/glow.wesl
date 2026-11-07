// antiqueLook/glow.wesl — the low band one level further down: each texel the
// mean of a 4×4 block of `wash` (1/16 of the print). At this scale a star is a
// rounding error and only true extended light — nebulae, the Milky Way,
// structure discs, dense galaxy fields — survives to drive stipple and contours.
// Alpha: how coherent the block's isophotes are, 0..1 (see `fs`).

import package::antiqueLook::io::VSOut;
import package::antiqueLook::pigments::luma;

@group(0) @binding(0) var washTex: texture_2d<f32>;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let origin = vec2<i32>(in.pos.xy) * 4;
  let size = vec2<i32>(textureDimensions(washTex));
  // Sky cells only (wash.a < 0): a lit globe's light must not spill into the
  // sky's outline colour round its limb. The block plus a one-cell rim, the
  // rim only for the gradients below.
  var logL: array<f32, 36>;
  var sum = vec3<f32>(0.0);
  var n = 0.0;
  for (var j = 0; j < 6; j++) {
    for (var i = 0; i < 6; i++) {
      let w = textureLoad(washTex, clamp(origin + vec2<i32>(i - 1, j - 1), vec2<i32>(0), size - 1), 0);
      let sky = select(1.0, 0.0, w.a >= 0.0);
      logL[j * 6 + i] = log(luma(w.rgb) * sky + 0.02);
      let inner = i >= 1 && i <= 4 && j >= 1 && j <= 4;
      sum += w.rgb * sky * f32(inner);
      n += sky * f32(inner);
    }
  }
  // Coherence of the log-light gradients over the block (structure tensor,
  // (λ1 − λ2) / (λ1 + λ2)): a galaxy's isophotes run one way locally, a star
  // field's speckle every way. The plate draws iso-lines only where it is high.
  var jxx = 0.0;
  var jyy = 0.0;
  var jxy = 0.0;
  for (var j = 1; j <= 4; j++) {
    for (var i = 1; i <= 4; i++) {
      let gx = 0.5 * (logL[j * 6 + i + 1] - logL[j * 6 + i - 1]);
      let gy = 0.5 * (logL[(j + 1) * 6 + i] - logL[(j - 1) * 6 + i]);
      jxx += gx * gx;
      jyy += gy * gy;
      jxy += gx * gy;
    }
  }
  let coherence = sqrt((jxx - jyy) * (jxx - jyy) + 4.0 * jxy * jxy) / max(jxx + jyy, 1e-9);
  return vec4<f32>(sum / max(n, 1.0), coherence);
}
