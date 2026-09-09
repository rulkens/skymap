/** Shared by the `place:dust` stage and the debug readback — one input shape, one place that assembles it. */

import type { GalaxyDescription } from '../../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyFieldStageContext } from '../../../../../@types/galaxy/GalaxyFieldStageContext';
import {
  ISM_MAP_AZ,
  ISM_MAP_RINGS,
  ismMapGridRadiusOrDefault,
} from '../../../../engine/galaxyGenerator/v2/galaxyIsmMapArmForcing';
import type { PlaceDustBudget } from '../ismMap/computePlaceDustBudget';
import type { PlaceDustDispatchInput } from '../ismMap/createIsmMapPlaceDust';

export function buildDustDispatchInput(
  ctx: GalaxyFieldStageContext,
  geo: GalaxyDescription,
  budget: PlaceDustBudget,
  /**
   * Debug-only, and absent it follows the live
   * `fieldTuning.ismMap.generator` — the production `place:dust` dispatch
   * passes nothing. `probeGpuErrors.ts` passes `false` to reach
   * placeDust.wesl's mode-1 (smoothDisc) branch, which nothing else in the
   * repo executes. Flipping the tuning to a non-fluid generator instead
   * would rerun the generator, both CDF scans and the placement, leaving two
   * readbacks either side of it over different maps and budgets — and hits
   * `docs/backlog/2026-08-12-ism-generator-none-copy-dst-crash.md`.
   */
  forceGeneratorIsFluid?: boolean,
): PlaceDustDispatchInput {
  const grid = ismMapGridRadiusOrDefault(geo);
  return {
    seed: ctx.input.seed,
    budget,
    dustOffset: ctx.model.fieldPack.get().counts.emission,
    generatorIsFluid: forceGeneratorIsFluid ?? ctx.input.fieldTuning.ismMap.generator === 'fluid',
    grid: { rings: ISM_MAP_RINGS, az: ISM_MAP_AZ, rMin: grid.rMin, rMax: grid.rMax },
    warp: {
      warpStrength: geo.warpStrength,
      warpTwist: geo.warpTwist,
      warpStartRadius: geo.warpStartRadius,
      outerRadius: geo.outerRadius,
    },
    prefixBuffer: ctx.chain.dustCdfScan.prefixBuffer,
    ringMeansBuffer: ctx.chain.generator.ringMeansBuffer,
    ismMapTexture: ctx.chain.generator.texture,
    orientationTexture: ctx.chain.orientation.texture,
    fieldCompsBuffer: ctx.fieldComps.getBuffer(),
  };
}
