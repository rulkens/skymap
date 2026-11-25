import type { GpuBufferReading } from '../../../../@types/GpuBufferReading';
import { GPU_BUFFER_ZONE_FROM } from './GPU_BUFFER_ZONE_FROM';

/** gpuBufferReading — a buffer's size against the device limit; null until the limit is known. */
export function gpuBufferReading(
  usedBytes: number,
  limitBytes: number | null,
): GpuBufferReading | null {
  if (limitBytes === null) return null;
  const fraction = usedBytes / limitBytes;
  // Scaled before dividing (0.29 × 100 is 28.999…); zones read the floored
  // percent, so the number shown and the zone flip together.
  const percent = Math.floor((usedBytes * 100) / limitBytes);
  const zone =
    percent >= GPU_BUFFER_ZONE_FROM.bad * 100
      ? 'bad'
      : percent >= GPU_BUFFER_ZONE_FROM.warn * 100
        ? 'warn'
        : 'normal';
  return { fill: Math.min(1, fraction), percent, zone };
}
