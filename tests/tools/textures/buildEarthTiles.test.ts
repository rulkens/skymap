import { describe, it, expect, afterAll } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import sharp from 'sharp';

import { bakeCoarserLevel, TILE_PREFIX } from '../../../tools/textures/buildEarthTiles';
import { earthTilePath } from '../../../src/utils/scene/earthTilePath';

const TILE_PX = 512;

const dirs: string[] = [];

/** A fresh temp dir, tracked for cleanup once the whole file is done. */
function tmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'build-earth-tiles-'));
  dirs.push(dir);
  return dir;
}

/** Write a solid-colour 512x512 child tile at `(z, x, y)`, the shape a real bake
 *  leaves on disk for `bakeCoarserLevel` to read back. */
async function writeChild(
  outDir: string,
  z: number,
  x: number,
  y: number,
  rgba: readonly [number, number, number, number],
): Promise<void> {
  const path = join(outDir, earthTilePath({ kind: 'surface', z, x, y }, TILE_PREFIX));
  mkdirSync(dirname(path), { recursive: true });
  await sharp({
    create: {
      width: TILE_PX,
      height: TILE_PX,
      channels: 4,
      background: { r: rgba[0], g: rgba[1], b: rgba[2], alpha: rgba[3] },
    },
  })
    .webp({ quality: 100 })
    .toFile(path);
}

/** Read one channel-4 pixel out of a raw RGBA buffer. */
function pixelAt(
  data: Buffer,
  width: number,
  x: number,
  y: number,
): readonly [number, number, number, number] {
  const i = (y * width + x) * 4;
  return [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!];
}

/** Tolerance for a WebP round-trip of a solid colour: generous enough to absorb
 *  lossy encoding, tight enough that a wrong quadrant (a whole different colour)
 *  still fails loudly. */
const CHANNEL_TOLERANCE = 8;

function expectPixelNear(
  actual: readonly [number, number, number, number],
  expected: readonly [number, number, number, number],
): void {
  for (let c = 0; c < 4; c++) {
    expect(Math.abs(actual[c]! - expected[c]!)).toBeLessThanOrEqual(CHANNEL_TOLERANCE);
  }
}

describe('bakeCoarserLevel', () => {
  // Children live at z=2 (4 columns x 2 rows), parent at z=1 (2 columns x 1 row) —
  // z=0 would make the parent level 1 column by 0.5 rows, not a real grid. The
  // level-1 loop therefore also visits parent (x=1, y=0); its children are absent,
  // so that iteration exercises the "a parent with no children is not written"
  // path for free. This test only asserts on parent (x=0, y=0), whose four
  // children are (0,0), (1,0), (0,1), (1,1) at z=2.
  const RED = [255, 0, 0, 255] as const; // NW: (i=0, j=0)
  const GREEN = [0, 255, 0, 255] as const; // NE: (i=1, j=0)
  const BLUE = [0, 0, 255, 255] as const; // SW: (i=0, j=1)
  const WHITE = [255, 255, 255, 255] as const; // SE: (i=1, j=1)

  // The bug this pins: sharp composites over the ALREADY-PROCESSED image, so a
  // `.resize()` chained after `.composite()` in the same pipeline runs first, not
  // last. The 1024x1024 canvas shrinks to 512 before the four 512x512 children are
  // laid down, so only the NW child (at offset 0,0) still overlaps the canvas —
  // the other three land at offset 512 on a now-512-wide canvas and are silently
  // clipped. Every quadrant of the output then reads NW's colour instead of its
  // own child's.
  it('gives each quadrant its own child colour when all four children are present', async () => {
    const dir = tmpDir();
    await writeChild(dir, 2, 0, 0, RED);
    await writeChild(dir, 2, 1, 0, GREEN);
    await writeChild(dir, 2, 0, 1, BLUE);
    await writeChild(dir, 2, 1, 1, WHITE);

    await bakeCoarserLevel(1, TILE_PX, dir);

    const parentPath = join(dir, earthTilePath({ kind: 'surface', z: 1, x: 0, y: 0 }, TILE_PREFIX));
    const { data } = await sharp(parentPath)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const nw = pixelAt(data, TILE_PX, 128, 128);
    const ne = pixelAt(data, TILE_PX, 384, 128);
    const sw = pixelAt(data, TILE_PX, 128, 384);
    const se = pixelAt(data, TILE_PX, 384, 384);

    expectPixelNear(nw, RED);
    expectPixelNear(ne, GREEN);
    expectPixelNear(sw, BLUE);
    expectPixelNear(se, WHITE);
  });

  // The coastal case the production docstring calls out: a parent with only SOME
  // children present must still carry the children it has. Under the bug this is
  // the worst case — every surviving child is off-origin, so all of them get
  // clipped and the tile written to disk is fully transparent everywhere.
  it('keeps the surviving child when only one of four is present, and leaves the rest transparent', async () => {
    const dir = tmpDir();
    await writeChild(dir, 2, 1, 1, WHITE); // SE only

    await bakeCoarserLevel(1, TILE_PX, dir);

    const parentPath = join(dir, earthTilePath({ kind: 'surface', z: 1, x: 0, y: 0 }, TILE_PREFIX));
    const { data } = await sharp(parentPath)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const nw = pixelAt(data, TILE_PX, 128, 128);
    const se = pixelAt(data, TILE_PX, 384, 384);

    expect(nw[3]).toBeLessThanOrEqual(CHANNEL_TOLERANCE); // NW quadrant: transparent, no child there
    expectPixelNear(se, WHITE);
  });
});

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});
