import type { PointCloud } from '../data/PointCloud';
import type { Source } from '../../data/sources';

/** Inputs for a Schechter-ratio bake. */
export type ComputeSchechterRatiosInput = {
  /** Point cloud whose galaxies need per-row Schechter ratios. */
  cloud: PointCloud;
  /** Survey this cloud belongs to — drives `mLim` and the Schechter triple. */
  source: Source;
};
