// ── Flow overlay patch entry point ──────────────────────────────────────────
//
// One patch-shaped setter over the `settings.flow` slice. The WHOLE patch lands
// through the `setFlow` slice action (React reads via `selectFlow`); the raw
// intent is stored verbatim — the GPU-safe clamps live in `clampFlowParams` at
// the flow renderer. Then the per-leaf side effects fire off which keys the
// patch carried.
//
// Module-scope so the `createEngine` literal delegates here (mirroring the other
// `handles/` setters) and so it's testable without a full GPU engine.

import type { FlowSettings } from '../../../@types/settings/FlowSettings';
import type { AppStore } from '../../../store/types';
import { setFlow as setFlowAction } from '../../../state/settings/settingsSlice';
import { syncVisibilityFades } from '../wiring/syncVisibilityFades';
import type { ApplyIntentState } from '../wiring/syncVisibilityFades';

export function setFlow(
  state: ApplyIntentState,
  store: AppStore,
  patch: Partial<FlowSettings>,
): void {
  store.dispatch(setFlowAction(patch));
  // Wake the loop so the renderer picks up the new params next frame — the
  // dispatch does NOT wake. This also drives the per-frame `reevaluateDemand`,
  // which lazy-loads the velocity cube on first enable: no setter has to kick
  // the loader itself (see runFrame's demand-re-eval seam).
  state.subsystems.scheduler.requestRender();

  // enabled: hand the fade to the bridge. It reads the just-written
  // `settings.flow.enabled` intent and the flow manifest's resident-only guard
  // (`fieldLoaded()`) decides whether to drive: enable-while-loaded fades to 1,
  // enable-while-unloaded skips (the slot commit owns that first fade-in),
  // disable fades to 0.
  if (patch.enabled !== undefined) {
    syncVisibilityFades(state, { animate: true, only: ['flow'] });
  }

  // mode / count both reseed the shared particle buffers.
  if (patch.mode !== undefined || patch.count !== undefined) {
    state.gpu.flowFieldRenderer?.maybeReseed();
  }
}
