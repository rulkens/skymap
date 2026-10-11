import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OctreeCatalogMeta } from '../../../tools/@types/octree/OctreeCatalogMeta';
import { decodeOctreeChunk } from '../../../src/data/octree/decodeOctreeChunk';
import { decodeOctreeIndex } from '../../../src/data/octree/decodeOctreeIndex';
import { STAR_COLUMN_SCHEMA } from '../../../src/data/octree/octreeFormat';
import { buildOctreeCatalog } from '../../../tools/octree/buildOctreeCatalog';
import { writeOctreeCatalog } from '../../../tools/octree/writeOctreeCatalog';
import {
  makeOctreeBuildInput,
  randomOctreeRecords,
  TEST_STRATIFY,
} from '../../fixtures/makeOctreeBuildInput';

const GRID = { bits: 6, origin: [0, 0, 0] as [number, number, number], cellEdge: 10 };
const CAPACITY = 300;
const N = 2000;

function meta(): OctreeCatalogMeta {
  return {
    family: 'star',
    grid: GRID,
    stratify: TEST_STRATIFY,
    schema: STAR_COLUMN_SCHEMA,
    stats: { starCount: N },
    capacity: CAPACITY,
  };
}

const read = (path: string): ArrayBuffer => {
  const b = fs.readFileSync(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

describe('buildOctreeCatalog → writeOctreeCatalog', () => {
  const dirs: string[] = [];
  const tempDir = () => {
    const d = fs.mkdtempSync(join(tmpdir(), 'octree-'));
    dirs.push(d);
    return d;
  };
  afterEach(() => {
    vi.restoreAllMocks();
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  it('round-trips the index and every chunk', () => {
    const objects = buildOctreeCatalog(
      makeOctreeBuildInput(randomOctreeRecords(N, 5, 640, [-6, 14]), GRID),
      CAPACITY,
    );
    const dir = tempDir();
    writeOctreeCatalog(objects, meta(), dir, 'stars');

    const index = decodeOctreeIndex(read(join(dir, 'stars.bin')));
    expect(index.header.chunks.length).toBe(objects.chunks.length);
    expect(index.header.chunkNodeCap).toBe(Math.max(...objects.chunks.map((c) => c.nodes.count)));
    expect(index.header.stats.starCount).toBe(N);

    // Every real record lands in exactly one object: no blob counted, none lost.
    let real = index.nodes.ownCount.reduce((a, b) => a + b, 0);
    for (const ref of index.header.chunks) {
      const chunk = decodeOctreeChunk(
        read(join(dir, 'stars', `${ref.level}-${ref.morton}.${ref.hash}.bin`)),
        index.header,
      );
      expect(chunk.header.nodes).toBe(ref.nodes);
      real += chunk.nodes.ownCount.reduce((a, b) => a + b, 0);
    }
    expect(real).toBe(N);

    const written = objects.chunks[0]!.columns.get('offset')!;
    const ref = index.header.chunks[0]!;
    const decoded = decodeOctreeChunk(
      read(join(dir, 'stars', `${ref.level}-${ref.morton}.${ref.hash}.bin`)),
      index.header,
    ).columns.get('offset') as Uint16Array;
    expect(decoded.length).toBe(written.length);
    written.forEach((f, i) =>
      expect(Math.abs(decoded[i]! / 65536 - f)).toBeLessThanOrEqual(1 / 65536),
    );
  });

  it('writes the index last', () => {
    const objects = buildOctreeCatalog(
      makeOctreeBuildInput(randomOctreeRecords(N, 9, 640, [-6, 14]), GRID),
      CAPACITY,
    );
    const spy = vi.spyOn(fs, 'writeFileSync');
    writeOctreeCatalog(objects, meta(), tempDir(), 'stars');

    const paths = spy.mock.calls.map((call) => String(call[0]));
    expect(paths.length).toBe(objects.chunks.length + 1);
    expect(paths[paths.length - 1]).toMatch(/\/stars\.bin$/);
  });
});
