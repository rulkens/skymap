// ── Volume field trim knob ──────────────────────────────────────────────────
//
// Module-scope so the `createEngine` literal delegates here (mirroring the other
// `handles/` setters) and so it's testable without a full GPU engine.
//
// Dispatch the slice action — no boringSetter, no fade, so no channel wakes for
// it; the explicit `requestRender` re-renders the raymarch pass. Clamps raw
// intent before the write; React reads via `selectVolumeFieldItems`.

import type { VolumeFieldId } from '../../../@types/data/volume/VolumeFieldId';
import type { AppStore } from '../../../store/types';
import { writeVolumeField as writeVolumeFieldAction } from '../../../state/settings/settingsSlice';
import { clampVolumeTrim } from '../../../utils/clampVolumeTrim';
import type { ApplyIntentState } from '../wiring/syncVisibilityFades';

export function setVolumeFieldTrim(
  state: ApplyIntentState,
  store: AppStore,
  fieldId: VolumeFieldId,
  trim: number,
): void {
  store.dispatch(writeVolumeFieldAction({ id: fieldId, patch: { trim: clampVolumeTrim(trim) } }));
  state.subsystems.scheduler.requestRender();
}
