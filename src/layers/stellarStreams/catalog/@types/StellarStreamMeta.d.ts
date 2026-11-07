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
  /** Mean particle colourT, 0 (blue horizontal branch) to 1 (red giant); tints the caption. */
  readonly colourT: number;
  readonly anchorMpc: readonly [number, number, number];
};
