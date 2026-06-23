// lib/lensing.wesl — singular-isothermal-sphere (SIS) thin-lens deflection.
//
// ## What this models
//
// Gravitational lensing is a LINE-OF-SIGHT effect: light from a distant
// source is bent as it passes a foreground mass, so the source's IMAGE
// appears shifted away from its true sky position. The shift depends on
// where the observer, the lens, and the source sit relative to one
// another — it is not a property of space you can fly around. That is
// why this lives in the vertex stage (per-source geometry) and NOT in a
// screen-space post-process: only sources that are actually BEHIND the
// lens, as seen from the current eye, may be deflected, and the amount
// scales with the observer→lens→source distance ratio. A post "pinch"
// filter cannot know any of that — it would bend the foreground and the
// Milky Way too, which is a lens-flare, not gravity.
//
// ## The model: singular isothermal sphere (SIS)
//
// The SIS is the standard analytically-tractable cluster lens. Its one
// remarkable property: the deflection angle has CONSTANT magnitude θ_E
// (the Einstein radius) for every impact parameter. The lens equation is
//
//     β = θ − θ_E          (β = true source angle from lens centre,
//                            θ = observed image angle)
//
// so a source seen at separation β has its primary image pushed OUTWARD
// to θ = β + θ_E. Sources near the line of sight pile up into a ring at
// θ_E — the Einstein ring. The SIS also produces a second, inner
// counter-image when β < θ_E; this prototype renders only the primary
// image (the counter-image needs the source emitted twice).
//
// ## Distance scaling and the finite-cluster envelope
//
// The Einstein radius carries a D_ls/D_s factor: a source just behind
// the lens is barely deflected, one at infinity feels the full θ_E. We
// use the Euclidean approximation D_ls = D_s − D_l, which is fine at the
// fidelity of an interactive viz (the box is ~Gpc, redshifts modest).
//
// A true SIS has infinite extent and would shift the ENTIRE sky by θ_E.
// Real clusters are finite, so we damp the deflection with a Gaussian
// envelope a few Einstein radii wide, keeping the distortion a local
// "lens" around the cluster instead of a global pan.
//
// ## Prototype scope
//
// θ_E here is a UI-exaggerated angle (real cluster Einstein radii are
// tens of arcseconds — invisible at typical zoom), and the lens centre
// is the camera orbit target rather than a mass-weighted cluster. Both
// are deliberate prototype shortcuts; deriving θ_E from a cluster's
// velocity dispersion (σ_v from M500) is the follow-up.

// Deflect a source's apparent position around a foreground lens.
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
// (log((1+√(1−x²))/x)) so we only need WGSL's core `log`/`acos`/`sqrt`.
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

// Returns the source's world position MOVED so its projected screen
// position carries the lensed image shift. The radial distance from the eye
// is preserved — lensing changes apparent direction, not the measured
// distance — so downstream apparent-size / depth-fade math is unaffected.
//
//   eye           camera position, world Mpc
//   lensCenter    lens (cluster) centre, world Mpc
//   strength      peak angular deflection in radians (already × exaggeration):
//                 the Einstein radius θ_E in SIS mode, the peak deflection in
//                 NFW mode (the shape is peak-normalised to match)
//   scaleRadiusMpc NFW scale radius r_s in Mpc (sets where the ring sits);
//                 ignored in SIS mode
//   mode          0 = SIS (constant deflection), 1 = NFW (g(x)/x profile)
//   enabled       0 = pass through unchanged, 1 = lens
//   srcWorld      the source galaxy's world position, Mpc
fn lensDeflect(
  eye: vec3<f32>,
  lensCenter: vec3<f32>,
  strength: f32,
  scaleRadiusMpc: f32,
  mode: u32,
  enabled: u32,
  srcWorld: vec3<f32>,
) -> vec3<f32> {
  if (enabled == 0u || strength <= 0.0) {
    return srcWorld;
  }

  let toLens = lensCenter - eye;
  let toSrc = srcWorld - eye;
  let dL = length(toLens);
  let dS = length(toSrc);

  // Only sources BEHIND the lens are lensed; foreground objects (and the
  // lens-plane neighbours) pass through untouched. Guard tiny distances
  // so the direction normalisations below stay finite.
  if (dS <= dL || dL < 1e-4 || dS < 1e-4) {
    return srcWorld;
  }

  let dirLens = toLens / dL;
  let dirSrc = toSrc / dS;

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
  // leave it where it is rather than pick an arbitrary direction.
  if (sinB < 1e-5) {
    return srcWorld;
  }

  // Unit tangent in the (dirLens, dirSrc) plane, pointing away from the
  // lens centre — the direction the image is pushed.
  let tangent = (dirSrc - dirLens * cosB) / sinB;

  // Deflection magnitude by profile.
  var delta: f32;
  if (mode == 1u) {
    // NFW: x = β·D_l/r_s. The shape → 0 at both small and large x, so the
    // effect self-localises — no Gaussian envelope needed.
    let x = beta * dL / max(scaleRadiusMpc, 1e-4);
    delta = strength * distFactor * nfwShape(x);
  } else {
    // SIS: constant Einstein deflection, localised with a Gaussian ~3·θ_E
    // wide so an idealised infinite SIS doesn't pan the whole sky.
    let thetaEeff = strength * distFactor;
    let envelope = exp(-(beta * beta) / (2.0 * thetaEeff * thetaEeff * 9.0));
    delta = thetaEeff * envelope;
  }

  // Primary image: source at β appears at θ = β + δ (pushed outward).
  let theta = beta + delta;
  let dirImage = dirLens * cos(theta) + tangent * sin(theta);

  // Preserve distance: only the apparent direction changes.
  return eye + dirImage * dS;
}
