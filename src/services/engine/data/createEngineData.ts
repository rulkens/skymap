import type { EngineData } from '../../../@types/engine/data/EngineData';
import { createGalaxyStore } from './createGalaxyStore';
import { createStructureStore } from './createStructureStore';
import { createVolumeStore } from './createVolumeStore';
import { createFilamentStore } from './createFilamentStore';
import { createFlowFieldStore } from './createFlowFieldStore';

/**
 * createEngineData — assemble the empty per-type stores into the `EngineData`
 * bag installed on `EngineState` at engine construction.
 */
export function createEngineData(): EngineData {
  return {
    galaxies: createGalaxyStore(),
    structures: createStructureStore(),
    volumes: createVolumeStore(),
    filaments: createFilamentStore(),
    flow: createFlowFieldStore(),
  };
}
