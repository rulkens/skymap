import { describe, it, expect, vi, afterEach } from 'vitest';
import { createBlueNoiseMask } from '../../../../src/services/gpu/resources/createBlueNoiseMask';
import {
  BLUE_NOISE_MASK_SIZE,
  BLUE_NOISE_MASK_SLICES,
} from '../../../../src/data/volume/blueNoiseMask';
import { useFetchMock } from '../../../setup/fetchMock';

const MASK_BYTES = BLUE_NOISE_MASK_SIZE * BLUE_NOISE_MASK_SIZE * BLUE_NOISE_MASK_SLICES;

function fakeDevice() {
  const writeTexture = vi.fn();
  const device = {
    createTexture: vi.fn(() => ({ destroy: vi.fn() })),
    queue: { writeTexture },
  } as unknown as GPUDevice;
  return { device, writeTexture };
}

const maskResponse = (bytes = MASK_BYTES) =>
  new Response(new Uint8Array(bytes).buffer, { status: 200 });

describe('createBlueNoiseMask', () => {
  const fetch = useFetchMock();
  afterEach(() => vi.useRealTimers());

  it('a mask destroyed while its fetch is in flight writes nothing when the bytes land', async () => {
    // Tearing the density Layer down mid-fetch left the late writeTexture aimed at a destroyed
    // texture: a WebGPU validation error in the console.
    let respond!: (r: Response) => void;
    fetch.mock.mockReturnValue(new Promise<Response>((resolve) => (respond = resolve)));
    const { device, writeTexture } = fakeDevice();

    const mask = createBlueNoiseMask(device);
    mask.destroy();
    respond(maskResponse());
    await mask.ready;

    expect(writeTexture).not.toHaveBeenCalled();
  });

  it('a fetch that fails once is retried and the mask is written', async () => {
    // One failed boot fetch used to leave `ready` rejected, and with it every density commit.
    vi.useFakeTimers();
    fetch.mock.mockRejectedValueOnce(new TypeError('network')).mockResolvedValue(maskResponse());
    const { device, writeTexture } = fakeDevice();

    const mask = createBlueNoiseMask(device);
    await vi.runAllTimersAsync();
    await mask.ready;

    expect(writeTexture).toHaveBeenCalledTimes(1);
  });

  it('a fetch that always fails still resolves ready, warning once', async () => {
    vi.useFakeTimers();
    fetch.mock.mockRejectedValue(new TypeError('network'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { device, writeTexture } = fakeDevice();

    const mask = createBlueNoiseMask(device);
    await vi.runAllTimersAsync();
    await expect(mask.ready).resolves.toBeUndefined();

    expect(writeTexture).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('a 200 with the wrong byte length is a failure, not a write', async () => {
    // An SPA fallback answering the URL with index.html is a 200 too.
    vi.useFakeTimers();
    fetch.mock.mockImplementation(() => Promise.resolve(maskResponse(512)));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { device, writeTexture } = fakeDevice();

    const mask = createBlueNoiseMask(device);
    await vi.runAllTimersAsync();
    await mask.ready;

    expect(writeTexture).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
