/**
 * The disc's dimensionless radial-profile fit, shared by every builder that
 * needs the disc's own surface density: the mixture's disc components, the
 * dust disc, and the arm cloud's smooth-disc placement fallback. Its own
 * module (rather than living in `galaxyFieldMixture.ts`) because
 * `armParticleCloud.ts` needs it too, and `galaxyFieldMixture.ts` imports
 * `armParticleCloud.ts` — hosting it in the mixture builder would cycle.
 */

/**
 * A sum of Gaussians fitted (ridge-regularised NNLS) to exp(-R/h) over R in
 * [0, 7h]: sigmas in units of h, weights as central surface densities, both
 * dimensionless so the fit re-scales to any disc. Flux-weighted (by R, then
 * by the target itself so the R~1h peak doesn't swamp the faint R>5h tail)
 * and constrained to sum(weight_i * sigma_i^2) == 1, matching this mixture's
 * flux to the exponential's, over the FULL six-term fit — sigma ratios 3.4
 * and 5.0 are no longer rendered as origin-centred blobs here (see
 * `pushWarpedOuterDisc`), but their weight share still anchors that
 * function's flux budget, so only the surviving four are listed.
 *
 * Exported: `galaxyDustMixture.ts` reuses this exact fit, evaluated at the
 * dust disc's own scale length — same dimensionless profile, different h.
 */
export const DISC_SIGMA_RATIOS = [0.35, 0.65, 1.15, 1.9] as const;
export const DISC_SURFACE_WEIGHTS = [0.1667, 0.3065, 0.2131, 0.1365] as const;
