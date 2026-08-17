import { describe, expect, it } from 'vitest';
import { formatZoneOfAvoidanceTuningDefaults } from '../../../src/utils/format/formatZoneOfAvoidanceTuningDefaults';
import type { ZoneOfAvoidanceTuning } from '../../../src/@types/settings/ZoneOfAvoidanceTuning';

// Parses the formatter's output back into a plain object the same way a
// human pasting it into defaults.ts would rely on it working: as a literal
// TS/JS object body. A test that instead re-derived the expected string with
// the same rounding formula would just restate the implementation; parsing
// the emitted text is the only check that can catch a real formatting bug
// (a missing comma, an unquoted key, a bracket typo) rather than a value bug.
function parseEmitted(output: string): ZoneOfAvoidanceTuning {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- tests/ is lint-excluded; this parses our own formatter's output, not external input.
  return new Function(`return {\n${output}\n};`)() as ZoneOfAvoidanceTuning;
}

describe('formatZoneOfAvoidanceTuningDefaults', () => {
  it('round-trips a tuning cluster with long decimal tails to ~4-decimal precision', () => {
    // The colour-picker round trip (hex -> linear) is exactly what produces
    // fixture values like this — a long, unreadable float tail.
    const tuning: ZoneOfAvoidanceTuning = {
      intensity: 0.7912345,
      radialFalloff: 0.21586050011389923,
      edgeSharpness: 5,
      color: [0.9999999, 0.5, 0.03310476657088448],
      labelColor: [0.0399, 1, 0.2140411920271763],
    };

    const parsed = parseEmitted(formatZoneOfAvoidanceTuningDefaults(tuning));

    expect(parsed.intensity).toBeCloseTo(tuning.intensity, 3);
    expect(parsed.radialFalloff).toBeCloseTo(tuning.radialFalloff, 3);
    expect(parsed.edgeSharpness).toBeCloseTo(tuning.edgeSharpness, 3);
    tuning.color.forEach((c, i) => expect(parsed.color[i]).toBeCloseTo(c, 3));
    tuning.labelColor.forEach((c, i) => expect(parsed.labelColor[i]).toBeCloseTo(c, 3));
  });

  it('emits a self-contained literal body — no trailing comma corruption, every knob present', () => {
    const tuning: ZoneOfAvoidanceTuning = {
      intensity: 0.5,
      radialFalloff: 0.35,
      edgeSharpness: 5,
      color: [1, 0.75, 0.5],
      labelColor: [1, 1, 1],
    };

    const parsed = parseEmitted(formatZoneOfAvoidanceTuningDefaults(tuning));

    // Compared against the fixture's own keys, not a hand-written list: a
    // knob added to `ZoneOfAvoidanceTuning` forces the fixture to grow, and
    // this assertion then covers it without anyone remembering to.
    expect(Object.keys(parsed).sort()).toEqual(Object.keys(tuning).sort());
  });
});
