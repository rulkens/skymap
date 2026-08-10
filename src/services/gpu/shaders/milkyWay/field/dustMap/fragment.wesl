// dustMap/fragment.wesl — splats the PRIMARY galaxy's dust slice into a
// screen-space column map: additively accumulating FOUR depth-sliced
// optical-depth channels (tau_0..tau_3, see io.wesl's dustSlices doc) per
// pixel, at fieldTex's own divisor-matched resolution (createGalaxyEngine.ts's
// dustMapTex declaration — NOT full canvas res). fieldSplat/fragment.wesl
// reads this map with one textureLoad per primary emission fragment; the
// JWST view mode (dustPresent/fragment.wesl) reads it too, summing the four
// channels to present the total column through a palette instead of using
// it to attenuate emission.

import package::milkyWay::field::dustMap::io::DustMapOut;
import package::lib::splatSilhouette::SPLAT_CUT;
import package::lib::gaussianIntegral::gaussianRayCoeffs;
import package::lib::gaussianIntegral::expHalfErfc;
import package::lib::gaussianIntegral::GAUSS_PI;
import package::milkyWay::field::io::u;
import package::milkyWay::field::io::comps;
import package::milkyWay::field::io::dustNoiseTex;
import package::milkyWay::field::io::dustNoiseSmp;
import package::milkyWay::field::dustDetail::dustDetailMultiplier;

// stretchNoiseCoord — S5 wisp anisotropy, stage 1: elongates the shared
// noise field along the disc's local AZIMUTHAL (tangential) direction at p
// by compressing the sample coordinate's tangential component by 1/stretch
// — the field then varies more slowly along rotation, so features read as
// stretched along it. Assumes the disc plane is XZ (io.wesl's comps doc:
// "Index 1 of M is the DISC POLE (+Y)"), so the tangent is just the in-plane
// radial direction rotated 90 degrees; no per-component orientation is read.
// A stage 2 would replace this generic proxy with the per-instance ISM
// orientation field (a vertex fetch + varying) — not built now.
// stretch <= 1 is the identity (today's isotropic field); the near-pole
// early-out avoids a zero-length normalize where p.xz is ~0.
fn stretchNoiseCoord(p: vec3<f32>, stretch: f32) -> vec3<f32> {
  if (stretch <= 1.0) {
    return p;
  }
  let r2 = vec2<f32>(p.x, p.z);
  let rl = length(r2);
  if (rl < 1e-6) {
    return p;
  }
  let radial = r2 / rl;
  let tangent = vec2<f32>(-radial.y, radial.x);
  let alongRadial = dot(r2, radial);
  let alongTangent = dot(r2, tangent) / stretch;
  let xz = alongRadial * radial + alongTangent * tangent;
  return vec3<f32>(xz.x, p.y, xz.y);
}

// dustNoiseWeighted — the shared, band-limited ridged-fbm sample BOTH S5's
// carve mask and dustNoiseMultiplier's interior erosion read; sharing the
// fetch means the two describe one coherent noisy cloud instead of two
// decorrelated ones (see dustCarveMask's own doc). 'p' is the ray's
// world-space closest-approach point to this Gaussian, 'depth' its distance
// along the ray (both already computed by the caller as o + d*tPeak /
// tPeak). Sampled at explicit LOD 0, no derivatives: this is a splat quad,
// so neighbouring fragments can belong to wildly different depths, and
// hardware-derivative LOD would pick the wrong footprint for at least one of
// them. Returns n in [0,1], mean ~0.5 by construction — see
// dustNoiseMultiplier's own doc for why that mean matters.
fn dustNoiseWeighted(p: vec3<f32>, depth: f32, stretch: f32) -> f32 {
  let coord = stretchNoiseCoord(p, stretch) / u.dustNoise.x;
  let bands = textureSampleLevel(dustNoiseTex, dustNoiseSmp, coord, 0.0);

  // dustMapHeightPx (counts2.y) is dustMapTex's own pixel height (io.wesl);
  // tanHalfFov (params.x) times depth is the world-space HALF-height of the
  // view frustum at this depth, so 2x that over the pixel height converts
  // to world units per pixel — this fragment's own footprint at 'depth'.
  let pxWorld = 2.0 * depth * u.params.x / u.counts2.y;
  if (pxWorld <= 0.0) {
    // Neutral: 0.5 is dustNoiseMultiplier's own no-op input (s=0 there), and
    // it zeroes S5's carve*(n-0.5) perturbation the same way.
    return 0.5;
  }

  // Four bands at 1x/2x/4x/8x the base tile frequency (dustNoiseBake.wesl),
  // weighted by a rough 1/f falloff (0.5/0.25/0.15/0.10) then REQUIRED to be
  // band-limited: at galaxy-wide zoom the high bands are far sub-pixel, and
  // sampling them unfiltered crawls badly under camera motion. A band's
  // weight ramps to zero once its wavelength has shrunk under ~2 world-space
  // pixels, and holds its full base weight once comfortably resolved.
  let w0 = 0.5 * clamp(u.dustNoise.x / (2.0 * pxWorld) - 1.0, 0.0, 1.0);
  let w1 = 0.25 * clamp((u.dustNoise.x / 2.0) / (2.0 * pxWorld) - 1.0, 0.0, 1.0);
  let w2 = 0.15 * clamp((u.dustNoise.x / 4.0) / (2.0 * pxWorld) - 1.0, 0.0, 1.0);
  let w3 = 0.10 * clamp((u.dustNoise.x / 8.0) / (2.0 * pxWorld) - 1.0, 0.0, 1.0);

  let wSum = w0 + w1 + w2 + w3;
  let weighted = bands.x * w0 + bands.y * w1 + bands.z * w2 + bands.w * w3;
  return weighted / max(wSum, 1e-6);
}

// dustNoiseMultiplier — shapes a shared dustNoiseWeighted sample 'n' (mean
// ~0.5) into a mean-1 density multiplier that erodes the particle cloud's
// own column (see io.wesl's dustNoise doc for why every dust component takes
// this branch now). Contrast is applied as a SIGNED power of 's' rather than
// a plain pow(n, g) on n itself, specifically to stay odd about s=0: an odd
// function preserves mean(s)=0 for a symmetric s, so the multiplier keeps
// mean 1 at ANY contrast setting — the cloud's total measured tau still
// holds in expectation, erosion only redistributes it. This only preserves
// the mean as well as n's own ~0.5 assumption already does (ridged fbm is
// not exactly symmetric); no new debt beyond that pre-existing
// approximation. The max(0, ...) clamp biases that mean very slightly
// upward at amplitudes above 1 (it can only clip the low tail, never the
// high one, since n in [0,1] bounds the unclamped term to [1-amp, 1+amp]);
// accepted rather than corrected — the slider tops out at 1.5, so the bias
// is small and the alternative (renormalising after the clamp) would cost a
// second pass over the same four samples for no visible gain.
fn dustNoiseMultiplier(n: f32) -> f32 {
  let s = 2.0 * n - 1.0;
  let shaped = sign(s) * pow(abs(s), u.dustNoise.w);
  return max(0.0, 1.0 + u.dustNoise.y * shaped);
}

// dustCarveMask — S5 silhouette carving, in BOUNDARY space rather than
// density space: the first S5 attempt smoothstepped radialWeight +
// carve*(n-0.5) directly, which sharpened the Gaussian's ~1-2 sigma contour
// into a hard ellipse outline at every carve, including carve near 0. Here
// the un-carved boundary sits at RHO0 = 3 sigma, where the Gaussian has
// already fallen to ~0.011 of its peak — invisible — so all visible change
// is noise BITING inward from nothing: nothing hardens at low carve, and
// nothing bulges past RHO0 at high carve.
//
// rho = sqrt(dc.z) is the Mahalanobis DISTANCE in sigma at the ray's closest
// approach (dc.z = gaussianRayCoeffs' q(tPeak), already the SQUARED
// Mahalanobis distance per gaussianIntegral.wesl's own derivation). 'n' is
// the SAME shared, band-limited sample dustNoiseMultiplier reads (mean
// ~0.5); rhoB = RHO0*(1 - carve*n) pulls the boundary inward only (n in
// [0,1], carve in [0,1] => rhoB in [0, RHO0]), so mean bite depth scales
// with carve * mean(n). w, the smoothstep half-width in sigma, is
// sharpness's whole effect now: 0.9 sigma reads as a soft airbrushed tear,
// 0.06 sigma as a crisp torn edge.
const RHO0: f32 = 3.0;

fn dustCarveMask(rho: f32, n: f32, carve: f32, sharpness: f32) -> f32 {
  let w = mix(0.9, 0.06, clamp(sharpness, 0.0, 1.0));
  let rhoB = RHO0 * (1.0 - carve * n);
  return 1.0 - smoothstep(rhoB - w, rhoB + w, rho);
}

// Edge-on gate for S4: the ISM map is 2D (p.xz only), so near edge-on a
// vertical run of fragments hits nearly one texel -> stripes 'breakup' above
// can't hide. camFwd.y (dot with the +Y disc pole), not ray 'd', discriminates
// face/edge-on — 'd' is camFwd-dominated, FOV deflection only softens this.
// Eyeballed; |camFwd.y| -> 1 (face-on) must stay an exact no-op below.
const EDGE_ON_START: f32 = 0.15;
const EDGE_ON_FULL: f32 = 0.45;

@fragment
fn fs(input: DustMapOut) -> @location(0) vec4<f32> {
  // Reconstructs the world-space ray from the interpolated NDC, exactly as
  // fieldSplat/fragment.wesl's fs does — the two must agree pixel-for-pixel
  // since the map is later read back at the SAME framebuffer coordinates.
  let tanHalfFov = u.params.x;
  let aspect = u.params.y;
  let shift = u.params.z;
  let d = normalize(
    u.camRight.xyz * ((input.ndc.x + shift) * tanHalfFov * aspect)
      + u.camUp.xyz * (input.ndc.y * tanHalfFov)
      + u.camFwd.xyz,
  );
  let o = u.eye.xyz;

  let dustOffset = u32(u.counts.y);
  let base = 4u * (dustOffset + input.inst);
  let dg0 = comps[base];
  let dg1 = comps[base + 1u];
  let dg3 = comps[base + 3u];
  let po = o - dg3.xyz;

  let dc = gaussianRayCoeffs(po, d, dg0.xyz, dg1.xyz);
  let a = dc.x;

  // dc.z (the ray's closest-approach squared Mahalanobis distance) past
  // SPLAT_CUT^2 means this fragment sits on a fullscreen-fallback quad
  // (splatSilhouette.wesl) the ray never actually grazes this component's
  // support — same cut fieldSplat/fragment.wesl's fs applies to its own hoisted coeffs,
  // for the same reason: the slice contribution below is already under the
  // vertex-side quad's own truncation. a < 1e-12 leaves dc.z at
  // gaussianRayCoeffs' null-space 0.0, which never trips this, so it falls
  // through to the null-space guard right below unchanged.
  if (dc.z > SPLAT_CUT * SPLAT_CUT) {
    return vec4<f32>(0.0);
  }

  // a < 1e-12: ray in this component's covariance null space — additive
  // blend means "contribute nothing" is the correct default, not a fallback
  // path (there's no other estimate to fall back to for one instance).
  if (a < 1e-12) {
    return vec4<f32>(0.0);
  }

  // -b/a is this component's own closest-approach depth along the ray;
  // clamped to 0 because a component whose peak is behind the eye still
  // contributes column density in front of it. Hoisted ahead of the slice
  // math below (S5): the carve test right after needs it for the shared
  // noise sample, and is meant to skip that math on a miss — the actual
  // perf win, not just a colour clamp.
  let tPeak = max(-dc.y / a, 0.0);
  let p = o + d * tPeak;

  // Erosion and S5 carving both apply to every dust component — input.inst
  // is this draw's index within the dust slice (see 'base' above), and
  // cloudOffset (dustNoise.z) is where the cloud components start within
  // that same slice (io.wesl's dustNoise doc); it is always 0 now that the
  // particle cloud is the only dust tier, so this gate never skips either
  // path. Kept rather than deleted since the uniform layout still reserves
  // the field.
  let cloudActive = input.inst >= u32(u.dustNoise.z);
  let noiseActive = u.dustNoise.y > 0.0 && cloudActive;
  let carveActive = u.dustCarve.x > 0.0 && cloudActive;

  // Shared fetch (S5): the sample happens once, when EITHER path needs it,
  // and both read the identical 'n' — see dustNoiseWeighted's own doc.
  var n = 0.5;
  if (noiseActive || carveActive) {
    n = dustNoiseWeighted(p, tPeak, u.dustCarve.z);
  }

  // carve <= 0 is the MANDATORY identity: skip the branch outright rather
  // than compute a smoothstep that would be near-1 but not exactly 1, which
  // would still reshape the silhouette (io.wesl's dustCarve doc).
  var carveMask = 1.0;
  if (carveActive) {
    let rho = sqrt(dc.z);
    carveMask = dustCarveMask(rho, n, u.dustCarve.x, u.dustCarve.y);
    // The early-out: a carved-away fragment skips the four expHalfErfc
    // evaluations below entirely, the perf win this feature buys back for
    // itself (io.wesl's dustCarve doc) — the boundary rhoB shrinks toward
    // the core as carve rises, so the early-out fires more often the harder
    // the carve.
    if (carveMask <= 0.0) {
      return vec4<f32>(0.0);
    }
  }

  // tail(t) is this component's own column from depth t to infinity — the
  // same closed form as a whole-ray (t=0) column integral. amplitude (dg0.w)
  // is the component's central V-band
  // extinction density — see io.wesl's layout comment. x(t) = (b + a*t) /
  // sqrt(2a) is expHalfErfc's own lower-limit argument (gaussianIntegral.wesl);
  // x0 is x(0), and each further edge just adds a*t_k/sqrtHalfA to it.
  let sqrtHalfA = sqrt(2.0 * a);
  let coeff = dg0.w * sqrt(GAUSS_PI / (2.0 * a));
  let x0 = dc.y / sqrtHalfA;
  let aOverSqrtHalfA = a / sqrtHalfA;
  let tail0 = coeff * expHalfErfc(dc.z, x0);
  let tail1 = coeff * expHalfErfc(dc.z, x0 + aOverSqrtHalfA * u.dustSlices.x);
  let tail2 = coeff * expHalfErfc(dc.z, x0 + aOverSqrtHalfA * u.dustSlices.y);
  let tail3 = coeff * expHalfErfc(dc.z, x0 + aOverSqrtHalfA * u.dustSlices.z);
  // Slice k's own column is the tail mass BETWEEN its two edges (tail(t4 =
  // infinity) is 0, folded in directly rather than a fourth expHalfErfc
  // call). Each difference of two close tail values loses precision as the
  // slice narrows (the erfc rational approximation is not bit-exact
  // monotonic across its two branches — gaussianIntegral.wesl's erfc x>=0/
  // x<0 split); clamped at 0 so that cancellation noise never becomes a
  // small negative tau feeding the additive accumulation, rather than
  // trusting it to stay non-negative on every GPU's math library.
  var slices = vec4<f32>(
    max(tail0 - tail1, 0.0),
    max(tail1 - tail2, 0.0),
    max(tail2 - tail3, 0.0),
    max(tail3, 0.0),
  );

  // S5's mask, applied after the slice math it early-out past above — a
  // fragment that reaches here either has carving off or survived the mask
  // test, so this is always a no-op or a genuine attenuation, never the
  // carved-away case (that already returned).
  if (carveActive) {
    slices = slices * carveMask;
  }
  // Erosion is a DENSITY modulation, not a depth-dependent one, so the same
  // scalar multiplies all four slices. 'n' is the fetch shared with S5 above
  // (dustNoiseWeighted's own doc) — computed once whichever path needed it
  // first.
  if (noiseActive) {
    slices = slices * dustNoiseMultiplier(n);
  }
  // S4: same sample point as the erosion noise above, for the same reason —
  // per-fragment, per-component, so the map's top octave parallaxes with the
  // splats rather than stamping a flat disc-plane decal. Its own gate
  // (dustDetail.x <= 0) is independent of noiseAmp: erosion off must not
  // disable map detail. The ratio is a density term, so it applies to all
  // four slices alike. The map is 2D, so its ratio alone is constant along a
  // vertical ray through the cloud; dustDetailMultiplier's 'breakup' scales
  // just the deviation from 1 by a mean-1 sample of the same noise volume
  // erosion uses, above, so the vertical coherence breaks up while the
  // column ratio holds in expectation.
  if (u.dustDetail.x > 0.0) {
    // Half-tile offset decorrelates this breakup field from the erosion
    // field sampled at the unoffset coordinate above; reusing the same
    // field would correlate two multiplicative terms and bias the
    // product's mean.
    let bands = textureSampleLevel(
      dustNoiseTex, dustNoiseSmp, p / u.dustNoise.x + vec3<f32>(0.5), 0.0,
    );
    let w = 2.0 * bands.y; // 2x band, mean ~0.5 -> w mean ~1.
    let pxWorld = 2.0 * tPeak * u.params.x / u.counts2.y;
    var breakup = 1.0;
    if (pxWorld > 0.0) {
      // Band-limited like dustNoiseMultiplier's own w1 term above, but
      // ramped toward NEUTRAL 1.0, not 0: sub-pixel breakup would crawl
      // under camera motion exactly like unweighted erosion bands, and at
      // that distance the banding it exists to hide is itself sub-pixel.
      let resolved = clamp((u.dustNoise.x / 2.0) / (2.0 * pxWorld) - 1.0, 0.0, 1.0);
      breakup = mix(1.0, w, resolved);
    }
    let detail = dustDetailMultiplier(p, breakup);
    let edgeOnFade = smoothstep(EDGE_ON_START, EDGE_ON_FULL, abs(u.camFwd.y));
    slices = slices * (1.0 + (detail - 1.0) * edgeOnFade);
  }
  return slices;
}
