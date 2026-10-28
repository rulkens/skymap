import { describe, expect, it } from 'vitest';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { asSceneBodyId } from '../../../../src/utils/scene/asSceneBodyId';

const AU = SCALE_UNITS.AU_TO_MPC;
const RAD_TO_ARCSEC = (180 / Math.PI) * 3600;
const jdOfYear = (yr: number) => 2451545.0 + (yr - 2000) * 365.25;
const A = asSceneBodyId('alpha-centauri');
const B = asSceneBodyId('alpha-centauri-b');

const pair = (yr: number) => {
  const states = deriveBodyStates(jdOfYear(yr));
  return { a: states.get(A)!.positionMpc, b: states.get(B)!.positionMpc };
};
const unit = (v: readonly number[]) => v.map((x) => x / Math.hypot(...v));

describe('famousStarOrbit: Alpha Centauri B', () => {
  it('is 11.3 au from A at the 2035.5 periastron and 35.7 au at the 1995.6 apastron', () => {
    for (const [yr, au] of [
      [1875.66 + 2 * 79.91, 23.53 * (1 - 0.5179)],
      [1875.66 + 2.5 * 79.91, 23.53 * (1 + 0.5179)],
    ] as const) {
      const { a, b } = pair(yr);
      expect(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / AU).toBeCloseTo(au, 1);
    }
  });

  // The pair's closest apparent approach, ~4″ in 2016, pins the tilt, ω (mod 180°)
  // and the phase; Ω only turns the pair on the sky, and is not seen here.
  it('sits about 4″ from A on the sky in early 2016', () => {
    const { a, b } = pair(2016.0);
    const [ua, ub] = [unit(a), unit(b)];
    const sep = Math.hypot(ub[0]! - ua[0]!, ub[1]! - ua[1]!, ub[2]! - ua[2]!) * RAD_TO_ARCSEC;
    expect(sep).toBeGreaterThan(3.4);
    expect(sep).toBeLessThan(4.6);
  });
});
