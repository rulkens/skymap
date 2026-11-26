import { describe, expect, it } from 'vitest';

import { HORIZON_TILE_PX } from '../../../../src/layers/body/surfaceTiles/format/data/surfaceTileParams';
import type { HorizonTile } from '../../../../tools/textures/surfaceHorizon/@types/HorizonTile';
import { repackGlobeHorizon } from '../../../../tools/textures/surfaceHorizon/utils/repackGlobeHorizon';

const TILE_SIDE = HORIZON_TILE_PX;
const TEXELS_PER_TILE = HORIZON_TILE_PX - 2;

/** A tile raster whose texel (u, v) reads `fill`, with the shared last row and column 255. */
function tileOf(fill: number): HorizonTile {
  const rgba = new Uint8Array(TILE_SIDE * TILE_SIDE * 4);
  for (let v = 0; v < TILE_SIDE; v++) {
    for (let u = 0; u < TILE_SIDE; u++) {
      const edge = u >= TEXELS_PER_TILE || v >= TEXELS_PER_TILE;
      rgba.fill(edge ? 255 : fill, (v * TILE_SIDE + u) * 4, (v * TILE_SIDE + u) * 4 + 4);
    }
  }
  return { kind: 'image', rgba };
}

describe('repackGlobeHorizon', () => {
  it("places each tile's posts at their equirect position and writes flat tiles as byte 0", () => {
    // z1 is 2 × 1 tiles: the west one is an image, the east one flat.
    const { width, height, rgba } = repackGlobeHorizon(
      (_z, x) => (x === 0 ? tileOf(77) : { kind: 'flat' }),
      1,
    );
    expect([width, height]).toEqual([2 * TEXELS_PER_TILE, TEXELS_PER_TILE]);
    const at = (u: number, v: number) => rgba[(v * width + u) * 4];
    expect(at(0, 0)).toBe(77);
    expect(at(TEXELS_PER_TILE - 1, TEXELS_PER_TILE - 1)).toBe(77);
    expect(at(TEXELS_PER_TILE, 0)).toBe(0);
    // The tile's shared last post row and column never reach the globe.
    expect(rgba.includes(255)).toBe(false);
  });

  it('keeps a tile row below another at its own y', () => {
    const { width, rgba } = repackGlobeHorizon((_z, x, y) => (y === 1 ? tileOf(9) : null), 2);
    expect(rgba[(TEXELS_PER_TILE * width + 3 * TEXELS_PER_TILE) * 4]).toBe(9);
    expect(rgba[(TEXELS_PER_TILE - 1) * width * 4]).toBe(0);
  });
});
