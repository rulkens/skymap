/** A bare number per the naming table: one decimal only below 10, a true minus (U+2212), never `−0`. */
export function formatNumber(value: number): string {
  const rounded = Math.abs(value) < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${rounded < 0 ? '−' : ''}${Math.abs(rounded)}`;
}
