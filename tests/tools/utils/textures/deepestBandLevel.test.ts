import { describe, expect, it } from 'vitest';

import { deepestBandLevel } from '../../../../tools/utils/textures/deepestBandLevel';
import type { SurfaceTileManifest } from '../../../../src/@types/scene/SurfaceTileManifest';

const GLOBAL: SurfaceTileManifest['bands'][number] = {
  bounds: { west: -180, east: 180, south: -90, north: 90 },
  min: 3,
  max: 7,
  builtFrom: {},
};
const REGIONAL: SurfaceTileManifest['bands'][number] = {
  bounds: { west: 137.36, east: 137.41, south: -4.85, north: -4.8 },
  min: 10,
  max: 17,
  builtFrom: {},
};
const MANIFEST: SurfaceTileManifest = {
  prefix: 'mars-tiles/v2',
  tilePx: 512,
  bands: [GLOBAL, REGIONAL],
};

describe('deepestBandLevel', () => {
  it('picks the tighter, deeper band where a regional window nests inside the global one', () => {
    expect(deepestBandLevel(MANIFEST, -4.8246, 137.38848)).toBe(17);
  });

  it('falls back to the global band outside every regional window', () => {
    expect(deepestBandLevel(MANIFEST, 0, 0)).toBe(7);
  });

  it('throws when no band covers the point at all', () => {
    expect(() => deepestBandLevel({ ...MANIFEST, bands: [REGIONAL] }, 0, 0)).toThrow();
  });
});
