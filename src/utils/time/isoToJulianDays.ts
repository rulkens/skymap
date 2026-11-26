import { unixMsToJulianDays } from './unixMsToJulianDays';

/** isoToJulianDays — an ISO 8601 instant as Julian days (UTC), the sim clock's unit. */
export function isoToJulianDays(iso: string): number {
  return unixMsToJulianDays(Date.parse(iso));
}
