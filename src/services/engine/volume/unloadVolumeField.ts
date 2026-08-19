// ── Volume field removal ────────────────────────────────────────────────────
//
// Module-scope so the `createEngine` literal delegates here (mirroring the other
// `handles/` setters) and so it's testable without a full GPU engine.
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
  fieldId: VolumeFieldId,
): void {
  state.gpu.volumeFieldRenderer?.unload(fieldId);
  store.dispatch(removeVolumeField(fieldId));
  // Essential wake: removal fires no fade — the field vanishes outright.
  state.subsystems.scheduler.requestRender();
}
