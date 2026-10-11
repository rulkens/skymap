/**
 * simInstant — the sim clock's current instant as a UTC Date.
 *
 * The time base MUST be `performance.now()`: `anchor.realMs` is itself a
 * `performance.now()` stamp, so a `Date.now()` base would subtract two unrelated
 * epochs and derive garbage simDays.
 */
import type { TimeState } from '../../@types/time/TimeState';
import { deriveSimDays } from './deriveSimDays';
import { julianDaysToUnixMs } from './julianDaysToUnixMs';

export function simInstant(time: TimeState): Date {
  return new Date(julianDaysToUnixMs(deriveSimDays(time, performance.now())));
}
