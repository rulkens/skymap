/**
 * dustExtinctionRgb — Cardelli, Clayton & Mathis (1989) optical extinction
 * law, A_lambda/A_V = a(x) + b(x)/R_V, evaluated once at the sRGB primaries
 * (612/549/465 nm => x = 1/lambda = 1.634/1.821/2.151 um^-1) rather than at
 * runtime: x is fixed by the display's own primaries, so the 7th-order
 * a(x)/b(x) polynomials have exactly one useful answer per channel — baking
 * that answer in trades three polynomial evaluations for two lookups.
 *
 * R_V (total-to-selective extinction, A_V / E(B-V)) is a real per-galaxy/
 * per-sightline dust GRAIN property, not a brightness knob: diffuse Milky
 * Way ISM sits at 3.1; dense molecular clouds run up to ~5.5 and read
 * GREYER (larger grains scatter more uniformly across the optical); SMC and
 * starburst sightlines run ~2-2.5 and read more strongly reddening (smaller
 * grains, steeper blue-vs-red attenuation).
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
