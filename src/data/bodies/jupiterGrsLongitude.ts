/**
 * Where Jupiter's Great Red Spot really is, to turn the fixed ~2000 Cassini texture by date.
 * The spot drifts ~20 deg/yr in System II and ~118 deg/yr in the texture's System III frame.
 *
 * L2 fit: least squares through JUPOS-based spot longitudes, unwrapped: 2019-06 ~309
 * (Sky & Telescope, Jun 2019: 308-311), 2025-03-01 = 71 and 2026-06-01 = 91 (S&T transit
 * calculator, anchored on JUPOS). The slope matches JUPOS's 1.75 deg/30 d (BAA Jupiter
 * Report 2024/25 no. 7; IMCCE JGRS). Residuals <= 3.2 deg; do not extrapolate far past 2027.
 * System II to III: Simon et al., NTRS 20210022719, eq. B2.
 */

/** Spot System II longitude, deg, at `GRS_L2_REF_JD` (the fit's pivot, 2025-03-01 0h). */
export const GRS_L2_REF_DEG = 427.848 - 360;
export const GRS_L2_REF_JD = 2460735.5;
/** Fitted drift of the spot in System II, deg per day (1.69 deg / 30 d). */
export const GRS_L2_DRIFT_DEG_PER_DAY = 0.056326;

/** L3 = L2 + 81.245 + 0.266 (JD - 2438761.5), JD 2438761.5 being 1965-01-01 0h UT. */
export const SYSTEM_III_MINUS_II_AT_1965_DEG = 81.245;
export const SYSTEM_III_MINUS_II_DRIFT_DEG_PER_DAY = 0.266;
export const JD_1965_JAN_1 = 2438761.5;

/** u of the spot's centre in the 4096-wide Cassini map (pixel 1500 of 4096, measured). */
export const JUPITER_TEXTURE_GRS_U = 1500 / 4096;
