import { describe, expect, it } from 'vitest';

import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { bodyPositionMpcAt } from '../../../../src/utils/exhibits/mission/bodyPositionMpcAt';
import { spacecraftPresent } from '../../../../src/utils/scene/spacecraftPresent';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { unixMsToJulianDays } from '../../../../src/utils/time/unixMsToJulianDays';
import { loadVoyagerStopWindows } from '../../../helpers/missions/loadVoyagerStopWindows';
import type { Mat3 } from '../../../../src/@types/math/Mat3';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

// One module instance per test file, so the registry set here stays out of the main suite.
loadVoyagerStopWindows();

const LAUNCH = unixMsToJulianDays(Date.parse('1977-09-05T12:56:00Z'));
const FIRST_SAMPLE = 2443392.082638889;
const MINUTE = 1 / 1440;

const relKm = (simDays: number): Vec3 => {
  const s = deriveBodyStates(simDays);
  const c = s.get('voyager1')!.positionMpc;
  const e = s.get('earth')!.positionMpc;
  const k = 1 / SCALE_UNITS.KM_TO_MPC;
  return [(c[0] - e[0]) * k, (c[1] - e[1]) * k, (c[2] - e[2]) * k];
};

/** World → Earth body-fixed: the orientation's transpose (column-major local → world). */
const bodyFixed = (v: Vec3, m: Mat3): Vec3 => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];

describe('Voyager between launch and its first track sample', () => {
  it('is present from the launch instant, not from the first sample', () => {
    expect(spacecraftPresent('voyager1', LAUNCH - MINUTE)).toBe(false);
    expect(spacecraftPresent('voyager1', LAUNCH + MINUTE)).toBe(true);
  });

  it('sits on the LC-41 pad at launch, turning with Earth', () => {
    const r = relKm(LAUNCH);
    expect(Math.hypot(...r)).toBeCloseTo(6371, 0);
    const p = bodyFixed(r, deriveBodyStates(LAUNCH).get('earth')!.orientation);
    expect((Math.asin(p[2] / Math.hypot(...p)) * 180) / Math.PI).toBeCloseTo(28.583, 2);
    expect((Math.atan2(p[1], p[0]) * 180) / Math.PI).toBeCloseTo(-80.583, 2);
  });

  it('joins the track at the first sample with no jump in position or speed', () => {
    const at = (t: number) => bodyPositionMpcAt('voyager1', t);
    const k = 1 / SCALE_UNITS.KM_TO_MPC;
    const dKm = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * k;
    const h = 1 / 86_400; // one second
    expect(dKm(at(FIRST_SAMPLE - 1e-9), at(FIRST_SAMPLE))).toBeLessThan(1);
    const vBefore = dKm(at(FIRST_SAMPLE - h), at(FIRST_SAMPLE - 2 * h));
    const vAfter = dKm(at(FIRST_SAMPLE + 2 * h), at(FIRST_SAMPLE + h));
    expect(Math.abs(vBefore - vAfter)).toBeLessThan(0.05 * vAfter);
  });

  it('the scene snapshot and the per-body walk agree', () => {
    const t = LAUNCH + 30 * MINUTE;
    expect(deriveBodyStates(t).get('voyager1')!.positionMpc).toEqual(
      bodyPositionMpcAt('voyager1', t),
    );
  });

  it('never dips under the ground on the way up', () => {
    for (let t = LAUNCH; t <= FIRST_SAMPLE; t += MINUTE) {
      expect(Math.hypot(...relKm(t))).toBeGreaterThanOrEqual(6370);
    }
  });
});
