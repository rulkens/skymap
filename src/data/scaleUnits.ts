/**
 * SCALE_UNITS — unit conversion constants to Megaparsec (Mpc).
 *
 * The renderer's per-object coordinate matrices are always expressed
 * in Megaparsecs (Mpc) — a scale that fits the ~300 Mpc observable
 * universe comfortably into a graphics engine designed for objects
 * sized in meters and distances in kilometers.  Every input unit
 * (parsecs, kiloparsecs, kilometers, light-years, astronomical units)
 * arrives from different catalogs and lookup functions, so each gets a
 * named conversion constant here.  Centralising them means every site
 * that converts reads the same value — no risk of one distance formula
 * using 1e-3 for kpc-to-Mpc and another using 0.001 and drifting by
 * rounding.
 *
 * The exact derivations (PC_IN_KM, AU_IN_KM) come from the IAU physical
 * constants.  The unit-pair conversions (PC_TO_MPC, KPC_TO_MPC) are
 * dimensionless exponents; they live here for clarity over burying
 * 1e-6 in random expressions throughout the codebase.
 *
 * Ref: IAU 2015 redefinition of the AU (1.495978707 × 10¹¹ m);
 *      parsec defined as distance where 1 AU subtends 1 arcsecond.
 */

import { PC_TO_LY } from '../utils/math/constants';

// Named locals: physical constants per the IAU.
const PC_IN_KM = 3.0856775814913673e13;
const AU_IN_KM = 1.495978707e8;

// Named locals: unit conversion exponents.
const PC_TO_MPC = 1e-6;
const KPC_TO_MPC = 1e-3;
const MPC_TO_MPC = 1;
const GPC_TO_MPC = 1e3;

// Named locals: SI. Bodies are authored and framed in metres (the body-relative
// render frames work in SI), while several catalog constants and the atmosphere
// table are still km — so the km↔m pair is a real boundary, not a formality.
const KM_TO_M = 1e3;
const M_TO_KM = 1e-3;

// Derived: composite conversions from other units.
const KM_TO_MPC = PC_TO_MPC / PC_IN_KM;
const AU_TO_MPC = AU_IN_KM * KM_TO_MPC;
const LY_TO_MPC = PC_TO_MPC / PC_TO_LY;
const M_TO_MPC = KM_TO_MPC / KM_TO_M;
const MPC_TO_M = 1 / M_TO_MPC;

/**
 * Unit conversion constants, named `<FROM>_TO_<TO>`.
 *
 * Each key-value pair is a multiplication factor: multiply a distance
 * in the FROM unit by the constant to get the TO unit.
 *
 * Example: `distance_mpc = distance_au * SCALE_UNITS.AU_TO_MPC`.
 */
export const SCALE_UNITS: Readonly<{
  readonly KM_TO_MPC: number;
  readonly AU_TO_MPC: number;
  readonly PC_TO_MPC: number;
  readonly KPC_TO_MPC: number;
  readonly MPC_TO_MPC: number;
  readonly GPC_TO_MPC: number;
  readonly LY_TO_MPC: number;
  readonly KM_TO_M: number;
  readonly M_TO_KM: number;
  readonly M_TO_MPC: number;
  readonly MPC_TO_M: number;
}> = {
  KM_TO_MPC,
  AU_TO_MPC,
  PC_TO_MPC,
  KPC_TO_MPC,
  MPC_TO_MPC,
  GPC_TO_MPC,
  LY_TO_MPC,
  KM_TO_M,
  M_TO_KM,
  M_TO_MPC,
  MPC_TO_M,
} as const;
