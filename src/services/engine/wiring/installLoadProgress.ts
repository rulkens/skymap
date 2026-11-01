/**
 * installLoadProgress — fills `deps.allSlots` (keyed by `slot.name`) from
 * `state.slotsByKey` and subscribes the load-progress emitter to each slot.
 * Runs AFTER `createLayers`. One shared Map feeds both the loading bar and
 * `LoadingDevPanel` (`assetSlots`), so they agree on what is "in flight".
 */

import { createLoadProgressEmitter } from '../subsystems/loadProgressAggregator';
import { engineLoadProgressChanged } from '../../../state/engine/engineSlice';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../@types/engine/BootstrapDeps';

export function installLoadProgress(state: EngineState, deps: BootstrapDeps): void {
  const { cb, allSlots } = deps;

  // A slot absent here gets no loading-bar progress and no slot-ready render wake.
  for (const slot of state.slotsByKey.values()) allSlots.set(slot.name, slot);

  const progressEmitter = createLoadProgressEmitter((snapshot) => {
    cb.store.dispatch(engineLoadProgressChanged(snapshot));
  }, allSlots);
  for (const [, slot] of allSlots) progressEmitter.attachSlot(slot);
  state.subsystems.loadProgress = progressEmitter;
}
