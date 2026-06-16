// ── Volume field visibility ─────────────────────────────────────────────────
//
// Module-scope so the `createEngine` literal delegates here (mirroring the other
// `handles/` setters) and so it's testable without a full GPU engine.
//
// Dispatch the copy-on-write store action; React reads via
// `selectVolumeFieldItems`. An unknown id lands an identity write (no-op).
// Having written the store, drive the fade through `syncVisibilityFades`: the
// volumeField row reads the just-written intent, fades the matching handle (the
// draw loop's `(!enabled && opacity <= 0)` skip keeps rendering through
// fade-out), and runs its enable-gated `post: maybeLazyLoadDebugVolume` so the
// DEV debug fixtures still lazy-load. The bridge owns the wake.

import type { VolumeFieldId } from '../../../@types/data/volume/VolumeFieldId';
import type { SettingsStore } from '../settingsStore/createSettingsStore';
import { writeVolumeFieldAction } from '../settingsStore/actions/writeVolumeFieldAction';
import { syncVisibilityFades } from '../wiring/syncVisibilityFades';
import type { ApplyIntentState } from '../wiring/syncVisibilityFades';

export function setVolumeFieldEnabled(
  state: ApplyIntentState,
  store: SettingsStore,
  fieldId: VolumeFieldId,
  enabled: boolean,
): void {
  writeVolumeFieldAction(store, fieldId, { enabled });
  syncVisibilityFades(state, { animate: true, only: ['volumeField'] });
}
