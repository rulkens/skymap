/**
 * EngineSettingsCallbacks — the slice of `EngineCallbacks` that the
 * `useEngineSettings` hook owns and forwards into `createEngine`.
 *
 * App.tsx spreads this into its `createEngine(canvas, { ... })`
 * options block so the engine can fire echoes that drive React's
 * settings state.
 *
 * `EngineCallbacks` is nested-only, so the Pick selects whole
 * sub-bags; filament counts ride the `filaments.onReady` address.
 */

import type { EngineCallbacks } from '../engine/EngineCallbacks';

export type EngineSettingsCallbacks = Pick<
  EngineCallbacks,
  // Every settings echo is gone — those clusters live in the engine-owned store
  // and React reads each via a `useStore` selector, so there is no settings
  // mirror to keep in sync from a callback. What remains the hook subscribes to
  // here is EVENT-shaped: `filaments.onReady` (the one-shot strip/vertex count
  // payload after `filaments.bin` lands) and `input.spaceMouse.onConnectedChange`
  // (puck connect / disconnect). Camera EVENTS — focus / camera / scale — are
  // also not settings, but `useEngine` wires those, not this hook.
  'filaments' | 'input'
>;
