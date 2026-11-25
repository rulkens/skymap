import type { GpuBufferZone } from '../../@types/GpuBufferZone';
import { GPU_BUFFER_ZONE_FROM } from './GPU_BUFFER_ZONE_FROM';

/**
 * simMemoryZone — the sim's total memory (estimateBoxGpuBytes) against the device's
 * per-buffer limit, as a zone. The GPU bar and Auto fit both read it here, so the
 * box Auto fit leaves never lands in a zone the bar would warn about.
 */
export function simMemoryZone(usedBytes: number, limitBytes: number): GpuBufferZone {
  const fraction = usedBytes / limitBytes;
  if (fraction >= GPU_BUFFER_ZONE_FROM.bad) return 'bad';
  return fraction >= GPU_BUFFER_ZONE_FROM.warn ? 'warn' : 'normal';
}
