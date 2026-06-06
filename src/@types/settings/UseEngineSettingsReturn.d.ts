/**
 * UseEngineSettingsReturn — the public shape of `useEngineSettings()`.
 *
 * `settings` carries the flat React-side projection of every knob
 * exposed in the SettingsPanel.  `engineCallbacks` is the
 * EngineCallbacks slice the engine echoes mutations into, spread by
 * App.tsx into the `createEngine` options block.
 *
 * The four optimistic setters (`setFilamentsEnabled`,
 * `setFilamentIntensity`, `setExposure`, `setVolumesEnabled`,
 * `setSpaceMouseSensitivity`) are the no-echo / partial-echo
 * exceptions — see the doc comments inside `useEngineSettings.ts`
 * for the rationale per setter.
 */

import type { UseEngineSettingsState } from './UseEngineSettingsState';
import type { EngineSettingsCallbacks } from './EngineSettingsCallbacks';
import type { FlowMode } from '../data/FlowMode';

export type UseEngineSettingsReturn = {
  settings: UseEngineSettingsState;
  engineCallbacks: EngineSettingsCallbacks;
  // App-owned optimistic setters for the no-echo / partial-echo cases
  setFilamentsEnabled: (v: boolean) => void;
  setFilamentIntensity: (v: number) => void;
  setExposure: (v: number) => void;
  /**
   * Master on/off for the scalar-volume overlay.  No engine echo — React
   * owns it optimistically, same as `setFilamentsEnabled`.
   */
  setVolumesEnabled: (v: boolean) => void;
  /**
   * Optimistic setter for the SpaceMouse sensitivity slider.  No engine
   * echo (the subsystem's `setSensitivity` is fire-and-forget), so
   * App.tsx must call this alongside `handle.input.spaceMouse.setSensitivity`
   * to keep the React state and the engine state in lock-step.
   */
  setSpaceMouseSensitivity: (v: number) => void;
  // ── CF4++ flow-field optimistic setters (no engine echo) ───────────────
  // Flow fires no echo callback — App.tsx calls each setter alongside the
  // matching `handle.flow.set…` to keep React and engine in lock-step, same
  // as `setFilamentsEnabled`.  SettingsPanel uses the first three; the rest
  // back the DebugPanel flow tuning row.
  setFlowEnabled: (enabled: boolean) => void;
  setFlowMode: (mode: FlowMode) => void;
  setFlowIntensity: (v: number) => void;
  setFlowCount: (v: number) => void;
  setFlowTrail: (v: number) => void;
  setFlowSpeed: (v: number) => void;
  setFlowDensityBias: (v: number) => void;
  setFlowWander: (v: number) => void;
  setFlowBoundaryFadeWidth: (v: number) => void;
};
