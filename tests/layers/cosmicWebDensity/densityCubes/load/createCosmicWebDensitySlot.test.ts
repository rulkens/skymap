/** createCosmicWebDensitySlot — release frees exactly this row's cube on the shared renderer. */

import { describe, expect, it, vi } from 'vitest';

import { createCosmicWebDensitySlot } from '../../../../../src/layers/cosmicWebDensity/densityCubes/load/createCosmicWebDensitySlot';
import { COSMIC_WEB_DENSITY_SOURCE_ROWS } from '../../../../../src/layers/cosmicWebDensity/sources/cosmicWebDensitySourceRows';
import type { VolumeFieldRenderer } from '../../../../../src/@types/rendering/VolumeFieldRenderer';
import type { CosmicWebDensityFieldId } from '../../../../../src/layers/cosmicWebDensity/@types/CosmicWebDensityFieldId';

vi.mock(
  '../../../../../src/layers/cosmicWebDensity/densityCubes/load/cosmicWebDensityFetcher',
  () => ({
    cosmicWebDensityFetcher: async () => ({}),
  }),
);

describe('createCosmicWebDensitySlot', () => {
  it("release() unloads the row's own cube", async () => {
    const renderer = {
      upload: vi.fn(),
      unload: vi.fn(),
    } as unknown as VolumeFieldRenderer<CosmicWebDensityFieldId>;
    const entry = COSMIC_WEB_DENSITY_SOURCE_ROWS[1];
    const slot = createCosmicWebDensitySlot(entry, renderer, Promise.resolve());

    void slot.load({ binBaseName: entry.binBaseName });
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));
    slot.release();

    expect(renderer.unload).toHaveBeenCalledExactlyOnceWith(entry.id);
  });

  // A cube drawn before the mask lands marches with zero jitter: a visible step grid.
  it('a cube commits only after the jitter mask is written', async () => {
    const renderer = {
      upload: vi.fn(),
      unload: vi.fn(),
    } as unknown as VolumeFieldRenderer<CosmicWebDensityFieldId>;
    let maskWritten!: () => void;
    const jitterMaskReady = new Promise<void>((resolve) => (maskWritten = resolve));
    const entry = COSMIC_WEB_DENSITY_SOURCE_ROWS[1];
    const slot = createCosmicWebDensitySlot(entry, renderer, jitterMaskReady);

    void slot.load({ binBaseName: entry.binBaseName });
    await vi.waitFor(() => expect(slot.state().kind).toBe('committing'));
    expect(renderer.upload).not.toHaveBeenCalled();

    maskWritten();
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));
    expect(renderer.upload).toHaveBeenCalledOnce();
  });
});
