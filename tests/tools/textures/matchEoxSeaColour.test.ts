import { describe, expect, it } from 'vitest';

import { matchEoxSeaColour } from '../../../tools/textures/matchEoxSeaColour';
import type { GreyRaster } from '../../../tools/utils/image/GreyRaster';

const SIZE = 64;
const DARK_WATER = [7, 18, 19] as const;
const BRIGHT_LAND = [120, 110, 90] as const;

/** 1 px/deg whole-globe mask: water west of the prime meridian, land east. */
function westWaterMask(): GreyRaster {
  const data = new Uint8Array(360 * 180);
  for (let y = 0; y < 180; y++) data.fill(255, y * 360 + 180, (y + 1) * 360);
  return { data, width: 360, height: 180 };
}

/** West half of the raster `west`, east half `east`. */
function splitRgba(west: readonly number[], east: readonly number[]): Uint8Array {
  const out = new Uint8Array(SIZE * SIZE * 4);
  for (let p = 0; p < SIZE * SIZE; p++) {
    out.set([...(p % SIZE < SIZE / 2 ? west : east), 255], p * 4);
  }
  return out;
}

function pixel(rgba: Uint8Array, x: number, y: number): number[] {
  const i = (y * SIZE + x) * 4;
  return [...rgba.subarray(i, i + 4)];
}

describe('matchEoxSeaColour', () => {
  it('lets the mask alone decide far from its coastline', async () => {
    const mask = westWaterMask();
    const land = splitRgba(DARK_WATER, DARK_WATER);
    const sea = splitRgba(BRIGHT_LAND, BRIGHT_LAND);

    const onLand = await matchEoxSeaColour(
      land,
      SIZE,
      SIZE,
      { west: 60, east: 61, south: 10, north: 11 },
      mask,
    );
    const atSea = await matchEoxSeaColour(
      sea,
      SIZE,
      SIZE,
      { west: -61, east: -60, south: 10, north: 11 },
      mask,
    );

    expect(onLand).toEqual(land);
    expect(pixel(atSea, 8, 8)[2]).toBeGreaterThan(100);
  });

  it('decides per pixel by colour within the coastal band, whatever the mask says', async () => {
    // Pixels are the reverse of the mask: land colour over mask water (a
    // spit), water colour over mask land (a harbour).
    const rgba = splitRgba(BRIGHT_LAND, DARK_WATER);
    const out = await matchEoxSeaColour(
      rgba,
      SIZE,
      SIZE,
      { west: -1, east: 1, south: 10, north: 11 },
      westWaterMask(),
    );

    expect(pixel(out, 4, 32)).toEqual(pixel(rgba, 4, 32));
    expect(pixel(out, SIZE - 4, 32)[2]).toBeGreaterThan(100);
  });
});
