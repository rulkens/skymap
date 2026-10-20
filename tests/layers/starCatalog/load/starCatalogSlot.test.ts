/**
 * starCatalogSlot + resizeStarPools — the pool size handed to `renderer.upload` is
 * the override when set, else the tier's `slots`; a resize reuses the loaded
 * octree (no refetch); a refused size keeps the previous stream.
 */

import { describe, it, expect, vi } from 'vitest';
import { createStarCatalogSlot } from '../../../../src/layers/starCatalog/load/starCatalogSlot';
import { resizeStarPools } from '../../../../src/layers/starCatalog/load/resizeStarPools';
import { SOURCE_REGISTRY, Source } from '../../../../src/data/sources';
import type { OctreeChunkStream } from '../../../../src/@types/octree/OctreeChunkStream';
import type { StarCatalogRuntime } from '../../../../src/layers/starCatalog/@types/StarCatalogRuntime';
import type { StarCatalogRenderer } from '../../../../src/layers/starCatalog/@types/StarCatalogRenderer';
import type { SourceType } from '../../../../src/@types/data/SourceType';
import type { StarColumns } from '../../../../src/@types/data/starCatalog/StarColumns';

const fetchSpy = vi.hoisted(() => vi.fn(async () => ({ recordCount: 0, nodes: { count: 0 } })));
vi.mock('../../../../src/layers/starCatalog/load/starCatalogFetcher', () => ({
  starCatalogFetcher: fetchSpy,
}));

const POOL_CAP = 256;

function setup(override: { value: number | null }) {
  const upload = vi.fn<StarCatalogRenderer['upload']>((_s, _o, slots) => {
    if (slots > POOL_CAP) throw new Error(`only ${POOL_CAP} slots fit`);
    return 0;
  });
  const chunkStreams = new Map<SourceType, OctreeChunkStream<StarColumns>>();
  const host = {
    renderer: { upload } as unknown as StarCatalogRenderer,
    chunkStreams,
    requestRender: () => {},
  };
  const slot = createStarCatalogSlot(Source.GaiaStars, host, () => override.value);
  const runtime = { poolHost: host, catalogs: new Map([[Source.GaiaStars, slot]]) };
  return { slot, upload, chunkStreams, runtime: runtime as unknown as StarCatalogRuntime };
}

const REQ = { source: Source.GaiaStars, tier: 'medium' } as const;
const tierSlots = () => {
  const entry = SOURCE_REGISTRY[Source.GaiaStars];
  if (entry.type !== 'starCatalog') throw new Error('not a star catalog');
  return entry.budgets.medium.slots;
};

describe('starCatalogSlot commit', () => {
  it('honours an override set before the load, else uses the tier slots', async () => {
    const override = { value: 384 as number | null };
    const { slot, upload } = setup(override);
    await slot.load(REQ);
    override.value = null;
    await slot.load(REQ);
    expect(upload.mock.calls.map((c) => c[2])).toEqual([384, tierSlots()]);
  });
});

describe('resizeStarPools', () => {
  it('re-installs the loaded octree at the new size without fetching', async () => {
    const { slot, upload, runtime } = setup({ value: null });
    await slot.load(REQ);
    fetchSpy.mockClear();
    expect(resizeStarPools(runtime, 128)).toBeNull();
    expect(upload.mock.calls.at(-1)![2]).toBe(128);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns the error and keeps the old stream for an over-cap size, then clears on a valid one', async () => {
    const { slot, chunkStreams, runtime } = setup({ value: null });
    await slot.load(REQ);
    const destroy = vi.fn();
    chunkStreams.set(Source.GaiaStars, { destroy } as unknown as OctreeChunkStream<StarColumns>);
    expect(resizeStarPools(runtime, 512)).toBe(`only ${POOL_CAP} slots fit`);
    expect(destroy).not.toHaveBeenCalled();
    expect(chunkStreams.has(Source.GaiaStars)).toBe(true);
    expect(resizeStarPools(runtime, 128)).toBeNull();
    expect(destroy).toHaveBeenCalledOnce();
  });
});
