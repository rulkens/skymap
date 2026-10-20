import type { EngineSubsystemHandles } from '../../@types/engine/handles/EngineSubsystemHandles';
import type { LayerTerrain } from '../../@types/engine/layer/LayerTerrain';

/** Reads `subsystems.surfaceTiles` per call, never captured: `wireSlots` creates it after `createLayers` builds this, and teardown nulls it. */
export function surfaceTileTerrain(
  subsystems: Pick<EngineSubsystemHandles, 'surfaceTiles'>,
): LayerTerrain {
  return {
    heightAt: (bodyId, dir) => subsystems.surfaceTiles?.terrainHeightAt(bodyId, dir) ?? 0,
    residentHeightLevelAt: (bodyId, dir) =>
      subsystems.surfaceTiles?.residentHeightLevelAt(bodyId, dir) ?? null,
    subCamera: () => subsystems.surfaceTiles?.getDebugSnapshot().subCamera ?? null,
  };
}
