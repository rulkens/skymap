/**
 * What the Layer's planner hands the GPU cut and the draws that read it: the
 * cut's inputs plus the shade scalars the cut does not read.
 */

import type { OctreeCutInputs } from '../../../@types/octree/OctreeCutInputs';

export type StarCutInputs = OctreeCutInputs & {
  readonly sizePx: number;
  readonly brightness: number;
  readonly glowOverlap: number;
  readonly aggregateIntensityCap: number;
};
