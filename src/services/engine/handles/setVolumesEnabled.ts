// ── Volume master toggle ────────────────────────────────────────────────────
//
// Module-scope so the `createEngine` literal delegates here (mirroring the other
// `handles/` setters) and so it's testable without a full GPU engine.
//
// Dispatch the copy-on-write store action so the per-frame volume gates see the
// new master bit next frame. No echo: React reads via `selectVolumesEnabled`.
// Having written the store, drive the fade through `syncVisibilityFades`: the
// bridge reads the just-written intent and fades the `volumesMaster` handle (and
// owns the render wake). The encodeHdr* sites multiply this master opacity into
// every per-field fade, so the whole subsystem ramps in lockstep; the
// pass-enabled gate accepts the master enable bit OR opacity > 0, so it keeps
// blitting through fade-out.

import type { SettingsStore } from '../settingsStore/createSettingsStore';
import { setVolumesEnabledAction } from '../settingsStore/actions/setVolumesEnabledAction';
import { syncVisibilityFades } from '../wiring/syncVisibilityFades';
import type { ApplyIntentState } from '../wiring/syncVisibilityFades';

export function setVolumesEnabled(
  state: ApplyIntentState,
  store: SettingsStore,
  enabled: boolean,
): void {
  setVolumesEnabledAction(store, enabled);
  syncVisibilityFades(state, { animate: true, only: ['volumesMaster'] });
}
