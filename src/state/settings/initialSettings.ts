/** The settings root at boot: each Layer fragment's cluster over the core clusters. */

import { APP_SETTINGS_FRAGMENTS } from '../../compositions/appSettingsFragments';
import { CORE_INITIAL_SETTINGS } from './coreInitialSettings';
import { composeInitialSettings } from '../../utils/settings/composeInitialSettings';
import type { EngineSettingsState } from '../../@types/settings/EngineSettingsState';

export const INITIAL_SETTINGS: EngineSettingsState = composeInitialSettings(
  CORE_INITIAL_SETTINGS,
  APP_SETTINGS_FRAGMENTS,
);
