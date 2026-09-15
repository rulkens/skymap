import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { dhmTerraenHeightSource } from '../../../tools/textures/dhmTerraenHeightSource';

/**
 * Minimal uncompressed single-band float32 TIFF, hand-written rather than
 * produced by sharp: sharp's TIFF encoder only reaches 32-bit float samples
 * through its `predictor: 'float'` path, which forces a 3-band scRGB image
 * and silently zeroes a single-band source — no combination of its options
 * round-trips a plain grayscale DEM tile. A bare TIFF (8-byte header, one
 * strip, ten IFD tags) is well inside libtiff's tolerance and sharp reads it
 * identically to a real DHM/ETOPO GeoTIFF.
 */
function writeFloatTiff(path: string, width: number, height: number, fillValue: number): void {
  const pixels = new Float32Array(width * height).fill(fillValue);
  const pixelBytes = Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  const headerSize = 8;
  const ifdOffset = headerSize + pixelBytes.byteLength;
  const entries: ReadonlyArray<readonly [number, number, number, number]> = [
    [256, 3, 1, width], // ImageWidth (SHORT)
    [257, 3, 1, height], // ImageLength (SHORT)
    [258, 3, 1, 32], // BitsPerSample
    [259, 3, 1, 1], // Compression: none
    [262, 3, 1, 1], // PhotometricInterpretation: BlackIsZero
    [273, 4, 1, headerSize], // StripOffsets (LONG)
    [277, 3, 1, 1], // SamplesPerPixel
    [278, 4, 1, height], // RowsPerStrip: one strip
    [279, 4, 1, pixelBytes.byteLength], // StripByteCounts
    [339, 3, 1, 3], // SampleFormat: IEEE float
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

const TILE_PX = 2500; // TILE_M / PIXEL_M inside the module under test

let dir = '';

// One lon (fixed) and a run of six consecutive z19 lattice rows, found by
// walking `lonLatToUtm32` south from an arbitrary Zealand point until its UTM
// northing crossed a 1 km tile boundary: rows 0-1 land wholly inside the
// northern tile (northKm 6177), rows 3-5 wholly inside the tile south of it
// (northKm 6176), and row 2 straddles both — its own pixel row in 6177, the
// next one down (its bilinear partner) already in 6176.
const Z = 19;
const I0 = 35810035;
const J0 = 6394059;
const EAST_KM = 694;
const NORTH_TILE_KM = 6177;
const SOUTH_TILE_KM = 6176;
const NORTH_VALUE = 10.5;
const SOUTH_VALUE = -20.25;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'dhm-terraen-'));
  mkdirSync(dir, { recursive: true });
  writeFloatTiff(
    join(dir, `DTM_1km_${NORTH_TILE_KM}_${EAST_KM}.tif`),
    TILE_PX,
    TILE_PX,
    NORTH_VALUE,
  );
  writeFloatTiff(
    join(dir, `DTM_1km_${SOUTH_TILE_KM}_${EAST_KM}.tif`),
    TILE_PX,
    TILE_PX,
    SOUTH_VALUE,
  );
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('dhmTerraenHeightSource', () => {
  const source = () =>
    dhmTerraenHeightSource({
      dir,
      coverage: [{ west: 11, east: 13, south: 55, north: 56 }],
    });

  it('reads a post wholly inside the northern tile straight from its own value', async () => {
    const grid = await source().readGrid(Z, I0, J0, 1, 1);
    expect(grid![0]).toBeCloseTo(NORTH_VALUE, 5);
  });

  it('reads a post wholly inside the southern tile once past the boundary', async () => {
    const grid = await source().readGrid(Z, I0, J0 + 3, 1, 1);
    expect(grid![0]).toBeCloseTo(SOUTH_VALUE, 5);
  });

  it('blends both tiles for the post whose bilinear straddles the boundary', async () => {
    const grid = await source().readGrid(Z, I0, J0 + 2, 1, 1);
    const value = grid![0]!;
    // Neither tile alone (the `NORTHING_REF_M / TILE_M - 1 - ty` derivation
    // picked a DIFFERENT file for this post's two bilinear corners), and
    // bounded by the two tiles' own values (a convex combination of them).
    expect(value).not.toBeCloseTo(NORTH_VALUE, 5);
    expect(value).not.toBeCloseTo(SOUTH_VALUE, 5);
    expect(value).toBeLessThan(NORTH_VALUE);
    expect(value).toBeGreaterThan(SOUTH_VALUE);
  });
});
