/** A number with its unit: a space before the unit except for degree units (`5.2°`, `1.4°/s`). */
import { formatNumber } from './formatNumber';

export function formatQuantity(value: number, unit: string): string {
  return `${formatNumber(value)}${unit.startsWith('°') ? '' : ' '}${unit}`;
}
