/**
 * engineSettingsStore — spike: the *bidirectional* settings seam in one
 * store, proven on a single field (`biasMode`).
 *
 * ### Why this is the hard case (vs. engineTelemetryStore)
 *
 * Telemetry (fps, loadProgress) flows one way: engine → React.  Settings
 * flow both ways and the engine is authoritative:
 *
 *   - React writes via the engine handle (`handle.bias.setMode`) — never
 *     directly into this store.  The engine setter clamps / triggers side
 *     effects (here: the async Malmquist bake) and THEN writes the store.
 *   - The engine *reads its own setting back* from this store — both in
 *     the per-frame hot loop (`runFrame` → `RenderFrameSettings.biasMode`)
 *     and from the `biasCorrectionSubsystem`'s `getMode` accessor.
 *   - React reads via the `useBiasMode` selector.
 *
 * That last point is the whole spike: making this store the single source
 * of truth means `services/engine/*` now *depends on* it, and the field
 * leaves `EngineState.settings.bias`.  The win is deleting the double-
 * store + echo-callback machinery (the `bias.onModeChange` echo, the
 * `useEngineSettings` mirror useState, the `seedSettingsCallbacks` init
 * fire).  The cost is exactly that new engine→store coupling and the
 * engine tests that must seed the store instead of an `EngineState` bag.
 *
 * Vanilla zustand has no React dependency, so the engine importing this
 * is lateral to the `EngineCallbacks` coupling it already carries — it's
 * a pub/sub cell, not a UI framework.
 *
 * ### Single-source-of-truth, not a second copy
 *
 * Note there is NO `state.settings.bias.mode` anymore.  If the engine
 * kept its bag AND wrote here, we'd have added a store without removing
 * the sync — strictly worse.  The field moved; it didn't get mirrored.
 */

import { useSyncExternalStore } from 'react';
import { createStore } from 'zustand/vanilla';
import { BiasMode } from '../data/biasMode';
import { DEFAULT_BIAS_MODE } from '../data/defaults';
import type { BiasMode as BiasModeT } from '../@types/data/BiasMode';

type EngineSettingsState = {
  /**
   * Malmquist-bias correction mode.  The engine's `setBiasMode` is the
   * only authorised writer (it clamps + kicks the per-source worker bake
   * before storing); React reads via `useBiasMode` and writes only
   * through `handle.bias.setMode`.
   */
  biasMode: BiasModeT;
  setBiasMode: (mode: BiasModeT) => void;
};

export const engineSettingsStore = createStore<EngineSettingsState>((set) => ({
  biasMode: DEFAULT_BIAS_MODE as BiasModeT,
  setBiasMode: (biasMode) => set({ biasMode }),
}));

// Re-export so consumers needing the enum values don't reach past us.
export { BiasMode };

/**
 * React selector hook.  Bound with `useSyncExternalStore` using
 * `getState` for both snapshots — see `engineTelemetryStore` for the full
 * rationale (client-only SPA; zustand's own `useStore` would report the
 * initial value under `renderToStaticMarkup`).
 */
export const useBiasMode = (): BiasModeT =>
  useSyncExternalStore(
    engineSettingsStore.subscribe,
    () => engineSettingsStore.getState().biasMode,
    () => engineSettingsStore.getState().biasMode,
  );
