/**
 * Luminosity in solar units from absolute G magnitude and effective
 * temperature, via the bolometric magnitude:
 *
 *   M_bol = absMagG + BC_G(T_eff)
 *   L/L☉  = 10^(−0.4·(M_bol − M_bol,☉)),   M_bol,☉ = 4.74 (IAU 2015)
 *
 * Composes `bolometricCorrectionG` for the band-to-bolometric step. The
 * absolute magnitude is the LUT-quantised value on the star record and carries
 * no extinction correction, so a reddened star reads too faint / too cool and
 * hence too luminous once its low temperature inflates the correction. An
 * order-of-magnitude estimate, not a measurement.
 */
import { bolometricCorrectionG } from './bolometricCorrectionG';

const M_BOL_SUN = 4.74;

export function starLuminositySolar(absMagG: number, teffK: number): number {
  const mBol = absMagG + bolometricCorrectionG(teffK);
  return 10 ** (-0.4 * (mBol - M_BOL_SUN));
}
