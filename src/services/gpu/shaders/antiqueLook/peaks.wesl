// antiqueLook/peaks.wesl — non-maximum suppression over the quarter-res peaks:
// a cell keeps its star only if no neighbour's is brighter, and its strength is
// the peak's CONTRAST over the surrounding mean, so a star stands out of a glow
// while the glow itself (the low band) never stamps a glyph.

import package::antiqueLook::io::AntiqueUniforms;
import package::antiqueLook::io::VSOut;

@group(0) @binding(0) var peakTex: texture_2d<f32>;
@group(0) @binding(1) var<uniform> u: AntiqueUniforms;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let c = vec2<i32>(in.pos.xy);
  let size = vec2<i32>(textureDimensions(peakTex));
  let mine = textureLoad(peakTex, c, 0);
  // The neighbourhood spans the same PRINT area at any DPR, so a retina plate
  // carries the same stars as a 1× one rather than four times as many.
  let reach = max(1, i32(round(u.unit)));
  var mean = 0.0;
  var n = 0.0;
  for (var j = -reach; j <= reach; j++) {
    for (var i = -reach; i <= reach; i++) {
      let q = clamp(c + vec2<i32>(i, j), vec2<i32>(0), size - 1);
      let other = textureLoad(peakTex, q, 0);
      mean += other.w;
      n += 1.0;
      // Ties break by cell order so two equal peaks never both survive.
      let ahead = (j > 0) || (j == 0 && i > 0);
      if (other.z > mine.z || (other.z == mine.z && ahead && (i != 0 || j != 0))) {
        return vec4<f32>(0.0);
      }
    }
  }
  // w: the block's mean light. A star's core saturates in the tone-map, so its
  // brightness survives as the AREA it lights, which the block mean measures.
  return vec4<f32>(mine.xy, max(mine.z - mean / n, 0.0), mine.w);
}
