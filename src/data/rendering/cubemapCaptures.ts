/**
 * cubemapCaptures — the frame's environment bakes, AS DATA: one row per
 * six-face capture, each keyed on its own anchor distance band.
 *
 * Slot 0 is the main view, so a row's six faces claim
 * `viewSlotBase … viewSlotBase + 5`. Every row's range must fit under
 * `VIEW_SLOT_COUNT` (`src/utils/gpu/createViewSlotUniformRing.ts`) and stay
 * disjoint from every other row's: two rows sharing a slot overwrite each
 * other's per-view uniform writes, with no error anywhere.
 */

import type { CubeFace } from '../../@types/rendering/CubeFace';
import type { CubemapCapture } from '../../@types/rendering/CubemapCapture';
import type { CubemapCaptureKey } from '../../@types/rendering/CubemapCaptureKey';
import { regionById } from '../../utils/scene/regionById';
import { SCALE_FADE_BANDS } from '../../services/engine/presentation/scaleFadeBands';
import { SCALE_UNITS } from '../scaleUnits';

export const ALL_CUBE_FACES: readonly CubeFace[] = [0, 1, 2, 3, 4, 5];

export const CUBEMAP_CAPTURES: Readonly<Record<CubemapCaptureKey, CubemapCapture>> = {
  // The black-hole lens's sky.
  sgrAStar: {
    target: 'sky-cubemap',
    // Resolved at module load rather than per frame — a linear `.find` over
    // `BODY_REGIONS`, same as the pass-side consumers of the lookup.
    anchor: regionById('galactic-centre'),
    band: SCALE_FADE_BANDS.sgrAStarLensing,
    nearMpc: 0.1 * SCALE_UNITS.AU_TO_MPC,
    viewSlotBase: 1,
  },
};
