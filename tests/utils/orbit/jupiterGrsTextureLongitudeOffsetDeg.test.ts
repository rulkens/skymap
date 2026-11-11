import { describe, it, expect } from 'vitest';
import { grsSystemIILongitudeDeg } from '../../../src/utils/orbit/grsSystemIILongitudeDeg';
import { jupiterGrsTextureLongitudeOffsetDeg } from '../../../src/utils/orbit/jupiterGrsTextureLongitudeOffsetDeg';

const angDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

describe('Great Red Spot longitude model', () => {
  // Published values (Sky & Telescope transit calculator, JUPOS-anchored); the fit is good to ~3 deg.
  it('matches JUPOS-based System II longitudes', () => {
    expect(angDiff(grsSystemIILongitudeDeg(2460735.5), 71)).toBeLessThan(4); // 2025-03-01
    expect(angDiff(grsSystemIILongitudeDeg(2461192.5), 91)).toBeLessThan(4); // 2026-06-01
  });

  it('turns the texture by the spot drift in System III (~118 deg/yr)', () => {
    const yr = 365.25;
    const d =
      jupiterGrsTextureLongitudeOffsetDeg(2460735.5 + yr) -
      jupiterGrsTextureLongitudeOffsetDeg(2460735.5);
    expect(angDiff(d, -(0.056326 + 0.266) * yr)).toBeLessThan(0.1);
  });
});
