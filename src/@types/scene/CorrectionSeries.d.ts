/**
 * CorrectionSeries — one fitted `Horizons − model` residual over a span, in C channels: a cubic
 * in normalised time plus a sum of sinusoids. The channel unit is the owning field's (km, rad);
 * `correctionSeriesAt` evaluates it, `tools/bodies/buildEphemerisCorrections.ts` generates it.
 */

export type CorrectionSeries = {
  /** Fitted span start, UTC Julian date. */
  readonly startJd: number;
  /** Fitted span end, UTC Julian date. */
  readonly endJd: number;
  /** [τ⁰, τ¹, τ², τ³][channel]; τ = 2(t − startJd)/(endJd − startJd) − 1. */
  readonly poly: readonly [
    readonly number[],
    readonly number[],
    readonly number[],
    readonly number[],
  ];
  /** Flat per term: ω (rad/day), cos[0..C), sin[0..C); phase ω·(t − startJd). C = poly[0].length. */
  readonly terms: readonly number[];
};
