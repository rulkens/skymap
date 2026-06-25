import { describe, it, expect, vi } from 'vitest';
import { createSceneBindGroup } from '../../../../src/services/gpu/resources/createSceneBindGroup';
import type { SceneUniformsBgl } from '../../../../src/@types/rendering/SceneUniformsBgl';

/**
 * Minimal fake GPUDevice for bind-group assembly tests.
 *
 * `createBindGroup` is the only method `createSceneBindGroup` calls; the spy
 * records the descriptor so we can assert its entries without a real device.
 */
function makeFakeDevice() {
  const createBindGroup = vi.fn<(desc: GPUBindGroupDescriptor) => GPUBindGroup>(
    (_desc) => ({ __mockBindGroup: true }) as unknown as GPUBindGroup,
  );
  const device = { createBindGroup } as unknown as GPUDevice;
  return { device, createBindGroup };
}

const fakeBgl = { __mockBgl: true } as unknown as SceneUniformsBgl;
const fakeFocusBuffer = { __mockFocusBuf: true } as unknown as GPUBuffer;
const fakeLensingBuffer = { __mockLensingBuf: true } as unknown as GPUBuffer;
const fakeLutView = { __mockLutView: true } as unknown as GPUTextureView;
const fakeLutSampler = { __mockLutSampler: true } as unknown as GPUSampler;

describe('createSceneBindGroup', () => {
  it('scene bind group binds the LUT view and sampler at entries 2 and 3', () => {
    const { device, createBindGroup } = makeFakeDevice();

    createSceneBindGroup(
      device,
      fakeBgl,
      fakeFocusBuffer,
      fakeLensingBuffer,
      fakeLutView,
      fakeLutSampler,
    );

    expect(createBindGroup).toHaveBeenCalledTimes(1);
    const desc = createBindGroup.mock.calls[0]![0]!;
    expect(desc.entries).toHaveLength(4);
    // binding 2: the LUT view (not the texture itself).
    expect(desc.entries[2]).toEqual({ binding: 2, resource: fakeLutView });
    // binding 3: the LUT sampler.
    expect(desc.entries[3]).toEqual({ binding: 3, resource: fakeLutSampler });
  });

  it('binds the focus + lensing buffers at entries 0 and 1 unchanged', () => {
    const { device, createBindGroup } = makeFakeDevice();

    createSceneBindGroup(
      device,
      fakeBgl,
      fakeFocusBuffer,
      fakeLensingBuffer,
      fakeLutView,
      fakeLutSampler,
    );

    const desc = createBindGroup.mock.calls[0]![0]!;
    expect((desc.entries[0] as GPUBindGroupEntry).binding).toBe(0);
    expect((desc.entries[0] as GPUBindGroupEntry).resource).toEqual({ buffer: fakeFocusBuffer });
    expect((desc.entries[1] as GPUBindGroupEntry).binding).toBe(1);
    expect((desc.entries[1] as GPUBindGroupEntry).resource).toEqual({ buffer: fakeLensingBuffer });
  });

  it('uses the supplied label in the bind-group label', () => {
    const { device, createBindGroup } = makeFakeDevice();

    createSceneBindGroup(
      device,
      fakeBgl,
      fakeFocusBuffer,
      fakeLensingBuffer,
      fakeLutView,
      fakeLutSampler,
      'testLabel',
    );

    const desc = createBindGroup.mock.calls[0]![0]!;
    expect(desc.label).toBe('testLabel-bg');
  });
});
