// ── Filament overlay visibility ─────────────────────────────────────────────
//
// Same shape as `setMilkyWayEnabled`: write the authoritative
// `settings.filaments.enabled` intent by dispatching the `setFilamentsEnabled`
// slice action (so React's `useAppSelector(selectFilamentsEnabled)` subscriber
// wakes), call `requestRender` (dispatch does not wake on its own), then drive
// the fade through `syncVisibilityFades`, which reads the just-written intent
// and fades the `filaments` handle. filamentsPass's gate accepts the boolean OR
// a non-zero opacity, keeping the pass alive through fade-out.
//
// ORDERING MATTERS: the dispatch MUST precede the bridge call, because the
// bridge reads the just-written `enabled` intent from settings.

import type { AppStore } from '../../../store/types';
import { setFilamentsEnabled as setFilamentsEnabledAction } from '../../../state/settings/settingsSlice';
import { syncVisibilityFades } from '../wiring/syncVisibilityFades';
import type { ApplyIntentState } from '../wiring/syncVisibilityFades';

export function setFilamentsEnabled(
  state: ApplyIntentState,
  store: AppStore,
  enabled: boolean,
): void {
  store.dispatch(setFilamentsEnabledAction(enabled));
  state.subsystems.scheduler.requestRender();
  syncVisibilityFades(state, { animate: true, only: ['filaments'] });
}
