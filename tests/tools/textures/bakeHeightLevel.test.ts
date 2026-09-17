import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import type { HeightSource } from '../../../tools/textures/HeightSource';
import { bakeHeightLevel } from '../../../tools/textures/bakeHeightLevel';
import { HEIGHT_POSTS_PER_TILE } from '../../../src/data/scene/heightTileFormat';
import { codeHeightM } from '../../../src/utils/surfaceTiles/codeHeightM';
import { heightCode } from '../../../tools/utils/textures/heightCode';
import { surfaceTilePath } from '../../../src/utils/surfaceTiles/surfaceTilePath';
import { surfaceTileBounds } from '../../../tools/utils/scene/surfaceTileBounds';
import { SURFACE_TILE_PX } from '../../../src/data/bodies/surfaceTileParams';
import { flattenWaterComponents } from '../../../tools/utils/textures/flattenWaterComponents';
import { heightLatticeStepDeg } from '../../../tools/utils/textures/heightLatticeStepDeg';
import { readHeightTileFile } from '../../../tools/utils/textures/readHeightTileFile';

const PREFIX = 'test-tiles/v1';
const POSTS = HEIGHT_POSTS_PER_TILE;
const DEG = Math.PI / 180;

const dirs: string[] = [];
function scratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'height-bake-'));
  dirs.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

/** Smooth, everywhere-finite, and cheap: nothing is downloaded and the field
 *  is the same function at every level, so decimation is exactly testable. */
function analyticHeight(lonDeg: number, latDeg: number): number {
  return Math.fround(1000 * Math.sin(lonDeg * DEG) * Math.cos(2 * latDeg * DEG));
}

function analyticSource(maxLevel: number): HeightSource {
  return {
    id: 'analytic',
    attribution: 'analytic test field',
    maxLevel,
    coverage: [{ west: -180, east: 180, south: -90, north: 90 }],
    provenance: { sourceId: 'analytic', attribution: 'analytic', vintage: 'test' },

    async readGrid(z, i0, j0, nx, ny) {
      const step = heightLatticeStepDeg(z);
      const grid = new Float32Array(nx * ny);
      for (let jj = 0; jj < ny; jj++) {
        const lat = 90 - (j0 + jj) * step;
        for (let ii = 0; ii < nx; ii++)
          grid[jj * nx + ii] = analyticHeight(-180 + (i0 + ii) * step, lat);
      }
      return grid;
    },

    async boundsInBox(box) {
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      for (let j = 0; j <= 32; j++) {
        const lat = box.south + ((box.north - box.south) * j) / 32;
        for (let i = 0; i <= 32; i++) {
          const value = analyticHeight(box.west + ((box.east - box.west) * i) / 32, lat);
          min = Math.min(min, value);
          max = Math.max(max, value);
        }
      }
      return [min, max];
    },
  };
}

async function readTile(dir: string, z: number, x: number, y: number) {
  const path = join(dir, surfaceTilePath({ product: 'height', z, x, y }, PREFIX));
  const tile = await readHeightTileFile(path);
  if (tile === null) throw new Error(`readTile: ${path} missing`);
  return tile;
}

async function bake(
  dir: string,
  z: number,
  tiles: ReadonlyArray<{ x: number; y: number }>,
  source: HeightSource,
): Promise<string[]> {
  return bakeHeightLevel({
    z,
    tiles,
    source,
    underfill: null,
    outDir: dir,
    prefix: PREFIX,
    flattenWater: false,
  });
}

describe('bakeHeightLevel', () => {
  // §5.4.2: the shared post is the same computed float in both tiles, or the
  // patches crack along the seam in a way that reads as z-fighting.
  it('bakes two adjacent tiles agreeing bit-for-bit on their shared column', async () => {
    const dir = scratchDir();
    const source = analyticSource(5);
    await bake(
      dir,
      5,
      [
        { x: 10, y: 8 },
        { x: 11, y: 8 },
      ],
      source,
    );

    const west = await readTile(dir, 5, 10, 8);
    const east = await readTile(dir, 5, 11, 8);
    for (let row = 0; row < POSTS; row++) {
      const a = west.heightM[row * POSTS + (POSTS - 1)]!;
      const b = east.heightM[row * POSTS]!;
      expect(Object.is(a, b)).toBe(true);
    }
  });

  // §5.4.3: level L's lattice is every other point of level L+1's, so a
  // parent post must be its covering child's post bit-for-bit (R1).
  it('gives a parent posts identical to the matching child posts', async () => {
    const dir = scratchDir();
    const source = analyticSource(5);
    await bake(
      dir,
      5,
      [
        { x: 10, y: 8 },
        { x: 11, y: 8 },
        { x: 10, y: 9 },
        { x: 11, y: 9 },
      ],
      source,
    );
    await bake(dir, 4, [{ x: 5, y: 4 }], source);

    const parent = await readTile(dir, 4, 5, 4);
    const children = [
      [await readTile(dir, 5, 10, 8), await readTile(dir, 5, 11, 8)],
      [await readTile(dir, 5, 10, 9), await readTile(dir, 5, 11, 9)],
    ];
    for (let j = 0; j <= POSTS - 1; j++) {
      for (let i = 0; i <= POSTS - 1; i++) {
        const qx = i < 64 ? 0 : 1;
        const qy = j < 64 ? 0 : 1;
        const child = children[qy]![qx]!;
        const ci = 2 * i - qx * 128;
        const cj = 2 * j - qy * 128;
        expect(Object.is(parent.heightM[j * POSTS + i], child.heightM[cj * POSTS + ci])).toBe(true);
      }
    }
  });

  it("bounds a parent's subtree by every child's bounds and its own posts", async () => {
    const dir = scratchDir();
    const source = analyticSource(5);
    await bake(
      dir,
      5,
      [
        { x: 10, y: 8 },
        { x: 11, y: 8 },
        { x: 10, y: 9 },
        { x: 11, y: 9 },
      ],
      source,
    );
    await bake(dir, 4, [{ x: 5, y: 4 }], source);

    const parent = await readTile(dir, 4, 5, 4);
    const children = [
      await readTile(dir, 5, 10, 8),
      await readTile(dir, 5, 11, 8),
      await readTile(dir, 5, 10, 9),
      await readTile(dir, 5, 11, 9),
    ];
    for (const child of children) {
      expect(parent.subtreeMaxM).toBeGreaterThanOrEqual(child.subtreeMaxM);
      expect(parent.subtreeMinM).toBeLessThanOrEqual(child.subtreeMinM);
    }
    expect(parent.subtreeMaxM).toBeGreaterThanOrEqual(Math.max(...parent.heightM));
    expect(parent.subtreeMinM).toBeLessThanOrEqual(Math.min(...parent.heightM));
    // The deepest level has nothing finer inside it to differ from.
    for (const child of children) expect(child.geometricResidualM).toBe(0);
    expect(parent.geometricResidualM).toBeGreaterThan(0);
  });

  // A `j ↔ ny−1−j` flip in the region-to-tile slicing would pass every other
  // test here (which only compare tiles to each other) while shipping a
  // north/south-flipped surface to the renderer.
  it('keeps the north row first: heightM[0] is the NW corner, not the SW', async () => {
    const dir = scratchDir();
    const source = analyticSource(5);
    await bake(dir, 5, [{ x: 10, y: 8 }], source);

    const tile = await readTile(dir, 5, 10, 8);
    const box = surfaceTileBounds(5, 10, 8, SURFACE_TILE_PX);
    // Posts sit on the 0.1 m grid, so compare against the quantised field.
    const quantised = (v: number): number => codeHeightM(heightCode(v));
    expect(tile.heightM[0]).toBe(quantised(analyticHeight(box.west, box.north)));
    expect(tile.heightM[(POSTS - 1) * POSTS]).toBe(quantised(analyticHeight(box.west, box.south)));
  });

  // The encoder already refuses off-grid posts; what it can't see is ORDER —
  // bounds taken before rounding would describe values no longer on disk.
  it('quantises every post before deriving the header', async () => {
    const dir = scratchDir();
    const base = analyticSource(5);
    const source: HeightSource = { ...base, boundsInBox: async () => null };
    await bake(dir, 5, [{ x: 10, y: 8 }], source);

    const tile = await readTile(dir, 5, 10, 8);
    expect(tile.subtreeMinM).toBe(Math.min(...tile.heightM));
    expect(tile.subtreeMaxM).toBe(Math.max(...tile.heightM));
  });

  it('skips a tile whose output already exists', async () => {
    const dir = scratchDir();
    const source = analyticSource(5);
    const tiles = [{ x: 10, y: 8 }];
    expect(await bake(dir, 5, tiles, source)).toHaveLength(1);
    const before = readFileSync(
      join(dir, surfaceTilePath({ product: 'height', z: 5, x: 10, y: 8 }, PREFIX)),
    );

    let reads = 0;
    const counted: HeightSource = {
      ...source,
      readGrid: async (...args) => {
        reads++;
        return source.readGrid(...args);
      },
    };
    expect(await bake(dir, 5, tiles, counted)).toHaveLength(1);
    expect(reads).toBe(0);
    expect(
      readFileSync(join(dir, surfaceTilePath({ product: 'height', z: 5, x: 10, y: 8 }, PREFIX))),
    ).toEqual(before);
  });
});

describe('flattenWaterComponents', () => {
  // R3: no basin list and no ocean seed — the largest component IS the world
  // ocean, and every other one settles at its own lowest shore.
  it('pins the largest component to 0 and an enclosed basin to its lowest shore', () => {
    const nx = 8;
    const ny = 8;
    const heightM = new Float32Array(nx * ny);
    const isWater = new Uint8Array(nx * ny);
    for (let row = 0; row < ny; row++) {
      for (let col = 0; col < nx; col++) heightM[row * nx + col] = 100 + row * 10 + col;
    }
    const water = (row: number, col: number): void => {
      isWater[row * nx + col] = 1;
      heightM[row * nx + col] = -500;
    };
    for (let row = 1; row <= 3; row++) for (let col = 1; col <= 3; col++) water(row, col);
    for (let row = 5; row <= 6; row++) for (let col = 5; col <= 6; col++) water(row, col);
    heightM[6 * nx + 4] = 12;

    flattenWaterComponents(heightM, isWater, nx, ny);

    for (let row = 1; row <= 3; row++) {
      for (let col = 1; col <= 3; col++) expect(heightM[row * nx + col]).toBe(0);
    }
    for (let row = 5; row <= 6; row++) {
      for (let col = 5; col <= 6; col++) expect(heightM[row * nx + col]).toBe(12);
    }
    expect(heightM[0]).toBe(100);
    expect(heightM[6 * nx + 4]).toBe(12);
  });

  // Column 0 and column nx−1 are the SAME lattice point (lon ±180): water at
  // both must be one component, and the ocean/largest-component rule sets
  // them to the identical value only if the labelling union treats them so.
  it('unions water straddling the antimeridian into one component', () => {
    const nx = 8;
    const ny = 8;
    const heightM = new Float32Array(nx * ny).fill(50);
    const isWater = new Uint8Array(nx * ny);
    isWater[2 * nx + 0] = 1;
    heightM[2 * nx + 0] = -500;
    isWater[2 * nx + (nx - 1)] = 1;
    heightM[2 * nx + (nx - 1)] = -700;

    flattenWaterComponents(heightM, isWater, nx, ny);

    expect(heightM[2 * nx + 0]).toBe(0);
    expect(heightM[2 * nx + (nx - 1)]).toBe(0);
  });

  // A land post at col 0's west neighbour is col nx−2 (the point just before
  // the lon ±180 duplicate), not col nx−1 (itself); a self-referencing wrap
  // would never let this shore height reach the water it borders. A larger
  // decoy component elsewhere keeps this single water post from becoming the
  // "ocean" (set to 0 regardless of shore) rather than exercising the rule.
  it('lets a shore across the antimeridian seam set the water level', () => {
    const nx = 8;
    const ny = 8;
    const heightM = new Float32Array(nx * ny).fill(100);
    const isWater = new Uint8Array(nx * ny);
    for (let row = 0; row <= 1; row++)
      for (let col = 2; col <= 3; col++) isWater[row * nx + col] = 1;
    heightM[4 * nx + 0] = 5;
    isWater[4 * nx + (nx - 2)] = 1;

    flattenWaterComponents(heightM, isWater, nx, ny);

    expect(heightM[4 * nx + (nx - 2)]).toBe(5);
  });
});
