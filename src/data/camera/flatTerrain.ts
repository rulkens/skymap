import type { LayerTerrain } from '../../@types/engine/layer/LayerTerrain';
import { datumOnlyTerrainHeight } from '../../utils/camera/datumOnlyTerrainHeight';

/** What core's camera reads when no provider is composed: the datum, no tiles. */
export const FLAT_TERRAIN: LayerTerrain = {
  heightAt: datumOnlyTerrainHeight,
  residentHeightLevelAt: () => null,
  subCamera: () => null,
};
