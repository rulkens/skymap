/**
 * FitPlan — what `autoFit` optimises for one morphological category: the
 * descriptor-loss weights (silencing channels that are meaningless for that
 * category, e.g. zero arm weight for ellipticals), the ordered list of
 * `GalaxyParams` knobs to coordinate-descend over, and — for spirals/barred
 * only — the discrete arm counts to sweep before the continuous descent
 * starts. `arms` is `null` when the category has no arms to count, or when
 * the reference is too edge-on for the harmonic measurement to be reliable
 * (see `fitPlan`'s `armOK` gate).
 */

import type { DescriptorWeights } from './DescriptorWeights';
import type { FitParamRange } from './FitParamRange';

export type FitPlan = {
  readonly w: DescriptorWeights;
  readonly params: readonly FitParamRange[];
  readonly arms: readonly number[] | null;
};
