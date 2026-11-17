// antiqueLook/passes/structureGlowFragment.wesl — the structure markers' own low band at 1/16
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

fn eroded(sampleUv: vec2<f32>, texel: vec2<f32>) -> vec4<f32> {
  var lowest = textureSampleLevel(structuresTex, linear, sampleUv, 0.0);
  for (var tapIndex = 0; tapIndex < 4; tapIndex++) {
    let angle = f32(tapIndex) * 1.5707963;
    lowest = min(lowest, textureSampleLevel(structuresTex, linear, sampleUv + vec2<f32>(cos(angle), sin(angle)) * texel * RING_REACH, 0.0));
  }
  return lowest;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let texel = 1.0 / vec2<f32>(textureDimensions(structuresTex));
  // Each tap sits between four texels, so 4×4 taps cover the BLOCK×BLOCK block.
  let origin = floor(in.pos.xy) * BLOCK;
  var sum = vec4<f32>(0.0);
  for (var tapY = 0; tapY < 4; tapY++) {
    for (var tapX = 0; tapX < 4; tapX++) {
      sum += eroded((origin + (vec2<f32>(f32(tapX), f32(tapY)) + 0.5) * BLOCK / 4.0) * texel, texel);
    }
  }
  return sum / 16.0;
}
