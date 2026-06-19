// ── Bias-correction mode ────────────────────────────────────────────────────
//
// Module-scope so the `createEngine` literal delegates here (mirroring the other
// `handles/` setters) and so it's testable without a full GPU engine.
//
// Two jobs, which is why it is bespoke:
//
//   1. Write the mode intent by dispatching the `setBiasMode` slice action.
//      The shader branches on the integer mode (0 = none, 1 = volume-limited,
//      …), so flipping it takes effect next frame with no pipeline rebuild.
//      React reads via `selectBiasMode`, so no echo is wired.
//   2. Kick the worker re-bake — an event-driven action routed through
//      `biasCorrectionSubsystem`, which owns the cached ratios/weights + worker
//      runners and the render wakes (entry + post-splice). The `void` discards
//      the Promise — the handle doesn't await.

import type { BiasMode } from '../../../@types/data/galaxyCatalog/BiasMode';
import type { AppStore } from '../../../store/types';
import { setBiasMode as setBiasModeAction } from '../../../state/settings/settingsSlice';
import type { ApplyIntentState } from '../wiring/syncVisibilityFades';

export function setBiasMode(state: ApplyIntentState, store: AppStore, mode: BiasMode): void {
  store.dispatch(setBiasModeAction(mode));
  void state.subsystems.biasCorrection.setMode(mode);
}
