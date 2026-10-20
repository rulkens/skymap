import type { OctreeStratify } from '../../@types/octree/OctreeStratify';
import { GALAXY_REFINE_THRESHOLD } from './galaxyRefineThreshold';

/** GLADE's brightness stratification (Mpc): an M = mLim galaxy resolves at 1 Mpc. First values, tuned in the bake sweep. */
export const GLADE_STRATIFY: OctreeStratify = {
  thr: GALAXY_REFINE_THRESHOLD,
  mLim: -14,
  refUnit: 1,
};
