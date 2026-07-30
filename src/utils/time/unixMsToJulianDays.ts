/**
 * unixMsToJulianDays — convert a Unix epoch millisecond timestamp to a Julian
 * Day number.
 *
 * The ephemeris speaks Julian days; the browser (and `Date.now()`) speaks Unix
 * milliseconds. The conversion is a fixed affine map: divide by the ms-per-day
 * to get days since the Unix epoch, then add the Julian Day number of that epoch
 * instant. `2_440_587.5` is the JD of 1970-01-01T00:00:00Z — the `.5` is because
 * a Julian day starts at *noon*, so midnight is half a day in.
 */

export function unixMsToJulianDays(unixMs: number): number {
  return unixMs / 86_400_000 + 2_440_587.5;
}
