/**
 * disposeScene — the two real bugs: a group switch that frees the previous
 * group's device memory only partially (VRAM grows with every switch), and a
 * second dispose that double-destroys or leaves the epoch un-bumped, which
 * would let an in-flight upload from the disposed scene be accepted back in.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  createRenderResources,
  disposeScene,
  type LidarGpuAsset,
} from '../../../../tools/scene-workbench/src/render/renderResources';

function fakeAsset(pointCount: number): LidarGpuAsset {
  return { vertexBuffer: { destroy: vi.fn() } as unknown as GPUBuffer, pointCount };
}

describe('disposeScene', () => {
  it('destroys every asset and the depth texture, clears the map and bumps epoch', () => {
    const resources = createRenderResources();
    const first = fakeAsset(10);
    const second = fakeAsset(20);
    resources.gpuAssets.set('a', first);
    resources.gpuAssets.set('b', second);
    resources.depthTexture = { destroy: vi.fn() } as unknown as GPUTexture;
    const depthTexture = resources.depthTexture;

    disposeScene(resources);

    expect(first.vertexBuffer.destroy).toHaveBeenCalledTimes(1);
    expect(second.vertexBuffer.destroy).toHaveBeenCalledTimes(1);
    expect(depthTexture.destroy).toHaveBeenCalledTimes(1);
    expect(resources.gpuAssets.size).toBe(0);
    expect(resources.depthTexture).toBeNull();
    expect(resources.epoch).toBe(1);
  });

  it('is idempotent — a second dispose destroys nothing twice but still bumps epoch', () => {
    const resources = createRenderResources();
    const asset = fakeAsset(10);
    resources.gpuAssets.set('a', asset);

    disposeScene(resources);
    disposeScene(resources);

    expect(asset.vertexBuffer.destroy).toHaveBeenCalledTimes(1);
    expect(resources.epoch).toBe(2);
  });
});
