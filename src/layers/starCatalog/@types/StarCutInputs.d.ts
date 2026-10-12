/**
 * What the Layer's planner hands the GPU cut and the draws that read it: the
 * cut's determinants plus the clock and shade scalars it does not read.
 */

import type { StarCutSpec } from './StarCutSpec';

export type StarCutInputs = {
  readonly cut: StarCutSpec;
  /** Stamps each source's fade step. */
  readonly nowMs: number;
  readonly sizePx: number;
  readonly brightness: number;
  readonly glowOverlap: number;
  readonly aggregateIntensityCap: number;
};
