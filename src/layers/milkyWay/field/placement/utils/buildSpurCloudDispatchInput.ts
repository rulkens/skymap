/** Shared by the `place:spur` stage and the debug readback. */

import type { GalaxyDescription } from '../../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyFieldMixtureResult } from '../../mixture/@types/GalaxyFieldMixtureResult';
import type { GalaxyFieldStageContext } from '../../@types/GalaxyFieldStageContext';
import type { PlaceArmSpurCloudDispatchInput } from '../@types/PlaceArmSpurCloudDispatchInput';

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
