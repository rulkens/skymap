// antiqueLook/reduce.wesl — one quarter-res cell per 4×4 block of the print.
// Splits the frame by frequency: `wash` carries the block's mean colour (the
// low band — glows become watercolour, never ink) and, in alpha, how much of
// the block is land on a body; `peak` carries the block's brightest sky texel
// (device px position, luminance) for the star-glyph gather.

import package::antiqueLook::io::VSOut;
import package::antiqueLook::pigments::luma;

@group(0) @binding(0) var printTex: texture_2d<f32>;
@group(0) @binding(1) var bodyTex: texture_2d<f32>;

struct ReduceOut {
  @location(0) wash: vec4<f32>,
  @location(1) peak: vec4<f32>,
}

const CELL: i32 = 4;

// Oceans read blue-dominant on every body texture we draw; Earth is the case that matters.
fn landness(c: vec3<f32>) -> f32 {
  return 1.0 - smoothstep(0.06, 0.22, (c.b - max(c.r, c.g * 0.92)) / max(c.b, 0.04));
}

@fragment
fn fs(in: VSOut) -> ReduceOut {
  let origin = vec2<i32>(in.pos.xy) * CELL;
  let size = vec2<i32>(textureDimensions(printTex));
  // A frame without bodies binds a 1×1 empty texture here, hence its own clamp.
  let bodySize = vec2<i32>(textureDimensions(bodyTex));
  var sum = vec3<f32>(0.0);
  var land = 0.0;
  var bodyCount = 0.0;
  var best = -1.0;
  var bestAt = vec2<f32>(0.0);
  for (var j = 0; j < CELL; j++) {
    for (var i = 0; i < CELL; i++) {
      let q = min(origin + vec2<i32>(i, j), size - 1);
      let c = textureLoad(printTex, q, 0).rgb;
      let body = textureLoad(bodyTex, min(q, bodySize - 1), 0).a;
      sum += c;
      land += body * landness(c);
      bodyCount += body;
      let l = luma(c) * (1.0 - body);
      if (l > best) {
        best = l;
        bestAt = vec2<f32>(q) + 0.5;
      }
    }
  }
  let n = f32(CELL * CELL);
  var o: ReduceOut;
  // Sky blocks report land −1 so the waterlines stop at the limb, not mid-space.
  o.wash = vec4<f32>(sum / n, select(-1.0, land / max(bodyCount, 1e-3), bodyCount > 8.0));
  o.peak = vec4<f32>(bestAt, best, luma(sum / n));
  return o;
}
