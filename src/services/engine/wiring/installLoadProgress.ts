/**
 * installLoadProgress — build the flat slot registry and wire the
 * load-progress emitter over it.
 *
 * Runs AFTER every slot is installed (point + body-texture slots minted
 * directly earlier in `wireSlots`, sidecars from `installSlots`, the DEV
 * synthetic-volume record from the orchestrator).
 * It populates `deps.allSlots` — keyed by `slot.name` — from all of those, then
 * hands the same Map to `createLoadProgressEmitter` and subscribes the emitter
 * to each slot.
 *
 * ### Why one shared Map
 *
 * `deps.allSlots` is the single registry both the loading bar (via the emitter)
 * AND the `LoadingDevPanel` read from — the public handle exposes it as
 * `assetSlots`. Building it once here keeps both consumers byte-for-byte in
 * agreement on what counts as "in flight"; per-subset `attachSlot` calls would
 * risk the two views drifting.
 *
 * The sidecar enumeration derives from `ASSET_WIRING`, so a new sidecar row
 * lands in `allSlots` automatically — the registry and the wiring table
 * cannot drift.
 *
 * The `unknown` type-erasure is benign — `aggregateRegistry` reads only the
 * `slot.state()` discriminator + byte counts, never the payload type.
 */

import { createLoadProgressEmitter } from '../subsystems/loadProgressAggregator';
import { isBodyTextureKey } from '../../../utils/bodyTextures/isBodyTextureKey';
import { isCoreSlotFieldKey } from '../../../utils/loading/isCoreSlotFieldKey';
import { isMeshBodyKey } from '../../../utils/meshBodies/isMeshBodyKey';
import { engineLoadProgressChanged } from '../../../state/engine/engineSlice';

import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../@types/engine/BootstrapDeps';

export function installLoadProgress(state: EngineState, deps: BootstrapDeps): void {
  const { cb, allSlots } = deps;

  // Body-texture slots (minted in wireSlots, keyed in the bodyTextures map like
  // points). Their ASSET_WIRING rows carry string keys but live in this keyed
  // map rather than a named field, so they are gathered here and skipped in
  // the string-keyed sidecar walk below.
  for (const [, slot] of state.assetSlots.bodyTextures) {
    allSlots.set(slot.name, slot as unknown as AssetSlot<unknown, unknown>);
  }

  // Mesh-body slots (minted in wireSlots, keyed in the meshBodies map like
  // bodyTextures). Their ASSET_WIRING rows carry `mesh:`-prefixed string keys
  // but live in this keyed map rather than a named field, so they are
  // gathered here and skipped in the string-keyed sidecar walk below.
  for (const [, slot] of state.assetSlots.meshBodies) {
    allSlots.set(slot.name, slot as unknown as AssetSlot<unknown, unknown>);
  }

  // Named sidecar slots (installed by installSlots): the ASSET_WIRING rows
  // with string keys (point rows carry numeric Source keys, included above;
  // body-texture and mesh-body rows are the keyed families gathered above).
  // pgcAlias is lazy but still registered so its eventual load shows in the
  // bar + dev panel. The absence of a cast IS the drift protection: a row key
  // with no matching assetSlots field fails to compile — the `isBodyTextureKey`
  // / `isMeshBodyKey` guards narrow the family keys out so only true
  // named-field keys reach the index.
  for (const row of state.assetRows) {
    if (typeof row.key !== 'string' || isBodyTextureKey(row.key) || isMeshBodyKey(row.key))
      continue;
    // A Layer's rows name slots the Layer owns; they have no `assetSlots` field
    // and are gathered from `layerSlots` below.
    if (!isCoreSlotFieldKey(state.assetSlots, row.key)) continue;
    const slot = state.assetSlots[row.key];
    if (slot) allSlots.set(slot.name, slot as unknown as AssetSlot<unknown, unknown>);
  }

  // Layer-owned slots (minted by `createLayers` from each Layer's asset rows).
  // They live in their own map, so neither the keyed-family walks nor the
  // named-field walk above reaches them — and a slot absent here gets no
  // loading-bar progress and no slot-ready render wake.
  for (const [, slot] of state.layerSlots) {
    allSlots.set(slot.name, slot);
  }

  // DEV synthetic-volume fixtures (present only in dev builds).
  if (state.assetSlots.syntheticVolumes) {
    for (const slot of Object.values(state.assetSlots.syntheticVolumes)) {
      allSlots.set(slot.name, slot as unknown as AssetSlot<unknown, unknown>);
    }
  }

  const progressEmitter = createLoadProgressEmitter((snapshot) => {
    cb.store.dispatch(engineLoadProgressChanged(snapshot));
  }, allSlots);
  for (const [, slot] of allSlots) progressEmitter.attachSlot(slot);
  state.subsystems.loadProgress = progressEmitter;
}
