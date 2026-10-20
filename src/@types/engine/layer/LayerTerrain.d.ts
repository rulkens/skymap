import type { ResidentHeightLevelLookup } from '../../camera/ResidentHeightLevelLookup';
import type { TerrainHeightAtLookup } from '../../camera/TerrainHeightAtLookup';
import type { TerrainSubCamera } from '../../camera/TerrainSubCamera';

/** Everything core's camera reads from the ground, and nothing else. */
export type LayerTerrain = {
  readonly heightAt: TerrainHeightAtLookup;
  readonly residentHeightLevelAt: ResidentHeightLevelLookup;
  /** Where over the body the last planned tile frame's camera sat; null while disengaged. */
  subCamera(): TerrainSubCamera | null;
};
