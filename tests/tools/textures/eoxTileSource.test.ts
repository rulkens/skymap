import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import sharp from 'sharp';

import { eoxTileSource } from '../../../tools/textures/eoxTileSource';
import type { LonLatBounds } from '../../../src/@types/scene/LonLatBounds';

const EOX_MAX_LEVEL = 13;
const EOX_TILE_PX = 256;
const EOX_TILE_DEG = 180 / 2 ** EOX_MAX_LEVEL; // 0.02197265625

/** Fresh temp coverage dir per test — vitest cleans the OS tmp dir itself. */
function tmpCoverageDir(): string {
  return mkdtempSync(join(tmpdir(), 'eox-tile-source-'));
}

/** Bounds of the single EOX tile at `(row, col)`, z13 — the exact inverse of
 *  the production `eoxTileAt`, written independently against the raw WGS84
 *  TMS formula rather than by calling into the module under test. */
function eoxTileBounds(row: number, col: number): LonLatBounds {
  return {
    west: col * EOX_TILE_DEG - 180,
    east: (col + 1) * EOX_TILE_DEG - 180,
    north: 90 - row * EOX_TILE_DEG,
    south: 90 - (row + 1) * EOX_TILE_DEG,
  };
}

/** The 2x2-tile box a skymap z13 bake tile spans, given its NW child's index. */
function boxForBlock(rowNW: number, colNW: number): LonLatBounds {
  const nw = eoxTileBounds(rowNW, colNW);
  const se = eoxTileBounds(rowNW + 1, colNW + 1);
  return { west: nw.west, north: nw.north, east: se.east, south: se.south };
}

async function writeEoxTile(
  coverageDir: string,
  row: number,
  col: number,
  rgb: readonly [number, number, number],
): Promise<void> {
  const path = join(coverageDir, String(EOX_MAX_LEVEL), String(row), `${col}.jpg`);
  mkdirSync(dirname(path), { recursive: true });
  await sharp({
    create: {
      width: EOX_TILE_PX,
      height: EOX_TILE_PX,
      channels: 3,
      background: { r: rgb[0], g: rgb[1], b: rgb[2] },
    },
  })
    .jpeg({ quality: 100 })
    .toFile(path);
}

function pixelAt(
  data: Buffer | Uint8Array,
  width: number,
  x: number,
  y: number,
): readonly [number, number, number, number] {
  const i = (y * width + x) * 4;
  return [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!];
}

// JPEG re-encoding a flat colour still perturbs it a little at block edges;
// centre-sampling each quadrant plus this tolerance absorbs that without
// letting a wrong-quadrant (a whole different colour) pass.
const CHANNEL_TOLERANCE = 8;

function expectPixelNear(
  actual: readonly [number, number, number, number],
  expected: readonly [number, number, number, number],
): void {
  for (let c = 0; c < 4; c++) {
    expect(Math.abs(actual[c]! - expected[c]!)).toBeLessThanOrEqual(CHANNEL_TOLERANCE);
  }
}

describe('eoxTileSource', () => {
  const RED = [255, 0, 0] as const;
  const GREEN = [0, 255, 0] as const;
  const BLUE = [0, 0, 255] as const;
  const WHITE = [255, 255, 255] as const;

  it('composites each quadrant from its own EOX child tile', async () => {
    const coverageDir = tmpCoverageDir();
    const rowNW = 100;
    const colNW = 200;
    await writeEoxTile(coverageDir, rowNW, colNW, RED); // NW
    await writeEoxTile(coverageDir, rowNW, colNW + 1, GREEN); // NE
    await writeEoxTile(coverageDir, rowNW + 1, colNW, BLUE); // SW
    await writeEoxTile(coverageDir, rowNW + 1, colNW + 1, WHITE); // SE

    const source = await eoxTileSource({ coverageDir });
    const box = boxForBlock(rowNW, colNW);
    const rgba = await source.readBox(box, 512, 512);
    expect(rgba).not.toBeNull();

    const nw = pixelAt(rgba!, 512, 128, 128);
    const ne = pixelAt(rgba!, 512, 384, 128);
    const sw = pixelAt(rgba!, 512, 128, 384);
    const se = pixelAt(rgba!, 512, 384, 384);

    expectPixelNear(nw, [...RED, 255]);
    expectPixelNear(ne, [...GREEN, 255]);
    expectPixelNear(sw, [...BLUE, 255]);
    expectPixelNear(se, [...WHITE, 255]);
  });

  it('returns null for a box outside the harvested tiles', async () => {
    const coverageDir = tmpCoverageDir();
    await writeEoxTile(coverageDir, 100, 200, RED);
    await writeEoxTile(coverageDir, 100, 201, GREEN);
    await writeEoxTile(coverageDir, 101, 200, BLUE);
    await writeEoxTile(coverageDir, 101, 201, WHITE);

    const source = await eoxTileSource({ coverageDir });
    // Nowhere near row 100/col 200 — none of this box's four children exist.
    const box = boxForBlock(5000, 9000);
    const rgba = await source.readBox(box, 512, 512);

    expect(rgba).toBeNull();
  });

  it('derives coverage from the harvested row/col rectangle on disk', async () => {
    const coverageDir = tmpCoverageDir();
    const rowMin = 1556;
    const rowMax = 1558;
    const colMin = 8756;
    const colMax = 8759;
    for (let row = rowMin; row <= rowMax; row++) {
      for (let col = colMin; col <= colMax; col++) {
        await writeEoxTile(coverageDir, row, col, RED);
      }
    }

    const source = await eoxTileSource({ coverageDir });

    // Hand-computed from the WGS84 z13 grid formula (tileDeg = 180/8192),
    // independent of the production `boundsForRowColRect` this exercises.
    const expected: LonLatBounds = {
      west: colMin * EOX_TILE_DEG - 180,
      east: (colMax + 1) * EOX_TILE_DEG - 180,
      north: 90 - rowMin * EOX_TILE_DEG,
      south: 90 - (rowMax + 1) * EOX_TILE_DEG,
    };

    expect(source.coverage).toHaveLength(1);
    expect(source.coverage[0]!.west).toBeCloseTo(expected.west, 9);
    expect(source.coverage[0]!.east).toBeCloseTo(expected.east, 9);
    expect(source.coverage[0]!.north).toBeCloseTo(expected.north, 9);
    expect(source.coverage[0]!.south).toBeCloseTo(expected.south, 9);
  });
});
