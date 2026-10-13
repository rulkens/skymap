/**
 * starCatalogSlot — the pool size handed to `renderer.upload` is the request's
 * override when set, else the tier's `slots`; a throwing upload leaves the
 * source's previous chunk stream in place.
 */

import { describe, it, expect, vi } from 'vitest';
import { createStarCatalogSlot } from '../../../../src/layers/starCatalog/load/starCatalogSlot';
import { SOURCE_REGISTRY, Source } from '../../../../src/data/sources';
import type { StarChunkStream } from '../../../../src/layers/starCatalog/@types/StarChunkStream';
import type { StarCatalogRenderer } from '../../../../src/layers/starCatalog/@types/StarCatalogRenderer';
import type { SourceType } from '../../../../src/@types/data/SourceType';

vi.mock('../../../../src/layers/starCatalog/load/starCatalogFetcher', () => ({
  starCatalogFetcher: async () => ({ starCount: 0, nodes: { count: 0 } }),
}));

function setup(upload: StarCatalogRenderer['upload']) {
  const renderer = { upload } as unknown as StarCatalogRenderer;
  const chunkStreams = new Map<SourceType, StarChunkStream>();
  const slot = createStarCatalogSlot(Source.GaiaStars, renderer, chunkStreams, () => {});
  return { slot, chunkStreams };
}

const tierSlots = (tier: 'small' | 'medium' | 'large') => {
  const entry = SOURCE_REGISTRY[Source.GaiaStars];
  if (entry.type !== 'starCatalog') throw new Error('not a star catalog');
  return entry.budgets[tier].slots;
};

describe('starCatalogSlot commit', () => {
  it('uploads with the override when set, the tier slots when null', async () => {
    const upload = vi.fn(() => 0);
    const { slot } = setup(upload);
    await slot.load({ source: Source.GaiaStars, tier: 'medium', slotsOverride: 384 });
    await slot.load({ source: Source.GaiaStars, tier: 'medium', slotsOverride: null });
    expect(upload.mock.calls.map((c: unknown[]) => c[2])).toEqual([384, tierSlots('medium')]);
  });

  it('keeps the previous chunk stream when the upload throws', async () => {
    const destroy = vi.fn();
    const upload = vi.fn<StarCatalogRenderer['upload']>().mockImplementation(() => {
      throw new Error('pool past cap');
    });
    const { slot, chunkStreams } = setup(upload);
    chunkStreams.set(Source.GaiaStars, { destroy } as unknown as StarChunkStream);
    await slot.load({ source: Source.GaiaStars, tier: 'medium', slotsOverride: 512 });
    expect(destroy).not.toHaveBeenCalled();
    expect(chunkStreams.has(Source.GaiaStars)).toBe(true);
  });
});
