/**
 * FitStepInfo — the payload `autoFit` hands to `AutoFitOptions.onStep` after
 * every evaluated candidate (accepted or not), so a caller can render a live
 * progress trace (loss curve, current params, the rendered descriptor) without
 * `autoFit` itself knowing anything about UI.
 */

import type { GalaxyParams } from '../model/GalaxyParams';
import type { GalaxyDescriptor } from './GalaxyDescriptor';

export type FitStepInfo = {
  readonly iter: number;
  readonly loss: number;
  readonly params: GalaxyParams;
  readonly desc: GalaxyDescriptor | null;
  readonly note: string;
};
