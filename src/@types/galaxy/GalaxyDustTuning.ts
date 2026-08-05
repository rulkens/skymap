/**
 * GalaxyDustTuning — what the analytic dust tier is fed, as opposed to what it
 * IS: the shape and opacity knobs live in `GalaxyDustParams` on the galaxy.
 */
export type GalaxyDustTuning = {
  /** Master toggle for the whole tier's shader loop (the particle cloud — see `GalaxyDustCloudParams`). */
  readonly enabled: boolean;
  /**
   * Gate for the dust particle cloud reading the SSPSF automaton's output. ON
   * makes the sampled map the cloud's ONLY placement density (`gas *
   * oldActivity` — see `sfMapDustDensity`), replacing the analytic
   * arm-lane/smooth-disc roll entirely, and still elongates each splat along
   * the measured crest orientation. OFF leaves `buildDustParticleCloud`
   * byte-identical to before the map existed.
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
  /**
   * Blend between the two dust-placement channels the automaton now carries:
   * 0 reads the legacy `gas x oldActivity` product (today's image), 1 reads
   * the conserved swept-dust channel (`docs/research/m74-jwst/
   * 06-ca-dust-channel-sketch.md`) every consumer decodes from `texel.dust`.
   * The legacy product time-integrates the swept AREA (activity accumulates
   * over the whole run), while the swept channel is a short-memory front
   * tracer (reset by each front's own floor/collision rule) — 0 is the
   * broad-smear image already shipped, 1 is thin rims and dark cavities.
   * Defaults 0: every consumer (CPU seeding, the S4 blur, the detail ratio)
   * must read this identically or the three would disagree about what a
   * "wall" looks like.
   */
  readonly sweptMix: number;
};
