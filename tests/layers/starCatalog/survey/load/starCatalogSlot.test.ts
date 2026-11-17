/**
 * starCatalogSlot + resizeStarPools — the pool size handed to `renderer.upload` is
 * the override when set, else the tier's `slots`; a resize reuses the loaded
 * octree (no refetch); a refused size keeps the previous stream.
 */

import { describe, it, expect, vi } from 'vitest';
import { createStarCatalogSlot } from '../../../../../src/layers/starCatalog/survey/load/starCatalogSlot';
import { resizeStarPools } from '../../../../../src/layers/starCatalog/survey/load/resizeStarPools';
import { STAR_CATALOG_SOURCE_RECORD } from '../../../../../src/layers/starCatalog/sources/starCatalogSourceRecord';
import type { OctreeChunkStream } from '../../../../../src/@types/octree/OctreeChunkStream';
import type { StarCatalogRuntime } from '../../../../../src/layers/starCatalog/@types/StarCatalogRuntime';
import type { StarCatalogRenderer } from '../../../../../src/layers/starCatalog/survey/@types/StarCatalogRenderer';
import type { StarCatalogId } from '../../../../../src/layers/starCatalog/@types/StarCatalogId';
import type { StarColumns } from '../../../../../src/layers/starCatalog/survey/@types/StarColumns';

const fetchSpy = vi.hoisted(() => vi.fn(async () => ({ recordCount: 0, nodes: { count: 0 } })));
vi.mock('../../../../../src/layers/starCatalog/survey/load/starCatalogFetcher', () => ({
  starCatalogFetcher: fetchSpy,
}));

const POOL_CAP = 256;

function setup(override: { value: number | null }) {
  const upload = vi.fn<StarCatalogRenderer['upload']>((_s, _o, slots) => {
    if (slots > POOL_CAP) throw new Error(`only ${POOL_CAP} slots fit`);
    return 0;
  });
  const release = vi.fn<StarCatalogRenderer['release']>();
  const chunkStreams = new Map<StarCatalogId, OctreeChunkStream<StarColumns>>();
  const host = {
    renderer: { upload, release } as unknown as StarCatalogRenderer,
    chunkStreams,
    requestRender: () => {},
  };
  const slot = createStarCatalogSlot('gaiaStars', host, () => override.value);
  const runtime = { poolHost: host, catalogs: new Map([['gaiaStars', slot]]) };
  return { slot, upload, release, chunkStreams, runtime: runtime as unknown as StarCatalogRuntime };
}

const REQ = { source: 'gaiaStars', tier: 'medium' } as const;
const tierSlots = () => {
  return STAR_CATALOG_SOURCE_RECORD['gaiaStars'].budgets.medium.slots;
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

describe('starCatalogSlot release', () => {
  it("frees the catalog's GPU buffers, not just its chunk stream", async () => {
    const { slot, release } = setup({ value: null });
    await slot.load(REQ);
    slot.release();
    expect(release).toHaveBeenCalledExactlyOnceWith('gaiaStars');
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
    chunkStreams.set('gaiaStars', { destroy } as unknown as OctreeChunkStream<StarColumns>);
    expect(resizeStarPools(runtime, 512)).toBe(`only ${POOL_CAP} slots fit`);
    expect(destroy).not.toHaveBeenCalled();
    expect(chunkStreams.has('gaiaStars')).toBe(true);
    expect(resizeStarPools(runtime, 128)).toBeNull();
    expect(destroy).toHaveBeenCalledOnce();
  });
});
