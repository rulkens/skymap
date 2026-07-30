/**
 * julianDaysToUnixMs — convert a Julian Day number to a Unix epoch millisecond
 * timestamp. The exact inverse of `unixMsToJulianDays`.
 *
 * The ephemeris (and the sim clock's anchor) speaks Julian days; the browser's
 * `Date` speaks Unix milliseconds. To serialize a sim instant into a URL as an
 * ISO 8601 string we first cross back into Unix-ms land, then hand the number to
 * `new Date(ms).toISOString()`. The map is the affine inverse: subtract the
 * Julian Day number of the Unix epoch (`2_440_587.5`, midnight 1970-01-01Z —
 * the `.5` because a Julian day starts at noon), then scale days → ms.
 *
 * Round-trips exactly with `unixMsToJulianDays` only when the input JD lands on a
 * whole-millisecond instant; `new Date` truncates sub-ms, so callers that need a
 * clean round-trip should seed their instant from a Unix-ms value in the first
 * place (as the URL compose/parse pair does).
 */

export function julianDaysToUnixMs(julianDays: number): number {
  return (julianDays - 2_440_587.5) * 86_400_000;
}
