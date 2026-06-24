import { describe, it, expect, vi } from 'vitest';
import { createNfwLensLutTexture } from '../../../../src/services/gpu/resources/createNfwLensLutTexture';
import { buildNfwLensLut } from '../../../../src/utils/lensing/buildNfwLensLut';

/**
 * Minimal GPUDevice double that records the calls we care about.
 *
 * We don't exercise real WebGPU — just enough surface for
 * `createTexture`, `queue.writeTexture`, `texture.createView`, and
 * `device.createSampler`. Each spy is typed so tsc does not reject the
 * `vi.fn<...>()` signatures that the project convention requires.
 */
function makeFakeDevice() {
  const textureDestroy = vi.fn<() => void>();
  const createView = vi.fn<() => object>(() => ({ __view: true }));
  const fakeTexture = {
    createView,
    destroy: textureDestroy,
    __texture: true,
  };
  const createTexture = vi.fn<(desc: GPUTextureDescriptor) => typeof fakeTexture>(
    (_desc) => fakeTexture,
  );
  const writeTexture = vi.fn<
    (
      destination: GPUImageCopyTexture,
      data: BufferSource,
      dataLayout: GPUImageDataLayout,
      size: GPUExtent3DStrict,
    ) => void
  >();
  const createSampler = vi.fn<(desc?: GPUSamplerDescriptor) => object>(() => ({
    __sampler: true,
  }));

  const device = {
    createTexture,
    createSampler,
    queue: { writeTexture },
  } as unknown as GPUDevice;

  return { device, createTexture, writeTexture, createSampler, textureDestroy, fakeTexture };
}

// A tiny real LUT — small enough for unit tests to be fast, large enough that
// width*height*4 f16 values are written. Using the real buildNfwLensLut here
// exercises the actual f32→f16 path rather than a synthetic fixture.
const lut = buildNfwLensLut(4, 2, 2.0, 3.0);

describe('createNfwLensLutTexture', () => {
  it('allocates an N×M rgba16float texture', () => {
    const { device, createTexture } = makeFakeDevice();

    createNfwLensLutTexture(device, lut);

    expect(createTexture).toHaveBeenCalledTimes(1);
    const [desc] = createTexture.mock.calls[0]!;
    expect(desc.format).toBe('rgba16float');
    expect(desc.size).toEqual([lut.width, lut.height, 1]);
    expect(desc.dimension).toBe('2d');
  });

  it('writes width*height*4 f16 values', () => {
    const { device, writeTexture } = makeFakeDevice();

    createNfwLensLutTexture(device, lut);

    expect(writeTexture).toHaveBeenCalledTimes(1);
    const [, data, layout] = writeTexture.mock.calls[0]!;
    // The data buffer must be a Uint16Array of length width*height*4.
    expect(data).toBeInstanceOf(Uint16Array);
    expect((data as Uint16Array).length).toBe(lut.width * lut.height * 4);
    // bytesPerRow = width * 4 channels * 2 bytes/f16.
    expect((layout as GPUImageDataLayout).bytesPerRow).toBe(lut.width * 4 * 2);
  });

  it('the sampler is clamp-to-edge linear', () => {
    const { device, createSampler } = makeFakeDevice();

    createNfwLensLutTexture(device, lut);

    expect(createSampler).toHaveBeenCalledTimes(1);
    const [desc] = createSampler.mock.calls[0]!;
    expect((desc as GPUSamplerDescriptor).magFilter).toBe('linear');
    expect((desc as GPUSamplerDescriptor).minFilter).toBe('linear');
    expect((desc as GPUSamplerDescriptor).addressModeU).toBe('clamp-to-edge');
    expect((desc as GPUSamplerDescriptor).addressModeV).toBe('clamp-to-edge');
  });

  it('destroy releases the texture and is idempotent', () => {
    const { device, textureDestroy } = makeFakeDevice();

    const handle = createNfwLensLutTexture(device, lut);

    handle.destroy();
    expect(textureDestroy).toHaveBeenCalledTimes(1);

    // Second destroy must not throw and must not call texture.destroy again.
    expect(() => handle.destroy()).not.toThrow();
    expect(textureDestroy).toHaveBeenCalledTimes(1);
  });
});
