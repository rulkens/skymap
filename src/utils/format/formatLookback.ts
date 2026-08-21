/**
 * Format a lookback time in gigayears with adaptive units. Every galaxy in
 * the Local Group and much of the local volume lies well under 1 Gyr away in
 * light-travel time, and `toFixed(1)` on raw Gyr floors those to "0.0 Gyr" —
 * uninformative for anything the InfoCard is most likely to show up close.
 * Steps down through Myr and, for the nearest Local-Group members, spelled-out
 * years (kyr is not a lay unit at this scale).
 *
 * @param gyr  Lookback time in gigayears. Expected non-negative.
 */
import { formatScalar } from './formatScalar';

export function formatLookback(gyr: number): string {
  if (gyr >= 1) return `${formatScalar(gyr)} Gyr`;
  if (gyr >= 0.001) return `${formatScalar(gyr * 1000)} Myr`;
  return `${Math.round(gyr * 1e9).toLocaleString()} years`;
}
