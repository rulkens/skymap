/**
 * EngineSettingsState — the settings sub-bag of `EngineState`: every value the
 * SettingsPanel surfaces, plus the flags the engine forwards into the per-frame
 * uniform buffer.
 *
 * DERIVED, not authored: adding a cluster means adding a Layer settings fragment
 * (or a field to `CoreSettingsState`), never editing this file. The value that
 * fills it is `INITIAL_SETTINGS`, composed from the same two inputs — so a
 * cluster cannot exist in the type without a value, or vice versa.
 */

import type { APP_SETTINGS_FRAGMENTS } from '../../compositions/appSettingsFragments';
import type { ComposedSettings } from './ComposedSettings';
import type { CoreSettingsState } from './CoreSettingsState';

export type EngineSettingsState = ComposedSettings<
  CoreSettingsState,
  typeof APP_SETTINGS_FRAGMENTS
>;
