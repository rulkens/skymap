// antiqueLook/printPoint.wesl — the 'antique-print-points' encoding: every Layer
// stage that prints a point writes it through printPoint, and glyphs.wesl reads
// it. One texel per ANTIQUE_PRINT_CELL_UNITS print units holds one point: xy its
// NDC (exact, so a glyph centres on its star rather than on its cell); a glyph
// star's z its apparent magnitude, w 1; a dot's (a galaxy, a faint star) z its
// weight, w 2. Depth ranks brightness, so the brightest point in a cell wins it.
// Galaxies print first, in COSMO's forward Z (cleared to 1, 'less'); the stars
// then clear depth for their own reversed Z (to 0, 'greater'), so any star
// overwrites a galaxy in its cell.

import package::lib::starPhotometry::D_REF_MPC;
import package::lib::starPhotometry::MIN_D2_MPC2;

// The naked-eye limit: a fainter star prints as a dot, as a galaxy does (w 2,
// its weight falling to 0 at PRINT_DOT_LIMIT), so a dense field still stipples
// its band; past PRINT_DOT_LIMIT nothing prints.
const PRINT_MAG_LIMIT: f32 = 5.75;
const PRINT_DOT_LIMIT: f32 = 7.5;
// A point fading in or out prints only past half its fade, so a glyph never
// stands on a star the frame barely draws.
const PRINT_MIN_OPACITY: f32 = 0.5;
const LOG10_2: f32 = 0.30103;

struct PrintPointOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) @interpolate(flat) point: vec4<f32>,
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
  if (mag > PRINT_DOT_LIMIT || opacity < PRINT_MIN_OPACITY || clip.w <= 0.0) {
    return printPointNone();
  }
  // 1 at m = -2, falling to 0 at m = 14; anything brighter (Venus, a far Sun) ties at 1.
  let depth = clamp(1.0 - (mag + 2.0) / 16.0, 0.0, 1.0);
  let faint = mag > PRINT_MAG_LIMIT;
  let weight = (PRINT_DOT_LIMIT - mag) / (PRINT_DOT_LIMIT - PRINT_MAG_LIMIT);
  var o: PrintPointOut;
  o.pos = vec4<f32>(clip.xy, depth * clip.w, clip.w);
  o.point = vec4<f32>(clip.xy / clip.w, select(mag, weight, faint), select(1.0, 2.0, faint));
  return o;
}

// A galaxy point's dot weight (0..1) from the intensity the plain frame draws it
// at: one decade of intensity over GALAXY_DECADES, from the faintest that prints.
const GALAXY_PRINT_FLOOR: f32 = 0.15;
const GALAXY_DECADES: f32 = 2.0;

fn galaxyDotWeight(intensity: f32) -> f32 {
  return clamp(log2(intensity / GALAXY_PRINT_FLOOR) * LOG10_2 / GALAXY_DECADES, 0.0, 1.0);
}

// A galaxy's point: z its dot weight, w 2 (a star's is 1), the brightest per cell kept.
fn printGalaxyPoint(clip: vec4<f32>, intensity: f32) -> PrintPointOut {
  if (intensity < GALAXY_PRINT_FLOOR || clip.w <= 0.0) {
    return printPointNone();
  }
  let weight = galaxyDotWeight(intensity);
  var o: PrintPointOut;
  o.pos = vec4<f32>(clip.xy, (0.99 - 0.98 * weight) * clip.w, clip.w);
  o.point = vec4<f32>(clip.xy / clip.w, weight, 2.0);
  return o;
}

@fragment
fn fs(in: PrintPointOut) -> @location(0) vec4<f32> {
  return in.point;
}
