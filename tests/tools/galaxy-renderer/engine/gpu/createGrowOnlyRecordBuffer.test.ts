/**
 * The three failure modes here are all invisible to the compiler and reach the
 * screen only as a WebGPU validation error or a silent leak: a write that
 * overflows the buffer, a `layout: 'auto'` bind group left pointing at a
 * destroyed buffer, and the old buffer never destroyed. Nothing else in the
 * suite can reach `createGalaxyEngine`, so a fake device is the only place
 * these are observable.
 */
import { describe, expect, it, vi } from 'vitest';

import { createGrowOnlyRecordBuffer } from '../../../../../tools/galaxy-renderer/src/engine/gpu/createGrowOnlyRecordBuffer';

type Fake = {
  device: GPUDevice;
  /** Byte size of every buffer created, in creation order. */
  created: number[];
  /** Byte size of every buffer destroyed, in destruction order. */
  destroyed: number[];
  /** Byte size of the buffer each `writeBuffer` targeted, in call order. */
  writes: number[];
};

function makeFake(): Fake {
  const created: number[] = [];
  const destroyed: number[] = [];
  const writes: number[] = [];

  const device = {
    createBuffer: ({ size }: { size: number }) => {
      created.push(size);
      return { size, destroy: () => destroyed.push(size) } as unknown as GPUBuffer;
    },
    queue: {
      writeBuffer: (buf: GPUBuffer) => writes.push((buf as unknown as { size: number }).size),
    },
  } as unknown as GPUDevice;

  return { device, created, destroyed, writes };
}

/** 4 lanes per record, 2 records of headroom — so 2 records is 32 bytes. */
const spec = (fake: Fake, onRegrow?: () => void) => ({
  device: fake.device,
  label: 'test',
  usage: 0,
  floatsPerRecord: 4,
  initialCapacity: 2,
  onRegrow,
});

describe('createGrowOnlyRecordBuffer', () => {
  it('grows past capacity into a new buffer, destroys the old one, and rebinds', () => {
    const fake = makeFake();
    const onRegrow = vi.fn<() => void>();
    const buf = createGrowOnlyRecordBuffer(spec(fake, onRegrow));

    // 3 records at 4 lanes = 48 bytes, over the 32-byte initial allocation.
    buf.write(new Float32Array(12));

    expect(fake.created).toEqual([32, 48]);
    expect(fake.destroyed).toEqual([32]);
    expect(onRegrow).toHaveBeenCalledTimes(1);
    // The upload must land in the buffer the regrow just made, not the dead one.
    expect(fake.writes).toEqual([48]);
    expect(buf.count).toBe(3);
  });

  it('reuses the buffer at and below capacity — a slider drag must not realloc', () => {
    const fake = makeFake();
    const onRegrow = vi.fn<() => void>();
    const buf = createGrowOnlyRecordBuffer(spec(fake, onRegrow));

    buf.write(new Float32Array(4)); // 1 record
    buf.write(new Float32Array(8)); // 2 records — exactly capacity

    expect(fake.created).toEqual([32]);
    expect(fake.destroyed).toEqual([]);
    expect(onRegrow).not.toHaveBeenCalled();
    expect(buf.count).toBe(2);
  });

  it('never shrinks back, so a smaller write reuses the grown buffer', () => {
    const fake = makeFake();
    const onRegrow = vi.fn<() => void>();
    const buf = createGrowOnlyRecordBuffer(spec(fake, onRegrow));

    buf.write(new Float32Array(20)); // 5 records -> 80 bytes
    buf.write(new Float32Array(4)); // back to 1

    expect(fake.created).toEqual([32, 80]);
    expect(onRegrow).toHaveBeenCalledTimes(1);
    expect(fake.writes).toEqual([80, 80]);
    expect(buf.count).toBe(1);
  });

  it('destroys whatever buffer is live, not the one allocated at construction', () => {
    const fake = makeFake();
    const buf = createGrowOnlyRecordBuffer(spec(fake));

    buf.write(new Float32Array(20));
    buf.destroy();

    // 32 went at the regrow; the ledger must now take 80, not a second 32.
    expect(fake.destroyed).toEqual([32, 80]);
  });
});
