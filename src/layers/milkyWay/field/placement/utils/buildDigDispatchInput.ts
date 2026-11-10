/** Shared by the `place:dig` stage and the debug readback. */

import type { GalaxyDescription } from '../../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyFieldStageContext } from '../../@types/GalaxyFieldStageContext';
import { ISM_MAP_RINGS } from '../../ismMap/data/ismMapRings';
import { findHiiSegment } from '../../starFormation/utils/findHiiSegment';
import type { DigVeilBudget } from '../@types/DigVeilBudget';
import type { PlaceDigVeilDispatchInput } from '../@types/PlaceDigVeilDispatchInput';
import { ismMapGridRadiusOrDefault } from '../../ismMap/utils/ismMapGridRadiusOrDefault';
import { ISM_MAP_AZ } from '../../ismMap/data/ismMapAz';

export function buildDigDispatchInput(
  ctx: GalaxyFieldStageContext,
  geo: GalaxyDescription,
  budget: DigVeilBudget,
): PlaceDigVeilDispatchInput {
  const grid = ismMapGridRadiusOrDefault(geo);
  return {
    seed: ctx.input.seed,
    budget,
    reservationOffset: findHiiSegment(ctx.model.hiiPack.get().segments, 'hii:dig')?.first ?? 0,
    generatorIsFluid: ctx.input.fieldTuning.ismMap.generator === 'fluid',
    cdfRings: ISM_MAP_RINGS,
    cdfAz: ISM_MAP_AZ,
    cdfRMin: grid.rMin,
    cdfRMax: grid.rMax,
    warp: {
      warpStrength: geo.warpStrength,
      warpTwist: geo.warpTwist,
      warpStartRadius: geo.warpStartRadius,
      outerRadius: geo.outerRadius,
    },
    prefixBuffer: ctx.chain.digCdfScan.prefixBuffer,
    hiiCompsBuffer: ctx.hiiComps.getBuffer(),
  };
}
