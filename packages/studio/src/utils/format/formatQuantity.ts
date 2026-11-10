/**
 * A number with its unit per the naming table: one decimal only below 10, a true minus (U+2212),
 * a space before the unit except for degree units (`5.2°`, `1.4°/s`), and never `−0`.
 */
export function formatQuantity(value: number, unit: string): string {
  const rounded = Math.abs(value) < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  const magnitude = Math.abs(rounded);
  const sign = rounded < 0 ? '−' : '';
  const gap = unit.startsWith('°') ? '' : ' ';
  return `${sign}${magnitude}${gap}${unit}`;
}
