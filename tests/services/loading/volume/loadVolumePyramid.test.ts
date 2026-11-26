/**
 * loadVolumePyramid — sidecar, one texture, levels coarse to fine, and nothing left on the GPU when
 * a load fails. A device with no features, so r8: a level's length is its texel count.
 */
import { describe, expect, it, vi } from 'vitest';
import type { VolumePyramidSidecar } from '../../../../src/@types/data/volume/VolumePyramidSidecar';
import { useFetchMock } from '../../../setup/fetchMock';

vi.mock('../../../../src/services/loading/fetchWithProgress', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  dataUrl: (path: string) => `/data/${path}`,
}));

import { HttpError } from '../../../../src/services/loading/fetchWithProgress';
import { loadVolumePyramid } from '../../../../src/services/loading/volume/loadVolumePyramid';

// Base 1: L1 8×8×4 (256 B), L2 4×4×2 (32 B), L3 2×2×1 (4 B).
const SIDECAR: VolumePyramidSidecar = {
  gridDims: [16, 16, 8],
  voxelMpc: 1,
  originMpc: [0, 0, 0],
  frame: 'equatorial-cartesian',
  dataBox: { originVox: [0, 0, 0], dims: [16, 16, 8] },
  levelMax: [4, 3, 2, 1],
};
const PREFIX = '/data/volume-pyramid/v1/tiny';
const LEVEL_BYTES = { 1: 256, 2: 32, 3: 4 };

function mockDevice() {
  const texture = { destroy: vi.fn() };
  return {
    features: new Set<string>(),
    createTexture: vi.fn(() => texture),
    queue: { writeTexture: vi.fn() },
    pushErrorScope: vi.fn(),
    popErrorScope: vi.fn<() => Promise<GPUError | null>>(() => Promise.resolve(null)),
    texture,
  };
}

type Body = (signal: AbortSignal) => BodyInit;

/** Serves the sidecar and zeroed levels of the right length; `bodies` replaces a route. */
function serve(
  fetch: { mock: ReturnType<typeof vi.fn> },
  bodies: Partial<Record<string, Body>> = {},
): void {
  const routes: Record<string, Body> = {
    [`${PREFIX}.json`]: () => JSON.stringify(SIDECAR),
    ...Object.fromEntries(
      Object.entries(LEVEL_BYTES).map(([level, n]) => [
        `${PREFIX}.r8.L${level}.bin`,
        () => new Uint8Array(n),
      ]),
    ),
    ...bodies,
  } as Record<string, Body>;
  fetch.mock.mockImplementation((url: string, init: RequestInit) =>
    Promise.resolve(new Response(routes[url]!(init.signal!), { status: 200 })),
  );
}

function load(device: ReturnType<typeof mockDevice>, signal = new AbortController().signal) {
  const progress: Array<[number, number]> = [];
  const promise = loadVolumePyramid(
    device as unknown as GPUDevice,
    { binBaseName: 'tiny', baseLevel: 1 },
    signal,
    (loaded, total) => progress.push([loaded, total]),
  );
  return { promise, progress };
}

describe('loadVolumePyramid', () => {
  const fetch = useFetchMock();

  it('levels arrive coarse to fine, each into its own mip, and the volume returns after every write check', async () => {
    serve(fetch);
    const device = mockDevice();
    let releaseLastCheck!: (error: null) => void;
    // Two pops per scoped call: creation, then L3, L2; L1's first pop is held open.
    for (let i = 0; i < 6; i++) device.popErrorScope.mockResolvedValueOnce(null);
    device.popErrorScope.mockReturnValueOnce(new Promise((r) => (releaseLastCheck = r)));

    const { promise, progress } = load(device);
    let settled = false;
    void promise.then(() => (settled = true));
    await vi.waitFor(() => expect(device.queue.writeTexture).toHaveBeenCalledTimes(3));
    await new Promise((r) => setTimeout(r, 0));
    expect(settled).toBe(false);
    releaseLastCheck(null);
    const volume = await promise;

    expect(fetch.mock.mock.calls.map(([url]) => url)).toEqual([
      `${PREFIX}.json`,
      `${PREFIX}.r8.L3.bin`,
      `${PREFIX}.r8.L2.bin`,
      `${PREFIX}.r8.L1.bin`,
    ]);
    expect(device.createTexture).toHaveBeenCalledWith({
      label: 'density-volume-tiny',
      size: { width: 8, height: 8, depthOrArrayLayers: 4 },
      mipLevelCount: 3,
      format: 'r8unorm',
      dimension: '3d',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    expect(device.queue.writeTexture.mock.calls.map(([dst]) => dst.mipLevel)).toEqual([2, 1, 0]);
    expect(device.queue.writeTexture.mock.calls[2]!.slice(2)).toEqual([
      { bytesPerRow: 8, rowsPerImage: 8 },
      { width: 8, height: 8, depthOrArrayLayers: 4 },
    ]);
    expect(progress.at(-1)).toEqual([292, 292]);
    expect(volume.texture).toBe(device.texture);
    expect(volume.placement.dims).toEqual([8, 8, 4]);
    expect(device.texture.destroy).not.toHaveBeenCalled();
  });

  it('a level of the wrong length throws and destroys the texture', async () => {
    serve(fetch, { [`${PREFIX}.r8.L2.bin`]: () => new Uint8Array(31) });
    const device = mockDevice();
    await expect(load(device).promise).rejects.toThrow(/31 of 32/);
    expect(device.texture.destroy).toHaveBeenCalledOnce();
  });

  it('an abort mid-level destroys the texture and rethrows the AbortError', async () => {
    const ctrl = new AbortController();
    // As a real fetch does: aborting errors the body stream with the signal's reason.
    serve(fetch, {
      [`${PREFIX}.r8.L1.bin`]: (signal) =>
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(100));
            signal.addEventListener('abort', () => controller.error(signal.reason));
          },
        }),
    });
    const device = mockDevice();
    const { promise, progress } = load(device, ctrl.signal);
    await vi.waitFor(() => expect(progress.at(-1)?.[0]).toBe(136));
    ctrl.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(device.texture.destroy).toHaveBeenCalledOnce();
  });

  it('a validation error on one write throws and destroys the texture', async () => {
    serve(fetch);
    const device = mockDevice();
    // Creation's two pops pass; every write's scope reports the error.
    device.popErrorScope
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ message: 'bad copy' } as GPUError);
    await expect(load(device).promise).rejects.toThrow(/bad copy/);
    expect(device.texture.destroy).toHaveBeenCalledOnce();
  });

  it('a 404 sidecar throws HttpError before any texture exists', async () => {
    fetch.mock.mockResolvedValue(new Response('', { status: 404 }));
    const device = mockDevice();
    await expect(load(device).promise).rejects.toBeInstanceOf(HttpError);
    expect(device.createTexture).not.toHaveBeenCalled();
  });
});
