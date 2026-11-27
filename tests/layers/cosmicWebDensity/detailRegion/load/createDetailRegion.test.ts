import { describe, it, expect, vi } from 'vitest';
import type { VolumePyramidSidecar } from '../../../../../src/@types/data/volume/VolumePyramidSidecar';
import type { VolumeFieldRenderer } from '../../../../../src/@types/rendering/VolumeFieldRenderer';
import type { CosmicWebDensityFieldId } from '../../../../../src/layers/cosmicWebDensity/@types/CosmicWebDensityFieldId';
import { ARCHIVE_FETCH_DEADLINE_MS } from '../../../../../src/data/archive/archiveFetchDeadlineMs';
import { VOLUME_PYRAMID_FORMATS } from '../../../../../src/data/volume/volumePyramidFormats';
import { DETAIL_REGION_FADE_MS } from '../../../../../src/layers/cosmicWebDensity/detailRegion/data/detailRegionFadeMs';
import { encodeArchiveIndex } from '../../../../../tools/utils/archive/encodeArchiveIndex';
import { useFetchMock } from '../../../../setup/fetchMock';

vi.mock(
  '../../../../../packages/shared/src/services/loading/fetchWithProgress',
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    dataUrl: (path: string) => `/data/${path}`,
  }),
);

import { createDetailRegion } from '../../../../../src/layers/cosmicWebDensity/detailRegion/load/createDetailRegion';

// 96³ voxels, world box [0, 96]³ Mpc: a 2 × 2 × 2 grid of bricks, all empty.
const SIDECAR: VolumePyramidSidecar = {
  gridDims: [96, 96, 96],
  voxelMpc: 1,
  originMpc: [0, 0, 0],
  frame: 'equatorial-cartesian',
  dataBox: { originVox: [0, 0, 0], dims: [96, 96, 96] },
  levelMax: [1, 1, 1, 1],
};
const ASTC = VOLUME_PYRAMID_FORMATS[0]!;
const emptyIndex = (count: number) =>
  encodeArchiveIndex(
    Array.from({ length: count }, (_, key) => ({ key, part: 0, offset: 0, length: 0 })),
    0,
  );

// Like the real fetch: never answers, rejects when its signal aborts.
const stalledFetch = (_url: string, init: RequestInit) =>
  new Promise((_, reject) =>
    init.signal!.addEventListener('abort', () => reject(init.signal!.reason)),
  );

function setup(
  fetch: { mock: ReturnType<typeof vi.fn> },
  index: Uint8Array | 'stalled',
  sidecar = SIDECAR,
) {
  const routes: Record<string, () => BodyInit> = {
    '/data/volume-pyramid/v1/mcpm.json': () => JSON.stringify(sidecar),
    '/data/volume-pyramid/v1/mcpm.astc6.L0.idx': () => index as Uint8Array<ArrayBuffer>,
  };
  fetch.mock.mockImplementation(
    index === 'stalled'
      ? stalledFetch
      : (url: string) => Promise.resolve(new Response(routes[url]!(), { status: 200 })),
  );
  const texture = { destroy: vi.fn() };
  const device = {
    features: new Set(ASTC.features),
    createTexture: vi.fn(() => texture),
    queue: { writeTexture: vi.fn() },
  };
  const renderer = { attachRegion: vi.fn() };
  const requestRender = vi.fn();
  const region = createDetailRegion({
    device: device as unknown as GPUDevice,
    renderer: renderer as unknown as VolumeFieldRenderer<CosmicWebDensityFieldId>,
    requestRender,
    id: 'mcpm',
    binBaseName: 'mcpm',
    bricksPerAxis: 2,
  });
  const landed = vi.waitFor(() => expect(requestRender).toHaveBeenCalled());
  return { device, texture, renderer, region, landed };
}

describe('createDetailRegion', () => {
  const fetch = useFetchMock();

  it("an index whose entry count is not the grid's leaves the region empty with one warning", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { device, region, landed } = setup(fetch, emptyIndex(7));
    expect(region.frame([48, 48, 48], 1000, 1, 0)).toEqual({ draw: null, busy: true });
    await landed;
    expect(region.frame([48, 48, 48], 1000, 2, 16)).toEqual({ draw: null, busy: false });
    expect(warn).toHaveBeenCalledOnce();
    expect(device.createTexture).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('an empty brick is written as the zero brick without a fetch, at most 4 per frame', async () => {
    const { device, region, landed } = setup(fetch, emptyIndex(8));
    await landed;
    region.frame([48, 48, 48], 1000, 1, 0);
    expect(device.queue.writeTexture).toHaveBeenCalledTimes(4);
    region.frame([48, 48, 48], 1000, 2, 16);
    expect(device.queue.writeTexture).toHaveBeenCalledTimes(8);
    expect(fetch.mock).toHaveBeenCalledTimes(2); // the sidecar and the index
    // An all-zero ASTC block is an error block: every block is the void-extent zero.
    const bytes = device.queue.writeTexture.mock.calls[0]![1] as Uint8Array;
    expect(bytes.byteLength).toBe(49_152);
    expect(bytes.subarray(16, 32)).toEqual(ASTC.zeroBlock);
    expect(bytes.subarray(49_136)).toEqual(ASTC.zeroBlock);
  });

  // Bug caught: a stalled load holding `busy` forever, so the planner voted awake and `settled()` hung.
  it('a stalled load gives up at the archive deadline with one warning; a teardown stays silent', async () => {
    vi.useFakeTimers();
    // Node's own AbortSignal.timeout ignores fake timers; this one rides setTimeout.
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      const c = new AbortController();
      setTimeout(() => c.abort(new DOMException('timed out', 'TimeoutError')), ms);
      return c.signal;
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const torn = setup(fetch, 'stalled');
    const stalled = setup(fetch, 'stalled');
    torn.region.destroy();
    await vi.advanceTimersByTimeAsync(ARCHIVE_FETCH_DEADLINE_MS);
    expect(stalled.region.frame([48, 48, 48], 1000, 1, 0)).toEqual({ draw: null, busy: false });
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
    timeout.mockRestore();
    vi.useRealTimers();
  });

  // Bug caught: a throwing signal leaving `loading`, and so the planner's wake vote, set.
  it('a signal that cannot be built ends the load with one warning', async () => {
    const any = vi.spyOn(AbortSignal, 'any').mockImplementation(() => {
      throw new TypeError('AbortSignal.any is not a function');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { region, landed } = setup(fetch, emptyIndex(8));
    await landed;
    expect(region.frame([48, 48, 48], 1000, 1, 0)).toEqual({ draw: null, busy: false });
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
    any.mockRestore();
  });

  // Touch before allocate is the fade's slot lock (spec §6.4): allocating first evicts a brick
  // still drawn in the box fading out, and the entering brick overwrites its slot.
  it('a brick in the box fading out keeps its slot against a wanted brick of the same residue', async () => {
    // 144 × 48 × 48 voxels: a row of three bricks, K = 2, so bricks 0 and 2 share slot 0.
    const row: VolumePyramidSidecar = {
      ...SIDECAR,
      gridDims: [144, 48, 48],
      dataBox: { originVox: [0, 0, 0], dims: [144, 48, 48] },
    };
    const { device, region, landed } = setup(fetch, emptyIndex(3), row);
    await landed;
    region.frame([10, 24, 24], 1000, 1, 0); // bricks 0 and 1 written
    region.frame([10, 24, 24], 1000, 2, 0); // the fade into [0, 2) starts
    region.frame([10, 24, 24], 1000, 3, DETAIL_REGION_FADE_MS); // and settles
    expect(device.queue.writeTexture).toHaveBeenCalledTimes(2);
    // The target moves to [1, 3): [0, 2) fades out, brick 0 still drawn, brick 2 wanted.
    region.frame([140, 24, 24], 1000, 4, DETAIL_REGION_FADE_MS);
    expect(device.queue.writeTexture).toHaveBeenCalledTimes(2);
  });

  it('teardown detaches the texture and destroys it', async () => {
    const { texture, renderer, region, landed } = setup(fetch, emptyIndex(8));
    await landed;
    expect(renderer.attachRegion).toHaveBeenCalledWith('mcpm', texture);
    region.destroy();
    expect(renderer.attachRegion).toHaveBeenLastCalledWith('mcpm', null);
    expect(texture.destroy).toHaveBeenCalledOnce();
  });
});
