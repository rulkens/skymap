// lib/lensing.wesl — thin-lens deflection (SIS or NFW profile) summed over
// the in-view cluster lenses.
import package::lib::lensingUniforms::LensingUniforms;

//
// ## What this models
//
// Gravitational lensing is a LINE-OF-SIGHT effect: light from a distant
// source is bent as it passes a foreground mass, so the source's IMAGE
// appears shifted away from its true sky position. The shift depends on
// where the observer, the lens, and the source sit relative to one
// another — it is not a property of space you can fly around. That is
// why this lives in the vertex stage (per-source geometry) and NOT in a
// screen-space post-process: only sources that are actually BEHIND a
// lens, as seen from the current eye, may be deflected, and the amount
// scales with the observer→lens→source distance ratio. A post "pinch"
// filter cannot know any of that — it would bend the foreground and the
// Milky Way too, which is a lens-flare, not gravity.
//
// ## The model: singular isothermal sphere (SIS), one per cluster
//
// The SIS is the standard analytically-tractable cluster lens. Its one
// remarkable property: the deflection angle has CONSTANT magnitude θ_E
// (the Einstein radius) for every impact parameter. For a single lens the
// lens equation is
//
//     β = θ − θ_E          (β = true source angle from lens centre,
//                            θ = observed image angle)
//
// so a source seen at separation β has its primary image pushed OUTWARD
// to θ = β + θ_E. Sources near the line of sight pile up into a ring at
// θ_E — the Einstein ring — and a second, inner counter-image forms on the
// OPPOSITE side when β < θ_E.
//
// ## Many lenses: summed deflection + dominant-lens counter-image
//
// With N cluster lenses the exact problem is intractable in a vertex
// shader: superposing N SIS lenses has no closed-form image solution, and
// full multi-image is 2^N. So we approximate, in 'lensedPosition':
//
//   - PRIMARY image: SUM each foreground lens's deflection. Each lens
//     rotates the source direction away from its centre by δ along the
//     local tangent; for the per-lens shifts that compose to first order
//     as Σ δ_i·tangent_i added to the source direction. This gives the
//     full weak-shear field between clusters plus the outward ring push
//     near each one.
//   - COUNTER image: rendered for the DOMINANT lens only — the one with
//     the largest δ/β on this source (closest to forming a ring). Its
//     inner image fills the disk the primary alone would leave hollow.
//     The combinatorial 2^N counter-images of the weaker lenses are
//     dropped; the dominant one carries the visible ring interior.
//
// 'lensTerm' below resolves ONE lens's geometry; 'lensedPosition' runs the
// loop and the summation/dominant-pick. This keeps the per-lens math and the
// accumulation policy together, with the vertex stage just choosing which
// image (primary or counter) to ask for.
//
// ## Distance scaling and the two damping envelopes
//
// The Einstein radius carries a D_ls/D_s factor: a source just behind
// the lens is barely deflected, one at infinity feels the full θ_E. We
// use the Euclidean approximation D_ls = D_s − D_l, which is fine at the
// fidelity of an interactive viz (the box is ~Gpc, redshifts modest).
//
// A true SIS has infinite extent and would shift the ENTIRE sky by θ_E.
// We damp the deflection by TWO Gaussian envelopes:
//
//   - ANGULAR, a few Einstein radii wide in β. This is the real physics:
//     the deflection falls off with angular separation from the lens
//     centre, shaping the ring.
//   - SPATIAL, in world Mpc: gate on the IMPACT PARAMETER — the
//     perpendicular distance from the cluster centre to the source's line
//     of sight, b = D_l·sin β. The angular envelope's physical width is
//     ~3·θ_E·D_l, which GROWS with the eye→lens distance, so a pulled-back
//     camera lenses an ever-wider physical cone behind the cluster. Capping
//     b at a fixed Mpc scale instead confines each lens to a fixed-width
//     pencil along the line of sight to the cluster: sources directly
//     behind it are bent at ANY depth (b → 0, so the ring still forms),
//     off-axis sources are not, and a distant camera no longer widens the
//     reach. A real cluster's finite extent truncates its lensing at just
//     such a physical impact parameter, so this is also the honest
//     finite-SIS cutoff.
//
// ## Prototype scope
//
// Each lens centre is an in-view cluster (CPU-side: clusters in front of
// the camera, capped to the most massive MAX_LENSES). θ_E per cluster is
// the UI master angle scaled by the cluster's normalised-M500 significance
// — a coarse mass proxy and wildly exaggerated vs reality (real cluster
// Einstein radii are tens of arcseconds). Deriving θ_E from a proper
// velocity dispersion (σ_v from M500) is the follow-up.
//
// ## Brightness: magnification
//
// Lensing conserves surface brightness but magnifies the solid angle, so
// each image's FLUX is scaled by |μ|. For SIS (dθ/dβ = 1):
//
//     |μ_primary| = 1 + δ/β          (always ≥ 1, magnified)
//     |μ_counter| = δ/β − 1          (exists when β < δ; 0 at the edge,
//                                      diverging on-axis)
//
// where δ is the same envelope-damped deflection that positions the
// images, so brightness and geometry stay physically coupled — far from a
// lens (δ → 0) μ → 1 and the field is untouched. 'lensedPosition' folds the
// dominant lens's μ into the returned magnification, which 'vs' multiplies
// into per-galaxy intensity, so the ring reads as genuinely bright and the
// inner counter-images appropriately faint. μ formally diverges as β → 0 (a
// point source on the caustic); real sources are extended, which caps the
// peak — 'lensedPosition' approximates that finite-source limit with the
// caller-supplied muMax clamp.

// Spatial-envelope radius: the impact-parameter scale (world Mpc) over
// which a cluster's deflection dies off (1-sigma). Light passing within
// ~3x this of the cluster centre is bent. Single prototype value for now;
// the follow-up is to scale it per-cluster with mass alongside θ_E.
const LENS_LOCAL_RADIUS_MPC: f32 = 30.0;

// One lens's contribution to a source, resolved in the source's sky frame.
// 'valid == 0u' means the lens does not deflect this source (it sits in
// front of the lens, on the lens plane, or dead on-axis) and the caller
// skips it. When valid, the geometry is everything 'vs' needs to push the
// primary (δ along +tangent) and to place the dominant counter-image
// (δ − β on the −tangent side):
//
// ## NFW radial shape m(x) = g(x)/x
//
// The Navarro–Frenk–White profile (ρ ∝ 1/[(r/r_s)(1+r/r_s)²]) is the
// "universal" cold-dark-matter halo. Unlike the SIS's constant deflection,
// NFW deflection rises from zero at the core, peaks near the scale radius,
// then falls off as ~ln(x)/x — the curvature that gives real clusters their
// inner radial critical curve (radial arcs), not just the tangential ring.
//
// Its enclosed-mass function has a closed form (Wright & Brainerd 2000;
// Bartelmann 1996), with x = R/r_s the projected radius in scale-radius units:
//
//   g(x) = ln(x/2) + ⎧ arccosh(1/x)/√(1−x²)  (x < 1)
//                    ⎨ 1                       (x = 1) → g(1) = 1 − ln2
//                    ⎩ arccos(1/x)/√(x²−1)    (x > 1)
//
// and the deflection magnitude ∝ g(x)/x. We compute it analytically here
// rather than from a baked 1D LUT: it is a handful of transcendentals per
// vertex (cheap on the GPU) and avoids forcing a texture+sampler bind group
// onto the SHARED pick pipeline. arccosh(1/x) is expanded to its log form
// (log((1+√(1−x²))/x)) so we only need WGSL's core 'log'/'acos'/'sqrt'.
//
// The result is divided by NFW_SHAPE_PEAK (the numeric maximum of g(x)/x,
// ≈0.312 near x≈1.3) so the curve peaks at 1.0 — that makes the strength
// knob read as the *peak* angular deflection in BOTH modes, so toggling
// SIS↔NFW keeps the ring roughly the same size and only its profile changes.
const NFW_SHAPE_PEAK: f32 = 0.3122;

fn nfwShape(x: f32) -> f32 {
  let xc = clamp(x, 1e-4, 1e4);
  var g: f32;
  if (abs(xc - 1.0) < 1e-3) {
    g = 1.0 - 0.6931472; // g(1) = 1 − ln2 (removable singularity)
  } else if (xc < 1.0) {
    let s = sqrt(1.0 - xc * xc);
    // arccosh(1/x) = log((1 + √(1−x²)) / x)
    g = log(xc * 0.5) + log((1.0 + s) / xc) / s;
  } else {
    let s = sqrt(xc * xc - 1.0);
    g = log(xc * 0.5) + acos(1.0 / xc) / s;
  }
  return (g / xc) / NFW_SHAPE_PEAK;
}

//   beta     angular separation source↔lens centre (radians)
//   delta    profile deflection, distance-scaled (radians)
//   dirLens  unit direction eye→lens centre
//   tangent  unit in-plane direction pointing AWAY from the lens centre
struct LensTerm {
  valid: u32,
  beta: f32,
  delta: f32,
  dirLens: vec3<f32>,
  tangent: vec3<f32>,
}

// Resolve one cluster lens's geometry for a source.
//
//   eye            camera position, world Mpc
//   lens           xyz = lens centre (world Mpc), w = peak deflection (radians):
//                  Einstein radius θ_E in SIS mode, peak deflection in NFW mode
//   dirSrc         unit direction eye→source (precomputed once by the caller)
//   dS             distance eye→source, Mpc (precomputed once by the caller)
//   mode           0 = SIS (constant deflection), 1 = NFW (g(x)/x profile)
//   scaleRadiusMpc NFW scale radius r_s in Mpc (where the ring sits); SIS-ignored
fn lensTerm(
  eye: vec3<f32>,
  lens: vec4<f32>,
  dirSrc: vec3<f32>,
  dS: f32,
  mode: u32,
  scaleRadiusMpc: f32,
) -> LensTerm {
  var term: LensTerm;
  term.valid = 0u;
  term.beta = 0.0;
  term.delta = 0.0;
  term.dirLens = vec3<f32>(0.0, 0.0, 1.0);
  term.tangent = vec3<f32>(0.0, 0.0, 0.0);

  let thetaE = lens.w;
  if (thetaE <= 0.0) {
    return term;
  }

  let toLens = lens.xyz - eye;
  let dL = length(toLens);

  // Only sources BEHIND the lens are lensed; foreground objects (and the
  // lens-plane neighbours) pass through untouched. Guard tiny distances
  // so the direction normalisations below stay finite.
  if (dS <= dL || dL < 1e-4 || dS < 1e-4) {
    return term;
  }

  let dirLens = toLens / dL;

  // Distance scaling: deflection ∝ D_ls / D_s (Euclidean approx). Identical
  // for both profiles — a source just behind the lens is barely deflected,
  // one at infinity feels the full strength.
  let dLS = dS - dL;
  let distFactor = dLS / dS;

  // Angular separation β between the source and the lens centre, plus its
  // sine for the in-plane tangent.
  let cosB = clamp(dot(dirSrc, dirLens), -1.0, 1.0);
  let beta = acos(cosB);
  let sinB = sqrt(max(1.0 - cosB * cosB, 0.0));

  // Degenerate: source almost exactly behind the lens. The tangent
  // direction is undefined and a single point can't form a ring, so
  // skip this lens rather than pick an arbitrary direction.
  if (sinB < 1e-5) {
    return term;
  }

  // Unit tangent in the (dirLens, dirSrc) plane, pointing away from the
  // lens centre — the direction the primary image is pushed.
  let tangent = (dirSrc - dirLens * cosB) / sinB;

  // Deflection magnitude by profile.
  var delta: f32;
  if (mode == 1u) {
    // NFW: x = β·D_l/r_s is the impact parameter in scale-radius units. The
    // shape g(x)/x → 0 at both small and large x, so the effect self-localises
    // on the physical scale r_s — no separate envelope needed.
    let x = beta * dL / max(scaleRadiusMpc, 1e-4);
    delta = thetaE * distFactor * nfwShape(x);
  } else {
    // SIS: constant Einstein deflection θ_E·D_ls/D_s, damped by two envelopes
    // so an idealised infinite SIS doesn't pan the whole sky.
    let thetaEeff = thetaE * distFactor;
    // Angular: Gaussian ~3·θ_E wide — deflection dies off with separation.
    let angularEnv = exp(-(beta * beta) / (2.0 * thetaEeff * thetaEeff * 9.0));
    // Spatial: gate on the impact parameter b = D_l·sin β (perpendicular
    // distance from the cluster centre to the eye→source ray), in world Mpc.
    // Sources directly behind the cluster (b → 0) stay bent at any depth — so
    // the ring survives — while a distant camera cannot widen the reach.
    let impact = dL * sinB;
    let localEnv = exp(-(impact * impact) / (2.0 * LENS_LOCAL_RADIUS_MPC * LENS_LOCAL_RADIUS_MPC));
    delta = thetaEeff * angularEnv * localEnv;
  }

  term.valid = 1u;
  term.beta = beta;
  term.delta = delta;
  term.dirLens = dirLens;
  term.tangent = tangent;
  return term;
}

// One image (primary or counter) of a lensed source: its deflected world
// position, the magnification to fold into its intensity, and a validity
// flag. This encapsulates the summed-primary + dominant-lens-counter policy
// that the points vertex stage used to run inline, so both the visual and the
// pick pipeline see one authoritative deflection model.
//
//   valid     0u culls this quad (the inner counter-image when no such image
//             exists — source outside the Einstein radius, NFW counter, or a
//             disabled lens)
//   position  the lensed world position; identical to the source position when
//             the image is unlensed
//   mu        magnification multiplied into the per-image flux; 1.0 when the
//             source is unlensed
struct LensedImage {
  valid: u32,
  position: vec3<f32>,
  mu: f32,
}

// Resolve ONE image of a source under the active lens field.
//
//   sourceWorld  the source's true world position (eye-relative direction +
//                distance are recovered from it and 'eye')
//   eye          camera position, world Mpc
//   lensing      the shared lens uniform (enabled / count / mode / scaleRadius
//                + the lens array); passed by value, the established idiom for
//                small uniform structs in this pipeline
//   imageKind    0 = primary (summed deflection), 1 = inner counter-image
//   muMax        the peak-magnification clamp the caller keeps as a const
//
// When lensing is off (or the source is too close to the eye to deflect) the
// primary renders unlensed at unit magnification and the counter is culled.
// Otherwise the loop sums every foreground lens's deflection into the primary
// while tracking the dominant lens (largest delta/beta) for the counter image.
fn lensedPosition(
  sourceWorld: vec3<f32>,
  eye: vec3<f32>,
  lensing: LensingUniforms,
  imageKind: u32,
  muMax: f32,
) -> LensedImage {
  let toSrc = sourceWorld - eye;
  let dS = length(toSrc);

  var img: LensedImage;
  // Lens disabled / source on the eye → identity primary, culled counter.
  img.valid = select(1u, 0u, imageKind == 1u);
  img.position = sourceWorld;
  img.mu = 1.0;

  if (lensing.enabled == 1u && dS > 1e-4) {
    let dirSrc = toSrc / dS;

    var primaryOffset = vec3<f32>(0.0, 0.0, 0.0);
    var lensMu = 1.0;
    var bestRatio = 0.0;
    var bestBeta = 0.0;
    var bestDelta = 0.0;
    var bestDirLens = vec3<f32>(0.0, 0.0, 1.0);
    var bestTangent = vec3<f32>(0.0, 0.0, 0.0);
    var hasDominant = false;

    for (var i = 0u; i < lensing.count; i = i + 1u) {
      let term = lensTerm(eye, lensing.lenses[i], dirSrc, dS, lensing.mode, lensing.scaleRadius);
      if (term.valid == 0u) {
        continue;
      }
      // Primary: accumulate this lens's outward push (delta along +tangent).
      primaryOffset = primaryOffset + term.tangent * term.delta;
      // Primary brightness tracks the strongest single-lens magnification.
      lensMu = max(lensMu, min(1.0 + term.delta / term.beta, muMax));
      // Dominant lens for the counter image: largest delta/beta (nearest a ring).
      let ratio = term.delta / term.beta;
      if (ratio > bestRatio) {
        bestRatio = ratio;
        bestBeta = term.beta;
        bestDelta = term.delta;
        bestDirLens = term.dirLens;
        bestTangent = term.tangent;
        hasDominant = true;
      }
    }

    if (imageKind == 0u) {
      // Primary: source direction rotated by the SUMMED deflection.
      let dirImage = normalize(toSrc + primaryOffset * dS);
      img.position = eye + dirImage * dS;
      img.mu = lensMu;
      img.valid = 1u;
    } else if (hasDominant && lensing.mode == 0u) {
      // Counter image — SIS ONLY. The inner image sits at theta = delta − beta
      // on the −tangent side, valid when the source is inside the Einstein
      // radius. NFW is deliberately suppressed here: its deflection delta(beta)
      // varies, so the SIS closed-form counter position and the 1 + delta/beta
      // magnification place a spurious inner ghost. Correct NFW multi-imaging
      // requires inverting beta = theta − alpha(theta), which has no closed
      // form — deferred to the precomputed-LUT approach (see the NFW-lensing-LUT
      // design spec). Until then NFW renders the primary image only; the counter
      // quad is culled.
      let thetaC = bestDelta - bestBeta;
      if (thetaC > 0.0) {
        let dirImage = bestDirLens * cos(thetaC) - bestTangent * sin(thetaC);
        img.position = eye + dirImage * dS;
        img.mu = min(bestDelta / bestBeta - 1.0, muMax);
        img.valid = 1u;
      }
    }
  }

  return img;
}
