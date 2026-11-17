/**
 * The sky bakes the lens samples, one row per capture. Leaf data, never importing
 * `layer.ts`: `compositions/appCubemapCaptures.ts` collects these rows by import, and
 * core's `captureRowAllocateWhen` reaches that file from this Layer's own target.
 * `viewSlotBase` is hand-set under the slot rule in `data/rendering/cubemapCaptures.ts`.
 */

import type { SkyCapture } from '../../../../@types/rendering/SkyCapture';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { regionById } from '../../../../utils/regions/regionById';
import { SGR_A_STAR_LENSING_BAND } from './sgrAStarLensingBand';

export const BLACK_HOLE_SKY_CAPTURES = {
  sgrAStar: {
    kind: 'sky',
    target: 'sky-cubemap',
    anchor: regionById('galactic-centre'),
    band: SGR_A_STAR_LENSING_BAND,
    nearMpc: 0.1 * SCALE_UNITS.AU_TO_MPC,
    viewSlotBase: 1,
    rebakeOnSettings: true,
  },
} as const satisfies Record<string, SkyCapture>;
