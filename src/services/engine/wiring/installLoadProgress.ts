/**
 * installLoadProgress — build the flat slot registry and wire the
 * load-progress emitter over it.
 *
 * Runs AFTER every slot exists (the mesh body slots minted earlier in
 * `wireSlots`, every Layer's minted by `createLayers`). It populates
 * `deps.allSlots` — keyed by `slot.name` — from both, then hands the same Map
 * to `createLoadProgressEmitter` and subscribes the emitter to each slot.
 *
 * ### Why one shared Map
 *
 * `deps.allSlots` is the single registry both the loading bar (via the emitter)
 * AND the `LoadingDevPanel` read from — the public handle exposes it as
 * `assetSlots`. Building it once here keeps both consumers byte-for-byte in
 * agreement on what counts as "in flight"; per-subset `attachSlot` calls would
 * risk the two views drifting.
 *
 * The `unknown` type-erasure is benign — `aggregateRegistry` reads only the
 * `slot.state()` discriminator + byte counts, never the payload type.
 */

import { createLoadProgressEmitter } from '../subsystems/loadProgressAggregator';
import { engineLoadProgressChanged } from '../../../state/engine/engineSlice';

import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../@types/engine/BootstrapDeps';

export function installLoadProgress(state: EngineState, deps: BootstrapDeps): void {
  const { cb, allSlots } = deps;

  // Mesh-body slots (minted in wireSlots, keyed in the meshBodies map). Their
  // ASSET_WIRING rows carry `mesh:`-prefixed string keys
  // but live in this keyed map rather than a named field, so they are
  // gathered here and skipped in the string-keyed sidecar walk below.
  for (const [, slot] of state.assetSlots.meshBodies) {
    allSlots.set(slot.name, slot as unknown as AssetSlot<unknown, unknown>);
  }

  // Layer-owned slots (minted by `createLayers` from each Layer's asset rows).
  // They live in their own map, so the mesh walk above does not reach them —
  // and a slot absent here gets no loading-bar progress and no slot-ready
  // render wake.
  for (const [, slot] of state.layerSlots) {
    allSlots.set(slot.name, slot);
  }

  const progressEmitter = createLoadProgressEmitter((snapshot) => {
    cb.store.dispatch(engineLoadProgressChanged(snapshot));
  }, allSlots);
  for (const [, slot] of allSlots) progressEmitter.attachSlot(slot);
  state.subsystems.loadProgress = progressEmitter;
}
