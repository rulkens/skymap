import type { TerrainHeightAtLookup } from '../../../@types/camera/terrain/TerrainHeightAtLookup';

/** Explicit "no terrain" `CameraArmBasisCtx` reader — states the miss value instead of leaving the field optional. */
export const datumOnlyTerrainHeight: TerrainHeightAtLookup = () => 0;
