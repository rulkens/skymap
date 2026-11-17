/** constellationsSlot — release frees the renderer's instance buffer. */

import { describe, expect, it, vi } from 'vitest';

import { createConstellationsSlot } from '../../../../../src/layers/constellations/figures/load/constellationsSlot';
import type { ConstellationRenderer } from '../../../../../src/layers/constellations/figures/@types/ConstellationRenderer';

vi.mock('../../../../../src/layers/constellations/figures/load/constellationsFetcher', () => ({
  constellationsFetcher: async () => ({}),
}));

describe('createConstellationsSlot', () => {
  it('release() clears the renderer', async () => {
    const renderer = { upload: vi.fn(), clear: vi.fn() } as unknown as ConstellationRenderer;
    const slot = createConstellationsSlot(renderer);

    void slot.load();
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));
    slot.release();

    expect(renderer.clear).toHaveBeenCalledTimes(1);
  });
});
