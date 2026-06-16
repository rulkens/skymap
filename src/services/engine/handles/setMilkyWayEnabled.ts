// ── Milky-Way disk visibility ───────────────────────────────────────────────
//
// Module-scope so the `createEngine` literal delegates here (mirroring the other
// `handles/` setters) and so it's testable without a full GPU engine.
//
// Writes the authoritative `settings.milkyWay.enabled` intent THROUGH the
// engine-owned store (the `setMilkyWayEnabledAction` copy-on-write reducer) so
// React's `useSettingsStore(selectMilkyWayEnabled)` subscriber wakes. The
// store action does NOT wake the render loop, so we call `requestRender`
// explicitly — then drive the fade through `syncVisibilityFades`, which reads
// the just-written intent and fades the `milkyWayDisk` handle. milkyWayPass's
// gate accepts the boolean OR a non-zero opacity, so the pass keeps drawing
// through fade-out.
//
// ORDERING MATTERS: the store write MUST precede the bridge call, because the
// bridge reads the just-written `enabled` intent from settings.

import type { SettingsStore } from '../settingsStore/createSettingsStore';
import { setMilkyWayEnabledAction } from '../settingsStore/actions/setMilkyWayEnabledAction';
import { syncVisibilityFades } from '../wiring/syncVisibilityFades';
import type { ApplyIntentState } from '../wiring/syncVisibilityFades';

export function setMilkyWayEnabled(
  state: ApplyIntentState,
  store: SettingsStore,
  enabled: boolean,
): void {
  setMilkyWayEnabledAction(store, enabled);
  state.subsystems.scheduler.requestRender();
  syncVisibilityFades(state, { animate: true, only: ['milkyWayDisk'] });
}
