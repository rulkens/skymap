import type { GalaxyCatalogSettings } from '../../../@types/settings/GalaxyCatalogSettings';

/** The galaxy-catalog settings leaves the Debug panel's octree board edits as sliders. */
export type GalaxyBlobTuningKey = keyof Pick<
  GalaxyCatalogSettings,
  'refineThreshold' | 'blobGain' | 'blobGlowOverlap' | 'blobPeakCap'
>;
