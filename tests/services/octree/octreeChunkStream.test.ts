/**
 * The chunk stream over a stubbed fetch: request order under a full pool, the
 * landing and eviction writes it drives, the two ways a fetch can come to
 * nothing (failed, or evicted before it landed), and nesting: a chunk's ref is
 * learnt from its parent, and a parent's eviction takes its descendants first.
 */
import { describe, it, expect, vi } from 'vitest';

import { createOctreeChunkStream } from '../../../src/services/octree/octreeChunkStream';
import { NO_CHUNK_REF } from '../../../src/data/octree/octreeFormat';
import { octreeChunkPath } from '../../../src/utils/octree/octreeChunkPath';
import { starColumnsOf } from '../../../src/utils/star/starColumnsOf';
import { encodeOctreeObject } from '../../../tools/octree/encodeOctreeObject';
import type { Octree } from '../../../src/@types/octree/Octree';
import type { OctreeChunkRef } from '../../../src/@types/octree/OctreeChunkRef';
import type { ColumnId } from '../../../src/@types/octree/ColumnId';
import type { OctreeRawColumn } from '../../../tools/@types/octree/OctreeRawColumn';
import type { StarColumns } from '../../../src/@types/data/starCatalog/StarColumns';
import { STAR_COLUMN_SCHEMA } from '../../../src/data/octree/starOctreeFamily';

/** Chunks 0–2 are rooted in the index; 3 in chunk 0's row, 4 in chunk 3's. Two records each. */
const REFS: readonly OctreeChunkRef[] = [0, 1, 2, 3, 4].map((id) => ({
  id,
  recordBase: 10 + 2 * id,
  level: id < 3 ? 3 : 5 - id,
  morton: id < 3 ? id : 0,
  roots: [0],
  hash: `hash000${id}`,
  bytes: 0,
  nodes: 1,
  records: 2,
}));
const CHILDREN: Readonly<Record<number, readonly OctreeChunkRef[]>> = {
  0: [REFS[3]!],
  3: [REFS[4]!],
};

// The stream reads only the index's family, refs, chunk count and the schema a chunk decodes against.
const OCTREE = {
  family: 'star',
  chunks: REFS.slice(0, 3),
  chunkCount: REFS.length,
  columns: STAR_COLUMN_SCHEMA,
} as unknown as Octree<StarColumns>;

/** Chunk `id` as its object: one row a level below its root, two records, its children named. */
function chunkBytes(id: number): ArrayBuffer {
  const { level, morton } = REFS[id]!;
  const children = CHILDREN[id] ?? [];
  const bytes = encodeOctreeObject(
    { kind: 'chunk', level, morton, nodes: 1, records: 2, chunks: children },
    {
      count: 1,
      morton: new Uint32Array([morton * 8]),
      level: new Uint8Array([level - 1]),
      childMask: new Uint8Array([children.length > 0 ? 1 : 0]),
      firstRecord: new Uint32Array([0]),
      ownCount: new Uint32Array([2]),
      blobCount: new Uint32Array([0]),
      chunkRef: new Uint32Array([children[0]?.id ?? NO_CHUNK_REF]),
    },
    STAR_COLUMN_SCHEMA,
    new Map<ColumnId, OctreeRawColumn>([
      ['offset', new Uint16Array(6)],
      ['absMag', new Uint8Array(2)],
      ['colourIndex', new Uint8Array(2)],
    ]),
  );
  return bytes.slice().buffer;
}

const pathOf = (id: number) => octreeChunkPath('star', 'stars', REFS[id]!);
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A stream whose fetches wait until the test resolves them by chunk ref. */
function harness(slots: number) {
  const pending = new Map<string, (buf: ArrayBuffer | null) => void>();
  const fetchChunk = vi.fn(
    (path: string) => new Promise<ArrayBuffer | null>((resolve) => pending.set(path, resolve)),
  );
  const upload = vi.fn();
  const evict = vi.fn();
  const stream = createOctreeChunkStream({
    octree: OCTREE,
    format: {
      chunkPath: (ref) => octreeChunkPath('star', 'stars', ref),
      decodeRecords: starColumnsOf,
    },
    slots,
    requestRender: () => {},
    upload,
    evict,
    fetchChunk,
  });
  const land = async (ref: number, buf: ArrayBuffer | null = chunkBytes(ref)) => {
    pending.get(pathOf(ref))!(buf);
    await flush();
  };
  return { stream, fetchChunk, upload, evict, land };
}

describe('octreeChunkStream', () => {
  it('update touches resident chunks and requests in descending priority until the pool refuses', async () => {
    const { stream, fetchChunk, evict, land } = harness(2);
    stream.update(
      1,
      [],
      [
        { chunkRef: 1, priority: 9 },
        { chunkRef: 0, priority: 3 },
        { chunkRef: 2, priority: 1 },
      ],
    );
    expect(fetchChunk.mock.calls.map(([path]) => path)).toEqual([pathOf(1), pathOf(0)]);

    await land(0);
    await land(1);
    stream.update(2, [0, 1], [{ chunkRef: 2, priority: 50 }]);
    expect(fetchChunk).toHaveBeenCalledTimes(2);
    expect(evict).not.toHaveBeenCalled();
  });

  it('a landed chunk is uploaded to its slot and bumps the epoch; eviction evicts the slot and bumps it again', async () => {
    const { stream, upload, evict, land } = harness(1);
    stream.update(1, [], [{ chunkRef: 0, priority: 1 }]);
    await land(0);

    expect(upload).toHaveBeenCalledOnce();
    expect(upload.mock.calls[0]![0]).toBe(0);
    expect(upload.mock.calls[0]![1]).toMatchObject({
      ref: REFS[0],
      parent: null,
      records: { count: 2 },
    });
    expect(stream.epoch()).toBe(1);
    expect(stream.resident(0)).toBe(upload.mock.calls[0]![1]);

    stream.update(2, [], [{ chunkRef: 1, priority: 1 }]);
    expect(evict).toHaveBeenCalledWith(0, null);
    expect(stream.epoch()).toBe(2);
    expect(stream.resident(0)).toBeNull();
  });

  it('a failed fetch marks the chunk failed and never re-enqueues it', async () => {
    const { stream, fetchChunk, land } = harness(1);
    stream.update(1, [], [{ chunkRef: 0, priority: 1 }]);
    await land(0, null);
    // Recycle the failed key's slot, so only the stream's own memory can refuse it.
    stream.update(2, [], [{ chunkRef: 1, priority: 1 }]);
    await land(1);
    stream.update(3, [], [{ chunkRef: 0, priority: 99 }]);

    expect(fetchChunk.mock.calls.map(([path]) => path)).toEqual([pathOf(0), pathOf(1)]);
    expect(stream.inFlightCount()).toBe(0);
    expect(stream.resident(1)).not.toBeNull();
  });

  it('an in-flight chunk evicted before landing is released, not uploaded', async () => {
    const { stream, upload, evict, land } = harness(1);
    stream.update(1, [], [{ chunkRef: 0, priority: 1 }]);
    stream.update(2, [], [{ chunkRef: 1, priority: 1 }]);
    await land(0);

    expect(upload).not.toHaveBeenCalled();
    expect(evict).not.toHaveBeenCalled();
    expect(stream.resident(0)).toBeNull();
  });
  it('evicting a parent first evicts its resident descendants, deepest first, freeing their slots', async () => {
    const { stream, fetchChunk, upload, evict, land } = harness(3);
    stream.update(1, [], [{ chunkRef: 0, priority: 1 }]);
    await land(0);
    stream.update(2, [0], [{ chunkRef: 3, priority: 1 }]);
    await land(3);
    stream.update(3, [], [{ chunkRef: 4, priority: 1 }]);
    await land(4);
    // [slot, id, parent id, the parent's slot its roots are written in]
    expect(
      upload.mock.calls.map(([slot, chunk, host]) => [slot, chunk.ref.id, chunk.parent, host]),
    ).toEqual([
      [0, 0, null, null],
      [1, 3, 0, 0],
      [2, 4, 3, 1],
    ]);

    // Chunk 0, last touched at frame 2 before its child 3 was allocated, is the LRU: its
    // descendants go first, deepest first.
    stream.update(
      4,
      [],
      [
        { chunkRef: 1, priority: 2 },
        { chunkRef: 2, priority: 1 },
      ],
    );
    expect(evict.mock.calls).toEqual([
      [2, 1],
      [1, 0],
      [0, null],
    ]);
    expect([0, 3, 4].map((id) => stream.resident(id))).toEqual([null, null, null]);
    expect(fetchChunk.mock.calls.slice(3).map(([path]) => path)).toEqual([pathOf(1), pathOf(2)]);
  });

  it('a parent touched with its child outlives it in the LRU, so one free slot costs the child, not both', async () => {
    const { stream, evict, land } = harness(3);
    stream.update(1, [], [{ chunkRef: 0, priority: 1 }]);
    await land(0);
    stream.update(
      2,
      [0],
      [
        { chunkRef: 3, priority: 2 },
        { chunkRef: 1, priority: 1 },
      ],
    );
    await land(3);
    await land(1);
    // Walk order: chunk 1, then chunk 0 and the child 3 inside it.
    stream.update(3, [1, 0, 3], []);
    stream.update(4, [], [{ chunkRef: 2, priority: 1 }]);

    expect(evict.mock.calls).toEqual([[1, 0]]);
    expect(stream.resident(0)).not.toBeNull();
    expect(stream.resident(3)).toBeNull();
  });

  it('drops a landing whose parent was evicted while it was in flight, and frees its slot', async () => {
    const { stream, fetchChunk, upload, land } = harness(2);
    stream.update(1, [], [{ chunkRef: 0, priority: 1 }]);
    await land(0);
    stream.update(2, [0], [{ chunkRef: 3, priority: 1 }]);
    stream.update(3, [], [{ chunkRef: 1, priority: 1 }]); // recycles chunk 0's slot
    await land(3);

    expect(upload.mock.calls.map(([, chunk]) => chunk.ref.id)).toEqual([0]);
    expect(stream.resident(3)).toBeNull();
    stream.update(4, [1], [{ chunkRef: 2, priority: 1 }]);
    expect(fetchChunk.mock.calls.at(-1)![0]).toBe(pathOf(2));
  });

  it('finds the resident chunk holding a record ordinal by its record base', async () => {
    const { stream, land } = harness(2);
    stream.update(1, [], [{ chunkRef: 1, priority: 1 }]);
    await land(1);
    expect(stream.residentOfRecord(12)?.ref.id).toBe(1);
    expect(stream.residentOfRecord(13)?.ref.id).toBe(1);
    expect(stream.residentOfRecord(14)).toBeNull();
  });
});
