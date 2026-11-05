import type { OctreeStratify } from '../../@types/octree/OctreeStratify';
import { GALAXY_REFINE_THRESHOLD } from './galaxyRefineThreshold';

/**
 * GLADE's brightness stratification (Mpc): an M = mLim galaxy resolves at 1 Mpc, so a galaxy
 * resolves where it reaches apparent ≈ 19, about GLADE's B limit. Brighter mLim lifts the bulk
 * (M ≈ −20) to level 4, whose cells overflow the bake's dense-cell and index caps.
 */
export const GLADE_STRATIFY: OctreeStratify = {
  thr: GALAXY_REFINE_THRESHOLD,
  mLim: -6,
  refUnit: 1,
};
