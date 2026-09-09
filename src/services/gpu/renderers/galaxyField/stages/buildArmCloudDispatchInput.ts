/** Shared by the `place:arm` stage and the debug readback. */

import type { GalaxyDescription } from '../../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyFieldMixtureResult } from '../../../../../@types/galaxy/GalaxyFieldMixtureResult';
import type { GalaxyFieldStageContext } from '../../../../../@types/galaxy/GalaxyFieldStageContext';
import type { PlaceArmCloudDispatchInput } from '../ismMap/createIsmMapPlaceArmCloud';

export function buildArmCloudDispatchInput(
  ctx: GalaxyFieldStageContext,
  geo: GalaxyDescription,
  reservation: NonNullable<GalaxyFieldMixtureResult['armCloudReservation']>,
): PlaceArmCloudDispatchInput {
  return {
    seed: ctx.input.seed,
    offset: reservation.offset,
    count: reservation.count,
    flux: reservation.flux,
    geometry: geo,
    tuning: ctx.input.fieldTuning,
    // A dead pass-through — `placeArmCloud.wesl` binds it and never samples
    // it, which is why `place:arm` declares no edge to `orientation:tex`.
    orientationTexture: ctx.chain.orientation.texture,
    fieldCompsBuffer: ctx.fieldComps.getBuffer(),
  };
}
