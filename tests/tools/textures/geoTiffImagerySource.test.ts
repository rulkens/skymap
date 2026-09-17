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

  it('applies an optional mask, leaving a masked-out pixel transparent even when its RGB is non-zero', async () => {
    const width = 2;
    const height = 1;
    const orthoPath = join(dir, 'masked-ortho.tif');
    await sharp(new Uint8Array([200, 200, 200, 50, 50, 50]), {
      raw: { width, height, channels: 3 },
    })
      .tiff({ compression: 'none' })
      .toFile(orthoPath);
    const maskPath = join(dir, 'masked-ortho-mask.tif');
    writeGreyTiff(maskPath, width, height, [0, 255], 8);

    const source = geoTiffImagerySource({
      id: 'masked-test',
      attribution: 'test',
      provenance: { sourceId: 'masked-test', attribution: 'test', vintage: '2026' },
      grid: { path: orthoPath, width, height, bounds: { west: -1, east: 1, north: 1, south: -1 } },
      maxLevel: 10,
      maskPath,
    });

    const rgba = await source.readBox({ west: -1, east: 1, north: 1, south: -1 }, width, height);
    expect(rgba).not.toBeNull();

    // Pixel 0: mask=0 yet RGB is non-zero — the black-sentinel heuristic
    // alone (no mask) would have left this opaque.
    expect([...rgba!.slice(0, 4)]).toEqual([200, 200, 200, 0]);
    // Pixel 1: mask=255, unaffected.
    expect([...rgba!.slice(4, 8)]).toEqual([50, 50, 50, 255]);
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
