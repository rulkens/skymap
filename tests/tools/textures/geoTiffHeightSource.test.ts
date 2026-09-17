/**
 * Pixel registration and no-data handling — the two ways a windowed GeoTIFF
 * height reader silently fabricates elevation: a half-pixel offset (reads a
 * post's neighbour instead of the post) and treating a sentinel or an
 * off-the-edge extension as a real sample.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { geoTiffHeightSource } from '../../../tools/textures/geoTiffHeightSource';
import { heightLatticeStepDeg } from '../../../tools/utils/textures/heightLatticeStepDeg';
import { readGeoTiffWindow } from '../../../tools/utils/textures/readGeoTiffWindow';

/**
 * A bare single-band float32 TIFF (8-byte header, one strip, ten IFD tags).
 * `sharp`'s TIFF encoder only reaches 32-bit float samples through its
 * `predictor: 'float'` path, which forces a 3-band scRGB image and silently
 * zeroes a single-band source (confirmed against `dhmTerraenHeightSource`'s
 * DTM tiles) — this is well inside libtiff's tolerance and reads identically.
 */
function writeFloatTiff(
  path: string,
  width: number,
  height: number,
  values: ArrayLike<number>,
  format: 'float32' | 'int16' = 'float32',
): void {
  const pixels = format === 'int16' ? Int16Array.from(values) : Float32Array.from(values);
  const pixelBytes = Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  const headerSize = 8;
  const ifdOffset = headerSize + pixelBytes.byteLength;
  const entries: ReadonlyArray<readonly [number, number, number, number]> = [
    [256, 3, 1, width], // ImageWidth (SHORT)
    [257, 3, 1, height], // ImageLength (SHORT)
    [258, 3, 1, format === 'int16' ? 16 : 32], // BitsPerSample
    [259, 3, 1, 1], // Compression: none
    [262, 3, 1, 1], // PhotometricInterpretation: BlackIsZero
    [273, 4, 1, headerSize], // StripOffsets (LONG)
    [277, 3, 1, 1], // SamplesPerPixel
    [278, 4, 1, height], // RowsPerStrip: one strip
    [279, 4, 1, pixelBytes.byteLength], // StripByteCounts
    [339, 3, 1, format === 'int16' ? 2 : 3], // SampleFormat: signed int / IEEE float
  ];
  const buf = Buffer.alloc(ifdOffset + 2 + entries.length * 12 + 4);
  buf.write('II', 0, 'ascii');
  buf.writeUInt16LE(42, 2);
  buf.writeUInt32LE(ifdOffset, 4);
  pixelBytes.copy(buf, headerSize);

  let p = ifdOffset;
  buf.writeUInt16LE(entries.length, p);
  p += 2;
  for (const [tag, type, count, value] of entries) {
    buf.writeUInt16LE(tag, p);
    buf.writeUInt16LE(type, p + 2);
    buf.writeUInt32LE(count, p + 4);
    buf.writeUInt32LE(value, p + 8);
    p += 12;
  }
  buf.writeUInt32LE(0, p);

  writeFileSync(path, buf);
}

// Global lattice level 7's post spacing is an exact dyadic fraction
// (360 / 2^14), so choosing the grid's own pixel size to equal it makes
// every lattice column/row land on an EXACT integer grid index — no
// floating-point noise near the .5 boundary the registration test depends on.
const Z = 7;
const STEP = heightLatticeStepDeg(Z);
// i=8192, j=4096 sit exactly on lon=0, lat=0 (8192/16384 = 0.5 exactly).
const I0 = 8192;
const J0 = 4096;
const OFFSET_M = 1000;
const NODATA = -32767;

// 4x2 grid, one lattice step per pixel, straddling lon=0/lat=0 so (I0, J0)
// lands on column 1's centre and row 0's (north row's) centre exactly.
const WEST = -1.5 * STEP;
const NORTH = 0.5 * STEP;
const ROW0 = [100, 200, NODATA, 400];
const ROW1 = [500, 600, 700, -3.4e38];

let dir = '';
let path = '';

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'geotiff-height-'));
  path = join(dir, 'grid.tif');
  writeFloatTiff(path, 4, 2, [...ROW0, ...ROW1]);
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function source(): ReturnType<typeof geoTiffHeightSource> {
  return geoTiffHeightSource({
    id: 'test-grid',
    attribution: 'test',
    provenance: { sourceId: 'test-grid', attribution: 'test', vintage: '2026' },
    grid: {
      path,
      width: 4,
      height: 2,
      bounds: { west: WEST, east: WEST + 4 * STEP, north: NORTH, south: NORTH - 2 * STEP },
    },
    nodata: NODATA,
    offsetM: OFFSET_M,
    maxLevel: Z,
  });
}

describe('geoTiffHeightSource', () => {
  it('samples a pixel centre exactly, with the offset added', async () => {
    const grid = await source().readGrid(Z, I0, J0, 1, 1);
    expect(grid).not.toBeNull();
    // Row 0, column 1 is 200; a half-pixel registration bug would instead
    // return column 0 (100) or column 2 (the no-data sentinel).
    expect(grid![0]).toBe(200 + OFFSET_M);
  });

  it('returns NaN at no-data and outside bounds', async () => {
    // Four consecutive posts from (I0, J0): columns 1, 2, 3, 4 — the last is
    // one past the grid's own width, needing a pixel the raster doesn't have.
    const row = await source().readGrid(Z, I0, J0, 4, 1);
    expect(row).not.toBeNull();
    expect([...row!]).toEqual([200 + OFFSET_M, Number.NaN, 400 + OFFSET_M, Number.NaN]);

    // Row 1, column 3 carries float32's -3.4e38 sentinel rather than the
    // exact declared no-data value.
    const huge = await source().readGrid(Z, I0 + 2, J0 + 1, 1, 1);
    expect(huge![0]).toBeNaN();
  });

  it('reads the pole rows of a pole-to-pole grid instead of leaving them void', async () => {
    const globePath = join(dir, 'globe.tif');
    writeFloatTiff(globePath, 4, 2, [1, 2, 3, 4, 5, 6, 7, 8]);
    const globe = geoTiffHeightSource({
      id: 'test-globe',
      attribution: 'test',
      provenance: { sourceId: 'test-globe', attribution: 'test', vintage: '2026' },
      grid: {
        path: globePath,
        width: 4,
        height: 2,
        bounds: { west: -180, east: 180, north: 90, south: -90 },
      },
      nodata: NODATA,
      offsetM: 0,
      maxLevel: 0,
    });
    // Level 0 rows 0 and 64 are the north and south poles.
    const north = await globe.readGrid(0, 0, 0, 129, 1);
    const south = await globe.readGrid(0, 0, 64, 129, 1);
    expect(north!.every(Number.isFinite)).toBe(true);
    expect(south!.every(Number.isFinite)).toBe(true);
  });

  it('refuses an Int16 DEM rather than returning clamped or rescaled metres', async () => {
    const shortPath = join(dir, 'short.tif');
    writeFloatTiff(shortPath, 2, 1, [-4500, 20000], 'int16');
    await expect(readGeoTiffWindow(shortPath, 0, 0, 2, 1)).rejects.toThrow(/depth 'short'/);
  });
});
