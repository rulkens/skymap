/**
 * The chunk stream over a stubbed fetch: request order under a full pool, the
 * landing and eviction writes it drives, and the two ways a fetch can come to
 * nothing (failed, or evicted before it landed).
 */
import { describe, it, expect, vi } from 'vitest';

import { createStarChunkStream } from '../../../../src/layers/starCatalog/load/starChunkStream';
import {
  NO_CHUNK_REF,
  STAR_COLUMN_SCHEMA,
  starChunkPath,
} from '../../../../src/data/octree/octreeFormat';
import { encodeOctreeObject } from '../../../../tools/octree/encodeOctreeObject';
import type { StarOctree } from '../../../../src/@types/data/starCatalog/StarOctree';
import type { OctreeChunkRef } from '../../../../src/@types/octree/OctreeChunkRef';
import type { ColumnId } from '../../../../src/@types/octree/ColumnId';
import type { OctreeRawColumn } from '../../../../tools/@types/octree/OctreeRawColumn';

const CHUNKS: readonly OctreeChunkRef[] = [0, 1, 2].map((morton) => ({
  level: 3,
  morton,
  roots: [morton],
  hash: `hash000${morton}`,
  bytes: 0,
  nodes: 1,
  records: 2,
}));

// The stream reads only the manifest and the schema a chunk decodes against.
const OCTREE = { chunks: CHUNKS, columns: STAR_COLUMN_SCHEMA } as unknown as StarOctree;

/** Chunk `ref` as its object: one level-2 row owning two records. */
function chunkBytes(ref: number): ArrayBuffer {
  const { level, morton } = CHUNKS[ref]!;
  const bytes = encodeOctreeObject(
    { kind: 'chunk', level, morton, nodes: 1, records: 2 },
    {
      count: 1,
      morton: new Uint32Array([morton * 8]),
      level: new Uint8Array([level - 1]),
      childMask: new Uint8Array([0]),
      firstRecord: new Uint32Array([0]),
      ownCount: new Uint32Array([2]),
      blobCount: new Uint32Array([0]),
      chunkRef: new Uint32Array([NO_CHUNK_REF]),
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

const pathOf = (ref: number) => starChunkPath('stars', CHUNKS[ref]!);
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A stream whose fetches wait until the test resolves them by chunk ref. */
function harness(slots: number) {
  const pending = new Map<string, (buf: ArrayBuffer | null) => void>();
  const fetchChunk = vi.fn(
    (path: string) => new Promise<ArrayBuffer | null>((resolve) => pending.set(path, resolve)),
  );
  const upload = vi.fn();
  const evict = vi.fn();
  const stream = createStarChunkStream({
    octree: OCTREE,
    binBaseName: 'stars',
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

describe('starChunkStream', () => {
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
    expect(upload.mock.calls[0]![1]).toMatchObject({ ref: 0, records: { count: 2 } });
    expect(stream.epoch()).toBe(1);
    expect(stream.resident(0)).toBe(upload.mock.calls[0]![1]);

    stream.update(2, [], [{ chunkRef: 1, priority: 1 }]);
    expect(evict).toHaveBeenCalledWith(0);
    expect(stream.epoch()).toBe(2);
    expect(stream.isResident(0)).toBe(false);
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
    expect(stream.isResident(1)).toBe(true);
  });

  it('an in-flight chunk evicted before landing is released, not uploaded', async () => {
    const { stream, upload, evict, land } = harness(1);
    stream.update(1, [], [{ chunkRef: 0, priority: 1 }]);
    stream.update(2, [], [{ chunkRef: 1, priority: 1 }]);
    await land(0);

    expect(upload).not.toHaveBeenCalled();
    expect(evict).not.toHaveBeenCalled();
    expect(stream.isResident(0)).toBe(false);
  });
});
