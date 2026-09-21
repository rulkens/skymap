/**
 * `readGeoTiffRgbWindow`'s window offset and channel order,
 * `geoTiffImagerySource`'s UInt16-grey stretch, its COG-overview pick on a
 * wide box, and the pixel-limit opt-out on its raw-buffer resize — the ways
 * a colour GeoTIFF reader silently produces a wrong, opaque-when-it-
 * shouldn't-be, needlessly-native-resolution, or crashing raster.
 */

import { describe, expect, it, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharpDefault from 'sharp';

import { geoTiffImagerySource } from '../../../tools/textures/geoTiffImagerySource';
import { readGeoTiffRgbWindow } from '../../../tools/utils/textures/readGeoTiffRgbWindow';
import { writeGreyTiff } from '../../fixtures/textures/geoTiffWriters';

vi.mock('sharp', async (importOriginal) => {
  const actual = await importOriginal<typeof import('sharp')>();
  return { ...actual, default: vi.fn(actual.default) };
});

vi.mock('../../../tools/utils/textures/readGeoTiffRgbWindow', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../tools/utils/textures/readGeoTiffRgbWindow')>();
  return { ...actual, readGeoTiffRgbWindow: vi.fn(actual.readGeoTiffRgbWindow) };
});

const sharp = vi.mocked(sharpDefault);
const mockedReadGeoTiffRgbWindow = vi.mocked(readGeoTiffRgbWindow);

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

describe('geoTiffImagerySource reads a downsampled box from a COG overview', () => {
  beforeEach(() => {
    mockedReadGeoTiffRgbWindow.mockClear();
  });

  it('picks the coarsest overview whose own resolution still covers a heavily-shrunk box, instead of always decoding native', async () => {
    // A `pyramid: true` TIFF chains each half-resolution copy as its own
    // IFD — the same on-disk shape a GDAL COG's overviews use — so this
    // stands in for one without checking in a real multi-gigabyte raster.
    const width = 64;
    const height = 32;
    const pixels = Buffer.alloc(width * height * 3, 90);
    const path = join(dir, 'pyramid-wide.tif');
    await sharp(pixels, { raw: { width, height, channels: 3 } })
      .tiff({ compression: 'none', pyramid: true, tile: true, tileWidth: 16, tileHeight: 16 })
      .toFile(path);

    const source = geoTiffImagerySource({
      id: 'pyramid-wide-test',
      attribution: 'test',
      provenance: { sourceId: 'pyramid-wide-test', attribution: 'test', vintage: '2026' },
      grid: { path, width, height, bounds: { west: -1, east: 1, north: 1, south: -1 } },
      maxLevel: 10,
    });

    // A whole-raster box asking for a 4x4 preview: level 2 (16x8) is the
    // coarsest of {64x32, 32x16, 16x8} that still covers 4x4.
    const rgba = await source.readBox({ west: -1, east: 1, north: 1, south: -1 }, 4, 4);

    expect(rgba).not.toBeNull();
    expect(rgba!.byteLength).toBe(4 * 4 * 4);
    expect(mockedReadGeoTiffRgbWindow).toHaveBeenCalledTimes(1);
    const [, left, top, winWidth, winHeight, page] = mockedReadGeoTiffRgbWindow.mock.calls[0]!;
    expect(page).toBe(2);
    expect({ left, top, winWidth, winHeight }).toEqual({
      left: 0,
      top: 0,
      winWidth: 16,
      winHeight: 8,
    });
  });

  it('reads the native level when the box asks for close to full resolution', async () => {
    const width = 64;
    const height = 32;
    const pixels = Buffer.alloc(width * height * 3, 90);
    const path = join(dir, 'pyramid-native.tif');
    await sharp(pixels, { raw: { width, height, channels: 3 } })
      .tiff({ compression: 'none', pyramid: true, tile: true, tileWidth: 16, tileHeight: 16 })
      .toFile(path);

    const source = geoTiffImagerySource({
      id: 'pyramid-native-test',
      attribution: 'test',
      provenance: { sourceId: 'pyramid-native-test', attribution: 'test', vintage: '2026' },
      grid: { path, width, height, bounds: { west: -1, east: 1, north: 1, south: -1 } },
      maxLevel: 10,
    });

    // Full raster at its own resolution: no overview (32x16, 16x8) can
    // cover 64x32, so this must fall back to page 0.
    const rgba = await source.readBox({ west: -1, east: 1, north: 1, south: -1 }, width, height);

    expect(rgba).not.toBeNull();
    const [, , , , , page] = mockedReadGeoTiffRgbWindow.mock.calls[0]!;
    expect(page).toBe(0);
  });
});

describe("geoTiffImagerySource opts out of sharp's pixel limit on its raw-buffer resize", () => {
  it('passes limitInputPixels: false to the composite resize, not just the file decode', async () => {
    const width = 3;
    const height = 2;
    const path = join(dir, 'limit-opt-out.tif');
    const pixels = new Uint8Array(width * height * 3).fill(60);
    await sharp(pixels, { raw: { width, height, channels: 3 } })
      .tiff({ compression: 'none' })
      .toFile(path);

    const source = geoTiffImagerySource({
      id: 'limit-opt-out-test',
      attribution: 'test',
      provenance: { sourceId: 'limit-opt-out-test', attribution: 'test', vintage: '2026' },
      grid: { path, width, height, bounds: { west: -1, east: 1, north: 1, south: -1 } },
      maxLevel: 10,
    });

    sharp.mockClear();
    const rgba = await source.readBox({ west: -1, east: 1, north: 1, south: -1 }, 2, 1);
    expect(rgba).not.toBeNull();

    // The file-path decode (a string first argument) already carries the
    // flag; this isolates the SEPARATE raw-buffer construction that used to
    // omit it and threw "Input image exceeds pixel limit" on a wide box.
    const rawBufferCalls = sharp.mock.calls.filter(([input]) => input instanceof Uint8Array);
    expect(rawBufferCalls).toHaveLength(1);
    expect(rawBufferCalls[0]![1]).toMatchObject({ limitInputPixels: false });
  });
});
