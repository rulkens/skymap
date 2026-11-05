import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, expect, it } from 'vitest';

import type { SurfaceTileProduct } from '../../../../src/layers/body/surfaceTiles/format/@types/SurfaceTileProduct';
import { decodeSurfaceTileArchiveIndex } from '../../../../src/layers/body/surfaceTiles/format/utils/decodeSurfaceTileArchiveIndex';
import { findSurfaceTileArchiveEntry } from '../../../../src/layers/body/surfaceTiles/format/utils/findSurfaceTileArchiveEntry';
import { surfaceTileArchivePath } from '../../../../src/layers/body/surfaceTiles/format/utils/surfaceTileArchivePath';
import { surfaceTileMortonKey } from '../../../../src/layers/body/surfaceTiles/format/utils/surfaceTileMortonKey';
import { packSurfaceTileLevels } from '../../../../tools/utils/textures/packSurfaceTileLevels';

const PREFIX = 'earth-tiles/v1';
const TILES: Record<string, string> = {
  [`${PREFIX}/albedo/2/1/0.webp`]: 'aaaa',
  [`${PREFIX}/albedo/2/0/1.webp`]: 'bb',
  [`${PREFIX}/height/3/5/6.webp`]: 'cccccc',
};
const PATHS = Object.keys(TILES).sort();
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'packSurfaceTileLevels-'));
  for (const [path, body] of Object.entries(TILES)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const read = (path: string) => readFileSync(join(dir, path));

it('writes z<z>.idx and parts whose ranges read back each tile byte for byte', () => {
  expect(packSurfaceTileLevels(dir, PREFIX, PATHS)).toBe(4);
  for (const [path, body] of Object.entries(TILES)) {
    const [product, z, x, y] = path.slice(PREFIX.length + 1).split('/');
    const p = product as SurfaceTileProduct;
    const index = decodeSurfaceTileArchiveIndex(read(surfaceTileArchivePath(PREFIX, p, Number(z))));
    const e = findSurfaceTileArchiveEntry(
      index,
      surfaceTileMortonKey(Number(x), Number.parseInt(y!, 10)),
    )!;
    const part = read(surfaceTileArchivePath(PREFIX, p, Number(z), e.part));
    expect(part.subarray(e.offset, e.offset + e.length).toString()).toBe(body);
  }
});

it('is deterministic: a second pack produces identical bytes', () => {
  const files = [
    surfaceTileArchivePath(PREFIX, 'albedo', 2),
    surfaceTileArchivePath(PREFIX, 'albedo', 2, 0),
    surfaceTileArchivePath(PREFIX, 'height', 3),
  ];
  packSurfaceTileLevels(dir, PREFIX, PATHS);
  const first = files.map(read);
  packSurfaceTileLevels(dir, PREFIX, PATHS);
  files.forEach((f, i) => expect(read(f).equals(first[i]!)).toBe(true));
});

it('deletes a stale higher-numbered part left by an earlier, larger pack', () => {
  const stale = join(dir, surfaceTileArchivePath(PREFIX, 'height', 3, 1));
  writeFileSync(stale, 'old');
  packSurfaceTileLevels(dir, PREFIX, PATHS);
  expect(existsSync(stale)).toBe(false);
});
