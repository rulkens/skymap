import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterAll, beforeAll, expect, it } from 'vitest';

import { HEIGHT_TILE_POST_COUNT } from '../../../../../src/layers/body/surfaceTiles/format/data/heightTileFormat';
import { codeHeightM } from '../../../../../src/layers/body/surfaceTiles/format/utils/codeHeightM';
import { readHeightPyramid } from '../../../../../tools/textures/surfaceHorizon/utils/readHeightPyramid';
import { encodeHeightTile } from '../../../../../tools/utils/textures/encodeHeightTile';
import { heightCode } from '../../../../../tools/utils/textures/heightCode';
import { packSurfaceTileLevels } from '../../../../../tools/utils/textures/packSurfaceTileLevels';

const PREFIX = 'moon-tiles/v1';
const TILE = `${PREFIX}/height/1/0/0.webp`;
const HEIGHT_M = codeHeightM(heightCode(250));
// Inside z1 tile (0, 0), the western hemisphere.
const LON = -Math.PI / 2;
let dir: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'readHeightPyramid-'));
  mkdirSync(dirname(join(dir, TILE)), { recursive: true });
  writeFileSync(
    join(dir, TILE),
    await encodeHeightTile({
      subtreeMinM: HEIGHT_M,
      subtreeMaxM: HEIGHT_M,
      geometricResidualM: 0,
      heightM: new Float32Array(HEIGHT_TILE_POST_COUNT).fill(HEIGHT_M),
    }),
  );
  packSurfaceTileLevels(dir, PREFIX, [TILE]);
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

// bakeHorizonTileResolved keeps a march whose reads left missCount unchanged, so a read that
// skips the count, or a lookup cache that outlives a decode or a trim, bakes a wrong angle or
// never converges.
it('counts every read of an undecoded tile, before decode and again after trim', async () => {
  const pyramid = readHeightPyramid(dir, PREFIX, 1_737_400);
  expect(pyramid.heightAt(1, LON, 0)).toBe(0);
  expect(pyramid.heightAt(1, LON, 0.1)).toBe(0);
  expect(pyramid.missCount()).toBe(2);

  expect(await pyramid.loadMisses()).toBe(1);
  expect(pyramid.heightAt(1, LON, 0)).toBeCloseTo(HEIGHT_M, 6);
  expect(pyramid.missCount()).toBe(2);

  pyramid.trim(0);
  expect(pyramid.heightAt(1, LON, 0)).toBe(0);
  expect(pyramid.missCount()).toBe(3);
});
