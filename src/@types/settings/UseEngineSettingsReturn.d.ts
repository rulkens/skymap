/**
 * UseEngineSettingsReturn — the public shape of `useEngineSettings()`.
 *
 * `settings` carries the flat React-side projection of every knob
 * exposed in the SettingsPanel.  `engineCallbacks` is the
 * EngineCallbacks slice the engine echoes mutations into, spread by
 * App.tsx into the `createEngine` options block.
 */

import type { UseEngineSettingsState } from './UseEngineSettingsState';
import type { EngineSettingsCallbacks } from './EngineSettingsCallbacks';

export type UseEngineSettingsReturn = {
  settings: UseEngineSettingsState;
  engineCallbacks: EngineSettingsCallbacks;
};
