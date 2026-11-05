/**
 * The chunk upload list comes from the index header, not the disk: a stale chunk from an
 * earlier bake must stay off it, and every listed path must exist under the bulk group's
 * `star-catalog/v2` root, or rclone would upload a partial or escaped tree.
 */
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { ColumnId } from '../../../../src/@types/octree/ColumnId';
import { STAR_COLUMN_SCHEMA } from '../../../../src/data/octree/starOctreeFamily';
import { collectOctreeChunks } from '../../../../tools/deploy/r2/collectOctreeChunks';
import { chunkOctree } from '../../../../tools/octree/chunkOctree';
import { stratifyOctree } from '../../../../tools/octree/stratifyOctree';
import { writeOctreeCatalog } from '../../../../tools/octree/writeOctreeCatalog';
import { contentHash8 } from '../../../../tools/utils/data/contentHash8';
import {
  makeOctreeBuildInput,
  randomOctreeRecords,
  TEST_STRATIFY,
} from '../../../fixtures/makeOctreeBuildInput';

const GRID = { bits: 6, origin: [0, 0, 0] as [number, number, number], cellEdge: 10 };
const CAPACITY = 300;
const N = 2000;

const STARS = { family: 'star', name: 'stars' } as const;

describe('collectOctreeChunks', () => {
  const dirs: string[] = [];
  const tempDataDir = () => {
    const d = fs.mkdtempSync(join(tmpdir(), 'star-chunks-'));
    dirs.push(d);
    return d;
  };
  afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  it('lists exactly the chunks the headers name at every depth, under the stars/ dir', () => {
    const dataDir = tempDataDir();
    const epochDir = join(dataDir, 'star-catalog/v2');
    const header = writeOctreeCatalog(
      // A 40-row bound nests chunks two deep, so some are named only by another chunk.
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
    const baked = fs.readdirSync(join(epochDir, 'stars'));
    const hashed = `stars.${contentHash8(fs.readFileSync(join(epochDir, 'stars.bin')))}.bin`;
    fs.renameSync(join(epochDir, 'stars.bin'), join(epochDir, hashed));
    fs.writeFileSync(join(epochDir, 'stars', '0-0.deadbeef.bin'), 'stale');
    fs.writeFileSync(
      join(dataDir, 'manifest.json'),
      JSON.stringify({ 'star-catalog/v2/stars.bin': `star-catalog/v2/${hashed}` }),
    );

    const uploads = collectOctreeChunks(dataDir, STARS);

    expect(header.stats.chunkCount).toBeGreaterThan(header.chunks.length);
    expect(uploads.map((u) => u.r2Key).sort()).toEqual(
      baked.map((name) => `data/star-catalog/v2/stars/${name}`).sort(),
    );
    for (const { localPath, r2Key } of uploads) {
      expect(fs.existsSync(localPath)).toBe(true);
      expect(`data/star-catalog/v2/${relative(epochDir, localPath)}`).toBe(r2Key);
    }
  });

  it("a galaxy catalog collects each chunk with its info sibling; the star catalog's list is unchanged", () => {
    const dataDir = tempDataDir();
    const epochDir = join(dataDir, 'galaxy-octree/v1');
    writeOctreeCatalog(
      chunkOctree(
        stratifyOctree(makeOctreeBuildInput(randomOctreeRecords(N, 5, 640, [4, 14]), GRID)),
        CAPACITY,
        40,
      ),
      {
        family: 'galaxy',
        grid: GRID,
        stratify: TEST_STRATIFY,
        schema: STAR_COLUMN_SCHEMA,
        stats: { recordCount: N },
      },
      epochDir,
      'glade',
      {
        schema: [{ id: 'specZ', store: 'f32', q0: 0, q1: 1 }],
        columns: new Map<ColumnId, Float32Array>([['specZ', new Float32Array(N)]]),
      },
    );
    const hashed = `glade.${contentHash8(fs.readFileSync(join(epochDir, 'glade.bin')))}.bin`;
    fs.renameSync(join(epochDir, 'glade.bin'), join(epochDir, hashed));
    fs.writeFileSync(
      join(dataDir, 'manifest.json'),
      JSON.stringify({ 'galaxy-octree/v1/glade.bin': `galaxy-octree/v1/${hashed}` }),
    );

    const uploads = collectOctreeChunks(dataDir, { family: 'galaxy', name: 'glade' });

    const baked = fs.readdirSync(join(epochDir, 'glade'));
    expect(baked.some((f) => f.includes('.info.'))).toBe(true);
    expect(uploads.map((u) => u.r2Key).sort()).toEqual(
      baked.map((name) => `data/galaxy-octree/v1/glade/${name}`).sort(),
    );
  });

  it('returns [] without an index', () => {
    const dataDir = tempDataDir();
    expect(collectOctreeChunks(dataDir, STARS)).toEqual([]);
    fs.writeFileSync(
      join(dataDir, 'manifest.json'),
      JSON.stringify({ 'galaxy-catalog/v9/2mrs.bin': 'galaxy-catalog/v9/2mrs.a3f19c2e.bin' }),
    );
    expect(collectOctreeChunks(dataDir, STARS)).toEqual([]);
  });
});
