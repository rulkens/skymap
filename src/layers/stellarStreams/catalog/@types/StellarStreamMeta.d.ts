/** One row of stellar_streams_meta.json; its array position is the stream index in the bin. */
export type StellarStreamMeta = {
  /** Slug, e.g. 'gd-1', 'sagittarius'. */
  readonly id: string;
  readonly names: readonly string[];
  readonly description: string;
  readonly source: 'vasiliev2021' | 'galstreams';
  readonly reference: string;
  /** Track length; for Sagittarius, the debris extent. */
  readonly lengthKpc: number;
  readonly distanceKpc: readonly [number, number];
  /** null for the N-body stream and for tracks with no catalogued width. */
  readonly widthDeg: number | null;
  readonly particleCount: number;
  /** Mean particle colourT (Gaia BP−RP over `STREAM_BP_RP_RANGE`); tints the caption. */
  readonly colourT: number;
  /** Measured [Fe/H]; null when the build defaulted it (never shown) and for Sagittarius. */
  readonly feh: number | null;
  /** Where `feh` was measured, e.g. 'Harris 2010'; null exactly when `feh` is. */
  readonly fehRef: string | null;
  readonly anchorMpc: readonly [number, number, number];
};
