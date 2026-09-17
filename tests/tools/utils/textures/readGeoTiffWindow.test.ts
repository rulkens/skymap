/**
 * readGeoTiffWindow refuses a byte-depth or Int16 DEM rather than silently
 * rescaling or clamping it into fabricated metres.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readGeoTiffWindow } from '../../../../tools/utils/textures/readGeoTiffWindow';
import { writeFloatTiff } from '../../../fixtures/textures/geoTiffWriters';

let dir = '';

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'read-geotiff-window-'));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('readGeoTiffWindow', () => {
  it('refuses an Int16 DEM rather than returning clamped or rescaled metres', async () => {
    const shortPath = join(dir, 'short.tif');
    writeFloatTiff(shortPath, 2, 1, [-4500, 20000], 'int16');
    await expect(readGeoTiffWindow(shortPath, 0, 0, 2, 1)).rejects.toThrow(/depth 'short'/);
  });
});
