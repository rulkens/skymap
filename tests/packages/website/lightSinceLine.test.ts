import { describe, expect, it } from 'vitest';

import { FACTS } from '../../../packages/website/src/data/facts';
import { lightSinceLine } from '../../../packages/website/src/utils/lightSinceLine';

describe('lightSinceLine', () => {
  it('multiplies the speed of light by the time and compares it with the Moon’s distance', () => {
    // 60 s x 299,792.458 km/s = 17,987,547 km; over 384,400 km that is 46.8.
    expect(lightSinceLine(60)).toBe(
      'Since you opened this page, light has travelled 18 million km, or 47 times the distance to the Moon.',
    );
    expect(lightSinceLine(3600)).toContain('1.1 billion km');
  });

  it('makes no Moon comparison before light has gone there and back', () => {
    expect(lightSinceLine(2)).toBe('Since you opened this page, light has travelled 600,000 km.');
  });

  it('uses the figures its fact rows print', () => {
    const texts = FACTS.map((f) => f.text).join(' ');
    expect(texts).toContain('299,792.458 kilometres every second');
    expect(texts).toContain('384,400 km');
  });
});
