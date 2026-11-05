/**
 * Bolometric correction in the Gaia G band as a function of effective
 * temperature — Andrae et al. 2018 (Gaia DR2 Apsis, A&A 616 A8), Eq. 7 +
 * Table 4, using only the 4000–8000 K quartic fit:
 *
 *   BC_G(T) = 0.06 + 6.731e−5·ΔT − 6.647e−8·ΔT² + 2.859e−11·ΔT³ − 7.197e−15·ΔT⁴
 *   ΔT = T_eff − 5772
 *
 * T_eff is clamped to [4000, 8000] before evaluating. The clamp to 4000 K
 * (rather than falling through to the paper's second, 3300–4000 K coefficient
 * set) is deliberate: that low-temperature set is listed as WRONG on the
 * official Gaia DR2 known-issues page, so this util never uses it.
 *
 * M_bol,☉ = 4.74 is applied downstream in `starLuminositySolar`, not here.
 */
export function bolometricCorrectionG(teffK: number): number {
  const dT = Math.min(8000, Math.max(4000, teffK)) - 5772;
  return 0.06 + 6.731e-5 * dT - 6.647e-8 * dT ** 2 + 2.859e-11 * dT ** 3 - 7.197e-15 * dT ** 4;
}
