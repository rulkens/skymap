/**
 * bufferLimitBytes — the largest single storage buffer this device takes: it must
 * clear `maxBufferSize` to be created and `maxStorageBufferBindingSize` to be bound.
 */
export function bufferLimitBytes(
  limits: Pick<GPUSupportedLimits, 'maxBufferSize' | 'maxStorageBufferBindingSize'>,
): number {
  return Math.min(limits.maxBufferSize, limits.maxStorageBufferBindingSize);
}
