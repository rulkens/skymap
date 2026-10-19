/**
 * formatSimClock — render a sim instant (Unix ms) as a compact UTC date-time
 * readout, e.g. '2026-11-03 18:00 UTC'; past the `Date` range (about year
 * ±275,760, which a far voyage's Earth clock passes) as signed years since
 * J2000, e.g. '+1,270,000 yr', never NaN.
 *
 * Fixed to UTC so the readout and the `t=` URL param share one frame. Fields
 * come from the UTC getters, padded by hand: `toISOString()` carries seconds
 * and reads as a machine timestamp.
 */

import { CONST_J2000 } from '../../data/time/constJ2000';
import { YEAR_MS } from '../../data/time/yearMs';
import { julianDaysToUnixMs } from './julianDaysToUnixMs';
import { formatYears } from '../voyage/formatYears';

const J2000_MS = julianDaysToUnixMs(CONST_J2000);

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

export function formatSimClock(unixMs: number): string {
  const date = new Date(unixMs);
  if (Number.isNaN(date.getTime())) {
    const yr = (unixMs - J2000_MS) / YEAR_MS;
    return `${yr < 0 ? '−' : '+'}${formatYears(Math.abs(yr))}`;
  }
  const year = date.getUTCFullYear().toString().padStart(4, '0');
  const month = pad2(date.getUTCMonth() + 1);
  const day = pad2(date.getUTCDate());
  const hours = pad2(date.getUTCHours());
  const minutes = pad2(date.getUTCMinutes());

  return `${year}-${month}-${day} ${hours}:${minutes} UTC`;
}
