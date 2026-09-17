/**
 * EngineSettingsState — the settings sub-bag of `EngineState`: every value the
 * SettingsPanel surfaces, plus the flags the engine forwards into the per-frame
 * uniform buffer.
 *
 * DERIVED, not authored: adding a cluster means adding a slice to
 * `CORE_SETTINGS_SLICES` or `APP_SETTINGS_SLICES`, never editing this file —
 * `combineSlices` is the single source of both the type and the boot value.
 */

import type { combinedSettingsReducer } from '../../state/settings/combinedSettingsReducer';

export type EngineSettingsState = ReturnType<typeof combinedSettingsReducer>;
