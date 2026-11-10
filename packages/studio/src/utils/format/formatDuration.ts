/** A duration for the Duration column: `4 s`, `1.5 s`, `11 s`, `0 s`. */
import { formatQuantity } from './formatQuantity';

export function formatDuration(sec: number): string {
  return formatQuantity(sec, 's');
}
