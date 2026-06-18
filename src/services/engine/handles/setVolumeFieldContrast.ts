// ── Volume field contrast knob ──────────────────────────────────────────────
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
import { clampVolumeContrast } from '../../../utils/clampVolumeContrast';
import type { ApplyIntentState } from '../wiring/syncVisibilityFades';

export function setVolumeFieldContrast(
  state: ApplyIntentState,
  store: AppStore,
  fieldId: VolumeFieldId,
  contrast: number,
): void {
  store.dispatch(
    writeVolumeFieldAction({ id: fieldId, patch: { contrast: clampVolumeContrast(contrast) } }),
  );
  state.subsystems.scheduler.requestRender();
}
