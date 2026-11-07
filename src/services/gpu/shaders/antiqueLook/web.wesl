// antiqueLook/web.wesl — the cosmic web charted as a sea, from the density raymarch's
// own 1/3-res row (its upsample never reaches the print, so the galaxy engraving
// never inks it): isobaths, the outermost dotted as a shoal's edge, walls stippled
// by density, voids bare paper. Max-blended into `antique-star-ink`'s spare b and a,
// beside the star glyphs: b web ink, a how much of a galaxy the void lifts. Drawn
// only in the cosmos with the density live (`u.rayTL.w`).

import package::antiqueLook::io::AntiqueUniforms;
import package::antiqueLook::io::VSOut;
import package::antiqueLook::engraving::stipple;
import package::antiqueLook::engraving::scatter;
import package::antiqueLook::pigments::luma;

@group(0) @binding(0) var webTex: texture_2d<f32>;
@group(0) @binding(1) var linear: sampler;
@group(0) @binding(2) var<uniform> u: AntiqueUniforms;

// One isobath per doubling of the row's linear luma over WEB_BASE, WEB_LEVELS of them.
// WEB_BASE leaves about half a web view (web-laniakea, web-pp) bare, as the prototype's
// median did; WEB_BLUR spaces a 3×3 tent to σ ≈ 9 units.
const WEB_BASE: f32 = 0.033;
const WEB_FLOOR: f32 = 0.004;
const WEB_LEVELS: f32 = 5.0;
const WEB_BLUR: f32 = 12.0;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let p = in.pos.xy / u.unit;
  let s = WEB_BLUR * u.unit / u.res;
  var sum = 0.0;
  for (var k = 0; k < 9; k++) {
    let o = vec2<f32>(f32(k % 3 - 1), f32(k / 3 - 1));
    sum += luma(textureSampleLevel(webTex, linear, in.uv + o * s, 0.0).rgb) * (2.0 - abs(o.x)) * (2.0 - abs(o.y));
  }
  let q = log2((sum / 16.0 + WEB_FLOOR) / WEB_BASE);
  let level = round(q);
  let w = 0.3 * u.unit;
  let line = (1.0 - smoothstep(w, w + 1.0, abs(q - level) / max(fwidth(q), 1e-4)))
    * step(-0.5, q) * step(level, WEB_LEVELS);
  let isobath = line * select(0.6, 0.8 * stipple(p, 2.4, 0.85), level < 0.5);
  let wall = scatter(p, 3.2, 0.5 * smoothstep(0.0, 2.5, q) * (1.0 - smoothstep(2.5, 4.0, q)), 0.5) * 0.7;
  let weight = u.rayTL.w;
  return vec4<f32>(0.0, 0.0, max(isobath, wall) * weight, (1.0 - smoothstep(-1.0, 0.6, q)) * weight);
}
