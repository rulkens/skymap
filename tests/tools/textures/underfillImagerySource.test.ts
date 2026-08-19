import { describe, it, expect, vi } from 'vitest';

import { underfillImagerySource } from '../../../tools/textures/underfillImagerySource';
import type { EarthImagerySource } from '../../../tools/textures/EarthImagerySource';
import type { LonLatBounds } from '../../../src/@types/scene/LonLatBounds';

const BOX: LonLatBounds = { west: 12, east: 13, south: 55, north: 56 };
const WIDTH = 4;
const HEIGHT = 4;

/** Minimal stub source: constant identity fields, `readBox` fixed to one return value. */
function stubSource(id: string, readBox: EarthImagerySource['readBox']): EarthImagerySource {
  return {
    id,
    attribution: `${id} attribution`,
    maxLevel: 13,
    coverage: [BOX],
    provenance: { sourceId: id, attribution: `${id} attribution`, vintage: 'stub-vintage' },
    readBox,
  };
}

/** width x height RGBA raster, `[r, g, b, a]` uniform across every pixel. */
function solid(rgba: readonly [number, number, number, number]): Uint8Array {
  const raster = new Uint8Array(WIDTH * HEIGHT * 4);
  for (let i = 0; i < raster.length; i += 4) raster.set(rgba, i);
  return raster;
}

function pixelAt(
  data: Uint8Array,
  x: number,
  y: number,
): readonly [number, number, number, number] {
  const i = (y * WIDTH + x) * 4;
  return [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!];
}

describe('underfillImagerySource', () => {
  it('declines without ever calling filler.readBox when primary declines', async () => {
    const primary = stubSource('primary', async () => null);
    const fillerReadBox = vi.fn<EarthImagerySource['readBox']>(async () => solid([0, 0, 255, 255]));
    const filler = stubSource('filler', fillerReadBox);

    const source = underfillImagerySource(primary, filler);
    const result = await source.readBox(BOX, WIDTH, HEIGHT);

    expect(result).toBeNull();
    expect(fillerReadBox).not.toHaveBeenCalled();
  });

  it('composites primary over filler: filler shows through the transparent hole, primary elsewhere', async () => {
    // Primary: opaque red in the top-left 2x2 quadrant, fully transparent everywhere else.
    const RED: readonly [number, number, number, number] = [255, 0, 0, 255];
    const GREEN: readonly [number, number, number, number] = [0, 255, 0, 255];
    const primaryRaster = new Uint8Array(WIDTH * HEIGHT * 4);
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const i = (y * WIDTH + x) * 4;
        if (x < 2 && y < 2) primaryRaster.set(RED, i);
        // else stays zeroed: [0, 0, 0, 0] — transparent.
      }
    }
    const primary = stubSource('primary', async () => primaryRaster);
    const filler = stubSource('filler', async () => solid(GREEN));

    const source = underfillImagerySource(primary, filler);
    const result = await source.readBox(BOX, WIDTH, HEIGHT);
    expect(result).not.toBeNull();

    // Inside the opaque quadrant: primary wins.
    expect(pixelAt(result!, 0, 0)).toEqual(RED);
    expect(pixelAt(result!, 1, 1)).toEqual(RED);
    // Outside it, where primary is transparent: filler shows through, fully opaque.
    expect(pixelAt(result!, 3, 0)).toEqual(GREEN);
    expect(pixelAt(result!, 0, 3)).toEqual(GREEN);
    expect(pixelAt(result!, 3, 3)).toEqual(GREEN);
  });

  it('falls back to primary as-is when filler declines', async () => {
    const primaryRaster = solid([255, 128, 0, 255]);
    const primary = stubSource('primary', async () => primaryRaster);
    const filler = stubSource('filler', async () => null);

    const source = underfillImagerySource(primary, filler);
    const result = await source.readBox(BOX, WIDTH, HEIGHT);

    expect(result).toEqual(primaryRaster);
  });

  it('takes identity fields from primary, verbatim', () => {
    const primary = stubSource('primary-id', async () => null);
    const filler = stubSource('filler-id', async () => null);

    const source = underfillImagerySource(primary, filler);

    expect(source.id).toBe(primary.id);
    expect(source.attribution).toBe(primary.attribution);
    expect(source.maxLevel).toBe(primary.maxLevel);
    expect(source.coverage).toBe(primary.coverage);
    expect(source.provenance).toBe(primary.provenance);
  });
});
