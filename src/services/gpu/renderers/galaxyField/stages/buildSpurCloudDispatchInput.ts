/** Shared by the `place:spur` stage and the debug readback. */

import type { GalaxyDescription } from '../../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyFieldMixtureResult } from '../../../../../@types/galaxy/GalaxyFieldMixtureResult';
import type { GalaxyFieldStageContext } from '../../../../../@types/galaxy/GalaxyFieldStageContext';
import type { PlaceArmSpurCloudDispatchInput } from '../ismMap/createIsmMapPlaceArmSpurCloud';

export function buildSpurCloudDispatchInput(
  ctx: GalaxyFieldStageContext,
  geo: GalaxyDescription,
  reservation: NonNullable<GalaxyFieldMixtureResult['spurCloudReservation']>,
): PlaceArmSpurCloudDispatchInput {
  return {
    seed: ctx.input.seed,
    offset: reservation.offset,
    count: reservation.count,
    flux: reservation.flux,
    spurArms: reservation.spurArms,
    geometry: geo,
    tuning: ctx.input.fieldTuning,
    fieldCompsBuffer: ctx.fieldComps.getBuffer(),
  };
}
