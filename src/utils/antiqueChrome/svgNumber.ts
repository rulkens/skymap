/** A coordinate for SVG markup: two decimals, no trailing zeros, so generated markup stays short and stable. */
export function svgNumber(n: number): string {
  return String(Math.round(n * 100) / 100);
}
