/** The settings root at boot: each Layer fragment's cluster over the core seed. */

import { APP_SETTINGS_FRAGMENTS } from '../../compositions/appSettingsFragments';
import { coreSeed } from './coreSeed';
import { composeSettingsSeed } from '../../utils/settings/composeSettingsSeed';
import type { EngineSettingsState } from '../../@types/settings/EngineSettingsState';

export function buildInitialSettings(): EngineSettingsState {
  return composeSettingsSeed(coreSeed(), APP_SETTINGS_FRAGMENTS);
}
