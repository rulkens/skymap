// ── Milky-Way disk visibility ───────────────────────────────────────────────
//
// Module-scope so the `createEngine` literal delegates here (mirroring the other
// `handles/` setters) and so it's testable without a full GPU engine.
//
// Writes the authoritative `settings.milkyWay.enabled` intent by dispatching the
// `setMilkyWayEnabled` slice action so React's
// `useAppSelector(selectMilkyWayEnabled)` subscriber wakes. Dispatch does NOT
// wake the render loop, so we call `requestRender` explicitly — then drive the
// fade through `syncVisibilityFades`, which reads the just-written intent and
// fades the `milkyWayDisk` handle. milkyWayPass's gate accepts the boolean OR a
// non-zero opacity, so the pass keeps drawing through fade-out.
//
// ORDERING MATTERS: the dispatch MUST precede the bridge call, because the
// bridge reads the just-written `enabled` intent from settings.

import type { AppStore } from '../../../store/types';
import { setMilkyWayEnabled as setMilkyWayEnabledAction } from '../../../state/settings/settingsSlice';
import { syncVisibilityFades } from '../wiring/syncVisibilityFades';
import type { ApplyIntentState } from '../wiring/syncVisibilityFades';

export function setMilkyWayEnabled(
  state: ApplyIntentState,
  store: AppStore,
  enabled: boolean,
): void {
  store.dispatch(setMilkyWayEnabledAction(enabled));
  state.subsystems.scheduler.requestRender();
  syncVisibilityFades(state, { animate: true, only: ['milkyWayDisk'] });
}
