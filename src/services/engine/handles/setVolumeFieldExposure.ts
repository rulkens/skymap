// ── Volume field exposure knob ──────────────────────────────────────────────
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
import { clampVolumeExposure } from '../../../utils/clampVolumeExposure';
import type { ApplyIntentState } from '../wiring/syncVisibilityFades';

export function setVolumeFieldExposure(
  state: ApplyIntentState,
  store: SettingsStore,
  fieldId: VolumeFieldId,
  exposure: number,
): void {
  writeVolumeFieldAction(store, fieldId, { exposure: clampVolumeExposure(exposure) });
  state.subsystems.scheduler.requestRender();
}
