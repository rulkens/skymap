// lib/lensing.wesl — singular-isothermal-sphere (SIS) thin-lens deflection,
// summed over the in-view cluster lenses.
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
// full multi-image is 2^N. So we approximate, in 'vs':
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
// 'lensTerm' below resolves ONE lens's geometry; 'vs' runs the loop and
// the summation/dominant-pick. This keeps the per-lens math here and the
// accumulation policy in the vertex stage.
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
// lens (δ → 0) μ → 1 and the field is untouched. 'vs' folds the dominant
// lens's μ into per-galaxy intensity, so the ring reads as genuinely
// bright and the inner counter-images appropriately faint. μ formally
// diverges as β → 0 (a point source on the caustic); real sources are
// extended, which caps the peak — 'vs' approximates that finite-source
// limit with its own MU_MAX clamp.

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
//   beta     angular separation source↔lens centre (radians)
//   delta    envelope-damped, distance-scaled Einstein radius (radians)
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
//   eye      camera position, world Mpc
//   lens     xyz = lens centre (world Mpc), w = Einstein radius (radians)
//   dirSrc   unit direction eye→source (precomputed once by the caller)
//   dS       distance eye→source, Mpc (precomputed once by the caller)
fn lensTerm(eye: vec3<f32>, lens: vec4<f32>, dirSrc: vec3<f32>, dS: f32) -> LensTerm {
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
  // skip this lens rather than pick an arbitrary direction.
  if (sinB < 1e-5) {
    return term;
  }

  // Unit tangent in the (dirLens, dirSrc) plane, pointing away from the
  // lens centre — the direction the primary image is pushed.
  let tangent = (dirSrc - dirLens * cosB) / sinB;

  // Angular envelope: Gaussian ~3·θ_E wide so the shift dies off with
  // separation from the lens centre instead of panning the whole sky.
  let angularEnv = exp(-(beta * beta) / (2.0 * thetaEeff * thetaEeff * 9.0));

  // Spatial envelope: gate on the impact parameter b = D_l·sin β (the
  // perpendicular distance from the cluster centre to the eye→source ray),
  // in world Mpc. Sources directly behind the cluster (b → 0) stay bent at
  // any depth — so the ring survives — while a distant camera cannot widen
  // the physical reach. See the header.
  let impact = dL * sinB;
  let localEnv = exp(-(impact * impact) / (2.0 * LENS_LOCAL_RADIUS_MPC * LENS_LOCAL_RADIUS_MPC));

  term.valid = 1u;
  term.beta = beta;
  term.delta = thetaEeff * angularEnv * localEnv;
  term.dirLens = dirLens;
  term.tangent = tangent;
  return term;
}
