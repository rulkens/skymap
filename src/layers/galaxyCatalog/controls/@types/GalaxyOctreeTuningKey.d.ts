import type { GalaxyBlobTuningKey } from './GalaxyBlobTuningKey';

/** The galaxy-catalog settings leaves the Debug panel's octree board edits: the cut's threshold and the blob look. */
export type GalaxyOctreeTuningKey = GalaxyBlobTuningKey | 'refineThreshold';
