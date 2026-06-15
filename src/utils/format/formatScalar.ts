/**
 * Format a number with adaptive precision: an integer below 100, one
 * decimal between 10 and 100, two decimals between 1 and 10, and
 * `toLocaleString`'s default for very small or very large.  Keeps the
 * dual-unit distance string compact ("326 Mly" not "326.156 Mly")
 * without burying meaningful digits at low values.
 *
 * Shared by `formatDistance` and `formatDiameterKpc` — both pair a
 * parsec-family value with its light-year equivalent and need the same
 * compact rendering on each side of the slash.
 */
export function formatScalar(n: number): string {
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if (abs >= 100) return Math.round(n).toLocaleString();
  if (abs >= 10) return n.toFixed(1);
  if (abs >= 1) return n.toFixed(2);
  return n.toLocaleString();
}
