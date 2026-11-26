/** createCosmicWebDensitySlot — release frees exactly this row's cube on the shared renderer. */

import { describe, expect, it, vi } from 'vitest';

import { createCosmicWebDensitySlot } from '../../../../../src/layers/cosmicWebDensity/densityCubes/load/createCosmicWebDensitySlot';
import { COSMIC_WEB_DENSITY_SOURCE_ROWS } from '../../../../../src/layers/cosmicWebDensity/sources/cosmicWebDensitySourceRows';
import type { VolumeFieldRenderer } from '../../../../../src/@types/rendering/VolumeFieldRenderer';
import type { GpuVolume } from '../../../../../src/@types/rendering/GpuVolume';
import type { CosmicWebDensityFieldId } from '../../../../../src/layers/cosmicWebDensity/@types/CosmicWebDensityFieldId';

function fakeRenderer(): VolumeFieldRenderer<CosmicWebDensityFieldId> {
  return {
    upload: vi.fn(),
    unload: vi.fn(),
  } as unknown as VolumeFieldRenderer<CosmicWebDensityFieldId>;
}

function fakeVolume(): GpuVolume {
  return { texture: { destroy: vi.fn() } } as unknown as GpuVolume;
}

const entry = COSMIC_WEB_DENSITY_SOURCE_ROWS[1];

describe('createCosmicWebDensitySlot', () => {
  it("release() unloads the row's own cube", async () => {
    const renderer = fakeRenderer();
    const slot = createCosmicWebDensitySlot(entry, {
      renderer,
      jitterMaskReady: Promise.resolve(),
      fetch: async () => fakeVolume(),
    });

    void slot.load({ binBaseName: entry.binBaseName });
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));
    slot.release();

    expect(renderer.unload).toHaveBeenCalledExactlyOnceWith(entry.id);
  });

  // A cube drawn before the mask lands marches with zero jitter: a visible step grid.
  it('a cube commits only after the jitter mask is written', async () => {
    const renderer = fakeRenderer();
    let maskWritten!: () => void;
    const jitterMaskReady = new Promise<void>((resolve) => (maskWritten = resolve));
    const slot = createCosmicWebDensitySlot(entry, {
      renderer,
      jitterMaskReady,
      fetch: async () => fakeVolume(),
    });

    void slot.load({ binBaseName: entry.binBaseName });
    await vi.waitFor(() => expect(slot.state().kind).toBe('committing'));
    expect(renderer.upload).not.toHaveBeenCalled();

    maskWritten();
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));
    expect(renderer.upload).toHaveBeenCalledOnce();
  });

  // A texture is never garbage-collected: a superseded volume dropped to the GC would leak.
  it('a superseded volume that never committed is destroyed exactly once', async () => {
    const renderer = fakeRenderer();
    const a = fakeVolume();
    const b = fakeVolume();
    const resolvers: ((v: GpuVolume) => void)[] = [];
    const slot = createCosmicWebDensitySlot(entry, {
      renderer,
      jitterMaskReady: Promise.resolve(),
      fetch: () => new Promise<GpuVolume>((resolve) => resolvers.push(resolve)),
    });

    void slot.load({ binBaseName: entry.binBaseName, tier: 'small' });
    void slot.load({ binBaseName: entry.binBaseName, tier: 'large' });
    await vi.waitFor(() => expect(resolvers).toHaveLength(2));
    resolvers[1]!(b);
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));
    resolvers[0]!(a);

    await vi.waitFor(() => expect(a.texture.destroy).toHaveBeenCalledOnce());
    expect(b.texture.destroy).not.toHaveBeenCalled();
    expect(renderer.upload).toHaveBeenCalledExactlyOnceWith(entry.id, b, entry);
  });
});
