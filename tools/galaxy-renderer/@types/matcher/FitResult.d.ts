/**
 * FitResult — `autoFit`'s return value: the best `GalaxyParams` found (with
 * `starCount` restored to the seed's full-quality budget, not the reduced
 * fit-time budget), its loss against the reference descriptor, the winning
 * render's descriptor, the number of candidate evaluations performed, and the
 * per-evaluation loss trace for a post-hoc convergence plot.
 */

import type { GalaxyParams } from '../model/GalaxyParams';
import type { GalaxyDescriptor } from './GalaxyDescriptor';

export type FitResult = {
  readonly params: GalaxyParams;
  readonly loss: number;
  readonly desc: GalaxyDescriptor | null;
  readonly iters: number;
  readonly history: readonly number[];
};
