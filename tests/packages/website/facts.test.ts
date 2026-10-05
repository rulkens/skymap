import { describe, expect, it } from 'vitest';

import { FACTS } from '../../../packages/website/src/data/facts';
import { fact } from '../../../packages/website/src/data/fact';
import { C_KM_S } from '../../../src/utils/math/constants';

const LY_PER_PC = 3.26156;
const KM_PER_LY = C_KM_S * 365.25 * 86_400;
const YEAR_S = 365.25 * 86_400;

describe('website facts', () => {
  it('every row has a unique id, text, an https source with a label and an ISO check date', () => {
    const ids = new Set<string>();
    for (const row of FACTS) {
      expect(ids.has(row.id), `duplicate id ${row.id}`).toBe(false);
      ids.add(row.id);
      expect(row.text.trim(), row.id).not.toBe('');
      expect(row.sourceLabel.trim(), `${row.id} sourceLabel`).not.toBe('');
      expect(new URL(row.source).protocol, `${row.id} source`).toBe('https:');
      expect(row.checked, `${row.id} checked`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(row.checked)), `${row.id} checked is a real date`).toBe(false);
    }
  });

  it('an unknown id throws, so a page citing a missing row fails the build', () => {
    expect(() => fact('no-such-fact')).toThrow(/no-such-fact/);
  });

  // Each number below is a calculation the row only states, so it is redone here from its inputs.
  it('derived light-travel times and distances match their inputs', () => {
    expect(384_400 / C_KM_S).toBeCloseTo(1.3, 1);
    expect(1_205.5e6 / C_KM_S / 60).toBeCloseTo(67, 0);
    expect(1_658.6e6 / C_KM_S / 60).toBeCloseTo(92, 0);
    expect(Math.round((8_178 * LY_PER_PC) / 100) * 100).toBe(26_700);
    expect(Math.round((761e3 * LY_PER_PC) / 1e5) / 10).toBe(2.5);
    expect(Math.round((16.5e6 * LY_PER_PC) / 1e6)).toBe(54);
    expect((1 / 0.7680665) * LY_PER_PC).toBeCloseTo(4.25, 2);
  });

  it('the Voyager 1 trip to Proxima Centauri takes about 75,000 years', () => {
    const years = (4.2465 * KM_PER_LY) / 17.0 / YEAR_S;
    expect(years).toBeGreaterThan(74_000);
    expect(years).toBeLessThan(76_000);
  });
});
