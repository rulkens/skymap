/**
 * A_LY_PER_YR2 — 1 g of proper acceleration in units where c = 1: light-years per year².
 * a = g · yr / c ≈ 1.0323, from standard gravity (exact, CGPM 1901), the Julian year and c (exact).
 */

import { C_KM_S } from '../../utils/math/constants';
import { YEAR_MS } from '../time/yearMs';

const STANDARD_GRAVITY_M_S2 = 9.80665;

export const A_LY_PER_YR2 = (STANDARD_GRAVITY_M_S2 * (YEAR_MS / 1000)) / (C_KM_S * 1000);
