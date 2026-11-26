/** One view's progressive density sample this frame, folded by `planVolumeAccumulation`. */
import type { VolumeFieldDrawInputs } from '../../../@types/rendering/VolumeFieldDrawInputs';

export type VolumeAccumulationPlan = {
  /** Every input outside the view the mean depends on; `null` when no field is live. */
  readonly inputsKey: string | null;
  /** 1-based; 1 means restart, and `inputs.weight` is `1 / sample`. */
  readonly sample: number;
  readonly restart: boolean;
  /** False once the cap is reached, and while nothing is live. */
  readonly draw: boolean;
  readonly inputs: VolumeFieldDrawInputs;
};
