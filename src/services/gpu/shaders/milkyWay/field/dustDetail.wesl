// milkyWay/field/dustDetail.wesl — S4's high-pass term (docs/research/
// m74-jwst/07-sprite-seeding.md): the SF map's own density over an
// 8-texel-blurred copy. Applied at ACCUMULATION (dustMap.wesl's fs), per
// splat fragment, at that splat's own closest-approach point — so the
// pattern parallaxes with the splats instead of stamping one flat decal
// across the whole depth column (the earlier per-consumer, ray-hit version
// did exactly that, and read as 2D). Both consumers inherit the modulated
// column for free.

import package::milkyWay::field::io::u;

const PI: f32 = 3.14159265358979;
// Absolute density floor: where both terms sit under it (quiet disc, cleared
// map) the ratio degrades to 1 = no information, and it also keeps a
// cleared/disabled map from dividing by zero. Slightly above the CPU
// seeding survival floor 0.01 (sampleSfMapDustCdf.ts).
const DETAIL_EPS: f32 = 0.02;
// One hot texel over a dead 8x8 block ratios near 30; uncapped that turns a
// texel into a beacon rather than texture.
const DETAIL_MAX: f32 = 8.0;

// rMin/rMax: same grid sfMapPresent.wesl's fs resolves through — written once
// per rebuildSfMap, not every frame like io.wesl's 'u'.
struct SfMapGrid {
  rMin: f32,
  rMax: f32,
}

// Binding numbers: dustMap.wesl's own closure is io's 0/1 (u/comps), its
// dust-noise volume 4/5, and these four — collision-free there, which is the
// only constraint that mattered picking them.
@group(0) @binding(3) var<uniform> grid: SfMapGrid;
@group(0) @binding(7) var sfMapSmp: sampler;
@group(0) @binding(8) var sfMapTex: texture_2d<f32>;
@group(0) @binding(9) var sfMapBlurTex: texture_2d<f32>;

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
  let r = length(p.xz);
  if (r < grid.rMin || r > grid.rMax) {
    return 1.0;
  }
  let theta = atan2(p.z, p.x);
  let ringT = log(r / grid.rMin) / log(grid.rMax / grid.rMin);
  let azT = theta / (2.0 * PI) + select(0.0, 1.0, theta < 0.0);
  let uv = vec2<f32>(azT, ringT);
  // The density the splats were SEEDED from, so the ratio below is structure
  // the splats should carry but blurred away — u.dustDetail.w blends the same
  // legacy/swept pair the CPU seeding and sfMapDustBlur.wesl blend, and needs
  // no mean-normalization here since a RATIO of two mixes is scale-invariant.
  let mapTexel = textureSampleLevel(sfMapTex, sfMapSmp, uv, 0.0);
  let density = mix(mapTexel.x * mapTexel.z, mapTexel.w, u.dustDetail.w);
  let densityBlur = textureSampleLevel(sfMapBlurTex, sfMapSmp, uv, 0.0).x;
  let detail = (density + DETAIL_EPS) / (densityBlur + DETAIL_EPS);
  return clamp(1.0 + u.dustDetail.x * (detail - 1.0) * breakup, 0.0, DETAIL_MAX);
}
