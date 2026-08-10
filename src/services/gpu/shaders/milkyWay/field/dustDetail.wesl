// milkyWay/field/dustDetail.wesl — S4's high-pass term (docs/research/
// m74-jwst/07-sprite-seeding.md): the ISM map's own density over an
// 8-texel-blurred copy, read from ismMapCartesianBake.wesl's one-shot
// world-xz re-bake via one affine UV and one fetch, rather than deriving
// the log-polar lookup (length+atan2+log, two fetches) per fragment.
// Applied at ACCUMULATION (dustMap.wesl's fs), per splat fragment, at that
// splat's own closest-approach point — so the pattern parallaxes with the
// splats instead of stamping one flat decal across the whole depth column.

import package::milkyWay::field::io::u;

// One hot texel over a dead 8x8 block ratios near 30; uncapped that turns a
// texel into a beacon rather than texture. The ratio ITSELF (density over
// blurred density) is now computed once by the bake, not here — only the
// strength/breakup shaping and this ceiling remain a per-fragment cost.
const DETAIL_MAX: f32 = 8.0;

// rMax: the same grid ismMapCartesianBake.wesl resolves world xz through —
// the one scalar the affine UV below needs. rMin stays in the struct only to
// match gridUbo's byte layout (written once per rebuildIsmMap, not read here).
struct IsmMapGrid {
  rMin: f32,
  rMax: f32,
}

// Binding numbers: dustMap.wesl's own closure is io's 0/1 (u/comps), its
// dust-noise volume 4/5, and these three — collision-free there, which is
// the only constraint that mattered picking them. Binding 9 (a packed map's
// blur divisor) is absent: the bake consumes it upstream, so no render
// pipeline needs it.
@group(0) @binding(3) var<uniform> grid: IsmMapGrid;
@group(0) @binding(7) var ismCartesianSmp: sampler;
@group(0) @binding(8) var ismCartesianTex: texture_2d<f32>;

// World xz -> the cartesian bake's own affine UV (ismMapCartesianBake.wesl's
// dst texel centers are laid out the same way, in reverse) — ONE home for
// the transform since two consumers (this file's own dustDetailMultiplier
// and hiiSplat/youngFragment.wesl's young-stars read) both need it.
fn ismCartesianUv(p: vec3<f32>) -> vec2<f32> {
  return p.xz / (2.0 * grid.rMax) + vec2<f32>(0.5, 0.5);
}

// p: the world-space point to sample at — the caller's splat's own
// closest-approach point (o + d*tPeak in dustMap.wesl's fs), not a
// re-derived ray/plane hit, so detail rides each component's own depth
// instead of one shared disc-plane intersection.
// breakup: a mean-1 vertical decorrelation weight supplied by the caller —
// the map is 2D, so an unweighted multiplier extrudes its texel contrast
// into vertical curtains through a 3D cloud; scaling the DEVIATION by a
// mean-1 field preserves the column ratio in expectation while breaking the
// vertical coherence. Callers with no noise in reach pass 1.0.
fn dustDetailMultiplier(p: vec3<f32>, breakup: f32) -> f32 {
  if (u.dustDetail.x <= 0.0) {
    return 1.0;
  }
  // No in-range test: the bake fills every texel outside the disc with a
  // neutral R=1 (ismMapCartesianBake.wesl), and ismCartesianSmp's
  // clamp-to-edge addressing sends any p past the square itself to that
  // same neutral border — both paths land on a no-op detail ratio, same as
  // the old ismMapUv guard's 1.0 fallback.
  let uv = ismCartesianUv(p);
  let detail = textureSampleLevel(ismCartesianTex, ismCartesianSmp, uv, 0.0).r;
  return clamp(1.0 + u.dustDetail.x * (detail - 1.0) * breakup, 0.0, DETAIL_MAX);
}
