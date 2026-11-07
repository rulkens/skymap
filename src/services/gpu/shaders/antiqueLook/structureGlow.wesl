// antiqueLook/structureGlow.wesl — the structure markers' own low band at 1/16
// of the print: the box mean of their half-res row (ANTIQUE_MOVED_PASSES) over
// sixteen bilinear taps. The plate draws Dutch outline colour from it, so a
// cluster's or void's disc is never engraved as a galaxy.
// rgb: premultiplied colour; a: coverage, exposure-free (the halos' alpha).

import package::antiqueLook::io::VSOut;

@group(0) @binding(0) var structuresTex: texture_2d<f32>;
@group(0) @binding(1) var linear: sampler;

// Row texels per output texel along each axis: ANTIQUE_CELL * 4 / ANTIQUE_STRUCTURE_CELL.
const BLOCK: f32 = 8.0;

// A marker ring is line work, not light: at most 3.5 texels across (ring.wesl's
// band plus its AA), so a min over this reach either side erodes it away while
// a halo, hundreds of texels wide, barely shrinks. Its staircase had drawn
// ragged outlines where the halos' are round.
const RING_REACH: f32 = 3.0;

fn eroded(at: vec2<f32>, texel: vec2<f32>) -> vec4<f32> {
  var v = textureSampleLevel(structuresTex, linear, at, 0.0);
  for (var k = 0; k < 4; k++) {
    let a = f32(k) * 1.5707963;
    v = min(v, textureSampleLevel(structuresTex, linear, at + vec2<f32>(cos(a), sin(a)) * texel * RING_REACH, 0.0));
  }
  return v;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let texel = 1.0 / vec2<f32>(textureDimensions(structuresTex));
  // Each tap sits between four texels, so 4×4 taps cover the BLOCK×BLOCK block.
  let origin = floor(in.pos.xy) * BLOCK;
  var sum = vec4<f32>(0.0);
  for (var j = 0; j < 4; j++) {
    for (var i = 0; i < 4; i++) {
      sum += eroded((origin + (vec2<f32>(f32(i), f32(j)) + 0.5) * BLOCK / 4.0) * texel, texel);
    }
  }
  return sum / 16.0;
}
