/**
 * IsmMapChannelWeights — per-channel isolation weights for the ISM-map debug view
 * (io.wesl's `ismMapChannels`), orthogonal to `debugViews.ismMap` (the whole
 * view's crossfade weight) — ismMapPresent.wesl's palette sums all four
 * channels, so with no per-channel control there was no way to tell gas from
 * activity from stars from dust. Each field names what the channel MEANS,
 * not just that it's a weight — see `RenderSettings`'s own docblocks for the
 * same four explained from the slider side.
 */

export type IsmMapChannelWeights = {
  /** Unspent ISM fuel — advected and relaxed toward the radial `gasProfile(r)` equilibrium by `gasRegen` each step. */
  readonly gasWeight: number;
  /** Young-stars tracer — an advected density deposited at SF events and decaying over the run. */
  readonly starsWeight: number;
  /** The accumulated trace of every front that passed, decayed per step by `activityDecay`. */
  readonly activityWeight: number;
  /** The conserved dust channel (packed texel's `.w`, since 9aa9fe5d) — swept-shell overshoot legitimately exceeds 1, up to the 8.0 ceiling; unclamped here so the slider can pull rim overshoot back into view. */
  readonly dustWeight: number;
};
