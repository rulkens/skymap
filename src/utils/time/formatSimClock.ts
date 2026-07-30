/**
 * formatSimClock — render a wall-clock instant as a compact UTC date-time
 * readout, e.g. '2026-11-03 18:00 UTC'.
 *
 * The readout is fixed to UTC on purpose. The `t=` URL param (Task 5) encodes
 * its instant in UTC, so a UTC readout keeps what the user sees and what a
 * shared link carries in the same frame — no host-timezone drift between two
 * people looking at the same simulated moment.
 *
 * We pull the fields from the `Date`'s UTC getters and pad by hand rather than
 * leaning on `toISOString()`. `toISOString()` would give the same digits, but it
 * also carries seconds and milliseconds we don't want and reads as a machine
 * timestamp; composing the string field-by-field keeps the format ours to shape
 * (and lets the test assert an expected string that wasn't derived from the same
 * call the implementation makes).
 */

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

export function formatSimClock(date: Date): string {
  const year = date.getUTCFullYear().toString().padStart(4, '0');
  const month = pad2(date.getUTCMonth() + 1);
  const day = pad2(date.getUTCDate());
  const hours = pad2(date.getUTCHours());
  const minutes = pad2(date.getUTCMinutes());

  return `${year}-${month}-${day} ${hours}:${minutes} UTC`;
}
