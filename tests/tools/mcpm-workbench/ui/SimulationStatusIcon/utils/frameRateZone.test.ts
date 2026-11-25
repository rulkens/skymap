/**
 * frameRateZone — slower zones start exactly at 20 and 10 fps, faster ones wait
 * for the recovery margin, and a paused or unmeasured sim never warns.
 */
import { describe, expect, it } from 'vitest';
import { frameRateZone } from '../../../../../../tools/mcpm-workbench/src/ui/SimulationStatusIcon/utils/frameRateZone';

describe('frameRateZone', () => {
  it.each([
    [60, 'normal'],
    [20, 'normal'],
    [19.9, 'warn'],
    [10, 'warn'],
    [9.9, 'bad'],
  ] as const)('from normal, %d fps is %s', (fps, zone) => {
    expect(frameRateZone('normal', fps, true)).toBe(zone);
  });

  it('a slower zone shows at once', () => {
    expect(frameRateZone('warn', 9.9, true)).toBe('bad');
  });

  it('warn clears only once the rate is back above 20 by the margin', () => {
    expect(frameRateZone('warn', 20, true)).toBe('warn');
    expect(frameRateZone('warn', 21.9, true)).toBe('warn');
    expect(frameRateZone('warn', 22, true)).toBe('normal');
  });

  it('bad steps up only once the rate is back above 10 by the margin', () => {
    expect(frameRateZone('bad', 10, true)).toBe('bad');
    expect(frameRateZone('bad', 11.9, true)).toBe('bad');
    expect(frameRateZone('bad', 12, true)).toBe('warn');
    expect(frameRateZone('bad', 30, true)).toBe('normal');
  });

  it('paused is normal, whatever the rate', () => {
    expect(frameRateZone('bad', 5, false)).toBe('normal');
  });

  it('0 fps while running is not measured yet, so normal', () => {
    expect(frameRateZone('normal', 0, true)).toBe('normal');
    expect(frameRateZone('bad', 0, true)).toBe('normal');
  });
});
