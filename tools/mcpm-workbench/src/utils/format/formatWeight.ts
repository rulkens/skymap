/** A weight to two significant digits, without trailing zeros: 0.0415 → "0.042". */
export function formatWeight(value: number): string {
  return String(Number(value.toPrecision(2)));
}
