import { describe, it, expect, vi } from 'vitest';
import type { DetailRegionDeps } from '../../../../../src/layers/cosmicWebDensity/detailRegion/@types/DetailRegionDeps';

const built: Array<{ deps: DetailRegionDeps; destroy: ReturnType<typeof vi.fn> }> = [];
vi.mock('../../../../../src/layers/cosmicWebDensity/detailRegion/load/createDetailRegion', () => ({
  createDetailRegion: (deps: DetailRegionDeps) => {
    const region = { deps, destroy: vi.fn() };
    built.push(region);
    return { frame: () => ({ draw: null, busy: false }), destroy: region.destroy };
  },
}));

import { createDetailRegionHost } from '../../../../../src/layers/cosmicWebDensity/detailRegion/load/createDetailRegionHost';
import { DENSITY_REGION_BRICKS_BY_TIER } from '../../../../../src/layers/cosmicWebDensity/densityCubes/data/densityRegionBricksByTier';

describe('createDetailRegionHost', () => {
  it('a tier switch that changes K rebuilds the region; small ↔ medium keeps it', () => {
    const host = createDetailRegionHost({
      device: {} as GPUDevice,
      renderer: {} as never,
      requestRender: () => {},
    });
    const at = (tier: keyof typeof DENSITY_REGION_BRICKS_BY_TIER, frame: number) =>
      host.frame(
        new Map([['mcpm', DENSITY_REGION_BRICKS_BY_TIER[tier]]]),
        [0, 0, 0],
        300,
        frame,
        0,
      );

    at('small', 1);
    at('medium', 2);
    expect(built).toHaveLength(1);
    at('large', 3);
    expect(built).toHaveLength(2);
    expect(built[0]!.destroy).toHaveBeenCalledOnce();
    expect(built[1]!.deps.bricksPerAxis).toBe(8);
    expect(built[1]!.deps.binBaseName).toBe('mcpm');
  });
});
