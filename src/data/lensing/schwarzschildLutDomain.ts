/**
 * schwarzschildLutDomain — the Schwarzschild deflection LUT's impact-parameter
 * domain, in r_s. Shared by `buildSchwarzschildDeflectionLut` (which samples
 * the domain) and `sgrAStarLensQuadRadiusM` (which needs the SAME max as the
 * lens quad's slab-envelope floor — a second copy could drift and reopen the
 * near-plane clip the envelope exists to close).
 */
export const MIN_IMPACT_PARAM_RS = 1; // below b_c throughout: exercises the capture sentinel
export const MAX_IMPACT_PARAM_RS = 50; // deep weak-field: 2/b ~ 0.04 rad, matches the asymptotic formula closely
