// ── Volume field removal ────────────────────────────────────────────────────
//
// `uploadVolumeField`'s twin. Module-scope so `createEngine` and the volume
// slot commits can delegate here without a full GPU engine to test against.
//
// Deliberately asymmetric with the upload guard (decision #14): unload still
// removes the settings row even with no renderer — its lifetime is independent.
//
// Drop the GPU upload first, then remove the settings row. No fade: removal
// fires no ramp — the field vanishes outright.

import type { VolumeFieldId } from '../../../@types/data/volume/VolumeFieldId';
import type { AppStore } from '../../../store/types';
import { removeVolumeField } from '../../../state/settings/settingsSlice';
import type { ApplyIntentState } from '../wiring/syncVisibilityFades';

export function unloadVolumeField(
  state: ApplyIntentState,
  store: AppStore,
  id: VolumeFieldId,
): void {
  state.gpu.volumeFieldRenderer?.unload(id);
  store.dispatch(removeVolumeField(id));
  // Redundant-but-local; rung 5 owns the wake accounting.
  state.subsystems.scheduler.requestRender();
}
