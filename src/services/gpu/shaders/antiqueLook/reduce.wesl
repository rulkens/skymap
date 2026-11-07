// antiqueLook/reduce.wesl — one quarter-res cell per 4×4 block of the print.
// `wash` carries the block's mean colour (the low band: glows become
// watercolour, never ink) and, in alpha, the block's land: −1 sky, 0..1 the land
// share where a land map covers the body, LAND_UNMAPPED on a body without one
// (its rim haze, a body with no map), which every land reader weighs as nothing.
// Stars are not read from here: their glyphs come from the catalogue.

import package::antiqueLook::io::AntiqueUniforms;
import package::antiqueLook::io::VSOut;
import package::antiqueLook::cover::coverOf;
import package::antiqueLook::engraving::LAND_UNMAPPED;
import package::antiqueLook::pigments::luma;

@group(0) @binding(0) var printTex: texture_2d<f32>;
// foreground:0's colour or depth (`cover.wesl`), or a 1×1 empty texture.
@group(0) @binding(1) var bodyTex: texture_2d<f32>;
// The land map (r land share, g covered: Earth's oceans, Mars's dark albedo),
// or a 1×1 empty texture.
@group(0) @binding(2) var landTex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> u: AntiqueUniforms;

const CELL: i32 = 4;
// How far over its dimmest texel a sky block's mean may sit. At 1.5 foreground
// stars leaked into a bright disc and grew iso-line bubbles; at 1.15 arms join up.
const FLOOR_K: f32 = 1.15;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let origin = vec2<i32>(in.pos.xy) * CELL;
  let size = vec2<i32>(textureDimensions(printTex));
  // A frame without bodies binds a 1×1 empty texture here, hence its own clamp.
  let bodySize = vec2<i32>(textureDimensions(bodyTex));
  let landSize = vec2<i32>(textureDimensions(landTex));
  var bodySum = vec3<f32>(0.0);
  var skySum = vec3<f32>(0.0);
  var skyDimmest = 1e9;
  var land = 0.0;
  var mappedCount = 0.0;
  var bodyCount = 0.0;
  for (var j = 0; j < CELL; j++) {
    for (var i = 0; i < CELL; i++) {
      let q = min(origin + vec2<i32>(i, j), size - 1);
      let c = textureLoad(printTex, q, 0).rgb;
      let body = coverOf(textureLoad(bodyTex, min(q, bodySize - 1), 0), u.flags);
      bodySum += c * body;
      skySum += c * (1.0 - body);
      if (body < 0.5) {
        skyDimmest = min(skyDimmest, luma(c));
      }
      let mapped = textureLoad(landTex, min(q, landSize - 1), 0).rg;
      let weight = body * step(0.5, mapped.g);
      land += weight * mapped.r;
      mappedCount += weight;
      bodyCount += body;
    }
  }
  let n = f32(CELL * CELL);
  // The sky's low band keeps only light that fills the block: its mean is held
  // to a little over its dimmest texel. A star (a point in dark sky) drops out,
  // since it belongs to the glyphs, while an extended glow keeps its full
  // brightness: a per-texel cap had flattened a galaxy's arms and gaps alike.
  let skyCount = max(n - bodyCount, 0.0);
  var skyMean = skySum / max(skyCount, 1.0);
  let floorL = select(0.0, skyDimmest * FLOOR_K + 0.01, skyCount > 0.0);
  skyMean *= min(1.0, floorL / max(luma(skyMean), 1e-4));
  let sum = bodySum + skyMean * skyCount;
  // Sky blocks report land −1 so the coast halo stops at the limb, not mid-space.
  let share = select(LAND_UNMAPPED, land / max(mappedCount, 1e-3), mappedCount > 8.0);
  return vec4<f32>(sum / n, select(-1.0, share, bodyCount > 8.0));
}
