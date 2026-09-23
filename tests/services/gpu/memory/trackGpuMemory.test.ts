/**
 * trackGpuMemory — the ledger's bookkeeping against a fake `GPUDevice`: totals
 * and owners in the snapshot, `destroy()` subtracting exactly once (a second
 * call is a no-op), and per-object independence (destroying one buffer never
 * touches another's tally). FinalizationRegistry/GC behavior is untestable
 * without forcing a GC cycle — out of scope per the plan.
 */

import { describe, it, expect } from 'vitest';
import { trackGpuMemory } from '../../../../src/services/gpu/memory/trackGpuMemory';

function makeFakeDevice() {
  const buffers: { size: number; destroy: () => void }[] = [];
  const device = {
    createBuffer: (descriptor: GPUBufferDescriptor) => {
      const buffer = {
        size: descriptor.size,
        destroy: () => {},
      };
      buffers.push(buffer);
      return buffer as unknown as GPUBuffer;
    },
    createTexture: (descriptor: GPUTextureDescriptor) =>
      ({
        format: descriptor.format,
        destroy: () => {},
      }) as unknown as GPUTexture,
  };
  return device as unknown as GPUDevice;
}

describe('trackGpuMemory', () => {
  it('starts with an empty snapshot', () => {
    const ledger = trackGpuMemory(makeFakeDevice());
    expect(ledger.snapshot()).toEqual({ totalBytes: 0, owners: [] });
  });

  it('tallies a labeled buffer under its label', () => {
    const device = makeFakeDevice();
    const ledger = trackGpuMemory(device);
    device.createBuffer({ label: 'test-buffer', size: 1024, usage: 0 });

    const snap = ledger.snapshot();
    expect(snap.totalBytes).toBe(1024);
    expect(snap.owners).toEqual([
      { owner: 'test-buffer', kind: 'buffer', bytes: 1024, count: 1, gcReclaimed: 0 },
    ]);
  });

  it('sizes a labeled texture via textureByteSize and adds it to the total', () => {
    const device = makeFakeDevice();
    const ledger = trackGpuMemory(device);
    device.createTexture({
      label: 'test-texture',
      size: { width: 4, height: 4 },
      format: 'rgba8unorm',
      usage: 0,
    } as GPUTextureDescriptor);

    const snap = ledger.snapshot();
    expect(snap.totalBytes).toBe(4 * 4 * 4);
    expect(snap.owners[0]).toEqual({
      owner: 'test-texture',
      kind: 'texture',
      bytes: 64,
      count: 1,
      gcReclaimed: 0,
    });
  });

  it('splits one owner into two rows when it creates both a buffer and a texture', () => {
    const device = makeFakeDevice();
    const ledger = trackGpuMemory(device);
    device.createBuffer({ label: 'volumeFieldRenderer', size: 100, usage: 0 });
    device.createTexture({
      label: 'volumeFieldRenderer',
      size: { width: 4, height: 4 },
      format: 'rgba8unorm',
      usage: 0,
    } as GPUTextureDescriptor);

    const snap = ledger.snapshot();
    expect(snap.totalBytes).toBe(100 + 64);
    expect(snap.owners).toEqual([
      { owner: 'volumeFieldRenderer', kind: 'buffer', bytes: 100, count: 1, gcReclaimed: 0 },
      { owner: 'volumeFieldRenderer', kind: 'texture', bytes: 64, count: 1, gcReclaimed: 0 },
    ]);
  });

  it('destroy() on one kind subtracts only that owner+kind row, not the sibling kind', () => {
    const device = makeFakeDevice();
    const ledger = trackGpuMemory(device);
    const buffer = device.createBuffer({ label: 'volumeFieldRenderer', size: 100, usage: 0 });
    device.createTexture({
      label: 'volumeFieldRenderer',
      size: { width: 4, height: 4 },
      format: 'rgba8unorm',
      usage: 0,
    } as GPUTextureDescriptor);

    buffer.destroy();

    const snap = ledger.snapshot();
    expect(snap.totalBytes).toBe(64);
    expect(snap.owners).toEqual([
      { owner: 'volumeFieldRenderer', kind: 'texture', bytes: 64, count: 1, gcReclaimed: 0 },
    ]);
  });

  it('falls back to a stack-derived owner when no label is given', () => {
    // A vitest/node stack frame has no `http://` URL, so `ownerFromStack`
    // finds no match and the ledger falls back to 'unknown'.
    const device = makeFakeDevice();
    const ledger = trackGpuMemory(device);
    device.createBuffer({ size: 4, usage: 0 });
    expect(ledger.snapshot().owners[0]!.owner).toBe('unknown');
  });

  it('destroy() subtracts the buffer once and a second destroy() is a no-op', () => {
    const device = makeFakeDevice();
    const ledger = trackGpuMemory(device);
    const buffer = device.createBuffer({ label: 'owner-a', size: 100, usage: 0 });
    device.createBuffer({ label: 'owner-a', size: 30, usage: 0 });

    buffer.destroy();
    buffer.destroy(); // idempotent — must not go negative
    expect(ledger.snapshot().owners).toEqual([
      { owner: 'owner-a', kind: 'buffer', bytes: 30, count: 1, gcReclaimed: 0 },
    ]);
  });

  it('drops an owner row once everything it held is destroyed', () => {
    const device = makeFakeDevice();
    const ledger = trackGpuMemory(device);
    device.createBuffer({ label: 'owner-a', size: 100, usage: 0 }).destroy();
    expect(ledger.snapshot()).toEqual({ totalBytes: 0, owners: [] });
  });

  it('sorts owners by bytes descending and keeps per-owner totals independent', () => {
    const device = makeFakeDevice();
    const ledger = trackGpuMemory(device);
    device.createBuffer({ label: 'small', size: 10, usage: 0 });
    device.createBuffer({ label: 'big', size: 1000, usage: 0 });
    device.createBuffer({ label: 'small', size: 10, usage: 0 });

    const snap = ledger.snapshot();
    expect(snap.totalBytes).toBe(1020);
    expect(snap.owners.map((o) => o.owner)).toEqual(['big', 'small']);
    expect(snap.owners[1]).toEqual({
      owner: 'small',
      kind: 'buffer',
      bytes: 20,
      count: 2,
      gcReclaimed: 0,
    });
  });
});
