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
  // `surveys` + `sources` + `tonemap` dropped: those clusters read the
  // engine-owned store via `useSettingsStore` selectors, so the hook subscribes
  // to no surveys/tonemap echo.
  | 'camera'
  | 'bias'
  | 'thumbnails'
  | 'milkyWay'
  | 'debug'
  | 'filaments'
  | 'volumes'
  | 'labels'
  | 'input'
>;
