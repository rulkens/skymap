import { describe, it, expect } from 'vitest';
import { surfaceTileTerrain } from '../../../../../src/layers/body/subsystems/surfaceTiles/surfaceTileTerrain';
import { IDLE_SURFACE_TILE_PLAN } from '../../../../../src/layers/body/subsystems/surfaceTiles/idleSurfaceTilePlan';
import type { BodyRuntime } from '../../../../../src/layers/body/@types/BodyRuntime';
import type { SurfaceTilePlan } from '../../../../../src/layers/body/@types/SurfaceTilePlan';
import { asSceneBodyId } from '../../../../../src/utils/scene/asSceneBodyId';

describe('surfaceTileTerrain', () => {
  it("reads the plan written after it was built, climbing with that plan's params", () => {
    const params = { tilePx: 512, baseLevel: 3, bands: [], lodBias: 0 };
    const tiles = {
      stream: {
        heightAt: (_b: unknown, _d: unknown, p: unknown) => (p === params ? 1234 : -1),
        residentHeightLevelAt: (_b: unknown, _d: unknown, p: unknown) => (p === params ? 15 : -1),
      },
      plan: IDLE_SURFACE_TILE_PLAN,
    } as unknown as BodyRuntime['surfaceTiles'];
    const terrain = surfaceTileTerrain(tiles);
    const dir = [0, 0, 1] as const;

    expect(terrain.subCamera()).toBeNull();

    const subCamera = { lonDeg: 12.5, latDeg: 55.7, coveredMaxLevel: 19 };
    tiles.plan = { ...IDLE_SURFACE_TILE_PLAN, subCamera, params } as unknown as SurfaceTilePlan;

    expect(terrain.heightAt(asSceneBodyId('earth'), dir)).toBe(1234);
    expect(terrain.residentHeightLevelAt(asSceneBodyId('earth'), dir)).toBe(15);
    expect(terrain.subCamera()).toBe(subCamera);
  });
});
