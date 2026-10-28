import type { BodyRuntime } from '../../@types/BodyRuntime';
import type { TerrainHeightAtLookup } from '../../../../@types/camera/TerrainHeightAtLookup';

/** Reads `tiles.plan` per call, never captured: the planner replaces it every frame. */
export function surfaceTileHeightAt(tiles: BodyRuntime['surfaceTiles']): TerrainHeightAtLookup {
  return (bodyId, dir) => tiles.stream.heightAt(bodyId, dir, tiles.plan.params);
}
