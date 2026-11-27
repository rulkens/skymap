/**
 * cosmicWebDensityAccumulationPlanner — per view, this frame's step of the density running mean
 * (`planVolumeAccumulation`). It reads the liveness both density passes read, so it cannot
 * disagree with them about which fields are live; its `restart` clears the retained
 * `cosmic-web-density` target through the render line's `restartPlanner`.
 */

import type { FrameContentPlanner } from '../../@types/engine/frame/FrameContentPlanner';
import type { CosmicWebDensityFieldId } from './@types/CosmicWebDensityFieldId';
import type { CosmicWebDensityRuntime } from './@types/CosmicWebDensityRuntime';
import type { VolumeAccumulationPlan } from './@types/VolumeAccumulationPlan';
import { deriveCosmicWebDensityLiveness } from './densityCubes/present/deriveCosmicWebDensityLiveness';
import { densityAccumulationKey } from './densityCubes/utils/densityAccumulationKey';
import { planVolumeAccumulation } from './densityCubes/utils/planVolumeAccumulation';

export function cosmicWebDensityAccumulationPlanner(
  runtime: CosmicWebDensityRuntime,
): Extract<FrameContentPlanner<VolumeAccumulationPlan, 'cosmicWebDensity'>, { scope: 'perView' }> {
  return {
    name: 'cosmic-web-density-accumulation',
    scope: 'perView',
    fade: 'cosmicWebDensity',
    plan: (view, state, prev, fade) => {
      const live = deriveCosmicWebDensityLiveness(runtime, state, view, fade);
      const inputsKey =
        live === null
          ? null
          : densityAccumulationKey(
              Object.keys(runtime.slots) as CosmicWebDensityFieldId[],
              live.settingsOf,
              live.fadeOpacityOf,
              (id) => runtime.slots[id].committed()?.loadedAtMs ?? null,
              live.regionOf,
              state.tier,
            );
      return planVolumeAccumulation(prev, view, state, inputsKey);
    },
  };
}
