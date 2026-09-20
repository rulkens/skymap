/**
 * clippedImagerySource's feather: an ortho left opaque to its clip edge is a
 * hard-edged square against the underfill.
 */

import { describe, expect, it } from 'vitest';

import { clippedImagerySource } from '../../../tools/textures/clippedImagerySource';
import type { SurfaceImagerySource } from '../../../tools/textures/@types/SurfaceImagerySource';

const opaque: SurfaceImagerySource = {
  id: 'fake',
  attribution: 'fake',
  maxLevel: 20,
  coverage: [],
  provenance: { sourceId: 'fake', attribution: 'fake', vintage: 'n/a' },
  async readBox(_box, widthPx, heightPx) {
    return new Uint8Array(widthPx * heightPx * 4).fill(255);
  },
};

describe('clippedImagerySource', () => {
  const extent = { west: 0, east: 8, south: 0, north: 1 };
  const core = { west: 4, east: 8, south: 0, north: 1 };
  const source = clippedImagerySource(opaque, extent, core);

  it('fades alpha from the extent edge to the core, colour untouched', async () => {
    const raster = await source.readBox({ west: 0, east: 8, south: 0.5, north: 1 }, 8, 1);

    const alphas = [0, 1, 2, 3, 4].map((px) => raster![px * 4 + 3]);
    expect(alphas[0]).toBeLessThan(20);
    expect(alphas[1]).toBeLessThan(alphas[2]!);
    expect(alphas[2]).toBeLessThan(alphas[3]!);
    expect(alphas[4]).toBe(255);
    expect(raster![0]).toBe(255);
  });

  it('declines a box that only shares an edge', async () => {
    expect(await source.readBox({ west: 8, east: 9, south: 0, north: 1 }, 1, 1)).toBeNull();
  });
});
