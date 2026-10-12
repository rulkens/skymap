/**
 * starChunkStream — one octree source's chunks over `createTileStreamSubsystem`
 * and a `SlotPool`. Keys are `String(chunk id)`. Chunks nest: a chunk's ref is
 * learnt from its parent's header as that object decodes, a landing whose
 * parent was evicted in flight is dropped, and evicting a chunk first evicts
 * its resident descendants, so no root bit is ever written into a recycled
 * slot. A failed fetch is remembered here, not only in the tile stream: the
 * stream forgets a failure when LRU recycles the key's slot, and a chunk
 * missing on disk would then refetch on every recycle.
 */

import type { OctreeChunkRef } from '../../../@types/octree/OctreeChunkRef';
import type { StarChunk } from '../../../@types/data/starCatalog/StarChunk';
import type { StarChunkStream } from '../@types/StarChunkStream';
import type { StarChunkStreamDeps } from '../@types/StarChunkStreamDeps';
import type { StarChunkRequest } from '../@types/StarChunkRequest';
import { SlotPool } from '../../../utils/cache/slotPool';
import { createTileStreamSubsystem } from '../../../services/engine/subsystems/tileStreamSubsystem';
import { dataUrl } from '../../../services/loading/fetchWithProgress';
import { STAR_CHUNK_CONCURRENCY } from '../../../data/starChunkConcurrency';
import { starChunkPath } from '../../../data/octree/octreeFormat';
import { decodeOctreeChunk } from '../../../data/octree/decodeOctreeChunk';
import { starColumnsOf } from '../../../utils/star/starColumnsOf';

/** `parentOf` for a chunk rooted in the index. */
const IN_INDEX = -1;

async function fetchChunkBytes(path: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(dataUrl(path));
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

export function createStarChunkStream(deps: StarChunkStreamDeps): StarChunkStream {
  const { octree, binBaseName, fetchChunk = fetchChunkBytes } = deps;
  const residents = new Map<number, { slot: number; chunk: StarChunk }>();
  const failed = new Set<number>();
  // Every ref a decoded object has named, by id: immutable bake facts, so kept past eviction.
  const refs = new Array<OctreeChunkRef | undefined>(octree.chunkCount);
  const parentOf = new Int32Array(octree.chunkCount).fill(IN_INDEX);
  const learn = (named: readonly OctreeChunkRef[], parent: number) => {
    for (const ref of named) {
      refs[ref.id] = ref;
      parentOf[ref.id] = parent;
    }
  };
  learn(octree.chunks, IN_INDEX);
  let epoch = 0;
  // Bytes after the browser inflates them, not on the wire.
  let decodedBytes = 0;
  let fetchedChunks = 0;
  // The A/B's bytes-and-chunks readout logs once per settle: in flight back to 0 after a landing.
  let landedSinceSettle = false;

  const pool = new SlotPool(deps.slots);
  const stream = createTileStreamSubsystem<StarChunk, SlotPool>({
    slots: pool,
    concurrency: STAR_CHUNK_CONCURRENCY,
    requestRender: deps.requestRender,
    upload: (_pool, slot, chunk) => {
      deps.upload(slot, chunk);
      residents.set(chunk.ref.id, { slot, chunk });
      epoch++;
      landedSinceSettle = true;
    },
    // A decoded chunk is plain memory: nothing to free.
    release: () => {},
  });
  // An in-flight key that is evicted wrote nothing, so only a resident one is evicted on the GPU.
  // Its resident children go first, each through the pool (so their slots free too), recursively.
  stream.setEvictHandler((key) => {
    const id = Number(key);
    const entry = residents.get(id);
    if (entry === undefined) return;
    for (const [child, { chunk }] of residents) {
      if (chunk.parent === id) pool.evict(String(child));
    }
    residents.delete(id);
    deps.evict(entry.slot);
    epoch++;
  });

  async function load(id: number): Promise<StarChunk | null> {
    const ref = refs[id]!;
    const buf = await fetchChunk(starChunkPath(binBaseName, ref));
    if (buf === null) return null;
    decodedBytes += buf.byteLength;
    fetchedChunks++;
    const { header, nodes, columns } = decodeOctreeChunk(buf, octree);
    learn(header.chunks, id);
    const parent = parentOf[id]!;
    return {
      ref,
      parent: parent === IN_INDEX ? null : parent,
      nodes,
      records: starColumnsOf(columns, header.records),
      chunks: header.chunks,
    };
  }

  function residentOfRecord(ordinal: number): StarChunk | null {
    for (const { chunk } of residents.values()) {
      const { recordBase, records } = chunk.ref;
      if (ordinal >= recordBase && ordinal < recordBase + records) return chunk;
    }
    return null;
  }

  function update(
    frame: number,
    touched: readonly number[],
    requests: readonly StarChunkRequest[],
  ): void {
    // Every resident and in-flight key is stamped before any allocation, so a
    // miss can never evict a chunk this same frame still wants.
    for (const id of touched) stream.touch(String(id), frame);
    const misses = requests.filter(
      (r) => !failed.has(r.chunkRef) && stream.touch(String(r.chunkRef), frame) === null,
    );
    for (const { chunkRef, priority } of misses) {
      const key = String(chunkRef);
      if (stream.allocate(key, frame) === null) break;
      stream.enqueueFetch({
        key,
        priority,
        fetcher: () => load(chunkRef),
        onResult: (chunk) => {
          if (chunk === null) failed.add(chunkRef);
          else if (chunk.parent !== null && !residents.has(chunk.parent)) pool.evict(key);
          else stream.upload(key, chunk);
        },
      });
    }
    if (import.meta.env.DEV && landedSinceSettle && stream.inFlightCount() === 0) {
      landedSinceSettle = false;
      console.log(
        `[stars] ${binBaseName}: ${fetchedChunks}/${octree.chunkCount} chunks, ` +
          `${(decodedBytes / 1e6).toFixed(1)} MB decoded, ${residents.size} resident`,
      );
    }
  }

  return {
    slots: deps.slots,
    update,
    hasFailed: (id) => failed.has(id),
    resident: (id) => residents.get(id)?.chunk ?? null,
    residentOfRecord,
    inFlightCount: () => stream.inFlightCount(),
    epoch: () => epoch,
    destroy() {
      stream.destroy();
      residents.clear();
    },
  };
}
