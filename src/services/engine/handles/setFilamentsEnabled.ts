// ── Filament overlay visibility ─────────────────────────────────────────────
//
// Same shape as `setMilkyWayEnabled`: write the authoritative
// `settings.filaments.enabled` intent THROUGH the store (so React's
// `useSettingsStore(selectFilamentsEnabled)` subscriber wakes), call
// `requestRender` (the store action does not wake on its own), then drive the
// fade through `syncVisibilityFades`, which reads the just-written intent and
// fades the `filaments` handle. filamentsPass's gate accepts the boolean OR a
// non-zero opacity, keeping the pass alive through fade-out.
//
// ORDERING MATTERS: the store write MUST precede the bridge call, because the
// bridge reads the just-written `enabled` intent from settings.

import type { SettingsStore } from '../settingsStore/createSettingsStore';
import { setFilamentsEnabledAction } from '../settingsStore/actions/setFilamentsEnabledAction';
import { syncVisibilityFades } from '../wiring/syncVisibilityFades';
import type { ApplyIntentState } from '../wiring/syncVisibilityFades';

export function setFilamentsEnabled(
  state: ApplyIntentState,
  store: SettingsStore,
  enabled: boolean,
): void {
  setFilamentsEnabledAction(store, enabled);
  state.subsystems.scheduler.requestRender();
  syncVisibilityFades(state, { animate: true, only: ['filaments'] });
}
