/**
 * Listing a star index's chunks reads only headers: a chunk not on disk is asked for by a
 * ranged GET, never its whole body, so a `--dry-run` moves kilobytes, not the catalog.
 */
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { STAR_COLUMN_SCHEMA } from '../../../src/data/octree/starOctreeFamily';
import { starChunkPaths } from '../../../tools/fetch/fetchPrebuiltData';
import { chunkOctree } from '../../../tools/octree/chunkOctree';
import { stratifyOctree } from '../../../tools/octree/stratifyOctree';
import { writeOctreeCatalog } from '../../../tools/octree/writeOctreeCatalog';
import {
  makeOctreeBuildInput,
  randomOctreeRecords,
  TEST_STRATIFY,
} from '../../fixtures/makeOctreeBuildInput';

const GRID = { bits: 6, origin: [0, 0, 0] as [number, number, number], cellEdge: 10 };
const CAPACITY = 300;
const N = 2000;
const HOST = 'https://data.test';

describe('starChunkPaths', () => {
  const dirs: string[] = [];
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  it('lists every depth from ranged header reads, writing nothing', async () => {
    const remote = fs.mkdtempSync(join(tmpdir(), 'fetch-remote-'));
    const local = fs.mkdtempSync(join(tmpdir(), 'fetch-local-'));
    dirs.push(remote, local);
    const epochDir = join(remote, 'star-catalog/v2');
    // A 40-row bound nests chunks two deep, so some are named only by another chunk.
    writeOctreeCatalog(
      chunkOctree(
        stratifyOctree(makeOctreeBuildInput(randomOctreeRecords(N, 5, 640, [4, 14]), GRID)),
        CAPACITY,
        40,
      ),
      {
        family: 'star',
        grid: GRID,
        stratify: TEST_STRATIFY,
        schema: STAR_COLUMN_SCHEMA,
        stats: { starCount: N },
      },
      epochDir,
      'stars',
    );
    const served: { path: string; ranged: boolean }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
        const path = url.slice(`${HOST}/data/`.length);
        const body = fs.readFileSync(join(remote, path));
        const range = /^bytes=0-(\d+)$/.exec(init?.headers?.Range ?? '');
        const end = range ? Math.min(Number(range[1]) + 1, body.length) : body.length;
        served.push({ path, ranged: range !== null });
        return new Response(body.subarray(0, end), { status: range ? 206 : 200 });
      }),
    );

    const paths = await starChunkPaths(
      HOST,
      local,
      'star-catalog/v2/stars.bin',
      'star-catalog/v2/stars.bin',
    );

    const baked = fs.readdirSync(join(epochDir, 'stars'));
    expect(paths.sort()).toEqual(baked.map((name) => `star-catalog/v2/stars/${name}`).sort());
    const chunkReads = served.filter((s) => s.path.includes('/stars/'));
    expect(chunkReads.length).toBe(baked.length);
    expect(chunkReads.every((r) => r.ranged)).toBe(true);
    expect(fs.readdirSync(local)).toEqual([]);
  });
});
