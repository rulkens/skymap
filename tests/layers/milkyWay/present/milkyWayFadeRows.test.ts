/**
 * milkyWayFadeRows — the two seed/intent pairs: a default-off session must
 * not flash either the disk or its label on frame 1.
 */
import { describe, it, expect } from 'vitest';
import { milkyWayFadeRows } from '../../../../src/layers/milkyWay/present/milkyWayFadeRows';
import type { EngineSettingsState } from '../../../../src/@types/settings/EngineSettingsState';

function makeSettings(enabled: boolean, labelEnabled: boolean): EngineSettingsState {
  return { milkyWay: { enabled, labelEnabled } } as unknown as EngineSettingsState;
}

describe('milkyWayFadeRows', () => {
  const [diskRow, labelRow] = milkyWayFadeRows();

  it('seeds the disk at 0 when disabled, 1 when enabled', () => {
    expect(diskRow!.seed(makeSettings(false, true), undefined)).toBe(0);
    expect(diskRow!.seed(makeSettings(true, true), undefined)).toBe(1);
  });

  it('disk intent follows settings.milkyWay.enabled', () => {
    expect(diskRow!.intent?.(makeSettings(false, true), undefined)).toBe(false);
    expect(diskRow!.intent?.(makeSettings(true, true), undefined)).toBe(true);
  });

  it('seeds the label at 0 when labelEnabled is false, 1 when true', () => {
    expect(labelRow!.seed(makeSettings(true, false), undefined)).toBe(0);
    expect(labelRow!.seed(makeSettings(true, true), undefined)).toBe(1);
  });

  it('label intent follows settings.milkyWay.labelEnabled', () => {
    expect(labelRow!.intent?.(makeSettings(true, false), undefined)).toBe(false);
    expect(labelRow!.intent?.(makeSettings(true, true), undefined)).toBe(true);
  });
});
