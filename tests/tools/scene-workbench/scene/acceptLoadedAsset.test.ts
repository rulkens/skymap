/**
 * acceptLoadedAsset — the leak this pins: a point-cloud upload that completes
 * after its `watchGroupSaga` worker was cancelled (or after a dispose that
 * happened without cancellation at all) must not leave a live vertex buffer
 * reachable from nowhere, nor resurrect a torn-down scene.
 */
import { describe, expect, it, vi } from 'vitest';

import type { LidarGpuAsset } from '../../../../tools/scene-workbench/src/render/renderResources';
import { acceptLoadedAsset } from '../../../../tools/scene-workbench/src/scene/acceptLoadedAsset';

function fakeAsset(): LidarGpuAsset {
  return { vertexBuffer: { destroy: vi.fn() } as unknown as GPUBuffer, pointCount: 7 };
}

describe('acceptLoadedAsset', () => {
  it('accepts a live build', () => {
    const built = fakeAsset();

    const result = acceptLoadedAsset(built, { epoch: 3 }, 3, { aborted: false });

    expect(result).toBe(built);
    expect(built.vertexBuffer.destroy).not.toHaveBeenCalled();
  });

  it('destroys and rejects an aborted build (the worker already unwound)', () => {
    const built = fakeAsset();

    const result = acceptLoadedAsset(built, { epoch: 3 }, 3, { aborted: true });

    expect(result).toBeNull();
    expect(built.vertexBuffer.destroy).toHaveBeenCalledTimes(1);
  });

  it('destroys and rejects a build whose epoch moved, even without cancellation', () => {
    const built = fakeAsset();

    const result = acceptLoadedAsset(built, { epoch: 4 }, 3, { aborted: false });

    expect(result).toBeNull();
    expect(built.vertexBuffer.destroy).toHaveBeenCalledTimes(1);
  });
});
