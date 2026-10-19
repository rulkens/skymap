/**
 * VOYAGE_ARRIVAL_RADIUS_MPC — the sphere the arrival view fits about a destination galaxy, keyed by
 * its `focusId`: half the `diameterKpc` of its row in `data/seeds/famous_galaxies.seed.json`.
 */

import { SCALE_UNITS } from '../scaleUnits';

export const VOYAGE_ARRIVAL_RADIUS_MPC: Readonly<Record<'m31' | 'm87', number>> = {
  m31: (40.376262683545626 / 2) * SCALE_UNITS.KPC_TO_MPC,
  m87: (34.71571522815503 / 2) * SCALE_UNITS.KPC_TO_MPC,
};
