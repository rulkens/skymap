/**
 * schwarzschildRadiusM — Schwarzschild radius in metres.
 *
 * r_s = 2GM/c² is the radius of the event horizon for a non-rotating black hole.
 */

// Named locals: SI physical constants. References: IAU, CODATA 2018, NIST.
// Speed of light (exact by definition since 1983).
const C_M_S = 299792458;
// Gravitational constant.
const G_M3_KG_S2 = 6.67430e-11;
// One solar mass in kg.
const SOLAR_MASS_KG = 1.98892e30;

export function schwarzschildRadiusM(massSolar: number): number {
  const massKg = massSolar * SOLAR_MASS_KG;
  const cSquared = C_M_S * C_M_S;
  return (2 * G_M3_KG_S2 * massKg) / cSquared;
}
