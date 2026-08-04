// milkyWay/field/dustPresent.wesl — the "JWST" view mode: presents
// dustMap.wesl's screen-space column map through a hot MIRI-ish palette,
// crossfaded with the emission splat draw by render.dustViewIntensity
// (createGalaxyEngine.ts). Writes into dustViewTex, divisor-matched to
// dustMapTex, not fieldTex (io.wesl's DUST MAP doc).
//
// S4 (docs/research/m74-jwst/07-sprite-seeding.md): the presented column is
// further modulated by dustDetailMultiplier, a per-fragment high-pass read
// of the SF map at the ray's disc intersection — the top octave 40k dust
// splats cannot reconstruct from the map they were seeded from.

import package::lib::fullscreenTri::fullscreenVertex;
import package::lib::fullscreenTri::FullscreenOut;
import package::milkyWay::field::io::u;
import package::milkyWay::field::io::dustMapTex;

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

@group(0) @binding(1) var sfMapTex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> grid: SfMapGrid;
// Bindings 4/5/6 are skipped deliberately — io.wesl reserves them for the
// dust-noise volume (4/5) and dustMapSmp (6); this pass has no use for either.
@group(0) @binding(7) var sfMapSmp: sampler;
@group(0) @binding(8) var sfMapBlurTex: texture_2d<f32>;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> FullscreenOut {
  return fullscreenVertex(vi);
}

// The high-pass term: (map density) / (8-texel-blurred map density) at the
// fragment's own disc-plane hit — mirrors sfMapPresent.wesl's ray
// reconstruction and log-polar lookup exactly, since both resample the same
// grid. Thin-disc approximation (y=0), same simplification sfMapPresent
// already claims — the column is 3D but pierces the disc at essentially one
// (r, theta).
fn dustDetailMultiplier(input: FullscreenOut) -> f32 {
  if (u.dustDetail.x <= 0.0) {
    return 1.0;
  }
  let tanHalfFov = u.params.x;
  let aspect = u.params.y;
  let shift = u.params.z;
  let ndcX = input.uv.x * 2.0 - 1.0;
  let ndcY = 1.0 - input.uv.y * 2.0;
  let dir = normalize(
    u.camRight.xyz * ((ndcX + shift) * tanHalfFov * aspect)
      + u.camUp.xyz * (ndcY * tanHalfFov)
      + u.camFwd.xyz,
  );
  let o = u.eye.xyz;
  if (abs(dir.y) < 1e-6) {
    return 1.0;
  }
  let t = -o.y / dir.y;
  if (t <= 0.0) {
    return 1.0;
  }
  let hit = o + dir * t;
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

@fragment
fn fs(input: FullscreenOut) -> @location(0) vec4<f32> {
  // dustMapTex is divisor-matched to THIS pass's target (dustViewTex) by
  // construction — createGalaxyRenderTargets.ts's rebuildDust sizes BOTH to
  // reducedSize(render.dustDivisor) in one call, and reruns whenever that
  // divisor moves, so neither can be left behind at the other's extent.
  // Framebuffer coords therefore ARE map texels, a direct 1:1 load. A UV rescale here
  // previously papered over a resolution MISMATCH (dustMapTex at full canvas
  // res, this target at a coarser divisor); that decimated any lane thinner
  // than the divisor into beads, which is why it's gone.
  let coord = vec2<i32>(input.pos.xy);
  // dustMapTex now carries four depth-sliced optical depths (io.wesl's
  // dustSlices doc), not one column — this presentation has no notion of
  // depth, so it sums them back into the total tau a single-column map
  // would have held.
  let texel = textureLoad(dustMapTex, coord, 0);
  let tau = texel.x + texel.y + texel.z + texel.w;
  // S4: modulate the splat-accumulated column by the SF map's own high-pass
  // ratio at this fragment's disc intersection, BEFORE the palette — the
  // splats keep the low/mid frequencies, the map contributes only what the
  // blur removed.
  let tau2 = tau * dustDetailMultiplier(input);

  // Presentation palette, NOT physics: intensity saturates smoothly with
  // column depth, then ramps black -> deep red -> orange -> white. Tuned by
  // eye for a JWST/MIRI dust-map look; none of these four colours or the
  // 1.5 rate is a measured quantity.
  let i = 1.0 - exp(-tau2 * 1.5);
  let black = vec3<f32>(0.0, 0.0, 0.0);
  let deepRed = vec3<f32>(0.55, 0.08, 0.02);
  let orange = vec3<f32>(1.0, 0.45, 0.1);
  let white = vec3<f32>(1.0, 1.0, 1.0);
  let warm = mix(mix(black, deepRed, smoothstep(0.0, 0.5, i)), orange, smoothstep(0.5, 0.8, i));
  let color = mix(warm, white, smoothstep(0.8, 1.0, i));

  // Alpha 0, matching splat.wesl's fs: this target's alpha channel feeds
  // nothing downstream (the additive upsample folds RGB into HDR and the
  // compositor forces alpha 1.0).
  //
  // debugView.x is this view's own crossfade weight (io.wesl's debugView
  // doc) — 0 with the slider off, which keeps this pass's contribution to
  // the additive composite at zero even on a frame where it still runs.
  return vec4<f32>(color * u.debugView.x, 0.0);
}
