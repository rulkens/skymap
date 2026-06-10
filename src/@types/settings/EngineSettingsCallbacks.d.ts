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
  // `surveys` + `sources` + `tonemap` + `camera` + `bias` + `thumbnails` +
  // `milkyWay` + `debug` + `volumes` + `labels` dropped: those clusters live in
  // the engine-owned store, so the hook subscribes to no surveys/tonemap/
  // auto-rotate/bias/thumbnails/milkyWay/debug echo (the thumbnail + milkyWay
  // toggles have no React consumer at all; the DebugPanel reads the debug toggles
  // via `useSettingsStore` selectors). The volumes cluster (master `enabled` +
  // per-field `items`) also moved to the store — App reads the master via
  // `selectVolumesEnabled` and the rows via `selectVolumeFieldItems` + a
  // `useMemo` projection, so there's no `onFieldsChanged` subscription here. The
  // structures / labels cluster (per-category marker + label visibility, plus the
  // famousGalaxy survey label) also moved to the store — App reads the marker
  // record via `selectStructureItems` + a projection and the label record via
  // `selectStructureItems` + `selectSurveyItems` + a projection, so the two
  // `cb.labels` echoes are gone. (The load slots still fire `onFieldsChanged`
  // against the full `EngineCallbacks` type; harmless with no subscriber.)
  // (Camera EVENTS — focus / camera / scale — are not settings; `useEngine`
  // wires those, not this hook.)
  'filaments' | 'input'
>;
