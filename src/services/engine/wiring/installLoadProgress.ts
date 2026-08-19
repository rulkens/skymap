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
import { ASSET_WIRING } from './assetWiring';
import { isBodyTextureKey } from '../../../utils/scene/isBodyTextureKey';
import { engineLoadProgressChanged } from '../../../state/engine/engineSlice';

import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../@types/engine/BootstrapDeps';

export function installLoadProgress(state: EngineState, deps: BootstrapDeps): void {
  const { cb, allSlots } = deps;

  // Point slots (minted earlier in wireSlots, keyed by Source in the points map).
  for (const [, slot] of state.assetSlots.points) {
    allSlots.set(slot.name, slot as unknown as AssetSlot<unknown, unknown>);
  }

  // Star-catalog slots (registry-built, keyed by Source in the starCatalogs
  // map). Their wiring rows carry NUMERIC keys, so the string-keyed sidecar
  // walk below misses them — they must be gathered from their per-source map
  // like the points, or a committing catalog would get no loading-bar
  // progress and, worse, no slot-ready render wake (`installSlotReadyWake`
  // subscribes over this same registry, and in the render-on-demand loop an
  // unwoken commit simply never presents).
  for (const [, slot] of state.assetSlots.starCatalogs) {
    allSlots.set(slot.name, slot as unknown as AssetSlot<unknown, unknown>);
  }

  // Body-texture slots (minted in wireSlots, keyed in the bodyTextures map like
  // points/starCatalogs). Their ASSET_WIRING rows carry string keys but live in
  // this keyed map rather than a named field, so they are gathered here and
  // skipped in the string-keyed sidecar walk below.
  for (const [, slot] of state.assetSlots.bodyTextures) {
    allSlots.set(slot.name, slot as unknown as AssetSlot<unknown, unknown>);
  }

  // Named sidecar slots (installed by installSlots): the ASSET_WIRING rows
  // with string keys (point rows carry numeric Source keys, included above;
  // body-texture rows are the keyed family gathered above). pgcAlias is lazy
  // but still registered so its eventual load shows in the bar + dev panel. The
  // absence of a cast IS the drift protection: a row key with no matching
  // assetSlots field fails to compile — the `isBodyTextureKey` guard narrows the
  // family keys out so only true named-field keys reach the index.
  for (const row of ASSET_WIRING) {
    if (typeof row.key !== 'string' || isBodyTextureKey(row.key)) continue;
    const slot = state.assetSlots[row.key];
    if (slot) allSlots.set(slot.name, slot as unknown as AssetSlot<unknown, unknown>);
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
