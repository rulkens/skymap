/**
 * starChunkStream — one octree source's chunks over `createTileStreamSubsystem`
 * and a `SlotPool`. Keys are `String(chunkRef)`. A failed fetch is remembered
 * here, not only in the tile stream: the stream forgets a failure when LRU
 * recycles the key's slot, and a chunk missing on disk would then refetch on
 * every recycle. The root keeps drawing as a glow either way.
 */

import type { StarChunk } from '../../../@types/data/starCatalog/StarChunk';
import type { StarChunkStream } from '../@types/StarChunkStream';
import type { StarChunkStreamDeps } from '../@types/StarChunkStreamDeps';
import type { StarChunkRequest } from '../@types/StarChunkRequest';
import { SlotPool } from '../../../utils/cache/slotPool';
import { createTileStreamSubsystem } from '../../../services/engine/subsystems/tileStreamSubsystem';
import { dataUrl } from '../../../services/loading/fetchWithProgress';
import { STAR_CHUNK_CONCURRENCY } from '../../../data/starChunkStream';
import { starChunkPath } from '../../../data/octree/octreeFormat';
import { decodeOctreeChunk } from '../../../data/octree/decodeOctreeChunk';
import { starColumnsOf } from '../../../utils/star/starColumnsOf';

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
  let epoch = 0;
  // Bytes after the browser inflates them, not on the wire.
  let decodedBytes = 0;
  let fetchedChunks = 0;
  // The A/B's bytes-and-chunks readout logs once per settle: in flight back to 0 after a landing.
  let landedSinceSettle = false;

  const stream = createTileStreamSubsystem<StarChunk, SlotPool>({
    slots: new SlotPool(deps.slots),
    concurrency: STAR_CHUNK_CONCURRENCY,
    requestRender: deps.requestRender,
    upload: (_pool, slot, chunk) => {
      deps.upload(slot, chunk);
      residents.set(chunk.ref, { slot, chunk });
      epoch++;
      landedSinceSettle = true;
    },
    // A decoded chunk is plain memory: nothing to free.
    release: () => {},
  });
  // An in-flight key that is evicted wrote nothing, so only a resident one is evicted on the GPU.
  stream.setEvictHandler((key) => {
    const ref = Number(key);
    const entry = residents.get(ref);
    if (entry === undefined) return;
    residents.delete(ref);
    deps.evict(entry.slot);
    epoch++;
  });

  async function load(ref: number): Promise<StarChunk | null> {
    const buf = await fetchChunk(starChunkPath(binBaseName, octree.chunks[ref]!));
    if (buf === null) return null;
    decodedBytes += buf.byteLength;
    fetchedChunks++;
    const { header, nodes, columns } = decodeOctreeChunk(buf, octree);
    return { ref, nodes, records: starColumnsOf(columns, header.records) };
  }

  function update(
    frame: number,
    touched: readonly number[],
    requests: readonly StarChunkRequest[],
  ): void {
    // Every resident and in-flight key is stamped before any allocation, so a
    // miss can never evict a chunk this same frame still wants.
    for (const ref of touched) stream.touch(String(ref), frame);
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
          else stream.upload(key, chunk);
        },
      });
    }
    if (import.meta.env.DEV && landedSinceSettle && stream.inFlightCount() === 0) {
      landedSinceSettle = false;
      console.log(
        `[stars] ${binBaseName}: ${fetchedChunks}/${octree.chunks.length} chunks, ` +
          `${(decodedBytes / 1e6).toFixed(1)} MB decoded, ${residents.size} resident`,
      );
    }
  }

  return {
    slots: deps.slots,
    update,
    isResident: (ref) => residents.has(ref),
    resident: (ref) => residents.get(ref)?.chunk ?? null,
    inFlightCount: () => stream.inFlightCount(),
    epoch: () => epoch,
    destroy() {
      stream.destroy();
      residents.clear();
    },
  };
}
