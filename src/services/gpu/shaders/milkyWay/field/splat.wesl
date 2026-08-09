// milkyWay/field/splat.wesl — the analytic Milky Way field: one instanced
// quad PER EMISSION COMPONENT, each covering its own Gaussian's screen
// footprint. Emission is additive and order-independent (no depth test, no
// depth sort), so overlapping quads sum to the mixture's true integral
// wherever a quad covers its own component's support: cost is sum of
// covered screen area rather than pixels x componentCount, which is what
// makes N~300+ mixtures affordable.
//
// Dust components live in the SAME 'comps' array, past every emission
// component (see io.wesl's layout comment), but are never drawn as quads —
// the draw call's instance count is the emission count only. The PRIMARY
// galaxy's dust no longer walks that slice per-fragment (a per-fragment loop
// does not scale to a filament network's component count, per the
// grill-session doc's N1); it instead reads dustMap.wesl's screen-space,
// depth-sliced optical-depth accumulation (io.wesl's dustSlices doc), one
// texel lookup regardless of dust component count. A single mean-depth
// split (the previous scheme) put a hard 50% floor on obscuration — the
// dust's own tau centroid sits INSIDE the emitting disc from both an
// edge-on and an inside-the-disc view, so half the light always escaped no
// matter how thick the dust. Four slices fix that: each is attenuated by
// only the tau IN FRONT of it, so opacity can reach 100% as tau does. A
// future per-EXTRA dust slice would come back as a bounded loop for extra
// instances (extras have no dust map yet, and their attenuation must stay
// per-galaxy — see io.wesl's primaryCount gate).

import package::lib::billboard::quadCorner;
import package::lib::splatSilhouette::splatNdc;
import package::lib::splatSilhouette::SPLAT_CUT;
import package::lib::gaussianIntegral::gaussianRayCoeffs;
import package::lib::gaussianIntegral::expHalfErfc;
import package::lib::gaussianIntegral::GAUSS_PI;
import package::milkyWay::field::io::u;
import package::milkyWay::field::io::comps;
import package::milkyWay::field::io::dustMapTex;
import package::milkyWay::field::io::dustMapSmp;
import package::milkyWay::field::io::dustNoiseTex;
import package::milkyWay::field::io::dustNoiseSmp;
import package::milkyWay::field::io::starGrainTex;
import package::milkyWay::field::io::starGrainSmp;
import package::milkyWay::field::dustDetail::ismCartesianUv;
import package::milkyWay::field::dustDetail::ismCartesianTex;
import package::milkyWay::field::dustDetail::ismCartesianSmp;

// sliceTransmitRatio — (1 - exp(-x)) / x per channel, the exact closed form
// for emission spread UNIFORMLY through a homogeneous slab of per-channel
// optical depth x, relative to the slab's own near face. x -> 0 is a
// removable singularity (the limit is 1, by l'Hopital / the Taylor series of
// exp), but the literal expression is 0/0 there and IEEE division does not
// take limits — so this is guarded per channel with select() rather than
// trusted to degrade gracefully, since red/green/blue can straddle the
// threshold independently (blue extinction is stronger than red at the same
// physical tau). 'safe' only feeds the branch select() is about to discard;
// its own value never reaches the output.
fn sliceTransmitRatio(x: vec3<f32>) -> vec3<f32> {
  let thin = vec3<f32>(1e-4);
  let safe = max(x, thin);
  let ratio = (vec3<f32>(1.0) - exp(-safe)) / safe;
  return select(ratio, vec3<f32>(1.0), x < thin);
}

// hiiNoiseTerm — breaks up an HII sprite's circular Gaussian footprint by
// reusing the SAME baked ridged-noise volume the dust cloud erodes with
// (dustNoiseTex/dustNoiseSmp), so shells/DIG/associations pick up the ISM
// texture their nearby dust already has rather than a second, uncorrelated
// pattern. 'scale' multiplies the sampling frequency relative to the dust
// volume's own tile size (u.dustNoise.x); 'contrast' is the same signed-power
// shaping dustMap.wesl's dustNoiseMultiplier applies about the noise's own
// ~0.5 midpoint. Returns a mean-~1 multiplier; the caller mixes it against
// the component's own textureWeight, so weight 0 is exactly "untouched"
// regardless of scale/contrast.
fn hiiNoiseTerm(p: vec3<f32>, scale: f32, contrast: f32) -> f32 {
  let tileUnits = u.dustNoise.x / max(scale, 1e-4);
  let n = textureSampleLevel(dustNoiseTex, dustNoiseSmp, p / tileUnits, 0.0).x;
  let s = 2.0 * n - 1.0;
  let shaped = sign(s) * pow(abs(s), contrast);
  return max(0.0, 1.0 + shaped);
}

// World span of one full wrap of starGrainBake.wesl's baked volume, sized so
// several of its 16 lattice cells cross one YOUNG STARS splat's own sigma
// (hiiRegions.ts's ASSN_SIGMA_MIN_PC..MAX_PC) — several independent grains
// visible per splat, not one grain spanning several splats. A fixed
// constant, not a tunable lane: unlike dustNoise.x (which tracks the dust
// cloud's own live sigma), this volume has no matching live parameter to
// track.
const STAR_GRAIN_TILE_UNITS: f32 = 0.32;
// Compensates the bake's own sparsity (most texels sit far from any grain's
// centre, so the RAW volume's spatial mean is well under 1) back up toward
// mean ~1 — eyeballed from the bake's own point density/sigma/amplitude
// parameters (starGrainBake.wesl), not measured, but chosen so this term
// shares hiiNoiseTerm's contract: turning a group's Texture weight up
// reveals grain structure without silently discounting that group's
// calibrated total flux.
const STAR_GRAIN_GAIN: f32 = 8.0;
// Zoom-revealed octaves sample the SAME volume at 4x/16x the base tiling
// frequency — separated enough that each reads as its own generation of
// points, not a near-duplicate of its coarser sibling enlarged.
const STAR_GRAIN_OCTAVE1_DIV: f32 = 4.0;
const STAR_GRAIN_OCTAVE2_DIV: f32 = 16.0;

// Domain-warp period, in world units, of the low-frequency shift applied to
// the grain lookup before all three octave taps (starGrainTerm) — the fix
// for a long YOUNG STARS chain visibly repeating the same ~4096-point
// constellation every STAR_GRAIN_TILE_UNITS. 3.5x the grain tile: LOW
// enough that the warp varies slowly across one grain tile (a point's own
// extent sees only a small slice of the warp's gradient, so points stay
// round, not smeared), and a NON-integer multiple of the tile so the warp
// and grain periods don't realign in lockstep — their combined repeat is
// the product of both (7 grain tiles here), long enough nothing recognizes
// it as a repeat.
const STAR_GRAIN_WARP_SCALE: f32 = 1.12;
// Displacement amplitude, in world units. 0.75x the grain tile: large
// enough to shift the lookup by a substantial fraction of a wrap (so
// adjacent wraps sample genuinely different regions of starGrainTex,
// killing the recognizable repeat), small enough to stay well under one
// full tile (shredding the local point field — folding a point onto its
// own neighbour — starts past ~1x).
const STAR_GRAIN_WARP_AMP: f32 = 0.24;

// The aliasing feature the firefly fix below must gate on is the baked
// POINT, not the tile: starGrainBake.wesl places one point per lattice cell
// (CELLS=16) with sigma POINT_SIGMA_CELLS=0.28 cell-widths — an order of
// magnitude under the tile itself. dustMap.wesl's w_k idiom gates on the
// tile because its ridged fbm's finest visible feature IS the tile; reusing
// that idiom unmodified here would fade octaves far too late to stop
// single-pixel sparks. STAR_GRAIN_POINT_SIGMA_FRAC below is the geometry
// fact (sigma as a fraction of one wrap); the feature SIZE the gate needs is
// the point's visible EXTENT, some multiple of that sigma (not sigma
// itself — gating on bare sigma faded the grain too early and large-scale
// views lost all point texture, leaving only the stars-map modulation). That
// multiplier is u.dustDetail.w (render.starGrainFeatureScale, default 8) —
// live-tunable because it is the user's own calibration of the look against
// the reference gallery, not a derived constant.
const STAR_GRAIN_POINT_SIGMA_FRAC: f32 = 0.28 / 16.0;

// starGrainOctave — one tap of the baked volume, half-tile-offset per
// dustMap.wesl's S4 breakup precedent ("Half-tile offset decorrelates...")
// so a finer octave doesn't just resample its coarser sibling's own points,
// enlarged. Unlike hiiNoiseTerm's signed ridge (mean ~1, gentle wobble
// either side), the baked field is already mean-near-0 with rare bright
// spikes (its own log-normal amplitude), so there is no 2n-1 recentring
// here: 'contrast' sharpens the spike/background contrast directly via
// pow(), and GAIN restores the mean the caller treats as this tap's
// meanRef — already ~1, so a further division is unneeded.
fn starGrainOctave(p: vec3<f32>, tileUnits: f32, contrast: f32, offset: vec3<f32>) -> f32 {
  let n = textureSampleLevel(starGrainTex, starGrainSmp, p / tileUnits + offset, 0.0).x;
  return pow(n, max(contrast, 1e-4)) * STAR_GRAIN_GAIN;
}

// starGrainTerm — the YOUNG STARS branch's own counterpart to hiiNoiseTerm:
// samples the scattered, uncorrelated point-grain volume instead of the
// shared ridged fbm, so an association splat reads as many independent
// unresolved stars rather than picking up the same wispy ISM texture a
// shell/DIG blob correctly does.
//
// Two finer octaves (tileUnits/4, tileUnits/16) layer on top of the base tap
// so zooming in resolves MORE, SMALLER points instead of the base grain just
// enlarging into a blob. All three (base included) are mean-1 multiplicative
// — mix() toward 1, never toward 0 — gated per-octave on featureFrac's own
// point size, not tileUnits_k itself:
// w_k = clamp(tileUnits_k * featureFrac / (2*pxWorld) - 1, 0, 1), where
// featureFrac = max(u.dustDetail.w, 0.0) * STAR_GRAIN_POINT_SIGMA_FRAC
// (io.wesl's own doc for the lane), using THIS pass's own resolution
// (counts2.w, fieldHeightPx — io.wesl: splat.wesl "runs at the FIELD's
// resolution") where dustMap.wesl's own tile-scale version reads counts2.y
// instead. This is the firefly fix: at a reduced render-target divisor
// pxWorld grows, so grain points cross below the ~2px floor and w_k -> 0
// well before the tile itself would, fading each octave to its mean-1
// neutral instead of letting sub-pixel points alias into flickering
// sparks. w_k <= 0 skips its textureSampleLevel
// outright (explicit LOD legalises the divergent branch), so a far view
// still costs at most one fetch (the warp, and only while some w_k > 0).
//
// Flux conservation: mean-1 octaves redistribute a splat's light into finer
// points on zoom without changing its total flux in expectation — riding
// STAR_GRAIN_GAIN's own eyeballed calibration above, the same debt class as
// dustNoiseMultiplier's ~0.5 assumption (dustMap.wesl).
//
// Domain warp: pWarped displaces the lookup ONCE, shared by all three
// octaves (independently warping each would drift them apart and break the
// half-tile decorrelation between them), so each STAR_GRAIN_WARP_SCALE-ish
// wrap of starGrainTex samples a differently-shifted region and the same
// constellation stops recurring along a long chain. Reuses dustNoiseTex,
// already bound for hiiNoiseTerm — its rgba8unorm bake stores four
// independent ridged bands (one per channel, dustNoiseBake.wesl), so one
// fetch's .xyz is already a serviceable vec3 displacement with no new
// texture. Each band is a ridge fold of a uniform field (r = 1-|2n-1|), mean
// exactly 0.5, hence the '- 0.5' recentring below. Built from the UNSCALED
// p (not p / tileUnits0): the warp's own geometry is fixed in world space,
// so the Texture-scale slider zooms the grain without re-randomizing which
// shift each point sees. A pure position shift resamples the same mean-1
// field elsewhere — it does not change starGrainOctave's sampled
// distribution or its mean, only which points a given wrap lands on.
fn starGrainTerm(p: vec3<f32>, depth: f32, scale: f32, contrast: f32) -> f32 {
  let pxWorld = 2.0 * depth * u.params.x / u.counts2.w;
  // render.starGrainFeatureScale (io.wesl's dustDetail doc) — max() keeps
  // this well-defined for any pass that packs the lane 0 (starGrainTerm
  // never runs there anyway, see that doc).
  let featureFrac = max(u.dustDetail.w, 0.0) * STAR_GRAIN_POINT_SIGMA_FRAC;

  let tileUnits0 = STAR_GRAIN_TILE_UNITS / max(scale, 1e-4);
  let tileUnits1 = tileUnits0 / STAR_GRAIN_OCTAVE1_DIV;
  let tileUnits2 = tileUnits0 / STAR_GRAIN_OCTAVE2_DIV;

  // pxWorld <= 0 (degenerate depth) keeps today's behaviour: every octave
  // stays fully weighted rather than guessing at a resolution it can't see.
  var w0 = 1.0;
  var w1 = 1.0;
  var w2 = 1.0;
  if (pxWorld > 0.0) {
    w0 = clamp(tileUnits0 * featureFrac / (2.0 * pxWorld) - 1.0, 0.0, 1.0);
    w1 = clamp(tileUnits1 * featureFrac / (2.0 * pxWorld) - 1.0, 0.0, 1.0);
    w2 = clamp(tileUnits2 * featureFrac / (2.0 * pxWorld) - 1.0, 0.0, 1.0);
  }

  var term = 1.0;
  if (w0 <= 0.0 && w1 <= 0.0 && w2 <= 0.0) {
    // No octave will sample at this resolution, so the warp's displacement
    // has nothing left to displace — skip dustNoiseTex's tap too, the case
    // a reduced-divisor YOUNG STARS target hits routinely.
    return term;
  }

  let warpN = textureSampleLevel(dustNoiseTex, dustNoiseSmp, p / STAR_GRAIN_WARP_SCALE, 0.0).xyz;
  let pWarped = p + STAR_GRAIN_WARP_AMP * (warpN - vec3<f32>(0.5));

  if (w0 > 0.0) {
    term = term * mix(1.0, starGrainOctave(pWarped, tileUnits0, contrast, vec3<f32>(0.0)), w0);
  }
  if (w1 > 0.0) {
    term = term * mix(1.0, starGrainOctave(pWarped, tileUnits1, contrast, vec3<f32>(0.5)), w1);
  }
  if (w2 > 0.0) {
    term = term * mix(1.0, starGrainOctave(pWarped, tileUnits2, contrast, vec3<f32>(0.5)), w2);
  }

  return term;
}

struct SplatOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) ndc: vec2<f32>,
  @location(1) @interpolate(flat) inst: u32,
}

// Near-camera fade window, HII-pass-only (see the vs's dustDetail.y gate
// below) — a component the eye has flown inside fades to nothing rather
// than shading its fullscreen-fallback quad (splatSilhouette.wesl's
// SPLAT_CUT) at full cost. u.youngStars.z/.w (io.wesl's own doc), live-tunable
// as render.hiiNearFadeStart/hiiNearFadeEnd: START defaults to SPLAT_CUT
// (4.5) so fading begins exactly where the eye enters the component's own
// truncation sphere, with no dead band where the fallback quad is already
// live but still full brightness; END defaults closer in than START — gone
// before the fallback regime dominates the frame, the physical read an
// unresolved wash, a deliberate trade approved for perf (see splat.wesl's
// header / the dust-seeding-spike cost analysis). GUARD: start <= end or
// start <= 0 disables the fade (fade stays 1) — defense in depth alongside
// the dustDetail.y gate below, since it also makes the field pass's zeroed
// youngStars lanes safe on their own, regardless of that discriminant.

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) inst: u32) -> SplatOut {
  let corner = quadCorner(vi);
  let g1 = comps[4u * inst + 1u];
  let g3 = comps[4u * inst + 3u];
  let center = g3.xyz;
  let r = g1.w;

  let eye = u.eye.xyz;
  let camRight = u.camRight.xyz;
  let camUp = u.camUp.xyz;
  let camFwd = u.camFwd.xyz;
  let tanHalfFov = u.params.x;
  let aspect = u.params.y;
  let shift = u.params.z;

  // View-space offset of the centre: zv along the gaze, xv/yv across it.
  let rel = center - eye;
  let zv = dot(rel, camFwd);
  let xv = dot(rel, camRight);
  let yv = dot(rel, camUp);

  var out: SplatOut;
  out.inst = inst;

  // dustDetail.y is 0 for every primary-field draw (io.wesl's own doc) and
  // this pass's shared fs also serves that draw, whose disc/bulge
  // components have a boundRadius the eye is ALWAYS inside at any
  // interesting pose — fading there would black the galaxy, so the gate
  // is mandatory, not an optimisation.
  let fadeStart = u.youngStars.z;
  let fadeEnd = u.youngStars.w;
  if (u.dustDetail.y > 0.0 && fadeStart > fadeEnd && fadeStart > 0.0) {
    let fade = smoothstep(fadeEnd * r, fadeStart * r, length(rel));
    if (fade <= 0.0) {
      // Same degenerate off-clip-volume corner splatSilhouette.wesl's own
      // fully-behind-camera branch collapses to: zero fragments, not a
      // shaded-then-discarded quad.
      out.ndc = vec2<f32>(2.0, 2.0);
      out.pos = vec4<f32>(out.ndc, 0.0, 1.0);
      return out;
    }
  }

  let ndc = splatNdc(corner, xv, yv, zv, r, tanHalfFov, aspect, shift, u.perf.x);
  out.pos = vec4<f32>(ndc, 0.0, 1.0);
  out.ndc = ndc;
  return out;
}

@fragment
fn fs(input: SplatOut) -> @location(0) vec4<f32> {
  // Reconstructs the world-space ray from the interpolated NDC rather than
  // passing one down from the vertex stage: cheap (three lines) and avoids
  // an extra varying.
  let tanHalfFov = u.params.x;
  let aspect = u.params.y;
  let shift = u.params.z;
  let d = normalize(
    u.camRight.xyz * ((input.ndc.x + shift) * tanHalfFov * aspect)
      + u.camUp.xyz * (input.ndc.y * tanHalfFov)
      + u.camFwd.xyz,
  );
  let o = u.eye.xyz;

  let g0 = comps[4u * input.inst];
  let g1 = comps[4u * input.inst + 1u];
  let g2 = comps[4u * input.inst + 2u];
  let g3 = comps[4u * input.inst + 3u];
  let po = o - g3.xyz;

  // Hoisted once per fragment: the dust-integral path below, its
  // no-dust-column fallback, and the HII texture branch further down all
  // need this component's own ray-quadratic (a, b, q — gaussianIntegral.wesl's
  // header), and re-deriving it per consumer was half this pass's
  // close-zoom cost (verified: both former call sites read po, d, g0.xyz,
  // g1.xyz with nothing else in between that could change them).
  let coeffs = gaussianRayCoeffs(po, d, g0.xyz, g1.xyz);
  let a = coeffs.x;

  // q (coeffs.z) is the ray's own closest-approach squared Mahalanobis
  // distance (gaussianRayCoeffs' doc) — exceeding SPLAT_CUT^2 means this
  // fragment sits on a fullscreen-fallback quad (splatSilhouette.wesl,
  // fired whenever the eye is near/inside the component's bound) at a
  // pixel the ray never actually grazes the component's support, so the
  // dust fetch/integral and texture branch below would all multiply to a
  // contribution already below the vertex-side quad's own truncation.
  // a < 1e-12 leaves q at gaussianRayCoeffs' own null-space 0.0, which does
  // NOT trip this cutoff — that case still falls through to the 'a >=
  // 1e-12' guards below, unchanged from before this hoist.
  if (coeffs.z > SPLAT_CUT * SPLAT_CUT) {
    return vec4<f32>(0.0);
  }

  // counts.x is the emission count (this draw's own instance count, unused
  // here); .w is the primary galaxy's own emission count — see io.wesl's
  // layout comment. .y/.z (the dust slice's offset/count) are consumed by
  // dustMap.wesl's own draw now, not read here.
  let primaryCount = u32(u.counts.w);

  var emission = vec3<f32>(0.0);
  var dustApplies = false;
  // Dust attenuates only the PRIMARY galaxy's own emission splats (index <
  // primaryCount, since the primary's components are packed first — see
  // io.wesl): an extra's dust must never darken the primary, and this gate
  // is what keeps that true without extras carrying their own dust yet.
  //
  // The dust column comes from dustMapTex, not a per-component loop. This
  // pass runs at fieldTex's own (coarser) resolution while dustMapTex is now
  // sized to its OWN divisor (io.wesl's DUST MAP doc) — no longer the same
  // extent, so a direct framebuffer-coord texel load is no longer valid.
  // counts2.zw (fieldSizePx) turns this fragment's own coords into a
  // normalized UV, sampled through dustMapSmp with an EXPLICIT level (0.0,
  // not textureSample): this read sits inside 'if (input.inst <
  // primaryCount)' and the 'dustApplies' branch below, both non-uniform
  // control flow, where implicit-derivative sampling is a WGSL validation
  // error. Bilinear is not a correct box downsample of a finer source, so
  // fine dust structure can shimmer under camera motion — a mip chain
  // sampled at the resolution ratio's LOD would fix that; a deliberate,
  // not-yet-done follow-up, not an oversight (see io.wesl's DUST MAP doc).
  // The four channels are the depth-sliced optical depths tau_0..tau_3
  // (io.wesl's dustSlices doc), not a single column any more.
  if (input.inst < primaryCount) {
    let dustUv = input.pos.xy / u.counts2.zw;
    let texel = textureSampleLevel(dustMapTex, dustMapSmp, dustUv, 0.0);
    let tau0 = texel.x;
    let tau1 = texel.y;
    let tau2 = texel.z;
    let tau3 = texel.w;
    dustApplies = (tau0 + tau1 + tau2 + tau3) > 1e-6;
    if (dustApplies) {
      let K = u.dustExtinction.xyz;
      // Cumulative optical depth IN FRONT OF each slice: slice 0 sees none
      // of the column yet (so its own attenuation below has no exp(-C*K)
      // factor), slice k sees every slice nearer than it.
      let c1 = tau0 * K;
      let c2 = c1 + tau1 * K;
      let c3 = c2 + tau2 * K;

      // a < 1e-12 (ray in this component's covariance null space) leaves
      // 'emission' at its zero default rather than falling back to the
      // plain path — 'dustApplies' is already true, and a null-space ray
      // integrates to 0 either way.
      if (a >= 1e-12) {
        // tail(t) is this Gaussian's own column from depth t to infinity —
        // same expHalfErfc trick dustMap.wesl uses to slice its dust
        // column, applied here to the EMISSION component instead so each
        // slice's own emission mass (E_k = tail(t_k) - tail(t_{k+1})) can be
        // attenuated by that slice's own transmittance before summing.
        let sqrtHalfA = sqrt(2.0 * a);
        let x0 = coeffs.y / sqrtHalfA;
        let aOverSqrtHalfA = a / sqrtHalfA;
        let tail0 = expHalfErfc(coeffs.z, x0);
        let tail1 = expHalfErfc(coeffs.z, x0 + aOverSqrtHalfA * u.dustSlices.x);
        let tail2 = expHalfErfc(coeffs.z, x0 + aOverSqrtHalfA * u.dustSlices.y);
        let tail3 = expHalfErfc(coeffs.z, x0 + aOverSqrtHalfA * u.dustSlices.z);
        // Clamped for the same reason dustMap.wesl's fs clamps its own tail
        // differences: two close tail values subtracted can lose precision
        // to the erfc rational approximation's branch seam, and a tiny
        // negative E_k would otherwise darken this slice's contribution
        // rather than the intended "no mass in this slice."
        let e0 = max(tail0 - tail1, 0.0);
        let e1 = max(tail1 - tail2, 0.0);
        let e2 = max(tail2 - tail3, 0.0);
        let e3 = max(tail3, 0.0);

        // Attenuation of emission spread through slice k: exp(-C_k*K), the
        // transmittance of everything IN FRONT of the slice, times the
        // in-slice term (the exact result for uniform emission through a
        // homogeneous absorbing slab, tau_k thick) — see
        // sliceTransmitRatio's own header for the tau_k -> 0 limit.
        let atten0 = sliceTransmitRatio(tau0 * K);
        let atten1 = exp(-c1) * sliceTransmitRatio(tau1 * K);
        let atten2 = exp(-c2) * sliceTransmitRatio(tau2 * K);
        let atten3 = exp(-c3) * sliceTransmitRatio(tau3 * K);

        let summed = e0 * atten0 + e1 * atten1 + e2 * atten2 + e3 * atten3;
        emission = g2.xyz * (g0.w * sqrt(GAUSS_PI / (2.0 * a)) * summed);
      }
    }
  }
  // No-dust-column fallback, inlined from gaussianRayIntegral's own body
  // (gaussianIntegral.wesl) against the hoisted 'coeffs' rather than
  // calling it: the a < 1e-12 case already leaves 'emission' at its zero
  // default, matching that function's own a < 1e-12 -> 0.0 return exactly.
  if (!dustApplies && a >= 1e-12) {
    emission = g2.xyz * (g0.w * sqrt(GAUSS_PI / (2.0 * a)) * expHalfErfc(coeffs.z, coeffs.y / sqrt(2.0 * a)));
  }

  // HII texture breakup: g2.w is comp.textureWeight (io.wesl's comps doc), 0
  // everywhere except hiiRegions.ts's pushes. dustDetail.y (the tier-global
  // scale) is packed 0 for every draw but the HII pass, so this branch is
  // UNIFORM across the whole draw call — the far more numerous primary
  // disc/arm fragments (dustDetail.y == 0 there) skip the sample outright
  // rather than compute a modulation that mix() would discard anyway.
  //
  // The SIGN of g2.w picks which volume this component reads (io.wesl's
  // comps doc): negative is YOUNG STARS (hiiRegions.ts's buildBlueAssociations
  // negates its own textureWeight), everything else stays on the shared
  // ridged noise. Branched with 'if', not select(): both textureSampleLevel
  // calls use an explicit LOD so divergent control flow is legal here, and a
  // select() would pay for BOTH texture fetches every fragment instead of
  // the ONE this pass is budgeted for (this pass is the close-zoom hotspot).
  var texMod = 1.0;
  if (u.dustDetail.y > 0.0 && g2.w != 0.0) {
    if (a >= 1e-12) {
      // o + d*tPeak is this component's own closest-approach point, the
      // same choice dustMap.wesl's fs makes for its erosion/S4 samples —
      // sampling at a shared plane instead would make the texture read as a
      // flat decal rather than something living IN the sprite as it parallaxes.
      let tPeak = max(-coeffs.y / a, 0.0);
      let p = o + d * tPeak;
      let weight = abs(g2.w);
      var term: f32;
      if (g2.w < 0.0) {
        term = starGrainTerm(p, tPeak, u.dustDetail.y, u.dustDetail.z);
        // g3.w is starsWeight (io.wesl's comps doc) — the chain's own
        // stars-map modulation depth, 0 for every other star-grain producer.
        // Layered on TOP of the grain term rather than replacing it: a young
        // component carries both textures at once.
        if (g3.w > 0.0) {
          let uv = ismCartesianUv(p);
          // A spur's own fadeRadius can run PAST the ISM grid's rMax
          // (armSpurGeometry.ts's buildSpurRecord: fadeRadius = root radius
          // + lengthFrac*gap, unclamped against the parent arm's own
          // fadeRadius outerArmRadius maxes over) — so this branch keeps an
          // explicit range test rather than trusting the clamp sampler, the
          // way dustDetailMultiplier does. Outside the disc the bake's G is
          // neutral 0, and skipping the test would DARKEN term via
          // mix(1, 0, g3.w) instead of leaving it untouched — dustDetail's
          // own neutral value (R=1) is a no-op multiplicatively, this one
          // (G=0) is not.
          if (all(uv >= vec2<f32>(0.0)) && all(uv <= vec2<f32>(1.0))) {
            let stars = textureSampleLevel(ismCartesianTex, ismCartesianSmp, uv, 0.0).g;
            // gamma shapes the read; invMeanNorm (1/mean of the shaped read,
            // packFieldUniforms.ts) renormalises it back to mean 1 so
            // restructuring the contrast doesn't drain the tier's
            // calibrated flux (io.wesl's youngStars doc, Q3's contract).
            let shaped = pow(max(stars, 0.0), u.youngStars.x) * u.youngStars.y;
            term = term * mix(1.0, shaped, g3.w);
          }
        }
      } else {
        term = hiiNoiseTerm(p, u.dustDetail.y, u.dustDetail.z);
      }
      texMod = mix(1.0, term, weight);
    }
  }
  emission = emission * texMod;

  // Near-camera fade (see the vs's u.youngStars.zw read above this pass's
  // header), recomputed rather than carried down as a varying: 'po' and 'g1' are
  // already read up here for the ray math above, so length(po)/g1.w
  // reproduce the vs's distance/boundRadius with no new interpolant — the
  // vs's own gate already collapsed the fade <= 0 case to zero fragments,
  // so only the 0..1 band ever reaches this multiply.
  var fade = 1.0;
  let fadeStart = u.youngStars.z;
  let fadeEnd = u.youngStars.w;
  if (u.dustDetail.y > 0.0 && fadeStart > fadeEnd && fadeStart > 0.0) {
    let r = g1.w;
    fade = smoothstep(fadeEnd * r, fadeStart * r, length(po));
  }

  // Alpha 0: the aggregate's alpha channel feeds nothing — the additive
  // upsample folds it into HDR and the compositor forces 1.0 — and a quad
  // writing coverage would swamp the sprites' own alpha for no reader's
  // benefit.
  //
  // Exposure (params.w) multiplies emission only, never the attenuation
  // above: the dust column is physical (a property of the galaxy's own
  // geometry), not a look knob that should brighten or dim with the field's
  // whole-frame exposure.
  //
  // debugView.w is the combined galaxy dimming weight (io.wesl's debugView
  // doc) — 1 with every debug view off, so this multiply is a no-op at the
  // default. This same fs also draws the HII tier (a second bind group over
  // the same pipeline), so HII dims under an active debug view too.
  return vec4<f32>(emission * u.params.w * u.debugView.w * fade, 0.0);
}
