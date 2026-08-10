/**
 * DEFAULT_LOD_SETTINGS — the tool's boot LOD threshold. The render-settings
 * store slice seeds from this same constant.
 *
 * `lodApparent` is seeded from the app's `MILKY_WAY_TUNING_DEFAULTS.lodApparent`
 * (`src/services/engine/galaxyGenerator/v1/milkyWayCalibration.ts`), and the two now share the
 * star shader outright (`milkyWay/sprites/stars.wesl`, symlinked into this tool's
 * WESL root), so the same number drives the same `fluxConservingLod` against an
 * NDC apparent size captured the same way in both places.
 */

import type { LodSettings } from '../../@types/engine/LodSettings';
import { MILKY_WAY_TUNING_DEFAULTS } from '../../../../src/services/engine/galaxyGenerator/v1/milkyWayCalibration';

export const DEFAULT_LOD_SETTINGS: LodSettings = {
  lodApparent: MILKY_WAY_TUNING_DEFAULTS.lodApparent,
};
