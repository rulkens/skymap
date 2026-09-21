/**
 * `sharp`'s own pyramidal-TIFF writer (`pyramid: true`) chains each
 * reduced-resolution image as its own IFD — the same on-disk shape GDAL's
 * COG driver uses for overviews — so it doubles as a tiny stand-in for a
 * real COG's pyramid without checking in one.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';

import { geoTiffOverviewLevels } from '../../../../tools/utils/textures/geoTiffOverviewLevels';

let dir = '';

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'geotiff-overview-levels-'));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('geoTiffOverviewLevels', () => {
  it("lists a pyramidal TIFF's pages finest-first, matching each page's own dimensions", async () => {
    const width = 64;
    const height = 32;
    const pixels = Buffer.alloc(width * height * 3, 128);
    const path = join(dir, 'pyramid.tif');
    await sharp(pixels, { raw: { width, height, channels: 3 } })
      .tiff({ compression: 'none', pyramid: true, tile: true, tileWidth: 16, tileHeight: 16 })
      .toFile(path);

    const levels = await geoTiffOverviewLevels(path);

    expect(levels).toEqual([
      { width: 64, height: 32 },
      { width: 32, height: 16 },
      { width: 16, height: 8 },
    ]);
  });

  it('reports a single level for a file with no overviews', async () => {
    const width = 3;
    const height = 2;
    const pixels = Buffer.alloc(width * height * 3, 200);
    const path = join(dir, 'flat.tif');
    await sharp(pixels, { raw: { width, height, channels: 3 } })
      .tiff({ compression: 'none' })
      .toFile(path);

    expect(await geoTiffOverviewLevels(path)).toEqual([{ width: 3, height: 2 }]);
  });
});
