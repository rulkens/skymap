/**
 * gpuBufferReading — the zone flips exactly at 75 % and 90 %, and the fill
 * stops at full when the buffer is over the limit.
 */
import { describe, expect, it } from 'vitest';
import { gpuBufferReading } from '../../../../../../../../tools/mcpm-workbench/src/ui/sim/GpuBufferMeter/utils/gpuBufferReading';

const LIMIT = 1000;

describe('gpuBufferReading', () => {
  it.each([
    [290, 'normal'],
    [749, 'normal'],
    [750, 'warn'],
    [899, 'warn'],
    [900, 'bad'],
    [1000, 'bad'],
  ] as const)('%d of 1000 is in the %s zone', (used, zone) => {
    expect(gpuBufferReading(used, LIMIT)).toEqual({ fill: used / LIMIT, zone });
  });

  it('just under a boundary stays below it', () => {
    expect(gpuBufferReading(74.9, 100)?.zone).toBe('normal');
    expect(gpuBufferReading(89.9, 100)?.zone).toBe('warn');
  });

  it('above the limit clamps the fill', () => {
    expect(gpuBufferReading(1350, LIMIT)).toEqual({ fill: 1, zone: 'bad' });
  });

  it('has no reading before the device limit is known', () => {
    expect(gpuBufferReading(500, null)).toBeNull();
  });
});
