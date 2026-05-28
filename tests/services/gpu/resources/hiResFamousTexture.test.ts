import { describe, it, expect, vi } from 'vitest';
import { createHiResFamousTexture } from '../../../../src/services/gpu/resources/hiResFamousTexture';

/**
 * Minimal GPUDevice double that records the calls we care about.
 *
 * We don't exercise real WebGPU — just enough surface for
 * `initTexture` → `createTexture`, `uploadBitmap` →
 * `queue.copyExternalImageToTexture`, and `getTextureView` →
 * `texture.createView`.  Each spy is a `vi.fn()` so tests can assert
 * the call shape (especially the `dimension: '2d-array'` on the view).
 */
const makeFakeDevice = () => {
  const createView = vi.fn((descriptor?: GPUTextureViewDescriptor) => ({
    descriptor,
    __view: true,
  }));
  const textureDestroy = vi.fn();
  const fakeTexture = {
    createView,
    destroy: textureDestroy,
    __texture: true,
  };
  const createTexture = vi.fn((_desc: GPUTextureDescriptor) => fakeTexture);
  const copyExternalImageToTexture = vi.fn();
  const device = {
    createTexture,
    queue: { copyExternalImageToTexture },
  } as unknown as GPUDevice;
  return { device, createTexture, copyExternalImageToTexture, createView, textureDestroy, fakeTexture };
};

const LAYER_SIDE = 1024;
const LAYER_COUNT = 8;

describe('HiResFamousTexture', () => {
  it('allocate returns sequential layers under capacity', () => {
    const { device } = makeFakeDevice();
    const h = createHiResFamousTexture({ device, layerSide: LAYER_SIDE, layerCount: LAYER_COUNT });
    expect(h.allocate('g-1', 100)).toBe(0);
    expect(h.allocate('g-2', 100)).toBe(1);
    expect(h.allocate('g-3', 100)).toBe(2);
  });

  it('allocate returns the existing layer for a repeat key', () => {
    const { device } = makeFakeDevice();
    const h = createHiResFamousTexture({ device, layerSide: LAYER_SIDE, layerCount: LAYER_COUNT });
    const first = h.allocate('g-x', 100);
    expect(h.allocate('g-x', 50)).toBe(first);
    expect(h.allocate('g-x', 9999)).toBe(first);
  });

  it('allocate evicts the LRU-by-recent-apparent-diameter layer when full', () => {
    const { device } = makeFakeDevice();
    const h = createHiResFamousTexture({ device, layerSide: LAYER_SIDE, layerCount: LAYER_COUNT });
    // Fill 8 layers with the diameters from the task description:
    // 250, 240, 230, 220, 210, 290, 280, 270 — index 4 (210) is the smallest.
    const diameters = [250, 240, 230, 220, 210, 290, 280, 270];
    diameters.forEach((px, i) => {
      expect(h.allocate(`g-${i}`, px)).toBe(i);
    });
    // 9th allocate must evict layer 4 (key 'g-4', diameter 210).
    const newLayer = h.allocate('g-new', 999);
    expect(newLayer).toBe(4);
    expect(h.layerForKey('g-4')).toBeUndefined();
    expect(h.layerForKey('g-new')).toBe(4);
  });

  it('release frees the layer for re-allocation', () => {
    const { device } = makeFakeDevice();
    const h = createHiResFamousTexture({ device, layerSide: LAYER_SIDE, layerCount: LAYER_COUNT });
    const layer = h.allocate('g-z', 100);
    h.release('g-z');
    expect(h.layerForKey('g-z')).toBeUndefined();
    expect(h.allocate('g-w', 100)).toBe(layer);
  });

  it('markFailed + isFailed survive multiple ticks', () => {
    const { device } = makeFakeDevice();
    const h = createHiResFamousTexture({ device, layerSide: LAYER_SIDE, layerCount: LAYER_COUNT });
    h.allocate('g-fail', 100);
    expect(h.isFailed('g-fail')).toBe(false);
    h.markFailed('g-fail');
    expect(h.isFailed('g-fail')).toBe(true);
    // touch should not clear the failed flag — the diameter signal is
    // independent of the load-status signal.
    h.touch('g-fail', 200);
    expect(h.isFailed('g-fail')).toBe(true);
    h.touch('g-fail', 50);
    expect(h.isFailed('g-fail')).toBe(true);
  });

  it('setEvictHandler is fired BEFORE the slot is overwritten', () => {
    const { device } = makeFakeDevice();
    const h = createHiResFamousTexture({ device, layerSide: LAYER_SIDE, layerCount: LAYER_COUNT });
    // Record what layerForKey returns for the evicted key at the moment
    // the handler fires — must still be the old layer index.
    let observedLayerAtEvict: number | undefined = -999;
    h.setEvictHandler((evictedKey) => {
      observedLayerAtEvict = h.layerForKey(evictedKey);
    });
    const diameters = [250, 240, 230, 220, 210, 290, 280, 270];
    diameters.forEach((px, i) => h.allocate(`g-${i}`, px));
    h.allocate('g-new', 999);
    // 'g-4' (smallest diameter) was the eviction victim, and at the
    // moment the handler fired its layer mapping must STILL point to
    // layer 4 (the handler runs before the overwrite).
    expect(observedLayerAtEvict).toBe(4);
  });

  it('uploadBitmap on a real (mocked) device dispatches copyExternalImageToTexture with [0,0,layerIdx] origin', () => {
    const { device, copyExternalImageToTexture, fakeTexture } = makeFakeDevice();
    const h = createHiResFamousTexture({ device, layerSide: LAYER_SIDE, layerCount: LAYER_COUNT });
    h.initTexture();
    const fakeBitmap = { __bitmap: true } as unknown as ImageBitmap;
    h.uploadBitmap(3, fakeBitmap);
    expect(copyExternalImageToTexture).toHaveBeenCalledTimes(1);
    const [source, dest, copySize] = copyExternalImageToTexture.mock.calls[0]!;
    expect(source).toEqual({ source: fakeBitmap, flipY: false });
    expect(dest).toEqual({ texture: fakeTexture, origin: [0, 0, 3] });
    expect(copySize).toEqual([LAYER_SIDE, LAYER_SIDE, 1]);
  });

  it('getTextureView is built with dimension "2d-array"', () => {
    const { device, createView } = makeFakeDevice();
    const h = createHiResFamousTexture({ device, layerSide: LAYER_SIDE, layerCount: LAYER_COUNT });
    h.initTexture();
    h.getTextureView();
    expect(createView).toHaveBeenCalledTimes(1);
    const [descriptor] = createView.mock.calls[0]!;
    expect(descriptor?.dimension).toBe('2d-array');
  });

  // ── extra coverage for invariants the contract requires ─────────────
  it('initTexture is idempotent', () => {
    const { device, createTexture } = makeFakeDevice();
    const h = createHiResFamousTexture({ device, layerSide: LAYER_SIDE, layerCount: LAYER_COUNT });
    h.initTexture();
    h.initTexture();
    expect(createTexture).toHaveBeenCalledTimes(1);
  });

  it('initTexture sizes the texture as [layerSide, layerSide, layerCount] and uses srgb format', () => {
    const { device, createTexture } = makeFakeDevice();
    const h = createHiResFamousTexture({ device, layerSide: LAYER_SIDE, layerCount: LAYER_COUNT });
    h.initTexture();
    const desc = createTexture.mock.calls[0]![0] as GPUTextureDescriptor;
    expect(desc.size).toEqual([LAYER_SIDE, LAYER_SIDE, LAYER_COUNT]);
    expect(desc.format).toBe('rgba8unorm-srgb');
    // Must include TEXTURE_BINDING | COPY_DST | RENDER_ATTACHMENT.
    // RENDER_ATTACHMENT is required by `copyExternalImageToTexture` even
    // though we never draw into the texture — the implementation may
    // use an internal render pass for sRGB / unpremul conversion. Without
    // it, uploadBitmap trips a WebGPU validation error at runtime.
    const wantBits =
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT;
    expect((desc.usage & wantBits) === wantBits).toBe(true);
  });

  it('uploadBitmap marks the entry as loaded', () => {
    const { device } = makeFakeDevice();
    const h = createHiResFamousTexture({ device, layerSide: LAYER_SIDE, layerCount: LAYER_COUNT });
    h.initTexture();
    const layer = h.allocate('g-load', 100);
    expect(h.isLoaded('g-load')).toBe(false);
    h.uploadBitmap(layer, { __bitmap: true } as unknown as ImageBitmap);
    expect(h.isLoaded('g-load')).toBe(true);
  });

  it('allocate when array is full returns -1 if no existing entry has smaller diameter', () => {
    // Eviction policy: smallest-diameter resident wins; if every
    // resident has diameter ≥ the incoming caller's, the caller isn't
    // "more deserving" than anyone present and allocation is refused.
    const { device } = makeFakeDevice();
    const h = createHiResFamousTexture({ device, layerSide: LAYER_SIDE, layerCount: LAYER_COUNT });
    // Fill with diameters 100..170 (all small).
    for (let i = 0; i < LAYER_COUNT; i++) h.allocate(`g-${i}`, 100 + i * 10);
    // Incoming diameter of 50 is smaller than every resident — refuse.
    expect(h.allocate('g-small', 50)).toBe(-1);
    // Incoming diameter equal to the smallest also refuses (strict <).
    expect(h.allocate('g-equal', 100)).toBe(-1);
    // Incoming diameter larger than the smallest evicts as normal.
    expect(h.allocate('g-bigger', 101)).toBe(0); // evicts 'g-0' (100)
  });

  it('destroy() tears down the texture and clears bookkeeping', () => {
    const { device, textureDestroy } = makeFakeDevice();
    const h = createHiResFamousTexture({ device, layerSide: LAYER_SIDE, layerCount: LAYER_COUNT });
    h.initTexture();
    h.allocate('g-1', 100);
    h.destroy();
    expect(textureDestroy).toHaveBeenCalledTimes(1);
    // After destroy(), getTextureView throws (texture is gone).
    expect(() => h.getTextureView()).toThrow();
  });

  it('mutators + accessors throw after destroy (contract: handle is unusable)', () => {
    // Stale references to a destroyed handle must fail loudly rather
    // than silently returning sentinel values — a silent -1 from
    // allocate() would crash the caller a frame later on the bogus index.
    const { device } = makeFakeDevice();
    const h = createHiResFamousTexture({ device, layerSide: LAYER_SIDE, layerCount: LAYER_COUNT });
    h.initTexture();
    h.allocate('g-1', 100);
    h.destroy();
    const expected = /handle is destroyed/;
    expect(() => h.allocate('g-2', 100)).toThrow(expected);
    expect(() => h.touch('g-1', 100)).toThrow(expected);
    expect(() => h.release('g-1')).toThrow(expected);
    expect(() => h.markFailed('g-1')).toThrow(expected);
    expect(() => h.uploadBitmap(0, { __bitmap: true } as unknown as ImageBitmap)).toThrow(expected);
    expect(() => h.getTextureView()).toThrow(expected);
  });

  it('setEvictHandler(undefined) clears the handler', () => {
    const { device } = makeFakeDevice();
    const h = createHiResFamousTexture({ device, layerSide: LAYER_SIDE, layerCount: LAYER_COUNT });
    const handler = vi.fn();
    h.setEvictHandler(handler);
    h.setEvictHandler(undefined);
    const diameters = [250, 240, 230, 220, 210, 290, 280, 270];
    diameters.forEach((px, i) => h.allocate(`g-${i}`, px));
    h.allocate('g-new', 999);
    expect(handler).not.toHaveBeenCalled();
  });
});
