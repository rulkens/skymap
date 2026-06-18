// ── Volume field palette selector ───────────────────────────────────────────
//
// Module-scope so the `createEngine` literal delegates here (mirroring the other
// `handles/` setters) and so it's testable without a full GPU engine.
//
// Dispatch the slice action — no boringSetter, no fade, so no channel wakes for
// it; the explicit `requestRender` re-renders the raymarch pass. React reads via
// `selectVolumeFieldItems`.

import type { VolumeFieldId } from '../../../@types/data/volume/VolumeFieldId';
import type { ScalarFieldPaletteId } from '../../../@types/data/volume/ScalarFieldPaletteId';
import type { AppStore } from '../../../store/types';
import { writeVolumeField as writeVolumeFieldAction } from '../../../state/settings/settingsSlice';
import type { ApplyIntentState } from '../wiring/syncVisibilityFades';

export function setVolumeFieldPalette(
  state: ApplyIntentState,
  store: AppStore,
  fieldId: VolumeFieldId,
  id: ScalarFieldPaletteId,
): void {
  store.dispatch(writeVolumeFieldAction({ id: fieldId, patch: { paletteId: id } }));
  state.subsystems.scheduler.requestRender();
}
