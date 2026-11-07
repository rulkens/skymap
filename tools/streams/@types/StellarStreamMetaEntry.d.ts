/** One row of stellar_streams_meta.json; array position = stream index in the bin. */
export type StellarStreamMetaEntry = {
  /** Slug: lowercase, non-alphanumerics → '-', e.g. 'gd-1', 'sagittarius'. */
  id: string;
  names: string[];
  description: string;
  source: 'vasiliev2021' | 'galstreams';
  reference: string;
  lengthKpc: number;
  distanceKpc: readonly [number, number];
  /** null for the N-body stream and for tracks whose master-log width is unset. */
  widthDeg: number | null;
  particleCount: number;
  /** Mean of the emitted particles' colourT: tints the stream's caption like its streaks. */
  colourT: number;
  /** Measured [Fe/H]; null when the table's median stood in, and for Sagittarius's gradient. */
  feh: number | null;
  /** Where `feh` was measured, e.g. 'Harris 2010'; null exactly when `feh` is. */
  fehRef: string | null;
  anchorMpc: readonly [number, number, number];
};
