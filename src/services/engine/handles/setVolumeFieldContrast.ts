// ── Volume field contrast knob ──────────────────────────────────────────────
//
// Module-scope so the `createEngine` literal delegates here (mirroring the other
// `handles/` setters) and so it's testable without a full GPU engine.
//
// Dispatch the copy-on-write store action — no boringSetter, no fade, so no
// channel wakes for it; the explicit `requestRender` re-renders the raymarch
// pass. Clamps raw intent before the write; React reads via
// `selectVolumeFieldItems`.

import type { VolumeFieldId } from '../../../@types/data/volume/VolumeFieldId';
import type { SettingsStore } from '../settingsStore/createSettingsStore';
import { writeVolumeFieldAction } from '../settingsStore/actions/writeVolumeFieldAction';
import { clampVolumeContrast } from '../../../utils/clampVolumeContrast';
import type { ApplyIntentState } from '../wiring/syncVisibilityFades';

export function setVolumeFieldContrast(
  state: ApplyIntentState,
  store: SettingsStore,
  fieldId: VolumeFieldId,
  contrast: number,
): void {
  writeVolumeFieldAction(store, fieldId, { contrast: clampVolumeContrast(contrast) });
  state.subsystems.scheduler.requestRender();
}
