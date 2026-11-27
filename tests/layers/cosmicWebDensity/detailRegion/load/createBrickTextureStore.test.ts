import { describe, it, expect, vi } from 'vitest';
import type { Vec3 } from '../../../../../packages/shared/src/@types/math/Vec3';
import type { VolumePyramidFormatRow } from '../../../../../src/@types/data/volume/VolumePyramidFormatRow';
import { VOLUME_PYRAMID_FORMATS } from '../../../../../src/data/volume/volumePyramidFormats';
import { createBrickTextureStore } from '../../../../../src/layers/cosmicWebDensity/detailRegion/load/createBrickTextureStore';
import { brickId } from '../../../../../src/utils/volume/brickId';

const GRID: Vec3 = [14, 24, 14];
const row = (format: string) => VOLUME_PYRAMID_FORMATS.find((r) => r.format === format)!;
const key = (x: number, y: number, z: number) => String(brickId([x, y, z], GRID));

function mockDevice() {
  return {
    createTexture: vi.fn(() => ({ destroy: vi.fn() })),
    queue: { writeTexture: vi.fn() },
  };
}

const store = (format: VolumePyramidFormatRow = row('astc6')) => {
  const device = mockDevice();
  return {
    device,
    store: createBrickTextureStore(device as unknown as GPUDevice, 'mcpm', format, GRID, 5),
  };
};

describe('createBrickTextureStore', () => {
  it("a brick's slot is its coordinates mod K", () => {
    const { store: s } = store();
    const slot = s.allocate(key(6, 0, 0), 1);
    expect(slot).toBe(1);
    expect(s.allocate(key(1, 0, 0), 2, 2)).toBe(slot);
    expect(s.slotOf(key(6, 0, 0))).toBeUndefined();
    expect(s.slotOf(key(1, 0, 0))).toBe(slot);
  });

  it('allocate refuses while the occupant was touched at or after liveSince, else evicts once', () => {
    const { store: s } = store();
    const evicted: string[] = [];
    s.setEvictHandler((k) => evicted.push(k));
    s.allocate(key(6, 0, 0), 1);
    s.touch(key(6, 0, 0), 5);
    expect(s.allocate(key(1, 0, 0), 5, 5)).toBeNull();
    expect(evicted).toEqual([]);
    expect(s.allocate(key(1, 0, 0), 6, 6)).toBe(1);
    expect(s.allocate(key(1, 0, 0), 7, 7)).toBe(1);
    expect(evicted).toEqual([key(6, 0, 0)]);
    expect(s.occupiedCount()).toBe(1);
  });

  it("write places a brick at 48 · slot with the format's layout", () => {
    const astc = store();
    // Slot (1, 2, 3) is index 1 + 5 · (2 + 5 · 3).
    astc.store.write(86, new Uint8Array(49_152));
    expect(astc.device.queue.writeTexture).toHaveBeenCalledWith(
      { texture: astc.store.texture, origin: { x: 48, y: 96, z: 144 } },
      expect.any(Uint8Array),
      { bytesPerRow: 128, rowsPerImage: 8 },
      { width: 48, height: 48, depthOrArrayLayers: 48 },
    );
    expect(astc.device.createTexture).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'density-region-mcpm',
        size: { width: 240, height: 240, depthOrArrayLayers: 240 },
        format: 'astc-6x6-unorm',
        dimension: '3d',
      }),
    );

    const r8 = store(row('r8'));
    r8.store.write(86, new Uint8Array(110_592));
    expect(r8.device.queue.writeTexture.mock.calls[0]![2]).toEqual({
      bytesPerRow: 48,
      rowsPerImage: 48,
    });
  });
});
