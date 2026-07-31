import { describe, it, expect } from 'vitest';
import { formatMilkyWayTuningDefaults } from '../../../src/utils/format/formatMilkyWayTuningDefaults';
import type { MilkyWayTuning } from '../../../src/@types/settings/MilkyWayTuning';

const defaults: MilkyWayTuning = {
  starSizeScale: 0.7,
  exposure: 0.11,
  starPxMin: 1,
  starPxMax: 48,
  softness: 0,
  lodApparent: 0.02,
  aggregateDivisor: 2,
  starCount: 75000,
};

describe('formatMilkyWayTuningDefaults', () => {
  it('emits only the changed keys, in defaults property order — not the tuning object own key order', () => {
    // `tuning` is built with its OWN key order exactly reversed relative to
    // `defaults` (starCount first, starSizeScale last). A formatter that
    // mistakenly walked `Object.keys(tuning)` instead of `Object.keys(defaults)`
    // would emit starCount before exposure; the correct order is the other
    // way round, since `defaults` declares exposure before starCount.
    const reversedBase = Object.fromEntries(
      [...Object.keys(defaults)]
        .reverse()
        .map((key) => [key, defaults[key as keyof MilkyWayTuning]]),
    ) as MilkyWayTuning;
    const tuning: MilkyWayTuning = {
      ...reversedBase,
      exposure: 0.2,
      starCount: 250000,
    };

    expect(formatMilkyWayTuningDefaults(tuning, defaults)).toBe(
      '  exposure: 0.2,\n  starCount: 250000,',
    );
  });

  it('renders starCount as a bare digit literal, not a comma-grouped display string', () => {
    // The regression this guards against: reaching for the same
    // toLocaleString() the starCount slider row uses for DISPLAY would emit
    // "starCount: 150,000," — a syntax error once pasted into source.
    const tuning: MilkyWayTuning = { ...defaults, starCount: 150000 };

    expect(formatMilkyWayTuningDefaults(tuning, defaults)).toBe('  starCount: 150000,');
  });
});
