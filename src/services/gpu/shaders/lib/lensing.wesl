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
// Returns the source's world position MOVED so its projected screen
// position carries the SIS image shift. The radial distance from the eye
// is preserved — lensing changes apparent direction, not the measured
// distance — so downstream apparent-size / depth-fade math is unaffected.
//
//   eye        camera position, world Mpc
//   lensCenter lens (cluster) centre, world Mpc
//   thetaE     Einstein angular radius in radians (already × exaggeration)
//   enabled    0 = pass through unchanged, 1 = lens
//   srcWorld   the source galaxy's world position, Mpc
fn lensDeflect(
  eye: vec3<f32>,
  lensCenter: vec3<f32>,
  thetaE: f32,
  enabled: u32,
  srcWorld: vec3<f32>,
) -> vec3<f32> {
  if (enabled == 0u || thetaE <= 0.0) {
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

  // SIS distance scaling: deflection ∝ D_ls / D_s (Euclidean approx).
  let dLS = dS - dL;
  let thetaEeff = thetaE * (dLS / dS);

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

  // Finite-cluster envelope: Gaussian ~3·θ_E wide so the shift dies off
  // far from the lens centre instead of panning the whole sky.
  let envelope = exp(-(beta * beta) / (2.0 * thetaEeff * thetaEeff * 9.0));
  let delta = thetaEeff * envelope;

  // SIS primary image: source at β appears at θ = β + θ_E (outward).
  let theta = beta + delta;
  let dirImage = dirLens * cos(theta) + tangent * sin(theta);

  // Preserve distance: only the apparent direction changes.
  return eye + dirImage * dS;
}
