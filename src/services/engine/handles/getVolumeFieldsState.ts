// ── Volume field snapshot accessor ──────────────────────────────────────────
//
// Module-scope so the `createEngine` literal delegates here (mirroring the other
// `handles/` accessors) and so it's testable without a full GPU engine.
//
// One-shot read of the per-field volume rows the SettingsPanel consumes (dev
// console, tests). A thin pass-through to `buildVolumeFieldsSnapshot`, which
// projects `state.settings.volumes.items` — identity and values come entirely
// from the items Record, so the rows are complete from boot.

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { VolumeFieldRowData } from '../../../@types/settings/VolumeFieldRowData';
import { buildVolumeFieldsSnapshot } from '../helpers/buildVolumeFieldsSnapshot';

export function getVolumeFieldsState(state: EngineState): ReadonlyArray<VolumeFieldRowData> {
  return buildVolumeFieldsSnapshot(state);
}
