/**
 * `readGeoTiffRgbWindow`'s window offset and channel order, and
 * `geoTiffImagerySource`'s UInt16-grey stretch — the two ways a colour
 * GeoTIFF reader silently produces a wrong or opaque-when-it-shouldn't-be
 * raster.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';

import { geoTiffImagerySource } from '../../../tools/textures/geoTiffImagerySource';
import { readGeoTiffRgbWindow } from '../../../tools/utils/textures/readGeoTiffRgbWindow';

/**
 * A bare single-band UInt16 TIFF (8-byte header, one strip, ten IFD tags) —
 * `sharp`'s own TIFF encoder converts a single-band raw input into an 8-bit
 * sRGB triple regardless of `depth`, the same silent-corruption failure mode
 * `dhmTerraenHeightSource`'s tests hit for single-band float32.
 */
function writeUInt16GreyTiff(
  path: string,
  width: number,
  height: number,
  values: ArrayLike<number>,
): void {
  const pixels = Uint16Array.from(values);
  const pixelBytes = Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  const headerSize = 8;
  const ifdOffset = headerSize + pixelBytes.byteLength;
  const entries: ReadonlyArray<readonly [number, number, number, number]> = [
    [256, 3, 1, width], // ImageWidth (SHORT)
    [257, 3, 1, height], // ImageLength (SHORT)
    [258, 3, 1, 16], // BitsPerSample
    [259, 3, 1, 1], // Compression: none
    [262, 3, 1, 1], // PhotometricInterpretation: BlackIsZero
    [273, 4, 1, headerSize], // StripOffsets (LONG)
    [277, 3, 1, 1], // SamplesPerPixel
    [278, 4, 1, height], // RowsPerStrip: one strip
    [279, 4, 1, pixelBytes.byteLength], // StripByteCounts
    [339, 3, 1, 1], // SampleFormat: unsigned int
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
});

describe('geoTiffImagerySource', () => {
  it('stretches UInt16 grey to opaque RGB and leaves no-data transparent', async () => {
    const width = 2;
    const height = 1;
    const path = join(dir, 'grey.tif');
    // 0 is the declared no-data value; 30000 sits at the stretch's high end.
    writeUInt16GreyTiff(path, width, height, [0, 30000]);

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
});
