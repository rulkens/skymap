import { julianDaysToUnixMs } from './julianDaysToUnixMs';

/** The UTC calendar date of a simulation clock reading, `YYYY-MM-DD`. */
export function simDaysToIsoDate(simDays: number): string {
  return new Date(julianDaysToUnixMs(simDays)).toISOString().slice(0, 10);
}
