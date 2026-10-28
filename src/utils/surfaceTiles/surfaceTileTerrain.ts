import type { EngineSubsystemHandles } from '../../@types/engine/handles/EngineSubsystemHandles';
import type { LayerTerrain } from '../../@types/engine/layer/LayerTerrain';

/** Reads `subsystems.surfaceTiles` per call, never captured: `wireSlots` creates it after `createLayers` builds this, and teardown nulls it. */
export function surfaceTileTerrain(
  subsystems: Pick<EngineSubsystemHandles, 'surfaceTiles'>,
): LayerTerrain {
  return {
    heightAt: (bodyId, dir) => {
      const tiles = subsystems.surfaceTiles;
      return tiles === null ? 0 : tiles.stream.heightAt(bodyId, dir, tiles.plan.params);
    },
    residentHeightLevelAt: (bodyId, dir) => {
      const tiles = subsystems.surfaceTiles;
      return tiles === null
        ? null
        : tiles.stream.residentHeightLevelAt(bodyId, dir, tiles.plan.params);
    },
    subCamera: () => subsystems.surfaceTiles?.plan.subCamera ?? null,
  };
}
