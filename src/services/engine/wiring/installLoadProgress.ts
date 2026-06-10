/**
 * installLoadProgress — build the flat slot registry and wire the
 * load-progress emitter over it.
 *
 * Runs AFTER every slot is installed (point slots from `initGpu`, sidecars
 * from `installSlots`, the DEV synthetic-volume record from the orchestrator).
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
 * The sidecar enumeration is derived from `ASSET_WIRING` (filtering to string
 * keys — point-source rows carry numeric `Source` keys and are already handled
 * above), so the registry and the wiring table cannot disagree about what exists.
 * A new sidecar row added to `ASSET_WIRING` lands in `allSlots` automatically.
 *
 * The `unknown` type-erasure is benign — `aggregateRegistry` reads only the
 * `slot.state()` discriminator + byte counts, never the payload type.
 */

import { createLoadProgressEmitter } from '../subsystems/loadProgressAggregator';
import { ASSET_WIRING } from './assetWiring';

import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../@types/engine/BootstrapDeps';

export function installLoadProgress(state: EngineState, deps: BootstrapDeps): void {
  const { cb, allSlots } = deps;

  // Point slots (minted in initGpu, keyed by Source in the points map).
  for (const [, slot] of state.assetSlots.points) {
    allSlots.set(slot.name, slot as unknown as AssetSlot<unknown, unknown>);
  }

  // Named sidecar slots (installed by installSlots). Derived from ASSET_WIRING
  // rows whose key is a string — point rows carry numeric Source keys and are
  // already included above. pgcAlias is lazy but still registered so its
  // eventual load shows in the bar + dev panel.
  for (const row of ASSET_WIRING) {
    if (typeof row.key !== 'string') continue;
    const slot = state.assetSlots[row.key as keyof typeof state.assetSlots];
    if (slot && typeof slot === 'object' && 'name' in slot) {
      allSlots.set(
        (slot as AssetSlot<unknown, unknown>).name,
        slot as unknown as AssetSlot<unknown, unknown>,
      );
    }
  }

  // DEV synthetic-volume fixtures (present only in dev builds).
  if (state.assetSlots.syntheticVolumes) {
    for (const slot of Object.values(state.assetSlots.syntheticVolumes)) {
      allSlots.set(slot.name, slot as unknown as AssetSlot<unknown, unknown>);
    }
  }

  const progressEmitter = createLoadProgressEmitter((snapshot) => {
    cb.sources?.onLoadProgress?.(snapshot);
  }, allSlots);
  for (const [, slot] of allSlots) progressEmitter.attachSlot(slot);
  state.subsystems.loadProgress = progressEmitter;
}
