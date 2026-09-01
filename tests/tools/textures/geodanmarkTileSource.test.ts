import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import sharp from 'sharp';

import { geodanmarkTileSource } from '../../../tools/textures/geodanmarkTileSource';
import type { LonLatBounds } from '../../../src/@types/scene/LonLatBounds';

const GEODANMARK_MAX_LEVEL = 19;
const TILE_PX = 512;
const TILE_DEG = 360 / 2 ** GEODANMARK_MAX_LEVEL;

function tmpCoverageDir(): string {
  return mkdtempSync(join(tmpdir(), 'geodanmark-tile-source-'));
}

/** Bounds of the single z19 tile at `(x, y)` — the exact inverse of the
 *  production `tileAt`, written independently against skymap's own
 *  `x0 = -180, y0 = +90` grid formula rather than by calling into the
 *  module under test. */
function tileBounds(x: number, y: number): LonLatBounds {
  return {
    west: x * TILE_DEG - 180,
    east: (x + 1) * TILE_DEG - 180,
    north: 90 - y * TILE_DEG,
    south: 90 - (y + 1) * TILE_DEG,
  };
}

async function writeGeodanmarkTile(
  coverageDir: string,
  x: number,
  y: number,
  rgb: readonly [number, number, number],
): Promise<void> {
  const path = join(coverageDir, String(GEODANMARK_MAX_LEVEL), String(x), `${y}.jpg`);
  mkdirSync(dirname(path), { recursive: true });
  await sharp({
    create: {
      width: TILE_PX,
      height: TILE_PX,
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

// A JPEG re-encode of a flat colour still perturbs it a little; a wrong-tile
// read is a whole different colour, well outside this.
const CHANNEL_TOLERANCE = 8;

function expectPixelNear(
  actual: readonly [number, number, number, number],
  expected: readonly [number, number, number, number],
): void {
  for (let c = 0; c < 4; c++) {
    expect(Math.abs(actual[c]! - expected[c]!)).toBeLessThanOrEqual(CHANNEL_TOLERANCE);
  }
}

describe('geodanmarkTileSource', () => {
  const RED = [255, 0, 0] as const;
  const GREEN = [0, 255, 0] as const;

  it("throws when the harvest rect isn't snapped to minLevel's tile grid", async () => {
    const coverageDir = tmpCoverageDir();
    // minLevel 18 -> modulus 2^(19-18) = 2; a single tile at odd x=1 leaves
    // its z18 parent with only this one child inside coverage — the case
    // that would bake a transparent quadrant with no underfill to patch.
    await writeGeodanmarkTile(coverageDir, 1, 4, RED);

    await expect(geodanmarkTileSource({ coverageDir, minLevel: 18 })).rejects.toThrow(
      /snapped|z18/,
    );
  });

  it('throws when the harvest spans a gap instead of one contiguous rect', async () => {
    const coverageDir = tmpCoverageDir();
    // Two isolated single tiles far enough apart that the naive bounding
    // rect over both claims ground never actually harvested.
    await writeGeodanmarkTile(coverageDir, 100, 200, RED);
    await writeGeodanmarkTile(coverageDir, 50000, 90000, GREEN);

    await expect(geodanmarkTileSource({ coverageDir, minLevel: 14 })).rejects.toThrow(
      /incomplete|gap/,
    );
  });

  it('reads the pixels of the requested tile out of a snapped rect', async () => {
    const coverageDir = tmpCoverageDir();
    const xMin = 100;
    const yMin = 200;
    // minLevel 18 -> modulus 2; a 2x2 block at even (100, 200) is exactly
    // one z18 parent's own ground, so it's snapped.
    await writeGeodanmarkTile(coverageDir, xMin, yMin, RED);
    await writeGeodanmarkTile(coverageDir, xMin + 1, yMin, GREEN);
    await writeGeodanmarkTile(coverageDir, xMin, yMin + 1, RED);
    await writeGeodanmarkTile(coverageDir, xMin + 1, yMin + 1, GREEN);

    const source = await geodanmarkTileSource({ coverageDir, minLevel: 18 });
    const box = tileBounds(xMin + 1, yMin);
    const rgba = await source.readBox(box, TILE_PX, TILE_PX);

    expect(rgba).not.toBeNull();
    expectPixelNear(pixelAt(rgba!, TILE_PX, 256, 256), [...GREEN, 255]);
  });

  it('returns null for a box outside the harvested rect', async () => {
    const coverageDir = tmpCoverageDir();
    const xMin = 100;
    const yMin = 200;
    await writeGeodanmarkTile(coverageDir, xMin, yMin, RED);
    await writeGeodanmarkTile(coverageDir, xMin + 1, yMin, RED);
    await writeGeodanmarkTile(coverageDir, xMin, yMin + 1, RED);
    await writeGeodanmarkTile(coverageDir, xMin + 1, yMin + 1, RED);

    const source = await geodanmarkTileSource({ coverageDir, minLevel: 18 });
    const rgba = await source.readBox(tileBounds(50000, 90000), TILE_PX, TILE_PX);

    expect(rgba).toBeNull();
  });
});
