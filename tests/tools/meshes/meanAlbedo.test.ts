import { describe, it, expect } from 'vitest';

import { meanAlbedo } from '../../../tools/meshes/meanAlbedo';

/** One triangle per entry, its UVs all at `uv`, its 3D area `area` (a right triangle in z = 0). */
function surface(...tris: { uv: [number, number]; area: number }[]) {
  const positions: number[] = [];
  const uvs: number[] = [];
  for (const { uv, area } of tris) {
    const leg = Math.sqrt(2 * area);
    positions.push(0, 0, 0, leg, 0, 0, 0, leg, 0);
    uvs.push(...uv, ...uv, ...uv);
  }
  return {
    positions: new Float32Array(positions),
    uvs: new Float32Array(uvs),
    indices: Uint32Array.from(positions.map((_, i) => i).slice(0, positions.length / 3)),
  };
}

describe('meanAlbedo()', () => {
  it('averages the surface in linear light', () => {
    // 2x1 RGBA: one full red texel, one full blue texel, each under an equal triangle.
    // Both channels are at the transfer curve's fixed points, so the mean is exactly half.
    const pixels = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]);
    const geometry = surface({ uv: [0.25, 0.5], area: 1 }, { uv: [0.75, 0.5], area: 1 });

    expect(meanAlbedo(pixels, 2, 1, geometry)).toEqual([0.5, 0, 0.5]);
  });

  it('undoes the sRGB transfer rather than averaging the encoded bytes', () => {
    // Mid-grey 128/255 is 0.216 in linear light, not 0.502 — a naive byte
    // average would hand the glint fallback a body twice as bright as its map.
    const geometry = surface({ uv: [0.5, 0.5], area: 1 });
    const [r, g, b] = meanAlbedo(new Uint8ClampedArray([128, 128, 128]), 1, 1, geometry);

    expect(r).toBeCloseTo(0.2159, 4);
    expect(g).toBeCloseTo(0.2159, 4);
    expect(b).toBeCloseTo(0.2159, 4);
  });

  it('reads v downwards from the top row, as glTF does', () => {
    // 1x2: white top row, black bottom row.
    const pixels = new Uint8ClampedArray([255, 255, 255, 0, 0, 0]);
    const geometry = surface({ uv: [0.5, 0.25], area: 1 });

    expect(meanAlbedo(pixels, 1, 2, geometry)).toEqual([1, 1, 1]);
  });

  it('weights by surface area, not by atlas texels', () => {
    // A baked atlas leaves the space between its UV islands black; counting every texel
    // darkened Bennu's glint by a quarter.
    const pixels = new Uint8ClampedArray([255, 255, 255, 0, 0, 0]);
    const geometry = surface({ uv: [0.25, 0.5], area: 3 }, { uv: [0.75, 0.5], area: 1 });

    expect(meanAlbedo(pixels, 2, 1, geometry)[0]).toBeCloseTo(0.75, 6);
  });
});
