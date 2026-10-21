import { describe, expect, it, vi } from 'vitest';

import { installOctreePool } from '../../../src/services/octree/installOctreePool';
import type { SourceType } from '../../../src/@types/data/SourceType';
import type { Octree } from '../../../src/@types/octree/Octree';
import type { OctreeChunkStream } from '../../../src/@types/octree/OctreeChunkStream';
import type { OctreePoolHost } from '../../../src/@types/octree/OctreePoolHost';
import type { OctreePoolShape } from '../../../src/@types/octree/OctreePoolShape';

type Records = { readonly count: number };

const SOURCE = 7 as SourceType;
const FORMAT = { chunkPath: () => 'unused', decodeRecords: (): Records => ({ count: 0 }) };
// A degenerate bake (a `--limit` dev run): no index records, no chunks.
const EMPTY = { chunks: [], chunkCount: 0, records: { count: 0 } } as unknown as Octree<Records>;
const NO_RUNS = { total: 0, minRun: 1, maxRun: 1 };
const NO_POOL: OctreePoolShape = { slots: 0, records: NO_RUNS, nodes: NO_RUNS };

function hostWith(upload: () => void, previous: OctreeChunkStream<Records>) {
  const host: OctreePoolHost<Records> = {
    renderer: { upload, uploadChunk: vi.fn(), evictChunk: vi.fn() },
    chunkStreams: new Map([[SOURCE, previous]]),
    requestRender: () => {},
  };
  return host;
}

describe('installOctreePool', () => {
  it('a zero-chunk index installs no stream and replaces the previous one', () => {
    const destroy = vi.fn();
    const host = hostWith(() => {}, {
      destroy,
    } as unknown as OctreeChunkStream<Records>);

    installOctreePool(host, SOURCE, EMPTY, NO_POOL, FORMAT);

    expect(destroy).toHaveBeenCalledOnce();
    expect(host.chunkStreams.has(SOURCE)).toBe(false);
  });

  it('a renderer that throws leaves the previous stream installed', () => {
    const destroy = vi.fn();
    const previous = { destroy } as unknown as OctreeChunkStream<Records>;
    const host = hostWith(() => {
      throw new Error('past the pool cap');
    }, previous);

    expect(() => installOctreePool(host, SOURCE, EMPTY, NO_POOL, FORMAT)).toThrow(
      'past the pool cap',
    );

    expect(destroy).not.toHaveBeenCalled();
    expect(host.chunkStreams.get(SOURCE)).toBe(previous);
  });
});
