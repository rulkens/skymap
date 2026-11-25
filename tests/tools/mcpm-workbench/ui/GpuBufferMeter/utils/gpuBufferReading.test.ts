/**
 * gpuBufferReading — the zone flips exactly at 75 % and 90 %, the fill stops
 * at full while the percentage keeps the real value.
 */
import { describe, expect, it } from 'vitest';
import { gpuBufferReading } from '../../../../../../tools/mcpm-workbench/src/ui/GpuBufferMeter/utils/gpuBufferReading';

const LIMIT = 1000;

describe('gpuBufferReading', () => {
  it.each([
    [290, 29, 'normal'],
    [749, 74, 'normal'],
    [750, 75, 'warn'],
    [899, 89, 'warn'],
    [900, 90, 'bad'],
    [1000, 100, 'bad'],
  ] as const)('%d of 1000 reads %d%% in the %s zone', (used, percent, zone) => {
    expect(gpuBufferReading(used, LIMIT)).toEqual({ fill: used / LIMIT, percent, zone });
  });

  it('just under a boundary stays below it, in number and zone', () => {
    expect(gpuBufferReading(74.9, 100)).toMatchObject({ percent: 74, zone: 'normal' });
    expect(gpuBufferReading(89.9, 100)).toMatchObject({ percent: 89, zone: 'warn' });
  });

  it('above the limit clamps the fill but keeps the real percentage', () => {
    expect(gpuBufferReading(1350, LIMIT)).toEqual({ fill: 1, percent: 135, zone: 'bad' });
  });

  it('has no reading before the device limit is known', () => {
    expect(gpuBufferReading(500, null)).toBeNull();
  });
});
