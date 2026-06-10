/**
 * UseEngineSettingsReturn — the public shape of `useEngineSettings()`.
 *
 * `settings` carries the flat React-side projection of every knob
 * exposed in the SettingsPanel.  `engineCallbacks` is the
 * EngineCallbacks slice the engine echoes mutations into, spread by
 * App.tsx into the `createEngine` options block.
 *
 * The optimistic setters (`setSpaceMouseSensitivity`, `updateFlow`) are the
 * no-echo exceptions — see the doc comments inside `useEngineSettings.ts` for
 * the rationale per setter.
 */

import type { UseEngineSettingsState } from './UseEngineSettingsState';
import type { EngineSettingsCallbacks } from './EngineSettingsCallbacks';
import type { FlowSettings } from './FlowSettings';

export type UseEngineSettingsReturn = {
  settings: UseEngineSettingsState;
  engineCallbacks: EngineSettingsCallbacks;
  // App-owned optimistic setters for the no-echo cases
  /**
   * Optimistic setter for the SpaceMouse sensitivity slider.  No engine
   * echo (the subsystem's `setSensitivity` is fire-and-forget), so
   * App.tsx must call this alongside `handle.input.spaceMouse.setSensitivity`
   * to keep the React state and the engine state in lock-step.
   */
  setSpaceMouseSensitivity: (v: number) => void;
  /**
   * Optimistic merge into the React `flow` mirror (no engine echo). App pairs
   * this with `handle.flow.set(patch)` so the same `Partial<FlowSettings>`
   * lands in both React and the engine, same lock-step idiom as
   * `setSpaceMouseSensitivity`.
   */
  updateFlow: (patch: Partial<FlowSettings>) => void;
};
