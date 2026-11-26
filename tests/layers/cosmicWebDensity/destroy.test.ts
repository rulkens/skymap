import { describe, it, expect, vi } from 'vitest';

import { destroy } from '../../../src/layers/cosmicWebDensity/destroy';
import { createJitterMaskSlot } from '../../../src/layers/cosmicWebDensity/densityCubes/load/createJitterMaskSlot';
import type { CosmicWebDensityRuntime } from '../../../src/layers/cosmicWebDensity/@types/CosmicWebDensityRuntime';
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
    } as unknown as CosmicWebDensityRuntime);
    respond(new Response(new Uint8Array(1), { status: 200 }));
    await loaded;

    expect(writeTexture).not.toHaveBeenCalled();
  });
});
