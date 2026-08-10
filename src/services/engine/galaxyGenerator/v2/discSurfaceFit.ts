/**
 * Math-derivation exception (comments.md): the disc's dimensionless
 * radial-profile fit, shared by every builder that needs the disc's own
 * surface density. Its own module, not `galaxyFieldMixture.ts`, because
 * `armParticleCloud.ts` needs it too and the mixture builder imports
 * `armParticleCloud.ts` — hosting it there would cycle.
 *
 * A sum of Gaussians fitted (ridge-regularised NNLS) to exp(-R/h) over R in
 * [0, 7h]: sigmas in units of h, weights as central surface densities, both
 * dimensionless so the fit re-scales to any disc. Constrained to
 * sum(weight_i * sigma_i^2) == 1, matching this mixture's flux to the
 * exponential's, over the full six-term fit — sigma ratios 3.4 and 5.0 are
 * placed by `pushWarpedOuterDisc` instead of as origin-centred blobs here,
 * so only the surviving four terms are listed; their removed weight share
 * still anchors that function's flux budget.
 *
 * `galaxyDustMixture.ts` reuses this exact fit at the dust disc's own scale
 * length — same dimensionless profile, different h.
 */
export const DISC_SIGMA_RATIOS = [0.35, 0.65, 1.15, 1.9] as const;
export const DISC_SURFACE_WEIGHTS = [0.1667, 0.3065, 0.2131, 0.1365] as const;
