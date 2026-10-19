/**
 * isoOfSimDays — a sim instant (Julian days) as an ISO 8601 UTC string, or null
 * when it falls outside the `Date` range (±8.64e15 ms, about year ±275,760),
 * where `toISOString` throws. A far voyage's Earth clock passes that edge, and
 * every URL composer must skip the `t` key there rather than throw.
 */

import { julianDaysToUnixMs } from './julianDaysToUnixMs';

export function isoOfSimDays(simDays: number): string | null {
  const date = new Date(julianDaysToUnixMs(simDays));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
