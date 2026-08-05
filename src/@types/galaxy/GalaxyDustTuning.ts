/**
 * GalaxyDustTuning — what the analytic dust tier is fed, as opposed to what it
 * IS: the shape and opacity knobs live in `GalaxyDustParams` on the galaxy.
 */
export type GalaxyDustTuning = {
  /** Master toggle for the whole tier's shader loop (the particle cloud — see `GalaxyDustCloudParams`). */
  readonly enabled: boolean;
};
