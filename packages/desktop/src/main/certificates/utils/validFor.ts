import { DAY_MS } from '../../../../../../src/data/time/dayMs';

/** A validity window of `days`, back-dated a day so a tablet whose clock runs slow still accepts it. */
export function validFor(days: number): { notBeforeDate: Date; notAfterDate: Date } {
  const now = Date.now();
  return { notBeforeDate: new Date(now - DAY_MS), notAfterDate: new Date(now + days * DAY_MS) };
}
