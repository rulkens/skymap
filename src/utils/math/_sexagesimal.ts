/**
 * Internal sexagesimal decomposition helpers — not exported from the barrel.
 *
 * Both formatRaSexagesimal and formatDecSexagesimal (and sdssName) need to
 * convert a decimal angle into integer (major-unit, minutes, sub-seconds)
 * tuples. Two variants exist:
 *
 *   decomposeSexagesimal      — rounds to nearest (for display strings)
 *   decomposeSexagesimalTrunc — truncates (for IAU-stable catalog names)
 *
 * The fixed-point strategy (multiply → round/trunc to integer → integer
 * division) collapses all floating-point error into a single step, so values
 * like 23.9999998° become 24° rather than 23°59'60".
 */

import type { Vec3 } from '../../@types/Vec';

/**
 * Zero-pad an integer to at least `width` digits.
 * e.g. pad(7, 2) → "07", pad(123, 2) → "123".
 */
export function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

/**
 * Decompose a non-negative decimal value into integer sexagesimal components
 * using a fixed-point (integer) approach to avoid floating-point carry-up.
 *
 * The strategy:
 *   1. Convert the float to an integer by multiplying by `subunitFactor`
 *      (e.g. 100 for centiseconds, 10 for deciseconds) and rounding to the
 *      nearest integer. This collapses all intermediate floating-point error
 *      into a single rounding step on the original value, so 23.999999998°
 *      becomes 24°, not 23°59'60".
 *   2. Decompose the resulting integer by integer division — no further
 *      floating-point arithmetic.
 *
 * Returns [majorUnit, minutes, subunitsOfSecond] where:
 *   - majorUnit   : hours (for RA) or degrees (for Dec)
 *   - minutes     : arcminutes / hours-minutes
 *   - subunits    : arcseconds × subunitFactor (i.e. centiseconds or deciseconds)
 *
 * @param value         Non-negative value in hours (RA) or degrees (Dec).
 * @param subunitFactor 100 for centisecond RA, 10 for decisecond Dec.
 */
export function decomposeSexagesimal(
  value: number,
  subunitFactor: number,
): Vec3 {
  // Total subunits (centiseconds or deciseconds) as an integer.
  // Math.round handles the floating-point accumulation that would otherwise
  // cause remainders like 59.9999999 to appear instead of 60.
  const totalSubunits = Math.round(value * 3600 * subunitFactor);

  // Integer decomposition — no further floating-point arithmetic.
  const subunitsPerMinute = 60 * subunitFactor;
  const subunitsPerMajor = 60 * subunitsPerMinute;

  const major = Math.floor(totalSubunits / subunitsPerMajor);
  const remAfterMajor = totalSubunits % subunitsPerMajor;
  const minutes = Math.floor(remAfterMajor / subunitsPerMinute);
  const subunits = remAfterMajor % subunitsPerMinute;

  return [major, minutes, subunits];
}

/**
 * Decompose a non-negative decimal value into integer sexagesimal components
 * using a fixed-point (integer) approach with *truncation* (not rounding).
 *
 * This mirrors `decomposeSexagesimal` but uses `Math.trunc` rather than
 * `Math.round` because SDSS catalog names must be stable: rounding a seconds
 * value up can change the name as measurements are refined, whereas truncation
 * always matches the digits that appear in the catalog.
 *
 * Returns [majorUnit, minutes, subunitsOfSecond] where subunitsOfSecond is
 * an integer in [0, 60 × subunitFactor).
 *
 * @param value         Non-negative value in hours (RA) or degrees (Dec).
 * @param subunitFactor 100 for centisecond RA, 10 for decisecond Dec.
 */
export function decomposeSexagesimalTrunc(
  value: number,
  subunitFactor: number,
): Vec3 {
  // Convert to total subunits, truncating (flooring) rather than rounding.
  // Math.trunc is used for positive values — equivalent to Math.floor here
  // since value is always ≥ 0 after wrapping/clamping.
  const totalSubunits = Math.trunc(value * 3600 * subunitFactor);

  const subunitsPerMinute = 60 * subunitFactor;
  const subunitsPerMajor = 60 * subunitsPerMinute;

  const major = Math.floor(totalSubunits / subunitsPerMajor);
  const remAfterMajor = totalSubunits % subunitsPerMajor;
  const minutes = Math.floor(remAfterMajor / subunitsPerMinute);
  const subunits = remAfterMajor % subunitsPerMinute;

  return [major, minutes, subunits];
}
