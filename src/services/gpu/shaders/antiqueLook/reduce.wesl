// antiqueLook/reduce.wesl — one quarter-res cell per 4×4 block of the print.
// `wash` carries the block's mean colour (the low band: glows become
// watercolour, never ink) and, in alpha, how much of the block is land on a
// body. Stars are not read from here: their glyphs come from the catalogue
// (printPoint.wesl).

import package::antiqueLook::io::VSOut;
import package::antiqueLook::pigments::luma;

@group(0) @binding(0) var printTex: texture_2d<f32>;
@group(0) @binding(1) var bodyTex: texture_2d<f32>;
// Earth's land map (r land share, g covered), or a 1×1 empty texture.
@group(0) @binding(2) var landTex: texture_2d<f32>;

const CELL: i32 = 4;
// How far over its dimmest texel a sky block's mean may sit. At 1.5 foreground
// stars leaked into a bright disc and grew iso-line bubbles; at 1.15 arms join up.
const FLOOR_K: f32 = 1.15;

// Where no land map covers (bodies other than Earth), land is guessed from
// colour: oceans read blue-dominant on every body texture we draw.
fn landness(c: vec3<f32>) -> f32 {
  return 1.0 - smoothstep(0.06, 0.22, (c.b - max(c.r, c.g * 0.92)) / max(c.b, 0.04));
}

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
  var bodyCount = 0.0;
  for (var j = 0; j < CELL; j++) {
    for (var i = 0; i < CELL; i++) {
      let q = min(origin + vec2<i32>(i, j), size - 1);
      let c = textureLoad(printTex, q, 0).rgb;
      let body = textureLoad(bodyTex, min(q, bodySize - 1), 0).a;
      bodySum += c * body;
      skySum += c * (1.0 - body);
      if (body < 0.5) {
        skyDimmest = min(skyDimmest, luma(c));
      }
      let mapped = textureLoad(landTex, min(q, landSize - 1), 0).rg;
      land += body * select(landness(c), mapped.r, mapped.g > 0.5);
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
  // Sky blocks report land −1 so the coast halo stop at the limb, not mid-space.
  return vec4<f32>(sum / n, select(-1.0, land / max(bodyCount, 1e-3), bodyCount > 8.0));
}
