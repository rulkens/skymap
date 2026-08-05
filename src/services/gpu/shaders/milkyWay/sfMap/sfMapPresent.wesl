// milkyWay/sfMap/sfMapPresent.wesl — presents the SSPSF automaton's packed
// output (sfMapPack.wesl), crossfaded with the analytic field's emission
// draw by weight render.sfMapViewIntensity, same seam as dustPresent.wesl.
//
// Unlike dustPresent.wesl's 1:1 texel read (its map is already screen-space,
// splatted there by dustMap.wesl), sfMapTex is GALAXY-FRAME log-polar: this
// shader reconstructs the camera ray per fragment (io.wesl's own basis, the
// same formula splat.wesl's fs uses) and intersects the disc plane (y=0 —
// the warp is ignored, a diagnostic overlay's own simplification, not
// claimed anywhere else) to find which (r, theta) texel to sample. That
// resample makes this pass's own target resolution independent of the map's
// — there is no equal-extent 1:1-load contract here to violate (research
// doc §17.1's decimation trap).

import package::lib::fullscreenTri::fullscreenVertex;
import package::lib::fullscreenTri::FullscreenOut;
import package::milkyWay::field::io::u;

const PI: f32 = 3.14159265358979;

// Mirrors sweptDustOvershoot.ts's export — parity-tested in
// constants.parity.test.ts alongside its other three WESL mirrors. Needed
// here to reconstruct 'overshoot' below from the raw dust channel this
// shader already reads.
const SF_MAP_AMBIENT_DUST: f32 = 1.0;

// rMin/rMax: the log-radial bounds THIS galaxy's grid was built over
// (galaxySfMapArmForcing.ts's sfMapGridRadius) — written once per
// rebuildSfMap, not every frame like io.wesl's 'u' above.
struct SfMapGrid {
  rMin: f32,
  rMax: f32,
}

@group(0) @binding(1) var sfMapTex: texture_2d<f32>;
@group(0) @binding(2) var sfMapSmp: sampler;
@group(0) @binding(3) var<uniform> grid: SfMapGrid;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> FullscreenOut {
  return fullscreenVertex(vi);
}

@fragment
fn fs(input: FullscreenOut) -> @location(0) vec4<f32> {
  let tanHalfFov = u.params.x;
  let aspect = u.params.y;
  let shift = u.params.z;
  // FullscreenOut carries 'uv' (its @builtin(position) is FRAMEBUFFER
  // pixels in the fragment stage, not NDC) — undo fullscreenVertex's own
  // uv transform to recover the NDC splat.wesl's fs reconstructs its ray
  // from.
  let ndcX = input.uv.x * 2.0 - 1.0;
  let ndcY = 1.0 - input.uv.y * 2.0;
  let d = normalize(
    u.camRight.xyz * ((ndcX + shift) * tanHalfFov * aspect)
      + u.camUp.xyz * (ndcY * tanHalfFov)
      + u.camFwd.xyz,
  );
  let o = u.eye.xyz;

  // Disc-plane (y=0) intersection; a ray parallel to or diverging from the
  // plane has nothing to show.
  if (abs(d.y) < 1e-6) {
    return vec4<f32>(0.0);
  }
  let t = -o.y / d.y;
  if (t <= 0.0) {
    return vec4<f32>(0.0);
  }
  let hit = o + d * t;
  let r = length(hit.xz);
  let theta = atan2(hit.z, hit.x);

  if (r < grid.rMin || r > grid.rMax) {
    return vec4<f32>(0.0);
  }
  let ringT = log(r / grid.rMin) / log(grid.rMax / grid.rMin);
  let azT = theta / (2.0 * PI) + select(0.0, 1.0, theta < 0.0);
  let texel = textureSampleLevel(sfMapTex, sfMapSmp, vec2<f32>(azT, ringT), 0.0);

  // Fade the last few percent toward each radial edge so the map doesn't
  // end in a hard ring — presentation, not physics.
  let edgeFade = smoothstep(0.0, 0.03, ringT) * (1.0 - smoothstep(0.94, 1.0, ringT));

  let gas = texel.x;
  let recent = texel.y;
  let old = texel.z;
  // The conserved dust channel (sfMapPack.wesl's state.z, since 9aa9fe5d) —
  // written RAW there, so swept-shell rims legitimately read above 1, up to
  // the snowplough's 8.0 ceiling.
  let dust = texel.w;
  // Presentation palette, NOT physics — chosen so the four channels stay
  // separable by eye: dim cool navy for unspent gas, bright magenta-violet
  // for the decaying activity wake, warm near-white for a cell that ignited
  // recently, teal-green for dust. Activity used to be amber, but that sat
  // right next to recentSf's warm near-white (the two blended into one warm
  // smear) and duplicated dustPresent.wesl's own red-orange-white band;
  // magenta-violet and teal-green are the two hues nothing else in the
  // debug-view set (dustPresent's red-orange-white, bubble's amber/cyan)
  // claims. The four peak colours are still deliberately NOT equal-
  // brightness — gas maxes at 0.25, recentSf at 1.0, activity's red/blue
  // channels at 1.3 (above the Reinhard whitepoint's linear range, spending
  // some of the HDR target's real headroom) — so u.sfMapChannels is the only
  // way to see the gas channel at all against the other three, and zeroing
  // three weights isolates the fourth. Dust is scaled by its weight the same
  // raw way, un-clamped, before the sum — the weight is how the slider pulls
  // rim overshoot back into a readable range, not a clip.
  let gasColor = vec3<f32>(0.05, 0.08, 0.25) * gas * u.sfMapChannels.x;
  let oldColor = vec3<f32>(1.3, 0.25, 1.15) * old * u.sfMapChannels.z;
  let recentColor = vec3<f32>(1.0, 0.95, 0.85) * recent * u.sfMapChannels.y;
  let dustColor = vec3<f32>(0.15, 1.0, 0.55) * dust * u.sfMapChannels.w;

  // The fifth, composite term: NOT another raw-channel isolation like the
  // four above — this is the exact density dustParticleCloud.ts's S1 CDF
  // sampler places from, 'mix(legacy/meanLegacy, overshoot/meanOvershoot,
  // sweptMix)', so seeding can be judged directly instead of inferred from
  // channels an ambient pedestal can glow in without contributing placement
  // mass. bubbleView.z/.w are the CPU's meanSfMapChannel means (0 when no map
  // has landed yet); the same epsilon-guard semantics as the CPU
  // (sweptDustOvershoot.ts / dustParticleCloud.ts) apply per-term here, NOT
  // just at the CPU's own weight-forcing guard — 'mix' would otherwise carry
  // a NaN from a zero-mean division through even at a zero blend fraction.
  // Shown BEFORE texel-area weighting: the CDF multiplies by area, so outer
  // texels weigh more in placement than they glow here.
  let legacyDensity = gas * old; // sfMapDustDensity(gas, oldActivity) mirrored inline
  let overshoot = max(0.0, dust - SF_MAP_AMBIENT_DUST);
  let meanLegacy = u.bubbleView.z;
  let meanOvershoot = u.bubbleView.w;
  let legacyTerm = select(0.0, legacyDensity / meanLegacy, meanLegacy > 0.0);
  let overshootTerm = select(0.0, overshoot / meanOvershoot, meanOvershoot > 0.0);
  let seedingDensity = mix(legacyTerm, overshootTerm, u.dustDetail.w);
  // Warm-white, deliberately brighter/cooler than recentColor's near-white so
  // the composite reads as its own layer rather than blending into recentSf.
  let seedingColor = vec3<f32>(1.4, 1.3, 1.15) * seedingDensity * u.bubbleView.y;

  let color = (gasColor + oldColor + recentColor + dustColor + seedingColor) * edgeFade;

  // debugView.y is this view's own crossfade weight (io.wesl's debugView
  // doc), same role as dustPresent.wesl's debugView.x multiply.
  return vec4<f32>(color * u.debugView.y, 0.0);
}
