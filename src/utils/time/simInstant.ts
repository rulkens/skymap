/**
 * simInstant — the sim clock's instant as a UTC Date. The base MUST be
 * `performance.now()`: `anchor.realMs` is one of its stamps, `Date.now()` is not.
 */
import type { TimeState } from '../../@types/time/TimeState';
import { deriveSimDays } from './deriveSimDays';
import { julianDaysToUnixMs } from './julianDaysToUnixMs';

export function simInstant(time: TimeState): Date {
  return new Date(julianDaysToUnixMs(deriveSimDays(time, performance.now())));
}
