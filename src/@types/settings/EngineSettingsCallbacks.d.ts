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
  // `surveys` + `sources` + `tonemap` + `camera` + `bias` + `thumbnails` dropped:
  // those clusters live in the engine-owned store, so the hook subscribes to no
  // surveys/tonemap/auto-rotate/bias/thumbnails echo (the thumbnail toggle has
  // no React consumer at all). (Camera EVENTS — focus / camera / scale — are not
  // settings; `useEngine` wires those, not this hook.)
  'milkyWay' | 'debug' | 'filaments' | 'volumes' | 'labels' | 'input'
>;
