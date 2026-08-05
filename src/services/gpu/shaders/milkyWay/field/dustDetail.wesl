// milkyWay/field/dustDetail.wesl — S4's high-pass term (docs/research/
// m74-jwst/07-sprite-seeding.md): the SF map's own density over an
// 8-texel-blurred copy, sampled at a ray's disc-plane hit. One term shared
// by BOTH the JWST presentation (dustPresent.wesl) and the normal view's
// dust attenuation (splat.wesl), so the two consumers can never disagree
// about what the map adds beyond the splats' own low/mid frequencies.
// Thin-disc approximation: the column is 3D but this samples the map at
// essentially one (r, theta) — the ray's y=0 intersection.

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

// Binding numbers: 0/1/2/6 are io.wesl's own lanes, referenced by
// splat.wesl (u/comps/dustMapTex/dustMapSmp); 4/5 are the dust-noise volume
// (dustNoiseTex/Smp), referenced only by dustMap.wesl. 3/7/8/9 are free in
// EVERY shader that links this module — both splat.wesl and
// dustPresent.wesl — which is the only constraint that mattered picking
// them.
@group(0) @binding(3) var<uniform> grid: SfMapGrid;
@group(0) @binding(7) var sfMapSmp: sampler;
@group(0) @binding(8) var sfMapTex: texture_2d<f32>;
@group(0) @binding(9) var sfMapBlurTex: texture_2d<f32>;

// o/d: the ray's world-space origin/direction, already reconstructed by the
// caller (both consumers need their own ray for other work too), so this
// stays a pure function over geometry rather than re-deriving a ray from a
// screen uv itself.
fn dustDetailMultiplier(o: vec3<f32>, d: vec3<f32>) -> f32 {
  if (u.dustDetail.x <= 0.0) {
    return 1.0;
  }
  if (abs(d.y) < 1e-6) {
    return 1.0;
  }
  let t = -o.y / d.y;
  if (t <= 0.0) {
    return 1.0;
  }
  let hit = o + d * t;
  let r = length(hit.xz);
  if (r < grid.rMin || r > grid.rMax) {
    return 1.0;
  }
  let theta = atan2(hit.z, hit.x);
  let ringT = log(r / grid.rMin) / log(grid.rMax / grid.rMin);
  let azT = theta / (2.0 * PI) + select(0.0, 1.0, theta < 0.0);
  let uv = vec2<f32>(azT, ringT);
  // sfMapDustDensity's gas x oldActivity (src/utils/galaxy/sfMapDustDensity.ts)
  // — the density the splats were SEEDED from, so the ratio below is
  // structure the splats should carry but blurred away.
  let mapTexel = textureSampleLevel(sfMapTex, sfMapSmp, uv, 0.0);
  let density = mapTexel.x * mapTexel.z;
  let densityBlur = textureSampleLevel(sfMapBlurTex, sfMapSmp, uv, 0.0).x;
  let detail = (density + DETAIL_EPS) / (densityBlur + DETAIL_EPS);
  return clamp(1.0 + u.dustDetail.x * (detail - 1.0), 0.0, DETAIL_MAX);
}
