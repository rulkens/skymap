import type { EngineData } from '../../../@types/engine/data/EngineData';
import { createGalaxyStore } from './createGalaxyStore';
import { createStructureStore } from './createStructureStore';
import { createBodyStore } from './createBodyStore';
import { SCENE_EARTH } from '../../../data/bodies/sceneBodies';

/**
 * createEngineData — assemble the per-type stores into the `EngineData` bag
 * installed on `EngineState` at engine construction. Three types get a store:
 * galaxies and structures (the app CPU-queries them through transformed/indexed
 * data the slot can't supply) and bodies (the true-scale foreground, whose
 * authored constants have no fetched asset behind them).
 *
 * Bodies are seeded here, at construction — the project's seed-data-early
 * convention: real data flows in the moment the store exists, not at a later
 * wiring phase. `SCENE_EARTH` is installed now; stars and planets get their
 * seeds in a later phase, so the store's other collections stay empty.
 *
 * Filaments, flow, and volume fields have no store: filaments/flow held only a
 * `loaded` bit that mirrored their asset slot (read `slotReady(assetSlots.X)`
 * instead), and volume fields' only app-side state is settings in
 * `state.settings.volumes.items` (ADR 0006).
 */
export function createEngineData(): EngineData {
  const bodies = createBodyStore();
  bodies.setEarth(SCENE_EARTH);
  return {
    galaxies: createGalaxyStore(),
    structures: createStructureStore(),
    bodies,
  };
}
