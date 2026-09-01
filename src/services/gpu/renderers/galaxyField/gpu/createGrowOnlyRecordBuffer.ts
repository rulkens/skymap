/**
 * createGrowOnlyRecordBuffer — a GPU buffer of fixed-stride records that
 * grows to fit and never shrinks (`setFieldTuning` fires every frame of a
 * tuning slider drag, so reallocating on each size change would be pure
 * churn). A regrow REPLACES the GPUBuffer, and a `layout: 'auto'` bind
 * group is bound to the exact buffer it was built against — hence
 * `onRegrow`.
 */

export type GrowOnlyRecordBufferSpec = {
  readonly device: GPUDevice;
  readonly label: string;
  readonly usage: GPUBufferUsageFlags;
  /** Stride, in f32 lanes — the buffer is sized `capacity * floatsPerRecord * 4` bytes. */
  readonly floatsPerRecord: number;
  /** Starting capacity in RECORDS. Size it at the caller's own admission ceiling so the common case never regrows. */
  readonly initialCapacity: number;
  /** Rebuild every `layout: 'auto'` bind group that binds this buffer. Fires after the swap, before the upload. */
  readonly onRegrow?: () => void;
};

export type GrowOnlyRecordBuffer = {
  getBuffer(): GPUBuffer;
  /** Records in the last `write`. NOT the capacity, which only ever grows. */
  readonly count: number;
  /** Grow to fit `records`, rebind, upload. */
  write(records: Float32Array): void;
  destroy(): void;
};

export function createGrowOnlyRecordBuffer(spec: GrowOnlyRecordBufferSpec): GrowOnlyRecordBuffer {
  const { device, label, usage, floatsPerRecord, initialCapacity, onRegrow } = spec;

  const allocate = (capacity: number): GPUBuffer =>
    device.createBuffer({ label, size: capacity * floatsPerRecord * 4, usage });

  let capacity = initialCapacity;
  let buffer = allocate(capacity);
  let count = 0;

  return {
    getBuffer(): GPUBuffer {
      return buffer;
    },
    get count(): number {
      return count;
    },

    write(records: Float32Array): void {
      count = records.length / floatsPerRecord;
      if (count > capacity) {
        capacity = count;
        buffer.destroy();
        buffer = allocate(capacity);
        onRegrow?.();
      }
      // A zero-length write is legal but pointless, and the empty case is the
      // one the callers hit every time a galaxy has no dust / no HII tier.
      if (count > 0) device.queue.writeBuffer(buffer, 0, records);
    },

    destroy(): void {
      buffer.destroy();
    },
  };
}
