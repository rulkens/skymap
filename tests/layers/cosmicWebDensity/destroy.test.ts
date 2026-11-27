import { describe, it, expect, vi } from 'vitest';

import { destroy } from '../../../src/layers/cosmicWebDensity/destroy';
import { createJitterMaskSlot } from '../../../src/layers/cosmicWebDensity/densityCubes/load/createJitterMaskSlot';
import { createCosmicWebDensitySlot } from '../../../src/layers/cosmicWebDensity/densityCubes/load/createCosmicWebDensitySlot';
import { COSMIC_WEB_DENSITY_SOURCE_ROWS } from '../../../src/layers/cosmicWebDensity/sources/cosmicWebDensitySourceRows';
import type { CosmicWebDensityRuntime } from '../../../src/layers/cosmicWebDensity/@types/CosmicWebDensityRuntime';
import type { GpuVolume } from '../../../src/@types/rendering/GpuVolume';
import type { VolumeFieldRenderer } from '../../../src/@types/rendering/VolumeFieldRenderer';
import type { CosmicWebDensityFieldId } from '../../../src/layers/cosmicWebDensity/@types/CosmicWebDensityFieldId';
import { useFetchMock } from '../../setup/fetchMock';

describe('cosmicWebDensity destroy', () => {
  const fetch = useFetchMock();

  it('a Layer torn down while the jitter mask is in flight writes nothing when the bytes land', async () => {
    // A late writeTexture aimed at the destroyed mask is a WebGPU validation error.
    let respond!: (r: Response) => void;
    fetch.mock.mockReturnValue(new Promise<Response>((resolve) => (respond = resolve)));
    const writeTexture = vi.fn();
    const device = { queue: { writeTexture } } as unknown as GPUDevice;
    const jitterMask = { width: 1, height: 1, destroy: vi.fn() } as unknown as GPUTexture;
    const jitterMaskSlot = createJitterMaskSlot(device, jitterMask);
    const loaded = jitterMaskSlot.load();

    destroy({
      renderer: { destroy: vi.fn() },
      upsample: { destroy: vi.fn() },
      jitterMask,
      jitterMaskSlot,
      slots: {},
      regions: { destroy: vi.fn() },
    } as unknown as CosmicWebDensityRuntime);
    respond(new Response(new Uint8Array(1), { status: 200 }));
    await loaded;

    expect(writeTexture).not.toHaveBeenCalled();
  });

  it('a Layer torn down while a cube is in flight uploads nothing and destroys the late volume', async () => {
    const entry = COSMIC_WEB_DENSITY_SOURCE_ROWS[0];
    const renderer = {
      upload: vi.fn(),
      unload: vi.fn(),
      destroy: vi.fn(),
    } as unknown as VolumeFieldRenderer<CosmicWebDensityFieldId>;
    const volume = { texture: { destroy: vi.fn() } } as unknown as GpuVolume;
    let arrive!: (v: GpuVolume) => void;
    const slot = createCosmicWebDensitySlot(entry, {
      renderer,
      fetch: () => new Promise<GpuVolume>((resolve) => (arrive = resolve)),
    });
    const loaded = slot.load({ storage: 'scfd', binBaseName: entry.binBaseName });
    await vi.waitFor(() => expect(arrive).toBeDefined());

    destroy({
      renderer,
      upsample: { destroy: vi.fn() },
      jitterMask: { destroy: vi.fn() },
      jitterMaskSlot: { release: vi.fn() },
      slots: { [entry.id]: slot },
      regions: { destroy: vi.fn() },
    } as unknown as CosmicWebDensityRuntime);
    arrive(volume);
    await loaded;

    expect(renderer.upload).not.toHaveBeenCalled();
    expect(volume.texture.destroy).toHaveBeenCalledOnce();
  });

  it('the regions are destroyed before the renderer', () => {
    // A region detaches its texture from the renderer before freeing it; a destroyed renderer first
    // would leave that call on a dead object.
    const order: string[] = [];
    destroy({
      renderer: { destroy: () => order.push('renderer') },
      upsample: { destroy: vi.fn() },
      jitterMask: { destroy: vi.fn() },
      jitterMaskSlot: { release: vi.fn() },
      slots: {},
      regions: { destroy: () => order.push('regions') },
    } as unknown as CosmicWebDensityRuntime);
    expect(order).toEqual(['regions', 'renderer']);
  });
});
