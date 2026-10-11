import { describe, it, expect } from 'vitest';
import { TextureAtlas } from '../../../../src/services/gpu/resources/textureAtlas';

const ATLAS_SIDE = 2048;
const SLOT_SIDE = 128;

describe('TextureAtlas', () => {
  it('slotUv returns the [u0,v0,u1,v1] rectangle for a slot in [0,1] coords', () => {
    const device = { createTexture: () => ({}) } as unknown as GPUDevice;
    const a = new TextureAtlas(device, {
      atlasSide: ATLAS_SIDE,
      slotSide: SLOT_SIDE,
      format: 'rgba8unorm-srgb',
      label: 'test-atlas',
    });
    expect(a.slotUv(0)).toEqual([0, 0, SLOT_SIDE / ATLAS_SIDE, SLOT_SIDE / ATLAS_SIDE]);
    // Slot 16 = row 1, col 0 (since 16 slots per row).
    const uvRow1 = a.slotUv(16);
    expect(uvRow1[1]).toBeCloseTo(SLOT_SIDE / ATLAS_SIDE);
  });
});
