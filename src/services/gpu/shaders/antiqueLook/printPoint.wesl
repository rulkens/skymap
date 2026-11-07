// antiqueLook/printPoint.wesl — the 'antique-print-points' encoding: every Layer
// stage that prints a point writes it through printPoint, and glyphs.wesl reads
// it. One texel per ANTIQUE_PRINT_CELL_UNITS print units holds one point: xy its
// NDC (exact, so a glyph centres on its star rather than on its cell), z its
// apparent magnitude, w 1. Depth falls with magnitude under reversed-Z (row
// cleared to 0, compare 'greater'), so the brightest point in a cell wins it.

import package::lib::starPhotometry::D_REF_MPC;
import package::lib::starPhotometry::MIN_D2_MPC2;

// The naked-eye limit: a fainter point never prints.
const PRINT_MAG_LIMIT: f32 = 5.75;
// A point fading in or out prints only past half its fade, so a glyph never
// stands on a star the frame barely draws.
const PRINT_MIN_OPACITY: f32 = 0.5;
const LOG10_2: f32 = 0.30103;

struct PrintPointOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) @interpolate(flat) point: vec3<f32>,
}

// m = M + 5 log10(d / 10 pc), from the squared distance in Mpc (10 pc = D_REF_MPC).
fn apparentMagnitude(absMag: f32, d2Mpc2: f32) -> f32 {
  let ratio = max(d2Mpc2, MIN_D2_MPC2) / (D_REF_MPC * D_REF_MPC);
  return absMag + 2.5 * LOG10_2 * log2(ratio);
}

fn printPointNone() -> PrintPointOut {
  var o: PrintPointOut;
  o.pos = vec4<f32>(2.0, 2.0, 2.0, 1.0);
  return o;
}

fn printPoint(clip: vec4<f32>, mag: f32, opacity: f32) -> PrintPointOut {
  if (mag > PRINT_MAG_LIMIT || opacity < PRINT_MIN_OPACITY || clip.w <= 0.0) {
    return printPointNone();
  }
  // 1 at m = -2, falling to 0 at m = 14; anything brighter (Venus, a far Sun) ties at 1.
  let depth = clamp(1.0 - (mag + 2.0) / 16.0, 0.0, 1.0);
  var o: PrintPointOut;
  o.pos = vec4<f32>(clip.xy, depth * clip.w, clip.w);
  o.point = vec3<f32>(clip.xy / clip.w, mag);
  return o;
}

@fragment
fn fs(in: PrintPointOut) -> @location(0) vec4<f32> {
  return vec4<f32>(in.point, 1.0);
}
