/**
 * loadEnvBrdfLut — the sidecar-json → texture upload contract, against a mocked
 * fetch + device. `bytesPerRow` is the one value nothing downstream catches: a
 * wrong stride shears the LUT into a plausible-looking but wrong reflectance,
 * with no validation error and no visible seam.
 */

import { describe, it, expect, vi } from 'vitest';
import { loadEnvBrdfLut } from '../../../../src/services/gpu/resources/loadEnvBrdfLut';
import { useFetchMock } from '../../../setup/fetchMock';

describe('loadEnvBrdfLut', () => {
  const fetch = useFetchMock();

  it('sizes the texture from the json and uploads bytesPerRow = width × 4', async () => {
    // Deliberately non-square and not the shipped 128²: a loader that hard-codes
    // either would still pass a square fixture.
    const meta = { width: 8, height: 4, format: 'rg16float', samples: 16 };
    const texels = new Uint16Array(8 * 4 * 2);
    fetch.mock.mockImplementation((url: string) =>
      Promise.resolve(
        url.endsWith('.json')
          ? new Response(JSON.stringify(meta), { status: 200 })
          : new Response(texels.buffer, { status: 200 }),
      ),
    );
    const descriptors: GPUTextureDescriptor[] = [];
    const writeTexture = vi.fn();
    const device = {
      createTexture: vi.fn((desc: GPUTextureDescriptor) => {
        descriptors.push(desc);
        return {};
      }),
      queue: { writeTexture },
    } as unknown as GPUDevice;

    await loadEnvBrdfLut(device);

    expect(descriptors).toHaveLength(1);
    expect(descriptors[0]!.size).toEqual([8, 4]);
    expect(descriptors[0]!.format).toBe('rg16float');

    const [, data, layout, size] = writeTexture.mock.calls[0]!;
    expect(layout).toEqual({ bytesPerRow: 32 });
    expect(size).toEqual([8, 4]);
    expect((data as ArrayBuffer).byteLength).toBe(texels.byteLength);
  });

  it('rejects a failed fetch instead of uploading garbage', async () => {
    // Without the status check the 404 body reaches `json()`, and boot fails on
    // an opaque parse error far from the missing file.
    fetch.mock.mockResolvedValue(new Response('not found', { status: 404 }));
    const device = { createTexture: vi.fn(), queue: { writeTexture: vi.fn() } };

    await expect(loadEnvBrdfLut(device as unknown as GPUDevice)).rejects.toThrow('envBrdf');
    expect(device.createTexture).not.toHaveBeenCalled();
  });
});
