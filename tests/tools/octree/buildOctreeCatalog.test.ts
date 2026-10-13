import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OctreeChunkRef } from '../../../src/@types/octree/OctreeChunkRef';
import type { OctreeIndexHeader } from '../../../src/@types/octree/OctreeIndexHeader';
import type { OctreeCatalogMeta } from '../../../tools/@types/octree/OctreeCatalogMeta';
import type { OctreeObjects } from '../../../tools/@types/octree/OctreeObjects';
import { decodeOctreeChunk } from '../../../src/data/octree/decodeOctreeChunk';
import { decodeOctreeIndex } from '../../../src/data/octree/decodeOctreeIndex';
import { octreeChunkFileName, STAR_COLUMN_SCHEMA } from '../../../src/data/octree/octreeFormat';
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
const NODE_CAPACITY = 40;
const N = 3000;

function meta(): OctreeCatalogMeta {
  return {
    family: 'star',
    grid: GRID,
    stratify: TEST_STRATIFY,
    schema: STAR_COLUMN_SCHEMA,
    stats: { starCount: N },
  };
}

/** A catalog whose chunks nest at least two deep (see the chunkOctree nesting test). */
function nestedObjects(seed: number): OctreeObjects {
  const input = makeOctreeBuildInput(randomOctreeRecords(N, seed, 640, [4, 14]), GRID);
  return chunkOctree(stratifyOctree(input), CAPACITY, NODE_CAPACITY);
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

  it('round-trips the index and every chunk at every depth through the headers alone', () => {
    const objects = nestedObjects(3);
    const dir = tempDir();
    writeOctreeCatalog(objects, meta(), dir, 'stars');

    const index = decodeOctreeIndex(read(join(dir, 'stars.bin')));
    expect(index.header.chunkNodeCap).toBe(objects.index.chunkNodeCap);
    expect(index.header.stats).toEqual({ starCount: N, chunkCount: objects.chunks.length });

    // Walk the tree from the index: each header lists exactly its own chunks, by global id.
    let real = index.nodes.ownCount.reduce((a, b) => a + b, 0);
    const seen: number[] = [];
    const walk = (refs: readonly OctreeChunkRef[], parent: number | null) => {
      expect(refs.map((r) => r.id)).toEqual(
        objects.chunks.flatMap((c, id) => (c.parent === parent ? [id] : [])),
      );
      for (const ref of refs) {
        const object = objects.chunks[ref.id]!;
        expect([ref.roots, ref.recordBase]).toEqual([object.roots, object.recordBase]);
        const chunk = decodeOctreeChunk(
          read(join(dir, 'stars', octreeChunkFileName(ref))),
          index.header,
        );
        expect(chunk.header.nodes).toBe(ref.nodes);
        expect(Array.from(chunk.nodes.chunkRef)).toEqual(Array.from(object.nodes.chunkRef));
        real += chunk.nodes.ownCount.reduce((a, b) => a + b, 0);
        seen.push(ref.id);
        walk(chunk.header.chunks, ref.id);
      }
    };
    walk(index.header.chunks, null);
    expect(seen.sort((a, b) => a - b)).toEqual(objects.chunks.map((_, id) => id));
    expect(real).toBe(N);

    const written = objects.chunks[0]!.columns.get('offset')!;
    const ref = index.header.chunks[0]!;
    const decoded = decodeOctreeChunk(
      read(join(dir, 'stars', octreeChunkFileName(ref))),
      index.header,
    ).columns.get('offset') as Uint16Array;
    expect(decoded.length).toBe(written.length);
    written.forEach((f, i) =>
      expect(Math.abs(decoded[i]! / 65536 - f)).toBeLessThanOrEqual(1 / 65536),
    );
  });

  it('writes every chunk before the object that lists it, and the index last', () => {
    const objects = nestedObjects(9);
    const spy = vi.spyOn(fs, 'writeFileSync');
    const header: OctreeIndexHeader = writeOctreeCatalog(objects, meta(), tempDir(), 'stars');

    const paths = spy.mock.calls.map((call) => String(call[0]));
    expect(paths.length).toBe(objects.chunks.length + 1);
    expect(paths[paths.length - 1]).toMatch(/\/stars\.bin$/);
    const writtenAt = (ref: OctreeChunkRef) =>
      paths.findIndex((p) => p.endsWith(`/${octreeChunkFileName(ref)}`));
    const check = (refs: readonly OctreeChunkRef[], parentAt: number) => {
      for (const ref of refs) {
        const at = writtenAt(ref);
        expect(at).toBeGreaterThanOrEqual(0);
        expect(at).toBeLessThan(parentAt);
        const path = paths[at]!;
        check(decodeOctreeChunk(read(path), header).header.chunks, at);
      }
    };
    check(header.chunks, paths.length - 1);
  });
});
