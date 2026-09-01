/**
 * schwarzschildRadiusM — Schwarzschild radius in metres; r_s = 2GM/c².
 * SI constants: c (exact), G (CODATA 2018), M☉ (NIST).
 */

const C_M_S = 299792458;
const G_M3_KG_S2 = 6.67430e-11;
const SOLAR_MASS_KG = 1.98892e30;

export function schwarzschildRadiusM(massSolar: number): number {
  const massKg = massSolar * SOLAR_MASS_KG;
  const cSquared = C_M_S * C_M_S;
  return (2 * G_M3_KG_S2 * massKg) / cSquared;
}
