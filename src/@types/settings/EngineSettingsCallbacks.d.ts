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
  | 'points'
  | 'tonemap'
  | 'camera'
  | 'sources'
  | 'bias'
  | 'thumbnails'
  | 'milkyWay'
  | 'debug'
  | 'filaments'
  | 'volumes'
  | 'labels'
  | 'input'
>;
