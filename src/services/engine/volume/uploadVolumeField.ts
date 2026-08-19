// ── Volume field registration ───────────────────────────────────────────────
//
// Module-scope so the `createEngine` literal delegates here (mirroring the other
// `handles/` setters) and so it's testable without a full GPU engine.
//
// Ensure a settings row exists before the GPU upload. Re-registering a field
// preserves its tuned values (identity no-op in the reducer); a brand-new handle
// seeds from registry defaults. Shippable volumes already have a construction
// seed, so this only seeds for a dynamically-added handle. React reads the
// per-field rows via `selectVolumeFieldItems`.

import type { VolumeFieldId } from '../../../@types/data/volume/VolumeFieldId';
import type { ScalarCube } from '../../../@types/data/volume/ScalarCube';
import type { AppStore } from '../../../store/types';
import { addVolumeField } from '../../../state/settings/settingsSlice';
import { syncVisibilityFades } from '../wiring/syncVisibilityFades';
import type { ApplyIntentState } from '../wiring/syncVisibilityFades';

export function uploadVolumeField(
  state: ApplyIntentState,
  store: AppStore,
  fieldId: VolumeFieldId,
  cube: ScalarCube,
): void {
  store.dispatch(addVolumeField(fieldId));
  // Upload to the renderer; a silent no-op if it isn't ready yet (re-add once
  // booted).
  state.gpu.volumeFieldRenderer?.upload(fieldId, cube);
  // Drive the first-load fade through the intent → fade bridge; the volumeField
  // row's intent gate (reads settings.volumes.items[id].enabled) decides, so a
  // disabled add leaves the handle at the 0 seeded by the fade manifest
  // (`seedFades`) at construction (the draw loop's `(!enabled && opacity <= 0)`
  // skip keeps it invisible until toggled on).
  syncVisibilityFades(state, { animate: true, only: ['volumeField'] });
  // Essential wake: the bridge's fade is intent-gated — a disabled add fires no
  // fade, yet still changes the renderer's field set and settings row, so wake
  // regardless.
  state.subsystems.scheduler.requestRender();
}
