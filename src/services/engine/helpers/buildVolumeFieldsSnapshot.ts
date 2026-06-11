/**
 * buildVolumeFieldsSnapshot — the engine-side one-shot read of the per-field
 * volume rows the SettingsPanel consumes.
 *
 * A thin `EngineState` adapter over `projectVolumeFieldRows`: it pulls
 * `state.settings.volumes.items` and hands it to the shared projection, so the
 * engine snapshot and the React-side `useMemo` projection are one
 * implementation. Used by `handle.volumes.getState()` for one-shot reads (dev
 * console, tests).
 *
 * Identity and values come entirely from the items Record (registry-seeded at
 * construction) — the GPU handle list is not consulted — so the rows are
 * complete from boot, before any cube loads. The `debug-*` filter is the React
 * consumer's concern, not applied here.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { VolumeFieldRowData } from '../../../@types/settings/VolumeFieldRowData';
import { projectVolumeFieldRows } from '../settingsStore/projectVolumeFieldRows';

export function buildVolumeFieldsSnapshot(state: EngineState): ReadonlyArray<VolumeFieldRowData> {
  return projectVolumeFieldRows(state.settings.volumes.items);
}
