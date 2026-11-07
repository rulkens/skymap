import type { StreamMetallicity } from './StreamMetallicity';

/** One row of stellar_streams_meta.json; array position = stream index in the bin. */
export type StellarStreamMetaEntry = {
  /** Slug: lowercase, non-alphanumerics → '-', e.g. 'gd-1', 'sagittarius'. */
  id: string;
  names: string[];
  description: string;
  source: 'vasiliev2021' | 'galstreams';
  reference: string;
  lengthKpc: number;
  /** The radius focus frames: half a track's length; for Sagittarius its denser debris's reach. */
  frameRadiusKpc: number;
  distanceKpc: readonly [number, number];
  /** null for the N-body stream and for tracks whose master-log width is unset. */
  widthDeg: number | null;
  particleCount: number;
  /** Mean of the emitted particles' colourT: tints the stream's caption like its streaks. */
  colourT: number;
  /** Measured [Fe/H] and its citation; null when the median stood in, and for Sagittarius's gradient. */
  metallicity: StreamMetallicity | null;
  anchorMpc: readonly [number, number, number];
};
