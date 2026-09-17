/**
 * EngineSettingsState — the settings sub-bag of `EngineState`.
 *
 * DERIVED, not authored: adding a cluster means adding a slice to
 * `CORE_SETTINGS_SLICES` or `APP_SETTINGS_SLICES`, never editing this file.
 */

import type { combinedSettingsReducer } from '../../state/settings/combinedSettingsReducer';

export type EngineSettingsState = ReturnType<typeof combinedSettingsReducer>;
