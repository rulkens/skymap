/**
 * orthoVrtXml — the geotransform sign and the tile-existence gate are both
 * invisible failures: a flipped y step still parses as a valid VRT and
 * colorizes points with a plausible-looking, upside-down orthophoto, and a
 * fabricated SimpleSource for a missing tile paints black over ground PDAL
 * never actually saw.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, afterEach } from 'vitest';

import { orthoVrtXml } from '../../../../tools/scene-recon/ortho/orthoVrtXml';
import type { TileIndexRect } from '../../../../tools/utils/scene/TileIndexRect';

/** Pulls the six comma-separated GeoTransform numbers out of the XML. */
function geoTransform(xml: string): number[] {
  const match = xml.match(/<GeoTransform>([^<]+)<\/GeoTransform>/);
  expect(match, 'GeoTransform element').toBeTruthy();
  return match![1]!.split(',').map(Number);
}

describe('orthoVrtXml', () => {
  it('places the mosaic origin and pixel size from the tile rect', () => {
    // level 19, tilePx 512: earthTileColumns(19, 512) = (512 << 19) / 512 =
    // 2**19 columns, so deg = 360 / 524288 — hand-computed below rather than
    // imported, so the test still catches earthTileColumns drifting.
    const deg = 360 / 524288;
    const rect: TileIndexRect = { xMin: 100, xMax: 101, yMin: 200, yMax: 201 };
    const xml = orthoVrtXml({ levelDir: '/nonexistent', rect, level: 19, tilePx: 512 });

    expect(xml).toContain('rasterXSize="1024"');
    expect(xml).toContain('rasterYSize="1024"');

    const [originX, pixelSizeX, rotX, originY, rotY, pixelSizeY] = geoTransform(xml);
    expect(originX).toBeCloseTo(100 * deg - 180, 12);
    expect(pixelSizeX).toBeCloseTo(deg / 512, 15);
    expect(rotX).toBe(0);
    expect(originY).toBeCloseTo(90 - 200 * deg, 12);
    expect(rotY).toBe(0);
    // North-up: the y pixel size is negative, so DstRect row 0 (north) maps
    // to decreasing latitude as GDAL walks the raster top to bottom.
    expect(pixelSizeY).toBeCloseTo(-deg / 512, 15);
  });

  describe('with a partial tile set on disk', () => {
    let dir: string;

    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it('emits one SimpleSource per band per existing tile, at its DstRect, skipping the missing one', () => {
      dir = mkdtempSync(join(tmpdir(), 'ortho-vrt-'));
      // 2x2 rect x[10,11] y[20,21]; (11, 21) is left off disk.
      const present: [number, number][] = [
        [10, 20],
        [10, 21],
        [11, 20],
      ];
      for (const [x, y] of present) {
        mkdirSync(join(dir, String(x)), { recursive: true });
        writeFileSync(join(dir, String(x), `${y}.jpg`), 'fake-jpeg-bytes');
      }

      const rect: TileIndexRect = { xMin: 10, xMax: 11, yMin: 20, yMax: 21 };
      const xml = orthoVrtXml({ levelDir: dir, rect, level: 19, tilePx: 512 });

      // 3 present tiles x 3 bands (Red/Green/Blue) each contribute one source.
      expect(xml.match(/<SimpleSource>/g)).toHaveLength(9);
      expect(xml).not.toContain(join(dir, '11', '21.jpg'));

      // Tile (11, 20) sits one column right, zero rows down from the rect
      // origin (10, 20): DstRect xOff = (11-10)*512 = 512, yOff = 0.
      const tilePath = join(dir, '11', '20.jpg');
      const sourceStart = xml.indexOf(tilePath);
      expect(sourceStart, 'tile (11,20) SimpleSource present').toBeGreaterThan(-1);
      const sourceBlock = xml.slice(sourceStart, xml.indexOf('</SimpleSource>', sourceStart));
      expect(sourceBlock).toContain('xOff="512"');
      expect(sourceBlock).toContain('yOff="0"');
    });
  });
});
