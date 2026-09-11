/**
 * The Layer settings clusters this app composes in — authority for the seed and
 * the slice's spreads. Asserted at import: a duplicate reducer key throws first.
 */

import { assertUniqueFragmentReducerKeys } from '../utils/settings/assertUniqueFragmentReducerKeys';
import { bodiesSettingsFragment } from '../layers/body/settings/bodiesSettings';
import { earthSettingsFragment } from '../layers/body/settings/earthSettings';
import { galaxyCatalogsSettingsFragment } from '../layers/galaxyCatalog/settings/galaxyCatalogsSettings';
import { milkyWaySettingsFragment } from '../layers/milkyWay/settings/milkyWaySettings';
import { orbitTrailsSettingsFragment } from '../layers/body/settings/orbitTrailsSettings';
import { sgrAStarLensingTuningSettingsFragment } from '../layers/body/settings/sgrAStarLensingTuningSettings';
import { starCatalogsSettingsFragment } from '../layers/starCatalog/settings/starCatalogsSettings';
import { structuresSettingsFragment } from '../layers/structure/settings/structuresSettings';
import { volumesSettingsFragment } from '../layers/volume/settings/volumesSettings';

export const APP_SETTINGS_FRAGMENTS = [
  galaxyCatalogsSettingsFragment,
  starCatalogsSettingsFragment,
  structuresSettingsFragment,
  volumesSettingsFragment,
  bodiesSettingsFragment,
  earthSettingsFragment,
  orbitTrailsSettingsFragment,
  sgrAStarLensingTuningSettingsFragment,
  milkyWaySettingsFragment,
] as const;

assertUniqueFragmentReducerKeys(APP_SETTINGS_FRAGMENTS);
