/**
 * UseEngineSettingsReturn — the public shape of `useEngineSettings()`.
 *
 * `settings` carries the flat React-side projection of every knob
 * exposed in the SettingsPanel.  `engineCallbacks` is the
 * EngineCallbacks slice the engine echoes mutations into, spread by
 * App.tsx into the `createEngine` options block.
 *
 * The optimistic setter (`setSpaceMouseSensitivity`) is the sole no-echo
 * exception — see the doc comment inside `useEngineSettings.ts` for the
 * rationale.
 */

import type { UseEngineSettingsState } from './UseEngineSettingsState';
import type { EngineSettingsCallbacks } from './EngineSettingsCallbacks';

export type UseEngineSettingsReturn = {
  settings: UseEngineSettingsState;
  engineCallbacks: EngineSettingsCallbacks;
  // App-owned optimistic setter for the no-echo case
  /**
   * Optimistic setter for the SpaceMouse sensitivity slider.  No engine
   * echo (the subsystem's `setSensitivity` is fire-and-forget), so
   * App.tsx must call this alongside `handle.input.spaceMouse.setSensitivity`
   * to keep the React state and the engine state in lock-step.
   */
  setSpaceMouseSensitivity: (v: number) => void;
};
