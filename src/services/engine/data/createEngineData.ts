import type { EngineData } from '../../../@types/engine/data/EngineData';
import { createStructureStore } from './createStructureStore';
import { createBodyStore } from './createBodyStore';
import { SCENE_EARTH } from '../../../data/bodies/sceneEarth';
import { SCENE_PLANETS } from '../../../data/bodies/scenePlanets';
import { SCENE_MESH_BODIES } from '../../../data/bodies/sceneMeshBodies';

/**
 * createEngineData — assemble the per-type stores into the `EngineData` bag
 * installed on `EngineState` at engine construction. Two types get a store:
 * structures (the app CPU-queries them through transformed/indexed data the slot
 * can't supply) and bodies (the true-scale foreground, whose authored constants
 * have no fetched asset behind them).
 *
 * Bodies are seeded here, at construction — the project's seed-data-early
 * convention: real data flows in the moment the store exists, not at a later
 * wiring phase. The seeded STARS are not among them: they are star catalogs,
 * read straight from `SEEDED_STAR_CATALOGS` by `visibleStars`.
 *
 * Filaments, flow, and volume fields have no store: filaments/flow held only a
 * `loaded` bit that mirrored their asset slot (read `slotFor(state, key)`
 * instead), and volume fields' only app-side state is settings in
 * `state.settings.volumes.items` (ADR 0006).
 */
export function createEngineData(): EngineData {
  const bodies = createBodyStore();
  bodies.setEarth(SCENE_EARTH);
  bodies.setPlanets(SCENE_PLANETS);
  bodies.setMeshBodies(SCENE_MESH_BODIES);
  return {
    structures: createStructureStore(),
    bodies,
  };
}
