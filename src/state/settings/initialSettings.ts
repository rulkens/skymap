/** The settings root at boot — every slice's own `initialState`, composed. */

import { combinedSettingsReducer } from './combinedSettingsReducer';
import type { EngineSettingsState } from '../../@types/settings/EngineSettingsState';

export const INITIAL_SETTINGS: EngineSettingsState = combinedSettingsReducer(undefined, {
  type: '@@settings/INIT',
});
