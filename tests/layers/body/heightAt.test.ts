import { describe, it, expect } from 'vitest';
import { heightAt } from '../../../src/layers/body/heightAt';
import { IDLE_SURFACE_TILE_PLAN } from '../../../src/layers/body/subsystems/surfaceTiles/idleSurfaceTilePlan';
import type { BodyRuntime } from '../../../src/layers/body/@types/BodyRuntime';
import type { SurfaceTilePlan } from '../../../src/layers/body/@types/SurfaceTilePlan';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';

describe('heightAt', () => {
  it("reads the plan written after it was built, climbing with that plan's params", () => {
    const params = { tilePx: 512, baseLevel: 3, bands: [], lodBias: 0 };
    const tiles = {
      stream: {
        heightAt: (_b: unknown, _d: unknown, p: unknown) => (p === params ? 1234 : -1),
      },
      plan: IDLE_SURFACE_TILE_PLAN,
    } as unknown as BodyRuntime['surfaceTiles'];
    const lookup = heightAt({ surfaceTiles: tiles } as BodyRuntime);

    tiles.plan = { ...IDLE_SURFACE_TILE_PLAN, params } as unknown as SurfaceTilePlan;

    expect(lookup(asSceneBodyId('earth'), [0, 0, 1])).toBe(1234);
  });
});
