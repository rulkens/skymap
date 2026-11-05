import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { repackSurfaceTiles } from '../../../../tools/utils/textures/repackSurfaceTiles';

let dir: string;
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function put(rel: string, body: string): void {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), body);
}

it('packs the indexed tiles and leaves manifest.json and index.txt byte-identical', () => {
  dir = mkdtempSync(join(tmpdir(), 'repackSurfaceTiles-'));
  const tile = 'earth-tiles/v1/albedo/1/0/0.webp';
  put('earth-tiles/manifest.json', '{"prefix":"earth-tiles/v1","tilePx":256,"bands":[]}\n');
  put('earth-tiles/index.txt', `${tile}\n`);
  put(tile, 'pixels');

  expect(repackSurfaceTiles(dir, 'earth-tiles')).toBe(2);
  expect(existsSync(join(dir, 'earth-tiles/v1/albedo/z1.idx'))).toBe(true);
  expect(readFileSync(join(dir, 'earth-tiles/v1/albedo/z1.p0.pack'), 'utf8')).toBe('pixels');
  expect(readFileSync(join(dir, 'earth-tiles/index.txt'), 'utf8')).toBe(`${tile}\n`);
  expect(readFileSync(join(dir, 'earth-tiles/manifest.json'), 'utf8')).toBe(
    '{"prefix":"earth-tiles/v1","tilePx":256,"bands":[]}\n',
  );
});

it('throws when the body was never baked', () => {
  dir = mkdtempSync(join(tmpdir(), 'repackSurfaceTiles-'));
  expect(() => repackSurfaceTiles(dir, 'earth-tiles')).toThrow(/bake first/);
});
