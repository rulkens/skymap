/**
 * GalaxyDustTuning — what the analytic dust tier is fed, as opposed to what it
 * IS: the shape and opacity knobs live in `GalaxyDustParams` on the galaxy.
 */
export type GalaxyDustTuning = {
  /** Master toggle for the whole tier's shader loop (the particle cloud — see `GalaxyDustCloudParams`). */
  readonly enabled: boolean;
  /**
   * Gate for the dust particle cloud reading the SSPSF automaton's output. ON
   * makes the sampled map the cloud's ONLY placement density — the swept-dust
   * channel's overshoot above the automaton's ambient pedestal (see
   * `sweptDustOvershoot`) — replacing the analytic arm-lane/smooth-disc roll
   * entirely, and still elongates each splat along the measured crest
   * orientation. OFF leaves `buildDustParticleCloud` byte-identical to before
   * the map existed.
   *
   * Lives here rather than on `GalaxyFieldTuning.sfMap` because it gates a
   * CONSUMER of that tier's output, not a parameter of the automaton — the
   * `galaxy-renderer` panel still shows it under SF MAP, beside the map it
   * reads.
   *
   * Defaults ON, which is inert wherever no automaton runs: both consumers
   * need a sampled map handed in and fall back to the unseeded analytic path
   * without one, so this only takes effect where a map is actually produced.
   */
  readonly sfMapSeeding: boolean;
};
