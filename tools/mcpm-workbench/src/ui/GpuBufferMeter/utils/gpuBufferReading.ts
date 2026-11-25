import type { GpuBufferReading } from '../../../../@types/GpuBufferReading';
import { GPU_BUFFER_ZONE_FROM } from '../../../sim/GPU_BUFFER_ZONE_FROM';

/** gpuBufferReading — a buffer's size against the device limit; null until the limit is known. */
export function gpuBufferReading(
  usedBytes: number,
  limitBytes: number | null,
): GpuBufferReading | null {
  if (limitBytes === null) return null;
  const fraction = usedBytes / limitBytes;
  const zone =
    fraction >= GPU_BUFFER_ZONE_FROM.bad
      ? 'bad'
      : fraction >= GPU_BUFFER_ZONE_FROM.warn
        ? 'warn'
        : 'normal';
  return { fill: Math.min(1, fraction), zone };
}
