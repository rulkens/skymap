/**
 * EngineSettingsCallbacks — the slice of `EngineCallbacks` that the
 * `useEngineSettings` hook owns and forwards into `createEngine`.
 *
 * App.tsx spreads this into its `createEngine(canvas, { ... })`
 * options block so the engine can fire echoes that drive React's
 * settings state.
 *
 * H5 task 11: only the nested sub-bag names survive — every flat
 * sibling on `EngineCallbacks` was deleted in lockstep with the
 * engine-side fire-site migration.  Filament counts now ride the
 * `filaments.onReady` address (no flat survivor).
 */

import type { EngineCallbacks } from '../engine/EngineCallbacks';

export type EngineSettingsCallbacks = Pick<
  EngineCallbacks,
  | 'surveys'
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
