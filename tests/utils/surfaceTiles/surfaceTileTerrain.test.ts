import { describe, it, expect } from 'vitest';
import { surfaceTileTerrain } from '../../../src/utils/surfaceTiles/surfaceTileTerrain';
import type { EngineSubsystemHandles } from '../../../src/@types/engine/handles/EngineSubsystemHandles';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';

describe('surfaceTileTerrain', () => {
  it('reads the stream and plan installed after it was built', () => {
    const subsystems: Pick<EngineSubsystemHandles, 'surfaceTiles'> = { surfaceTiles: null };
    const terrain = surfaceTileTerrain(subsystems);
    const dir = [0, 0, 1] as const;

    expect(terrain.heightAt(asSceneBodyId('earth'), dir)).toBe(0);
    expect(terrain.residentHeightLevelAt(asSceneBodyId('earth'), dir)).toBeNull();
    expect(terrain.subCamera()).toBeNull();

    const subCamera = { lonDeg: 12.5, latDeg: 55.7, coveredMaxLevel: 19 };
    subsystems.surfaceTiles = {
      stream: { heightAt: () => 1234, residentHeightLevelAt: () => 15 },
      plan: { subCamera },
    } as unknown as EngineSubsystemHandles['surfaceTiles'];

    expect(terrain.heightAt(asSceneBodyId('earth'), dir)).toBe(1234);
    expect(terrain.residentHeightLevelAt(asSceneBodyId('earth'), dir)).toBe(15);
    expect(terrain.subCamera()).toBe(subCamera);
  });
});
