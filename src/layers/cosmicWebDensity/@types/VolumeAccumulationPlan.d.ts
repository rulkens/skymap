/**
 * One view's progressive density sample for this frame: which running-mean sample it is, whether
 * the retained target restarts, and whether the march draws at all. Folded from last frame's value
 * by `planVolumeAccumulation`.
 */

import type { VolumeFieldDrawInputs } from '../../../@types/rendering/VolumeFieldDrawInputs';

export type VolumeAccumulationPlan = {
  /** Everything outside the view that invalidates the mean: settings, fades, tier, cube versions;
   *  `null` when no field is live. */
  readonly inputsKey: string | null;
  /** 1-based sample number this frame; 1 means restart. */
  readonly sample: number;
  /** Read by the executor's retained first touch (`restartRequested`). */
  readonly restart: boolean;
  /** False once the cap is reached, and while nothing is live. */
  readonly draw: boolean;
  /** `jitterIndex` = the frame index, `steps` = the tier's steps, `weight` = `1 / sample`. */
  readonly inputs: VolumeFieldDrawInputs;
};
