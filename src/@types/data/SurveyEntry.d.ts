import type { BandLabels } from './BandLabels';

/**
 * One row of the SURVEY_REGISTRY — all the per-survey metadata needed by the
 * UI, the loader, and the camera, colocated so adding a new survey means
 * editing one place.
 *
 * `binBaseName` is `null` for sources without an on-disk file (e.g. the
 * Synthetic procedurally-generated cloud); every other field is required.
 */
export type SurveyEntry = {
  /** Stable numeric tag, matching the `.bin` file format byte. */
  readonly code: number;
  /** Display name shown in the UI legend (e.g. `'SDSS'`, `'GLADE'`). */
  readonly label: string;
  /**
   * Filename stem under `public/data/` (and on R2). `null` for sources with
   * no on-disk representation. Tier-aware sources get `-<tier>` appended by
   * `tierFilenameForSource`.
   */
  readonly binBaseName: string | null;
  /** True if the survey footprint covers (approximately) the full sphere. */
  readonly allSky: boolean;
  /**
   * Approximate effective depth used to frame the camera, in megaparsecs.
   * Not a strict cut — outliers may sit beyond.
   */
  readonly maxDistMpc: number;
  /** Band each `magU/G/R/I/Z` slot actually carries on this source. */
  readonly bandLabels: BandLabels;
};
