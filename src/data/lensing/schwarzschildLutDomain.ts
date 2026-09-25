/**
 * schwarzschildLutDomain — the Schwarzschild deflection LUT's impact-parameter
 * domain in r_s. `blackHoleLensEnvelopeM` reads the same MAX for its
 * slab-envelope floor; a second copy could drift and reopen the near-plane
 * clip that envelope exists to close.
 */
export const MIN_IMPACT_PARAM_RS = 1; // below b_c: exercises the capture sentinel
export const MAX_IMPACT_PARAM_RS = 50; // deep weak field, matches the asymptotic formula
