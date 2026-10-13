import type { StarCatalogSettings } from '../../../@types/settings/StarCatalogSettings';

/** The star-catalog settings leaves the Debug panel's tuning board edits as sliders. */
export type StarCatalogTuningKey = keyof Pick<
  StarCatalogSettings,
  | 'refineThreshold'
  | 'glowOverlap'
  | 'exposureNearX'
  | 'exposureMidX'
  | 'exposureFarX'
  | 'aggregateIntensityCap'
>;
