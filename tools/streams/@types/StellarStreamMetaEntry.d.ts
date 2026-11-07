import type { Vec3 } from '../../../src/@types/math/Vec3';
import type { StreamMetallicity } from './StreamMetallicity';
import type { StreamStellarMass } from './StreamStellarMass';

/** One row of stellar_streams_meta.json; array position = stream index in the bin. */
export type StellarStreamMetaEntry = {
  /** Slug: lowercase, non-alphanumerics → '-', e.g. 'gd-1', 'sagittarius'. */
  id: string;
  names: string[];
  /** The Wikipedia article's lead; null without an article or when its summary has no extract. */
  description: string | null;
  /** English Wikipedia article about the stream itself (`streamWikipedia.constants`); null when none. */
  wikipediaTitle: string | null;
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
  /** What a full focus multiplies this stream's brightness by (`streamFocusBoost`), 1 or more. */
  focusBoost: number;
  /** Measured [Fe/H] and its citation; null when the median stood in, and for Sagittarius's gradient. */
  metallicity: StreamMetallicity | null;
  /** Published stellar mass and its citation; null where none is published as one value. */
  stellarMass: StreamStellarMass | null;
  anchorMpc: readonly [number, number, number];
  /** The track simplified for picking (`streamCentreline`); Sagittarius's arms joined at the remnant. */
  centrelineMpc: Vec3[];
  /** The pick ribbon's full width: the stream's, widened to hold its track; never shown. */
  ribbonWidthKpc: number;
};
