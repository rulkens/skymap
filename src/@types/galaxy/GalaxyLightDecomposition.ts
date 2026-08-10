/**
 * GalaxyLightDecomposition — how one galaxy's emitted light divides across the
 * four populations the analytic field builds. Fractions of the whole, summing
 * to exactly 1, so `GalaxyDescription.luminosity` times one of these IS what
 * that population emits. `galaxyLightDecomposition` reads them off a
 * Hubble-stage table; `galaxyPopulationCountShares` runs them BACKWARDS
 * through `SPRITE_POPULATION_BRIGHTNESS` to get v1's star counts. Citations
 * and the per-stage values are in `docs/research/milky-way/literature.md`.
 */
export type GalaxyLightDecomposition = {
  /**
   * B/T. A barred galaxy gets the SAME row as an unbarred one of its stage —
   * within the source sample, fitting a bar changes the measurement, not the
   * galaxy, so there's no separate barred row to prefer. By design there is
   * no per-galaxy override either (`GalaxyParams` carries no `bulgeToTotal`):
   * M31 and M104 are both visibly bulge-heavier than their stage mean and
   * both get the stage mean.
   */
  readonly bulge: number;
  /**
   * Bar/T, CONDITIONAL on a bar having been fitted — and this model spends
   * it that way: only the `barred` category builds bar geometry, so the
   * question is never "might this galaxy have a bar" but "how much light is
   * in the bar it has". A population average (multiplying by the bin's
   * bar-fitted fraction) would be wrong in both directions at once: it would
   * under-light a bar we know is there and light a bar that is not.
   */
  readonly bar: number;
  /**
   * The remainder: 1 - bulge - bar - halo. Arms are INSIDE this —
   * `pushArmRidges` derives their flux from measured arm/interarm contrast
   * against the disc profile and debits the disc by exactly what it adds
   * (`GalaxyArmTuning.contrast`), so arms redistribute disc light rather
   * than carry a share of their own.
   */
  readonly disc: number;
  /**
   * Halo/T, flat by design — no measurement of halo fraction by Hubble type
   * exists (the one study that lists it alongside morphology finds no
   * correlation). Do not "improve" this from better-measured MASS fractions:
   * light-to-mass corrections for the halo and the disc run in opposite
   * directions and must not be averaged together.
   */
  readonly halo: number;
};
