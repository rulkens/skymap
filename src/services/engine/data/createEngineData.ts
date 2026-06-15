import type { EngineData } from '../../../@types/engine/data/EngineData';
import { createGalaxyStore } from './createGalaxyStore';
import { createStructureStore } from './createStructureStore';

/**
 * createEngineData — assemble the per-type stores into the `EngineData` bag
 * installed on `EngineState` at engine construction. Only galaxies and
 * structures get a store — the two types the app CPU-queries through
 * transformed/indexed data the slot can't supply.
 *
 * Filaments, flow, and volume fields have no store: filaments/flow held only a
 * `loaded` bit that mirrored their asset slot (read `slotReady(assetSlots.X)`
 * instead), and volume fields' only app-side state is settings in
 * `state.settings.volumes.items` (ADR 0006).
 */
export function createEngineData(): EngineData {
  return {
    galaxies: createGalaxyStore(),
    structures: createStructureStore(),
  };
}
