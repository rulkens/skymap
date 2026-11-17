import { describe, expect, it } from 'vitest';
import { scaleTrackSvg } from '../../../src/utils/antiqueChrome/scaleTrackSvg';

describe('scaleTrackSvg', () => {
  it('repeats a two-unit chequer between the subdivided start and the end rule', () => {
    const t = scaleTrackSvg('#2b2118', '#f7efda');
    const unit = t.start;
    // The middle slice is exactly two units: ink in the top row, then in the bottom row,
    // so `round` repetition keeps the rows alternating unit by unit.
    expect(t.svg).toContain(`width="${t.start + 2 * unit + t.end}"`);
    expect(t.svg).toContain(`M${unit} 4h${unit}v3h${-unit}ZM${2 * unit} 7h${unit}v3h${-unit}Z`);
  });
});
