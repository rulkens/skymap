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
  anchorMpc: readonly [number, number, number];
};
