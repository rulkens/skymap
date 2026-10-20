/**
 * Squared angular separation in arcsec² between (raDeg, decDeg) and a target,
 * flat-sky (fine inside the 30″ search envelopes that use it). `cosDecT` is the
 * target's cos(dec), hoisted by callers that scan millions of rows.
 */
export function angularSepSqArcsec(
  raDeg: number,
  decDeg: number,
  raDegT: number,
  decDegT: number,
  cosDecT: number,
): number {
  const ddec = decDeg - decDegT;
  const dra = (((raDeg - raDegT + 540) % 360) - 180) * cosDecT;
  return (ddec * ddec + dra * dra) * 3600 * 3600;
}
