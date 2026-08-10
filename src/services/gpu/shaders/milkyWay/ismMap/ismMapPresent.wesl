// milkyWay/ismMap/ismMapPresent.wesl — presents the fluid generator's packed
// output (ismMapFluidPack.wesl), crossfaded with the analytic field's
// emission draw by weight render.ismMapViewIntensity, same seam as
// dustPresent.wesl.
//
// Unlike dustPresent.wesl's 1:1 texel read (its map is already screen-space,
// splatted there by dustMap.wesl), ismMapTex is GALAXY-FRAME log-polar: this
// shader reconstructs the camera ray per fragment (io.wesl's own basis, the
// same formula fieldSplat/fragment.wesl's fs uses) and intersects the disc plane (y=0 —
// the warp is ignored, a diagnostic overlay's own simplification, not
// claimed anywhere else) to find which (r, theta) texel to sample. That
// resample makes this pass's own target resolution independent of the map's
// — there is no equal-extent 1:1-load contract here to violate (research
// doc §17.1's decimation trap).

import package::lib::fullscreenTri::fullscreenVertex;
import package::lib::fullscreenTri::FullscreenOut;
import package::milkyWay::field::io::u;

const PI: f32 = 3.14159265358979;

// Mirrors dustParticleCloud.ts's DUST_SURVIVAL_FLOOR_FRAC — parity-tested in
// constants.parity.test.ts. A texel below this FRACTION of ITS OWN RING'S
// mean dust reads as zero density here the same way a map-seeded particle
// there is dropped by the S3 alive gate, so a texel that would never survive
// placement never glows in this view either. Ring-relative, not global: a
// cavity is faint RELATIVE TO ITS RING, not relative to the whole disc — see
// dustParticleCloud.ts's own doc on the TS twin for why a global floor would
// mass-cull the outer disc's honestly fainter (but legitimately placed)
// splats.
const DUST_SURVIVAL_FLOOR_FRAC: f32 = 0.01;

// rMin/rMax: the log-radial bounds THIS galaxy's grid was built over
// (galaxyIsmMapArmForcing.ts's ismMapGridRadius) — written once per
// rebuildIsmMap, not every frame like io.wesl's 'u' above.
struct IsmMapGrid {
  rMin: f32,
  rMax: f32,
}

@group(0) @binding(1) var ismMapTex: texture_2d<f32>;
@group(0) @binding(2) var ismMapSmp: sampler;
@group(0) @binding(3) var<uniform> grid: IsmMapGrid;
// One f32 per ring (createIsmMapOutput.ts's ringMeansBuffer/writeRingMeans,
// dustParticleCloud.ts's ismMapRingMeans on the CPU twin) — the radial
// envelope's own divisor, ring-indexed below. 'arrayLength' reads the
// binding's own element count rather than a second mirrored ISM_MAP_RINGS
// constant, so the two sides can never drift on how many rings there are.
@group(0) @binding(4) var<storage, read> ringMeans: array<f32>;

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
  // uv transform to recover the NDC fieldSplat/fragment.wesl's fs
  // reconstructs its ray from.
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
  let texel = textureSampleLevel(ismMapTex, ismMapSmp, vec2<f32>(azT, ringT), 0.0);

  // Fade the last few percent toward each radial edge so the map doesn't
  // end in a hard ring — presentation, not physics.
  let edgeFade = smoothstep(0.0, 0.03, ringT) * (1.0 - smoothstep(0.94, 1.0, ringT));

  let gas = texel.x;
  let stars = texel.y;
  let old = texel.z;
  // The conserved dust channel (ismMapFluidPack.wesl's state.w, see
  // GalaxyIsmMap.ts's contract table) — written RAW there, so swept-shell
  // rims legitimately read above 1, up to the snowplough's 8.0 ceiling.
  let dust = texel.w;
  // Presentation palette, NOT physics — chosen so the four channels stay
  // separable by eye: dim cool navy for unspent gas, bright magenta-violet
  // for the decaying activity wake, warm near-white for the stars tracer
  // (an advected young-stars density), teal-green for dust. Activity used
  // to be amber, but that sat right next to the stars channel's warm
  // near-white (the two blended into one warm smear) and duplicated
  // dustPresent.wesl's own red-orange-white band; magenta-violet and
  // teal-green are the two hues nothing else in the debug-view set
  // (dustPresent's red-orange-white, bubble's amber/cyan) claims. The four
  // peak colours are still deliberately NOT equal-brightness — gas maxes at
  // 0.25, stars at 1.0, activity's red/blue channels at 1.3 (above the
  // Reinhard whitepoint's linear range, spending some of the HDR target's
  // real headroom) — so u.ismMapChannels is the only way to see the gas
  // channel at all against the other three, and zeroing three weights
  // isolates the fourth. Dust is scaled by its weight the same raw way,
  // un-clamped, before the sum — the weight is how the slider pulls rim
  // overshoot back into a readable range, not a clip.
  let gasColor = vec3<f32>(0.05, 0.08, 0.25) * gas * u.ismMapChannels.x;
  let oldColor = vec3<f32>(1.3, 0.25, 1.15) * old * u.ismMapChannels.z;
  let starsColor = vec3<f32>(1.0, 0.95, 0.85) * stars * u.ismMapChannels.y;
  let dustColor = vec3<f32>(0.15, 1.0, 0.55) * dust * u.ismMapChannels.w;

  // The fifth, composite term: NOT another raw-channel isolation like the
  // four above — this MIRRORS dustParticleCloud.ts's density callback (the
  // one passed to buildIsmMapDustCdf) exactly, so seeding can be judged
  // directly instead of inferred from channels an ambient pedestal can glow
  // in without contributing placement mass. Change both together. No
  // ambient subtraction: the pedestal is no longer uniform (it's seeded
  // ambient*gasProfile(r) and advected) and is itself part of the structure
  // placement seeds into. Two terms, exactly like the CPU: a STRUCTURAL
  // radial envelope (ringMean/globalMean) the cap never touches, times a
  // within-ring ratio the cap DOES clamp — see dustParticleCloud.ts's own
  // placement comment for why capping the envelope itself would let the
  // outer disc's sheer texel count win a contrast fight against the inner
  // disc. Shown BEFORE texel-area weighting: the CDF multiplies by area, so
  // outer texels weigh more in placement than they glow here.
  let globalMean = u.bubbleView.w;
  let cap = u.bubbleView.z;
  let rings = arrayLength(&ringMeans);
  let ringIdx = u32(clamp(round(ringT * f32(rings - 1u)), 0.0, f32(rings - 1u)));
  let ringMean = ringMeans[ringIdx];
  // Guarded exactly like the CPU's density callback (dust <= 0 or ringMean
  // <= 0 -> 0, no NaN from a 0/0 divide) AND the SAME survival floor S3
  // applies post-placement — a texel below it would never keep a particle
  // dustParticleCloud.ts placed there, so it reads as dark here too rather
  // than glowing at a density nothing downstream survives at.
  var seedingDensity = 0.0;
  if (
    globalMean > 0.0 && dust > 0.0 && ringMean > 0.0
      && dust >= DUST_SURVIVAL_FLOOR_FRAC * ringMean
  ) {
    let local = dust / ringMean;
    // 0 = uncapped, matching dustPlacementCap's own default (dustParticleCloud.ts).
    let capped = select(local, min(local, cap), cap > 0.0);
    seedingDensity = (ringMean / globalMean) * capped;
  }
  // Warm-white, deliberately brighter/cooler than starsColor's near-white so
  // the composite reads as its own layer rather than blending into it.
  let seedingColor = vec3<f32>(1.4, 1.3, 1.15) * seedingDensity * u.bubbleView.y;

  let color = (gasColor + oldColor + starsColor + dustColor + seedingColor) * edgeFade;

  // debugView.y is this view's own crossfade weight (io.wesl's debugView
  // doc), same role as dustPresent.wesl's debugView.x multiply.
  return vec4<f32>(color * u.debugView.y, 0.0);
}
