/**
 * The Layer settings clusters this app composes in — authority for the seed and
 * the slice's spreads. `settingsSlice` asserts the reducer keys are unique, against
 * the core namespace too. `UNFORMED_SETTINGS_FRAGMENTS` is the thirteen clusters that
 * predate `Layer.settings`; `settingsOf` folds in every Layer's own fragments (empty
 * today — `APP_COMPOSITION.layers` is `[]`).
 */

import { bodiesSettingsFragment } from '../layers/body/settings/bodiesSettings';
import { constellationsSettingsFragment } from '../layers/constellations/settings/constellationsSettings';
import { earthSettingsFragment } from '../layers/body/settings/earthSettings';
import { filamentsSettingsFragment } from '../layers/filaments/settings/filamentsSettings';
import { flowSettingsFragment } from '../layers/flow/settings/flowSettings';
import { galaxyCatalogsSettingsFragment } from '../layers/galaxyCatalog/settings/galaxyCatalogsSettings';
import { milkyWaySettingsFragment } from '../layers/milkyWay/settings/milkyWaySettings';
import { orbitTrailsSettingsFragment } from '../layers/body/settings/orbitTrailsSettings';
import { sgrAStarLensingTuningSettingsFragment } from '../layers/body/settings/sgrAStarLensingTuningSettings';
import { starCatalogsSettingsFragment } from '../layers/starCatalog/settings/starCatalogsSettings';
import { structuresSettingsFragment } from '../layers/structure/settings/structuresSettings';
import { volumesSettingsFragment } from '../layers/volume/settings/volumesSettings';
import { zoneOfAvoidanceSettingsFragment } from '../layers/zoneOfAvoidance/settings/zoneOfAvoidanceSettings';
import { settingsOf } from '../utils/layer/settingsOf';
import { APP_COMPOSITION } from './app';

const UNFORMED_SETTINGS_FRAGMENTS = [
  galaxyCatalogsSettingsFragment,
  starCatalogsSettingsFragment,
  structuresSettingsFragment,
  volumesSettingsFragment,
  bodiesSettingsFragment,
  earthSettingsFragment,
  orbitTrailsSettingsFragment,
  sgrAStarLensingTuningSettingsFragment,
  milkyWaySettingsFragment,
  zoneOfAvoidanceSettingsFragment,
  filamentsSettingsFragment,
  constellationsSettingsFragment,
  flowSettingsFragment,
] as const;

export const APP_SETTINGS_FRAGMENTS = [
  ...UNFORMED_SETTINGS_FRAGMENTS,
  ...settingsOf(APP_COMPOSITION.layers),
] as const;
