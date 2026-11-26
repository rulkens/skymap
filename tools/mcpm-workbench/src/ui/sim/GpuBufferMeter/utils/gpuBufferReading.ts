import type { GpuBufferReading } from '../../../../../@types/sim/memory/GpuBufferReading';
import { simMemoryZone } from '../../../../sim/memory/simMemoryZone';

/** gpuBufferReading — the sim's memory against the device limit; null until the limit is known. */
export function gpuBufferReading(
  usedBytes: number,
  limitBytes: number | null,
): GpuBufferReading | null {
  if (limitBytes === null) return null;
  return { fill: Math.min(1, usedBytes / limitBytes), zone: simMemoryZone(usedBytes, limitBytes) };
}
