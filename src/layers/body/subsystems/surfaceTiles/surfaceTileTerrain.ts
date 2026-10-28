import type { BodyRuntime } from '../../@types/BodyRuntime';
import type { LayerTerrain } from '../../../../@types/engine/layer/LayerTerrain';

/** Reads `tiles.plan` per call, never captured: the planner replaces it every frame. */
export function surfaceTileTerrain(tiles: BodyRuntime['surfaceTiles']): LayerTerrain {
  return {
    heightAt: (bodyId, dir) => tiles.stream.heightAt(bodyId, dir, tiles.plan.params),
    residentHeightLevelAt: (bodyId, dir) =>
      tiles.stream.residentHeightLevelAt(bodyId, dir, tiles.plan.params),
    subCamera: () => tiles.plan.subCamera,
  };
}
