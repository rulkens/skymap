/**
 * `readGeoTiffRgbWindow`'s window offset and channel order, and
 * `geoTiffImagerySource`'s UInt16-grey stretch — the two ways a colour
 * GeoTIFF reader silently produces a wrong or opaque-when-it-shouldn't-be
 * raster.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';

import { geoTiffImagerySource } from '../../../tools/textures/geoTiffImagerySource';
import { readGeoTiffRgbWindow } from '../../../tools/utils/textures/readGeoTiffRgbWindow';
import { writeGreyTiff } from '../../fixtures/textures/geoTiffWriters';

let dir = '';

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'geotiff-imagery-'));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('readGeoTiffRgbWindow', () => {
  it("returns the window's pixels on a synthetic 8-bit RGB TIFF", async () => {
    // Default TIFF compression tiles the file in a way `extract` misreads;
    // `compression: 'none'` is load-bearing, not a preference.
    const width = 4;
    const height = 3;
    const pixels = new Uint8Array(width * height * 3);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 3;
        pixels[i] = 10 + x;
        pixels[i + 1] = 50 + y;
        pixels[i + 2] = 100 + x + y;
      }
    }
    const path = join(dir, 'rgb.tif');
    await sharp(pixels, { raw: { width, height, channels: 3 } })
      .tiff({ compression: 'none' })
      .toFile(path);

    const window = await readGeoTiffRgbWindow(path, 1, 1, 2, 2);

    // (1,1): R=11, G=51, B=102; (2,2): R=12, G=52, B=104 — distinct per axis,
    // so a transposed or off-by-one window shows up immediately.
    expect([...window.slice(0, 4)]).toEqual([11, 51, 102, 255]);
    expect([...window.slice(12, 16)]).toEqual([12, 52, 104, 255]);
  });

  it('replicates an 8-bit grey TIFF to opaque RGB', async () => {
    const path = join(dir, 'grey8.tif');
    writeGreyTiff(path, 3, 1, [7, 90, 200], 8);

    const window = await readGeoTiffRgbWindow(path, 1, 0, 2, 1);

    expect([...window]).toEqual([90, 90, 90, 255, 200, 200, 200, 255]);
  });
});

describe('geoTiffImagerySource', () => {
  it('stretches UInt16 grey to opaque RGB and leaves no-data transparent', async () => {
    const width = 2;
    const height = 1;
    const path = join(dir, 'grey.tif');
    // 0 is the declared no-data value; 30000 sits at the stretch's high end.
    writeGreyTiff(path, width, height, [0, 30000], 16);

    const source = geoTiffImagerySource({
      id: 'grey-test',
      attribution: 'test',
      provenance: { sourceId: 'grey-test', attribution: 'test', vintage: '2026' },
      grid: {
        path,
        width,
        height,
        bounds: { west: -1, east: 1, north: 1, south: -1 },
      },
      maxLevel: 10,
      greyStretch: [10000, 30000],
    });

    const rgba = await source.readBox({ west: -1, east: 1, north: 1, south: -1 }, 2, 1);
    expect(rgba).not.toBeNull();

    // Pixel 0 (no-data): transparent, whatever RGB it carries.
    expect(rgba![3]).toBe(0);
    // Pixel 1 (30000, the stretch's own high end): opaque white.
    expect([...rgba!.slice(4, 8)]).toEqual([255, 255, 255, 255]);
  });

  it('upsamples a box smaller than one source pixel bilinearly, registered to pixel centres', async () => {
    // Snapping the box to whole source pixels made every deep underfill tile
    // one flat block (or no tile at all), blocky once averaged up the pyramid.
    const path = join(dir, 'ramp.tif');
    // Blue 50 throughout: an all-black pixel reads as the no-data sentinel.
    const pixels = new Uint8Array([0, 0, 50, 200, 0, 50, 0, 100, 50, 200, 100, 50]);
    await sharp(pixels, { raw: { width: 2, height: 2, channels: 3 } })
      .tiff({ compression: 'none' })
      .toFile(path);
    const source = geoTiffImagerySource({
      id: 'ramp-test',
      attribution: 'test',
      provenance: { sourceId: 'ramp-test', attribution: 'test', vintage: '2026' },
      grid: { path, width: 2, height: 2, bounds: { west: -1, east: 1, north: 1, south: -1 } },
      maxLevel: 10,
    });

    const rgba = await source.readBox({ west: -0.25, east: 0.25, north: 0.25, south: -0.25 }, 4, 4);

    // Pixel centres at ±0.5: red is 100 + 200·lon, green 50 − 100·lat.
    for (let py = 0; py < 4; py++) {
      const lat = 0.25 - (py + 0.5) / 8;
      for (let px = 0; px < 4; px++) {
        const lon = -0.25 + (px + 0.5) / 8;
        const i = (py * 4 + px) * 4;
        expect(Math.abs(rgba![i]! - (100 + 200 * lon)), `red (${px}, ${py})`).toBeLessThanOrEqual(
          1,
        );
        expect(
          Math.abs(rgba![i + 1]! - (50 - 100 * lat)),
          `green (${px}, ${py})`,
        ).toBeLessThanOrEqual(1);
        expect(rgba![i + 3]).toBe(255);
      }
    }
  });

  it('throws on a box only partly inside its raster bounds rather than stretching it', async () => {
    const width = 2;
    const height = 2;
    const path = join(dir, 'partial.tif');
    const pixels = new Uint8Array(width * height * 3).fill(100);
    await sharp(pixels, { raw: { width, height, channels: 3 } })
      .tiff({ compression: 'none' })
      .toFile(path);

    const source = geoTiffImagerySource({
      id: 'partial-test',
      attribution: 'test',
      provenance: { sourceId: 'partial-test', attribution: 'test', vintage: '2026' },
      grid: { path, width, height, bounds: { west: -1, east: 1, north: 1, south: -1 } },
      maxLevel: 10,
    });

    // Straddles the raster's east edge (bounds.east = 1) by sharing area with
    // it, rather than sitting fully inside — the case that used to clamp the
    // window and stretch it to fill the box.
    await expect(source.readBox({ west: 0, east: 2, north: 1, south: -1 }, 2, 2)).rejects.toThrow(
      /partly overlaps/,
    );
  });
});
