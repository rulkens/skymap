/**
 * planVolumeAccumulation — the density running mean as a fold over last frame's value: a moving
 * view, a new view or changed inputs restart at sample 1; a still view counts up at weight 1/n
 * until the tier's cap, then stops drawing. `loading` holds only at rest, so continuous motion
 * (auto-rotate) never holds `settled()`. Nothing live votes nothing: a stop with the volume off
 * must not re-render a cap's worth of frames.
 */

import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { PassState } from '../../../../@types/engine/frame/PassState';
import type { PlannerResult } from '../../../../@types/engine/frame/PlannerResult';
import type { VolumeAccumulationPlan } from '../../@types/VolumeAccumulationPlan';
import { DENSITY_MARCH_STEPS_BY_TIER } from '../data/densityMarchStepsByTier';
import { DENSITY_SAMPLE_CAP_BY_TIER } from '../data/densitySampleCapByTier';

export function planVolumeAccumulation(
  prev: VolumeAccumulationPlan | undefined,
  view: Pick<FrameView, 'stillFrames'>,
  state: Pick<PassState, 'tier' | 'frameIndex'>,
  inputsKey: string | null,
): PlannerResult<VolumeAccumulationPlan> {
  const cap = DENSITY_SAMPLE_CAP_BY_TIER[state.tier];
  const atRest = view.stillFrames > 0;
  const row = (sample: number, restart: boolean, draw: boolean, converging: boolean) => ({
    value: {
      inputsKey,
      sample,
      restart,
      draw,
      inputs: {
        jitterIndex: state.frameIndex,
        steps: DENSITY_MARCH_STEPS_BY_TIER[state.tier],
        weight: 1 / sample,
      },
    },
    awake: converging,
    settling: false,
    loading: converging && atRest,
  });

  if (inputsKey === null) return row(1, true, false, false);
  if (!atRest || prev === undefined || prev.inputsKey !== inputsKey) {
    return row(1, true, true, 1 < cap);
  }
  if (prev.sample < cap) return row(prev.sample + 1, false, true, prev.sample + 1 < cap);
  return row(cap, false, false, false);
}
