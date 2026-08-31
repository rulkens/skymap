import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

/** Bounds of an arbitrary `[rowMin, rowMax] x [colMin, colMax]` tile
 *  rectangle — independent of `boundsForRowColRect` in the module under
 *  test, for asserting per-region `coverage` boxes. */
function boundsForRect(
  rowMin: number,
  rowMax: number,
  colMin: number,
  colMax: number,
): LonLatBounds {
  const nw = eoxTileBounds(rowMin, colMin);
  const se = eoxTileBounds(rowMax, colMax);
  return { west: nw.west, north: nw.north, east: se.east, south: se.south };
}

async function writeEoxTile(
  coverageDir: string,
  region: string,
  row: number,
  col: number,
  rgb: readonly [number, number, number],
): Promise<void> {
  const path = join(coverageDir, region, String(EOX_MAX_LEVEL), String(row), `${col}.jpg`);
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
    await writeEoxTile(coverageDir, 'testregion', rowNW, colNW, RED); // NW
    await writeEoxTile(coverageDir, 'testregion', rowNW, colNW + 1, GREEN); // NE
    await writeEoxTile(coverageDir, 'testregion', rowNW + 1, colNW, BLUE); // SW
    await writeEoxTile(coverageDir, 'testregion', rowNW + 1, colNW + 1, WHITE); // SE

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

  it('returns null only when all four children of the block are missing', async () => {
    const coverageDir = tmpCoverageDir();
    await writeEoxTile(coverageDir, 'testregion', 100, 200, RED);
    await writeEoxTile(coverageDir, 'testregion', 100, 201, GREEN);
    await writeEoxTile(coverageDir, 'testregion', 101, 200, BLUE);
    await writeEoxTile(coverageDir, 'testregion', 101, 201, WHITE);

    const source = await eoxTileSource({ coverageDir });
    // Nowhere near row 100/col 200 — none of this box's four children exist.
    const box = boxForBlock(5000, 9000);
    const rgba = await source.readBox(box, 512, 512);

    expect(rgba).toBeNull();
  });

  it('composites the present quadrants and leaves a missing one transparent', async () => {
    const coverageDir = tmpCoverageDir();
    const rowNW = 300;
    const colNW = 400;
    // All four written so the harvest tree is CONTIGUOUS at construction time
    // (the coverage guard requires it); SE is then deleted so `readBox` — which
    // checks disk fresh, not a cached scan — sees the same 3-of-4 partial block
    // an interrupted-mid-fetch harvest would leave.
    await writeEoxTile(coverageDir, 'testregion', rowNW, colNW, RED); // NW
    await writeEoxTile(coverageDir, 'testregion', rowNW, colNW + 1, GREEN); // NE
    await writeEoxTile(coverageDir, 'testregion', rowNW + 1, colNW, BLUE); // SW
    await writeEoxTile(coverageDir, 'testregion', rowNW + 1, colNW + 1, WHITE); // SE

    const source = await eoxTileSource({ coverageDir });
    rmSync(
      join(coverageDir, 'testregion', String(EOX_MAX_LEVEL), String(rowNW + 1), `${colNW + 1}.jpg`),
    );

    const box = boxForBlock(rowNW, colNW);
    const rgba = await source.readBox(box, 512, 512);
    expect(rgba).not.toBeNull();

    const nw = pixelAt(rgba!, 512, 128, 128);
    const se = pixelAt(rgba!, 512, 384, 384);

    expectPixelNear(nw, [...RED, 255]);
    expect(se[3]).toBe(0); // missing SE quadrant: transparent, filled later by underfillImagerySource
  });

  it('throws at construction when a gap inside one region breaks contiguity', async () => {
    const coverageDir = tmpCoverageDir();
    // Two isolated single tiles in the SAME region subdir, far enough apart
    // that the naive bounding rect over both claims a huge span of ground
    // never actually harvested.
    await writeEoxTile(coverageDir, 'testregion', 100, 200, RED);
    await writeEoxTile(coverageDir, 'testregion', 5000, 9000, GREEN);

    await expect(eoxTileSource({ coverageDir })).rejects.toThrow(/incomplete|gap/);
  });

  it('derives coverage from the harvested row/col rectangle on disk', async () => {
    const coverageDir = tmpCoverageDir();
    const rowMin = 1556;
    const rowMax = 1558;
    const colMin = 8756;
    const colMax = 8759;
    for (let row = rowMin; row <= rowMax; row++) {
      for (let col = colMin; col <= colMax; col++) {
        await writeEoxTile(coverageDir, 'testregion', row, col, RED);
      }
    }

    const source = await eoxTileSource({ coverageDir });

    // Literal decimal expectations, NOT `colMin * EOX_TILE_DEG - 180` etc. —
    // that would be the same formula `boundsForRowColRect` runs, token for
    // token, and could never catch an off-by-one in it. At z13 the WGS84
    // grid step is 180/8192 = 360/16384 = 0.02197265625 deg/tile, an exact
    // binary fraction, so these are exact too (`toBe`, not `toBeCloseTo`):
    //   west  = 8756 * 0.02197265625 - 180        = 12.392578125
    //   east  = (8759 + 1) * 0.02197265625 - 180   = 12.48046875
    //   north = 90 - 1556 * 0.02197265625          = 55.810546875
    //   south = 90 - (1558 + 1) * 0.02197265625    = 55.74462890625
    expect(source.coverage).toHaveLength(1);
    expect(source.coverage[0]!.west).toBe(12.392578125);
    expect(source.coverage[0]!.east).toBe(12.48046875);
    expect(source.coverage[0]!.north).toBe(55.810546875);
    expect(source.coverage[0]!.south).toBe(55.74462890625);
  });

  it('gives two disjoint regions their own coverage box each, sorted by region name', async () => {
    const coverageDir = tmpCoverageDir();
    // Written region "zulu" before "alpha", so a passing sort assertion can't
    // be an accident of directory-read or insertion order.
    await writeEoxTile(coverageDir, 'zulu', 100, 200, RED);
    await writeEoxTile(coverageDir, 'zulu', 100, 201, RED);
    await writeEoxTile(coverageDir, 'alpha', 5000, 9000, GREEN);
    await writeEoxTile(coverageDir, 'alpha', 5001, 9000, GREEN);

    const source = await eoxTileSource({ coverageDir });

    // Sorted by region name ("alpha" < "zulu"), not insertion order — each
    // box matches only its OWN region's rect, not a bounding box over both.
    expect(source.coverage).toHaveLength(2);
    expect(source.coverage[0]).toEqual(boundsForRect(5000, 5001, 9000, 9000)); // alpha
    expect(source.coverage[1]).toEqual(boundsForRect(100, 100, 200, 201)); // zulu
  });

  it('reads tiles from the correct region for a box inside region B', async () => {
    const coverageDir = tmpCoverageDir();
    const aRowNW = 100;
    const aColNW = 200;
    const bRowNW = 5000;
    const bColNW = 9000;
    await writeEoxTile(coverageDir, 'region-a', aRowNW, aColNW, RED);
    await writeEoxTile(coverageDir, 'region-a', aRowNW, aColNW + 1, RED);
    await writeEoxTile(coverageDir, 'region-a', aRowNW + 1, aColNW, RED);
    await writeEoxTile(coverageDir, 'region-a', aRowNW + 1, aColNW + 1, RED);
    await writeEoxTile(coverageDir, 'region-b', bRowNW, bColNW, GREEN);
    await writeEoxTile(coverageDir, 'region-b', bRowNW, bColNW + 1, GREEN);
    await writeEoxTile(coverageDir, 'region-b', bRowNW + 1, bColNW, GREEN);
    await writeEoxTile(coverageDir, 'region-b', bRowNW + 1, bColNW + 1, GREEN);

    const source = await eoxTileSource({ coverageDir });
    const box = boxForBlock(bRowNW, bColNW);
    const rgba = await source.readBox(box, 512, 512);
    expect(rgba).not.toBeNull();

    const centre = pixelAt(rgba!, 512, 128, 128);
    expectPixelNear(centre, [...GREEN, 255]);
  });

  it('throws naming the migration when a flat top-level z13 dir is found', async () => {
    const coverageDir = tmpCoverageDir();
    const flatPath = join(coverageDir, String(EOX_MAX_LEVEL), '100', '200.jpg');
    mkdirSync(dirname(flatPath), { recursive: true });
    writeFileSync(flatPath, 'not a real jpeg, just needs to exist');

    await expect(eoxTileSource({ coverageDir })).rejects.toThrow(/README/);
  });

  it('throws when there are no region subdirectories at all', async () => {
    const coverageDir = tmpCoverageDir();
    // A plain file (like the committed README.md) must be ignored, not
    // mistaken for a region — leaving zero actual regions here.
    writeFileSync(join(coverageDir, 'README.md'), 'provenance notes');

    await expect(eoxTileSource({ coverageDir })).rejects.toThrow(/no region subdirectories/);
  });
});
