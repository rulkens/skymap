/**
 * createViewSlotUniformRing — the view-slot buffer helper's own unit tests.
 *
 * Every renderer conversion (galaxyPointRenderer, starPointRenderer,
 * starCatalogRenderer) leans on this ring for slot isolation; these tests
 * pin the ring's own contract directly rather than re-deriving it per
 * renderer: N distinct physical buffers + bind groups, `writeSlot` targets
 * only its own slot's buffer, and `destroy` releases every one of them.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createViewSlotUniformRing,
  VIEW_SLOT_COUNT,
} from '../../../src/utils/gpu/createViewSlotUniformRing';

function mockDevice(): GPUDevice {
  return {
    createBuffer: vi.fn((desc: GPUBufferDescriptor) => ({
      label: desc.label,
      size: desc.size,
      destroy: vi.fn(),
    })),
    createBindGroup: vi.fn((desc: GPUBindGroupDescriptor) => ({ label: desc.label })),
    queue: { writeBuffer: vi.fn() },
  } as unknown as GPUDevice;
}

const LAYOUT = {} as unknown as GPUBindGroupLayout;

describe('createViewSlotUniformRing', () => {
  it('allocates VIEW_SLOT_COUNT buffers and bind groups by default, each sized byteSize', () => {
    const device = mockDevice();
    createViewSlotUniformRing({ device, label: 'x', byteSize: 32, layout: LAYOUT });

    const createBuffer = device.createBuffer as unknown as ReturnType<typeof vi.fn>;
    const createBindGroup = device.createBindGroup as unknown as ReturnType<typeof vi.fn>;
    expect(createBuffer).toHaveBeenCalledTimes(VIEW_SLOT_COUNT);
    expect(createBindGroup).toHaveBeenCalledTimes(VIEW_SLOT_COUNT);
    for (const [desc] of createBuffer.mock.calls) {
      expect((desc as GPUBufferDescriptor).size).toBe(32);
    }
  });

  it('bindGroupOf returns a DIFFERENT bind group per slot', () => {
    const device = mockDevice();
    const ring = createViewSlotUniformRing({ device, label: 'x', byteSize: 16, layout: LAYOUT });
    const bg1 = ring.bindGroupOf(1);
    const bg2 = ring.bindGroupOf(2);
    expect(bg1).not.toBe(bg2);
    // Stable identity across repeated reads of the SAME slot.
    expect(ring.bindGroupOf(1)).toBe(bg1);
  });

  it('writeSlot(slot, …) writes into ONLY that slot physical buffer — the writeBuffer/submit race this closes', () => {
    const device = mockDevice();
    const ring = createViewSlotUniformRing({ device, label: 'x', byteSize: 16, layout: LAYOUT });
    const writeBuffer = device.queue.writeBuffer as unknown as ReturnType<typeof vi.fn>;

    // Two "faces" of a capture sweep, both writing before one submit().
    ring.writeSlot(1, new Float32Array([1, 2, 3, 4]));
    ring.writeSlot(2, new Float32Array([5, 6, 7, 8]));

    expect(writeBuffer).toHaveBeenCalledTimes(2);
    const buf1 = writeBuffer.mock.calls[0]![0];
    const buf2 = writeBuffer.mock.calls[1]![0];
    // Distinct destinations — slot 2's write can never land in slot 1's
    // buffer, so a later read of slot 1 can never observe slot 2's bytes.
    expect(buf1).not.toBe(buf2);
  });

  it('destroy releases every slot buffer exactly once', () => {
    const device = mockDevice();
    const createBuffer = device.createBuffer as unknown as ReturnType<typeof vi.fn>;
    const ring = createViewSlotUniformRing({ device, label: 'x', byteSize: 16, layout: LAYOUT });
    const buffers = createBuffer.mock.results.map((r) => r.value as { destroy: () => void });

    ring.destroy();

    for (const buffer of buffers) {
      expect(buffer.destroy).toHaveBeenCalledTimes(1);
    }
  });
});
