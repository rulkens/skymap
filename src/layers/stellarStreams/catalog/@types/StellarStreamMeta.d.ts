/** One row of stellar_streams_meta.json; its array position is the stream index in the bin. */
export type StellarStreamMeta = {
  /** Slug, e.g. 'gd-1', 'sagittarius'. */
  readonly id: string;
  readonly names: readonly string[];
  /** The Wikipedia article's lead; null when there is none. */
  readonly description: string | null;
  /** English Wikipedia article about the stream itself; null when it has none. */
  readonly wikipediaTitle: string | null;
  readonly source: 'vasiliev2021' | 'galstreams';
  readonly reference: string;
  /** Track length; for Sagittarius, the debris extent. */
  readonly lengthKpc: number;
  /** The radius focus frames; tighter than half the extent for Sagittarius. */
  readonly frameRadiusKpc: number;
  readonly distanceKpc: readonly [number, number];
  /** null for the N-body stream and for tracks with no catalogued width. */
  readonly widthDeg: number | null;
  /** Mean particle colourT (Gaia BP−RP over `STREAM_BP_RP_RANGE`); tints the caption. */
  readonly colourT: number;
  /** What a full focus multiplies this stream's streaks and haze by: 1 for the brightest, more for dim ones. */
  readonly focusBoost: number;
  /** Measured [Fe/H] and its citation; null when the build defaulted it (never shown) and for Sagittarius. */
  readonly metallicity: { readonly feh: number; readonly ref: string } | null;
  /** Published stellar mass (M☉) and its citation; `partial` = measured over part of the stream, shown "≥". */
  readonly stellarMass: {
    readonly massMsun: number;
    readonly ref: string;
    readonly partial: boolean;
  } | null;
  readonly anchorMpc: readonly [number, number, number];
  /** The stream simplified to a few points for its pick ribbon; Sagittarius's arms joined at the remnant. */
  readonly centrelineMpc: readonly (readonly [number, number, number])[];
  /** The pick ribbon's full width: the stream's (defaulted where `widthDeg` is null), widened to hold its track; never shown. */
  readonly ribbonWidthKpc: number;
};
