// ── Volume field palette selector ───────────────────────────────────────────
//
// Module-scope so the `createEngine` literal delegates here (mirroring the other
// `handles/` setters) and so it's testable without a full GPU engine.
//
// Dispatch the copy-on-write store action — no boringSetter, no fade, so no
// channel wakes for it; the explicit `requestRender` re-renders the raymarch
// pass. React reads via `selectVolumeFieldItems`.

import type { VolumeFieldId } from '../../../@types/data/volume/VolumeFieldId';
import type { ScalarFieldPaletteId } from '../../../@types/data/volume/ScalarFieldPaletteId';
import type { SettingsStore } from '../settingsStore/createSettingsStore';
import { writeVolumeFieldAction } from '../settingsStore/actions/writeVolumeFieldAction';
import type { ApplyIntentState } from '../wiring/syncVisibilityFades';

export function setVolumeFieldPalette(
  state: ApplyIntentState,
  store: SettingsStore,
  fieldId: VolumeFieldId,
  id: ScalarFieldPaletteId,
): void {
  writeVolumeFieldAction(store, fieldId, { paletteId: id });
  state.subsystems.scheduler.requestRender();
}
