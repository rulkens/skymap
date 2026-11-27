import type { TerrainHorizonLookup } from '../../../@types/camera/terrain/TerrainHorizonLookup';

/** "No terrain" horizon reader: every mesh body on the ground draws fully lit. */
export const noTerrainHorizon: TerrainHorizonLookup = () => null;
