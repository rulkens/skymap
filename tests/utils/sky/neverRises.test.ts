import { describe, expect, it } from 'vitest';

import { neverRises } from '../../../src/utils/sky/neverRises';

const DEG = Math.PI / 180;

describe('neverRises', () => {
  it('is true for the Southern Cross (Acrux, Dec −63.1°) from 55.7° N', () => {
    expect(neverRises(-63.1 * DEG, 55.7 * DEG)).toBe(true);
  });
  it('is false for Vega (Dec +38.8°) from 55.7° N', () => {
    expect(neverRises(38.8 * DEG, 55.7 * DEG)).toBe(false);
  });
});
