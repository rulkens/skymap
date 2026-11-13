// antiqueLook/passes/webFragment.wesl — the cosmic web charted as a sea, from the density raymarch's
// own 1/3-res row (its upsample never reaches the print, so the galaxy engraving
// never inks it): isobaths, the outermost dotted as a shoal's edge, walls stippled
// by density, voids bare paper, the Zone of Avoidance ruled. `fs` max-blends its ink into
// `antique-star-ink`'s spare b, beside the star glyphs; `fsLevel` writes the 1/16 `webLevel`
// layer (r the level, g where it is charted), from which the plate and the field dots thin
// a void's galaxies. Drawn only in the cosmos with the density live (`u.rayTL.w`); the eye in rayTR..BR.w.

import package::antiqueLook::io::AntiqueUniforms;
import package::antiqueLook::io::VSOut;
import package::antiqueLook::shared::engraving::stipple;
import package::antiqueLook::shared::engraving::scatter;
import package::antiqueLook::shared::engraving::inkLine;
import package::lib::util::raySphere;
import package::lib::util::worldToGalactic;
import package::antiqueLook::shared::pigments::luma;
import package::antiqueLook::shared::paper::vnoise;
import package::lib::util::hash21Hq;

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
// The level of a density of 0, and just above it: outside the density cube's footprint
// (laniakea's south) the row is 0, which is uncharted, never a void.
const UNCHARTED = vec2<f32>(-2.95, -2.75);

// 2MRS saw no galaxies through the Galaxy's dust within ZOA_LAT_DEG of its plane
// (anticentre, bulge), so the density there is bare paper and would chart a void.
// Where most of a sight line inside the survey's reach runs through that wedge,
// the plate rules it as an unsurveyed strip instead.
const ZOA_LAT_DEG = vec2<f32>(5.0, 8.0);
const ZOA_REACH_MPC: f32 = 300.0;
const ZOA_STEPS: i32 = 12;
// Ruled by hand and lightest in the plate's line hierarchy (below the isobaths and
// filaments): its pitch wanders by ZOA_WANDER of a pitch along each line, its weight
// by line, so it reads as a light tint, never a machine screen.
const ZOA_RULE: f32 = 4.2;
const ZOA_WANDER: f32 = 0.3;
const ZOA_INK: f32 = 0.32;

// Share of the sight line within the survey's reach that lies in the dust wedge.
fn zoaShare(eye: vec3<f32>, ray: vec3<f32>) -> f32 {
  let hits = raySphere(eye, ray, vec3<f32>(0.0), ZOA_REACH_MPC);
  let t0 = max(hits.x, 0.0);
  if (hits.y <= t0) {
    return 0.0;
  }
  let dt = (hits.y - t0) / f32(ZOA_STEPS);
  var inside = 0.0;
  for (var i = 0; i < ZOA_STEPS; i++) {
    let g = worldToGalactic(eye + ray * (t0 + (f32(i) + 0.5) * dt));
    // g.x / |g.xy| is cos(l): the wedge widens toward the bulge.
    let limit = mix(ZOA_LAT_DEG.x, ZOA_LAT_DEG.y, 0.5 + 0.5 * g.x / max(length(g.xy), 1e-6));
    inside += step(abs(degrees(asin(clamp(g.z / max(length(g), 1e-6), -1.0, 1.0)))), limit);
  }
  return inside / f32(ZOA_STEPS);
}

// The density's isobath level at `uv`: doublings of its tent-blurred luma over WEB_BASE.
fn webLevel(uv: vec2<f32>) -> f32 {
  let s = WEB_BLUR * u.unit / u.res;
  var sum = 0.0;
  for (var k = 0; k < 9; k++) {
    let o = vec2<f32>(f32(k % 3 - 1), f32(k / 3 - 1));
    sum += luma(textureSampleLevel(webTex, linear, uv + o * s, 0.0).rgb) * (2.0 - abs(o.x)) * (2.0 - abs(o.y));
  }
  return log2((sum / 16.0 + WEB_FLOOR) / WEB_BASE);
}

@fragment
fn fsLevel(in: VSOut) -> @location(0) vec4<f32> {
  let q = webLevel(in.uv);
  return vec4<f32>(q, smoothstep(UNCHARTED.x, UNCHARTED.y, q) * u.rayTL.w, 0.0, 0.0);
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let p = in.pos.xy / u.unit;
  let q = webLevel(in.uv);
  let level = round(q);
  let w = 0.3 * u.unit;
  let line = (1.0 - smoothstep(w, w + 1.0, abs(q - level) / max(fwidth(q), 1e-4)))
    * step(-0.5, q) * step(level, WEB_LEVELS);
  let isobath = line * select(0.6, 0.8 * stipple(p, 2.4, 0.85), level < 0.5);
  let wall = scatter(p, 3.2, 0.5 * smoothstep(0.0, 2.5, q) * (1.0 - smoothstep(2.5, 4.0, q)), 0.5) * 0.7;
  let ray = normalize(mix(mix(u.rayTL.xyz, u.rayTR.xyz, in.uv.x), mix(u.rayBL.xyz, u.rayBR.xyz, in.uv.x), in.uv.y));
  let zoa = smoothstep(0.4, 0.7, zoaShare(vec3<f32>(u.rayTR.w, u.rayBL.w, u.rayBR.w), ray));
  let across = dot(p, vec2<f32>(0.7071, 0.7071)) / ZOA_RULE;
  let along = dot(p, vec2<f32>(-0.7071, 0.7071));
  let ruleIndex = floor(across + 0.5);
  let wander = ZOA_WANDER * (vnoise(vec2<f32>(along * 0.015, ruleIndex * 1.7)) - 0.5);
  let ruleWeight = 0.75 + 0.5 * hash21Hq(vec2<f32>(ruleIndex, 3.1));
  let rule = inkLine(abs(fract(across + wander) - 0.5) * ZOA_RULE, 0.45 * ruleWeight, 1.0 / u.unit) * ZOA_INK * zoa;
  let weight = u.rayTL.w;
  return vec4<f32>(0.0, 0.0, max(max(isobath, wall), rule) * weight, 0.0);
}
