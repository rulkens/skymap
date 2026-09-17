import { describe, expect, it } from 'vitest';

import type { MeshGpuAsset } from '../../../../tools/scene-workbench/src/render/renderResources';
import { writeMeshMask } from '../../../../tools/scene-workbench/src/render/writeMeshMask';

type FakeBuffer = { size: number; destroyed: boolean; destroy(): void };

function fakeBuffer(size: number): FakeBuffer {
  return {
    size,
    destroyed: false,
    destroy() {
      this.destroyed = true;
    },
  };
}

describe('writeMeshMask', () => {
  it('writeMeshMask reallocates and destroys the old buffer when the ring outgrows it', () => {
    const writes: Array<{ buffer: unknown; byteLength: number }> = [];
    const device = {
      createBuffer: ({ size }: GPUBufferDescriptor) => fakeBuffer(size),
      queue: {
        writeBuffer: (buffer: unknown, _offset: number, data: ArrayBuffer) =>
          writes.push({ buffer, byteLength: data.byteLength }),
      },
    } as unknown as GPUDevice;
    const original = fakeBuffer(16);
    const asset = { kind: 'mesh', mask: original } as unknown as MeshGpuAsset;

    writeMeshMask(device, asset, [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]);

    expect(original.destroyed).toBe(true);
    expect(asset.mask).not.toBe(original);
    expect(asset.mask.size).toBe(40);
    expect(writes).toEqual([{ buffer: asset.mask, byteLength: 40 }]);
  });
});
