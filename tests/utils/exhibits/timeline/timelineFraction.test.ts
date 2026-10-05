import { describe, it, expect } from 'vitest';

import { timelineAxis } from '../../../../src/utils/exhibits/timeline/timelineAxis';
import { timelineFraction } from '../../../../src/utils/exhibits/timeline/timelineFraction';
import { timelineInstant } from '../../../../src/utils/exhibits/timeline/timelineInstant';

const END = Date.parse('2026-10-06');
const ERAS = [
  { label: 'Planetary', fromIso: '1977-08-20' },
  { label: 'Interstellar', fromIso: '1990-01-01' },
];
const axis = timelineAxis('1977-08-20', ERAS, END);

describe('era-split timeline axis', () => {
  it('puts the era boundary at the middle of the track and the ends at 0 and 1', () => {
    expect(timelineFraction(Date.parse('1977-08-20'), axis)).toBe(0);
    expect(timelineFraction(Date.parse('1990-01-01'), axis)).toBeCloseTo(0.5, 12);
    expect(timelineFraction(END, axis)).toBe(1);
  });

  it('is monotone across the era break and clamps outside the span', () => {
    const isos = [
      '1976-01-01',
      '1977-10-01',
      '1980-01-01',
      '1989-12-31',
      '1990-01-02',
      '2000-01-01',
      '2020-01-01',
      '2026-10-01',
      '2030-01-01',
    ];
    const fractions = isos.map((iso) => timelineFraction(Date.parse(iso), axis));
    for (let i = 1; i < fractions.length; i++) {
      expect(fractions[i]!).toBeGreaterThanOrEqual(fractions[i - 1]!);
    }
    expect(fractions[0]).toBe(0);
    expect(fractions.at(-1)).toBe(1);
  });

  it('timelineInstant inverts timelineFraction on both sides of the break', () => {
    for (const iso of ['1979-03-05', '1989-08-25', '1990-02-14', '2012-08-25']) {
      const ms = Date.parse(iso);
      expect(timelineInstant(timelineFraction(ms, axis), axis)).toBeCloseTo(ms, -1);
    }
  });

  it('without eras is one linear span', () => {
    const linear = timelineAxis('2000-01-01', undefined, Date.parse('2010-01-01'));
    expect(timelineFraction(Date.parse('2005-01-01'), linear)).toBeCloseTo(0.5, 2);
  });
});
