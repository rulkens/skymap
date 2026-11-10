import { describe, expect, it } from 'vitest';
import { FIELD_CONTROLS } from '../../../src/inspector/data/fieldControls';
import { EASE_OPTIONS } from '../../../src/inspector/data/easeOptions';

describe('FIELD_CONTROLS', () => {
  it('degrees round-trip: 63° stores 1.0996 rad and shows 63°', () => {
    const { toDisplay, fromDisplay } = FIELD_CONTROLS.degrees;
    // 63 × π / 180 = 1.09956
    expect(fromDisplay!(63)).toBeCloseTo(1.0996, 4);
    expect(toDisplay!(fromDisplay!(63))).toBe(63);
  });

  it('percent round-trip: 40 % stores 0.4', () => {
    const { toDisplay, fromDisplay } = FIELD_CONTROLS.percent;
    expect(fromDisplay!(40)).toBe(0.4);
    expect(toDisplay!(0.4)).toBe(40);
  });

  it('seconds and Mpc store as shown', () => {
    expect(FIELD_CONTROLS.seconds.toDisplay).toBeUndefined();
    expect(FIELD_CONTROLS.mpc.fromDisplay).toBeUndefined();
  });

  it('offers every ease', () => {
    expect(EASE_OPTIONS).toHaveLength(31);
  });
});
