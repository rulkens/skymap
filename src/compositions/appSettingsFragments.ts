/**
 * The Layer settings clusters this app composes in — authority for the seed and
 * the slice's spreads. `settingsSlice` asserts the reducer keys are unique, against
 * the core namespace too. `UNFORMED_SETTINGS_FRAGMENTS` is what still predates
 * `Layer.settings`; each Layer's own tuple is folded in beside it, imported from that
 * Layer's settings module rather than off `APP_COMPOSITION` (see
 * `galaxyCatalogLayerSettings` for the circular-type-alias reason). A fragment lives in
 * one list or the other, never both — the uniqueness assert throws at import otherwise
 * (Ruling 15).
 */

import { bodiesSettingsFragment } from '../layers/body/settings/bodiesSettings';
import { constellationsSettingsFragment } from '../layers/constellations/settings/constellationsSettings';
import { earthSettingsFragment } from '../layers/body/settings/earthSettings';
import { flowSettingsFragment } from '../layers/flow/settings/flowSettings';
import { milkyWaySettingsFragment } from '../layers/milkyWay/settings/milkyWaySettings';
import { orbitTrailsSettingsFragment } from '../layers/body/settings/orbitTrailsSettings';
import { sgrAStarLensingTuningSettingsFragment } from '../layers/body/settings/sgrAStarLensingTuningSettings';
import { starCatalogsSettingsFragment } from '../layers/starCatalog/settings/starCatalogsSettings';
import { structuresSettingsFragment } from '../layers/structure/settings/structuresSettings';
import { volumesSettingsFragment } from '../layers/volume/settings/volumesSettings';
import { zoneOfAvoidanceSettingsFragment } from '../layers/zoneOfAvoidance/settings/zoneOfAvoidanceSettings';
import { filamentsLayerSettings } from '../layers/filaments/settings/filamentsLayerSettings';
import { galaxyCatalogLayerSettings } from '../layers/galaxyCatalog/settings/galaxyCatalogLayerSettings';

const UNFORMED_SETTINGS_FRAGMENTS = [
  starCatalogsSettingsFragment,
  structuresSettingsFragment,
  volumesSettingsFragment,
  bodiesSettingsFragment,
  earthSettingsFragment,
  orbitTrailsSettingsFragment,
  sgrAStarLensingTuningSettingsFragment,
  milkyWaySettingsFragment,
  zoneOfAvoidanceSettingsFragment,
  constellationsSettingsFragment,
  flowSettingsFragment,
] as const;

export const APP_SETTINGS_FRAGMENTS = [
  ...UNFORMED_SETTINGS_FRAGMENTS,
  ...galaxyCatalogLayerSettings,
  ...filamentsLayerSettings,
] as const;
