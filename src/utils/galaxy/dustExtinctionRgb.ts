/**
 * dustExtinctionRgb — Cardelli, Clayton & Mathis (1989) optical extinction
 * law, A_lambda/A_V = a(x) + b(x)/R_V, evaluated once at the sRGB primaries
 * (612/549/465 nm => x = 1/lambda = 1.634/1.821/2.151 um^-1) rather than at
 * runtime: x is fixed by the display's own primaries, so the 7th-order
 * a(x)/b(x) polynomials have exactly one useful answer per channel — baking
 * that answer in trades three polynomial evaluations for two lookups.
 *
 * R_V's physical meaning (grain size / sightline) is documented on
 * `GalaxyDustParams.rV`, not restated here.
 */
import type { Vec3 } from '../../@types/math/Vec3';

const CCM89_A_RGB: Vec3 = [0.9506, 1.0002, 1.0103];
const CCM89_B_RGB: Vec3 = [-0.1969, 0.0014, 0.6958];

const R_V_MIN = 1.5;
const R_V_MAX = 8;

export function dustExtinctionRgb(rV: number): Vec3 {
  const clampedRV = Math.min(R_V_MAX, Math.max(R_V_MIN, rV));
  return [
    CCM89_A_RGB[0] + CCM89_B_RGB[0] / clampedRV,
    CCM89_A_RGB[1] + CCM89_B_RGB[1] / clampedRV,
    CCM89_A_RGB[2] + CCM89_B_RGB[2] / clampedRV,
  ];
}
