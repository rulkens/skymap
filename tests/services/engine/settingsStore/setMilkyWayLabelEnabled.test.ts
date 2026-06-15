import { describe, expect, it } from 'vitest';
import { setMilkyWayLabelEnabled } from '../../../../src/services/engine/settingsStore/reducers/setMilkyWayLabelEnabled';
import { setMilkyWayEnabled } from '../../../../src/services/engine/settingsStore/reducers/setMilkyWayEnabled';
import { selectMilkyWayLabelEnabled } from '../../../../src/services/engine/settingsStore/selectors/selectMilkyWayLabelEnabled';
import { selectMilkyWayEnabled } from '../../../../src/services/engine/settingsStore/selectors/selectMilkyWayEnabled';
import { makeSettingsFixture } from './makeSettingsFixture';

describe('setMilkyWayLabelEnabled', () => {
  it('toggles only the label axis, leaving the disk axis untouched', () => {
    const base = setMilkyWayEnabled(makeSettingsFixture(), true);
    const next = setMilkyWayLabelEnabled(base, false);
    expect(selectMilkyWayLabelEnabled(next)).toBe(false);
    expect(selectMilkyWayEnabled(next)).toBe(true);
  });

  it('toggling the disk axis leaves the label axis untouched', () => {
    const base = setMilkyWayLabelEnabled(makeSettingsFixture(), false);
    const next = setMilkyWayEnabled(base, true);
    expect(selectMilkyWayEnabled(next)).toBe(true);
    expect(selectMilkyWayLabelEnabled(next)).toBe(false);
  });

  it('is copy-on-write: returns a new state and milkyWay object', () => {
    const base = makeSettingsFixture();
    const next = setMilkyWayLabelEnabled(base, !base.milkyWay.labelEnabled);
    expect(next).not.toBe(base);
    expect(next.milkyWay).not.toBe(base.milkyWay);
    expect(next.tonemap).toBe(base.tonemap); // sibling cluster untouched
  });
});
