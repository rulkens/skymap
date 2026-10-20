import type { GalaxyCatalogSettings } from '../../../@types/settings/GalaxyCatalogSettings';

/** The galaxy-catalog settings leaves the Debug panel's octree blob board edits as sliders. */
export type GalaxyBlobTuningKey = keyof Pick<
  GalaxyCatalogSettings,
  'blobGain' | 'blobGlowOverlap' | 'blobPeakCap'
>;
