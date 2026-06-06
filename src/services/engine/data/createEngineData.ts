import type { EngineData } from '../../../@types/engine/data/EngineData';
import { createGalaxyStore } from './createGalaxyStore';
import { createStructureStore } from './createStructureStore';
import { createFilamentStore } from './createFilamentStore';

/**
 * createEngineData — assemble the three empty per-type stores into the
 * `EngineData` bag installed on `EngineState` at engine construction.
 * Volume fields have no data-layer store; their only app-side state is
 * settings, which live in `state.settings.volumes.fields` (ADR 0006).
 */
export function createEngineData(): EngineData {
  return {
    galaxies: createGalaxyStore(),
    structures: createStructureStore(),
    filaments: createFilamentStore(),
  };
}
