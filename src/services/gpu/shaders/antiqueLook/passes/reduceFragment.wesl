// antiqueLook/passes/reduceFragment.wesl — one quarter-res cell per 4×4 block of the print.
// `wash` carries the block's mean colour (the low band: glows become
// watercolour, never ink) and, in alpha, the block's land: −1 sky, 0..1 the land
// share where a land map covers the body, LAND_UNMAPPED on a body without one
// (its rim haze, a body with no map), which every land reader weighs as nothing.
// Stars are not read from here: their glyphs come from the catalogue.

import package::antiqueLook::io::VSOut;
import package::antiqueLook::shared::engraving::LAND_UNMAPPED;
import package::antiqueLook::shared::pigments::luma;

@group(0) @binding(0) var printTex: texture_2d<f32>;
// The look's `mask` layer (`mask.wesl`): r body cover, gb the land map.
@group(0) @binding(1) var maskTex: texture_2d<f32>;

const CELL: i32 = 4;
// How far over its dimmest texel a sky block's mean may sit: none, so a dense
// field's points never leak into a galaxy's light (at 1.15 they wobbled its
// iso-lines into fingerprints on M87; at 1.5 they grew bubbles on bright discs).
const FLOOR_K: f32 = 1.0;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let origin = vec2<i32>(in.pos.xy) * CELL;
  let size = vec2<i32>(textureDimensions(printTex));
  var bodySum = vec3<f32>(0.0);
  var skySum = vec3<f32>(0.0);
  var skyDimmest = 1e9;
  var land = 0.0;
  var mappedCount = 0.0;
  var bodyCount = 0.0;
  for (var blockY = 0; blockY < CELL; blockY++) {
    for (var blockX = 0; blockX < CELL; blockX++) {
      let texelPos = min(origin + vec2<i32>(blockX, blockY), size - 1);
      let printColor = textureLoad(printTex, texelPos, 0).rgb;
      let mask = textureLoad(maskTex, texelPos, 0);
      let body = mask.r;
      bodySum += printColor * body;
      skySum += printColor * (1.0 - body);
      if (body < 0.5) {
        skyDimmest = min(skyDimmest, luma(printColor));
      }
      let weight = body * step(0.5, mask.b);
      land += weight * mask.g;
      mappedCount += weight;
      bodyCount += body;
    }
  }
  let blockTexels = f32(CELL * CELL);
  // The sky's low band keeps only light that fills the block: its mean is held
  // to a little over its dimmest texel. A star (a point in dark sky) drops out,
  // since it belongs to the glyphs, while an extended glow keeps its full
  // brightness: a per-texel cap had flattened a galaxy's arms and gaps alike.
  let skyCount = max(blockTexels - bodyCount, 0.0);
  var skyMean = skySum / max(skyCount, 1.0);
  let floorL = select(0.0, skyDimmest * FLOOR_K + 0.01, skyCount > 0.0);
  skyMean *= min(1.0, floorL / max(luma(skyMean), 1e-4));
  let sum = bodySum + skyMean * skyCount;
  // Sky blocks report land −1 so the coast halo stops at the limb, not mid-space.
  let share = select(LAND_UNMAPPED, land / max(mappedCount, 1e-3), mappedCount > 8.0);
  return vec4<f32>(sum / blockTexels, select(-1.0, share, bodyCount > 8.0));
}
