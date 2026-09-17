/**
 * The Layer settings clusters this app composes in. `UNFORMED_SETTINGS_SLICES`
 * is what still predates `Layer.settings`; each Layer's own tuple is folded in
 * beside it, imported from that Layer's settings module rather than off
 * `APP_COMPOSITION` (see `galaxyCatalogLayerSettings` for the circular-type-alias
 * reason). A cluster lives in one list or the other, never both.
 */

import { bodiesSlice } from '../layers/body/settings/bodiesSlice';
import { constellationsSlice } from '../layers/constellations/settings/constellationsSlice';
import { earthSlice } from '../layers/body/settings/earthSlice';
import { flowSlice } from '../layers/flow/settings/flowSlice';
import { milkyWaySlice } from '../layers/milkyWay/settings/milkyWaySlice';
import { orbitTrailsSlice } from '../layers/body/settings/orbitTrailsSlice';
import { sgrAStarLensingTuningSlice } from '../layers/body/settings/sgrAStarLensingTuningSlice';
import { starCatalogsSlice } from '../layers/starCatalog/settings/starCatalogsSlice';
import { structuresSlice } from '../layers/structure/settings/structuresSlice';
import { volumesSlice } from '../layers/volume/settings/volumesSlice';
import { zoneOfAvoidanceSlice } from '../layers/zoneOfAvoidance/settings/zoneOfAvoidanceSlice';
import { filamentsLayerSettings } from '../layers/filaments/settings/filamentsLayerSettings';
import { galaxyCatalogLayerSettings } from '../layers/galaxyCatalog/settings/galaxyCatalogLayerSettings';

const UNFORMED_SETTINGS_SLICES = [
  starCatalogsSlice,
  structuresSlice,
  volumesSlice,
  bodiesSlice,
  earthSlice,
  orbitTrailsSlice,
  sgrAStarLensingTuningSlice,
  milkyWaySlice,
  zoneOfAvoidanceSlice,
  constellationsSlice,
  flowSlice,
] as const;

export const APP_SETTINGS_SLICES = [
  ...UNFORMED_SETTINGS_SLICES,
  ...galaxyCatalogLayerSettings,
  ...filamentsLayerSettings,
] as const;
