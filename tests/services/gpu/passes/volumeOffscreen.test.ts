/**
 * Tests for the downsampled offscreen target used by the scalar-volume
 * pass.  Vitest runs in Node without a real GPU, so we mock
 * `device.createTexture` and assert on call shape rather than actual
 * GPU state.
 *
 * Coverage:
 *   - Construction allocates one rgba16float texture sized
 *     `floor(canvas / VOLUME_RENDER_SCALE_DIVISOR)` per axis.
 *   - The `floor(N / divisor) = 0` degenerate case clamps to 1 px.
 *   - Resize releases the old texture and recreates at the new size,
 *     swapping the exposed view.
 *   - Destroy releases the texture and nulls the view.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  createVolumeOffscreen,
  VOLUME_RENDER_SCALE_DIVISOR,
} from '../../../../src/services/gpu/passes/volumeOffscreen';

function mockDevice(): GPUDevice {
  return {
    createTexture: vi.fn(() => ({
      createView: vi.fn(() => ({})),
      destroy: vi.fn(),
    })),
  } as unknown as GPUDevice;
}

describe('createVolumeOffscreen', () => {
  it('allocates an rgba16float texture sized floor(canvas / divisor)', () => {
    const device = mockDevice();
    const off = createVolumeOffscreen(device, { width: 800, height: 600 });
    expect(off.view).toBeDefined();
    expect((device.createTexture as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    const desc = (device.createTexture as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(desc.size).toEqual({
      width: Math.floor(800 / VOLUME_RENDER_SCALE_DIVISOR),
      height: Math.floor(600 / VOLUME_RENDER_SCALE_DIVISOR),
    });
    expect(desc.format).toBe('rgba16float');
  });

  it('clamps to a 1 px minimum when floor(canvas / divisor) is 0', () => {
    const device = mockDevice();
    createVolumeOffscreen(device, { width: 1, height: 1 });
    const desc = (device.createTexture as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    // floor(1 / divisor) = 0 → clamped to 1.
    expect(desc.size).toEqual({ width: 1, height: 1 });
  });

  it('view reflects the new texture immediately after resize', () => {
    const device = mockDevice();
    const off = createVolumeOffscreen(device, { width: 800, height: 600 });
    const viewBefore = off.view;
    off.resize({ width: 1024, height: 768 });
    expect(off.view).not.toBe(viewBefore);
    // Resize freed the old texture before allocating the new one.
    expect(
      (device.createTexture as ReturnType<typeof vi.fn>).mock.results[0]!.value.destroy,
    ).toHaveBeenCalled();
  });

  it('destroy releases the texture', () => {
    const device = mockDevice();
    const off = createVolumeOffscreen(device, { width: 800, height: 600 });
    off.destroy();
    expect(
      (device.createTexture as ReturnType<typeof vi.fn>).mock.results[0]!.value.destroy,
    ).toHaveBeenCalled();
  });
});
