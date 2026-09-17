import type { TerrainHeightAtLookup } from '../../@types/camera/TerrainHeightAtLookup';

/** Explicit "no terrain" `RungBasisCtx` reader — states the miss value instead of leaving the field optional. */
export const datumOnlyTerrainHeight: TerrainHeightAtLookup = () => 0;
