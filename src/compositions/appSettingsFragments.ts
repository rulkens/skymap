/**
 * The Layer settings clusters this app composes in — authority for the seed and
 * the slice's spreads. Asserted at import: a duplicate reducer key throws first.
 */

import { assertUniqueFragmentReducerKeys } from '../utils/settings/assertUniqueFragmentReducerKeys';
import { galaxyCatalogsSettingsFragment } from '../layers/galaxyCatalog/settings/galaxyCatalogsSettings';
import { starCatalogsSettingsFragment } from '../layers/starCatalog/settings/starCatalogsSettings';
import { structuresSettingsFragment } from '../layers/structure/settings/structuresSettings';
import { volumesSettingsFragment } from '../layers/volume/settings/volumesSettings';

export const APP_SETTINGS_FRAGMENTS = [
  galaxyCatalogsSettingsFragment,
  starCatalogsSettingsFragment,
  structuresSettingsFragment,
  volumesSettingsFragment,
] as const;

assertUniqueFragmentReducerKeys(APP_SETTINGS_FRAGMENTS);
