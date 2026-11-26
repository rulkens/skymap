import { describe, it, expect, vi } from 'vitest';
import { createBlueNoiseMask } from '../../../../src/services/gpu/resources/createBlueNoiseMask';
import { useFetchMock } from '../../../setup/fetchMock';

describe('createBlueNoiseMask', () => {
  const fetch = useFetchMock();

  it('a mask destroyed while its fetch is in flight writes nothing when the bytes land', async () => {
    // Tearing the density Layer down mid-fetch left the late writeTexture aimed at a destroyed
    // texture: a WebGPU validation error in the console.
    let respond!: (r: Response) => void;
    fetch.mock.mockReturnValue(new Promise<Response>((resolve) => (respond = resolve)));
    const writeTexture = vi.fn();
    const device = {
      createTexture: vi.fn(() => ({ destroy: vi.fn() })),
      queue: { writeTexture },
    } as unknown as GPUDevice;

    const mask = createBlueNoiseMask(device);
    mask.destroy();
    respond(new Response(new Uint8Array(16).buffer, { status: 200 }));
    await mask.ready;

    expect(writeTexture).not.toHaveBeenCalled();
  });
});
