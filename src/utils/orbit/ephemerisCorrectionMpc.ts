/**
 * ephemerisCorrectionMpc — evaluate a planet's fitted `Horizons − Kepler` correction
 * at `simDays` as an equatorial-world offset in Mpc. Summed in f64 km and converted
 * once at the end. `simDays` is clamped to the span, so the edge value is held outside it.
 */

import type { EphemerisCorrection } from '../../@types/scene/EphemerisCorrection';
import type { Vec3 } from '../../@types/math/Vec3';
import { SCALE_UNITS } from '../../data/scaleUnits';

const FLOATS_PER_TERM = 7;

export function ephemerisCorrectionMpc(c: EphemerisCorrection, simDays: number): Vec3 {
  const dt = Math.min(Math.max(simDays, c.startJd), c.endJd) - c.startJd;
  const tau = (2 * dt) / (c.endJd - c.startJd) - 1;
  const [p0, p1, p2, p3] = c.polyKm;
  let x = p0[0] + tau * (p1[0] + tau * (p2[0] + tau * p3[0]));
  let y = p0[1] + tau * (p1[1] + tau * (p2[1] + tau * p3[1]));
  let z = p0[2] + tau * (p1[2] + tau * (p2[2] + tau * p3[2]));
  const terms = c.terms;
  for (let i = 0; i < terms.length; i += FLOATS_PER_TERM) {
    const phase = terms[i]! * dt;
    const cos = Math.cos(phase);
    const sin = Math.sin(phase);
    x += terms[i + 1]! * cos + terms[i + 4]! * sin;
    y += terms[i + 2]! * cos + terms[i + 5]! * sin;
    z += terms[i + 3]! * cos + terms[i + 6]! * sin;
  }
  const k = SCALE_UNITS.KM_TO_MPC;
  return [x * k, y * k, z * k];
}
