import { describe, it, expect, vi, afterEach } from 'vitest';

import { createJitterMaskSlot } from '../../../../../src/layers/cosmicWebDensity/densityCubes/load/createJitterMaskSlot';
import { useFetchMock } from '../../../../setup/fetchMock';

const WIDTH = 4;
const HEIGHT = 8;

function fakeGpu() {
  const writeTexture = vi.fn();
  const device = { queue: { writeTexture } } as unknown as GPUDevice;
  const texture = { width: WIDTH, height: HEIGHT } as unknown as GPUTexture;
  return { device, texture, writeTexture };
}

const maskResponse = (bytes: number) => new Response(new Uint8Array(bytes), { status: 200 });

describe('createJitterMaskSlot', () => {
  const fetch = useFetchMock();
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('writes the whole mask into the texture it was handed', async () => {
    fetch.mock.mockResolvedValue(maskResponse(WIDTH * HEIGHT));
    const { device, texture, writeTexture } = fakeGpu();
    const slot = createJitterMaskSlot(device, texture);

    await slot.load();

    expect(slot.state().kind).toBe('ready');
    expect(writeTexture).toHaveBeenCalledExactlyOnceWith(
      { texture },
      expect.any(ArrayBuffer),
      { bytesPerRow: WIDTH },
      [WIDTH, HEIGHT],
    );
  });

  it('a 200 with the wrong byte count is a failure, not a write', async () => {
    // An SPA fallback answering the URL with index.html is a 200 too.
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    fetch.mock.mockImplementation(() => Promise.resolve(maskResponse(512)));
    const { device, texture, writeTexture } = fakeGpu();
    const slot = createJitterMaskSlot(device, texture);

    const loaded = slot.load();
    await vi.runAllTimersAsync();
    await loaded;

    expect(slot.state().kind).toBe('error');
    expect(writeTexture).not.toHaveBeenCalled();
  });
});
