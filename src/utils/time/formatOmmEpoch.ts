/**
 * formatOmmEpoch — Unix ms back to an OMM `EPOCH` string (`2026-10-27T03:45:44.572896`, UTC, no zone
 * suffix), the inverse of `tools/utils/time/parseOmmEpochMs`. `satellite.js`'s `json2satrec` takes the
 * epoch only as this string, and `Date#toISOString` would cut it to milliseconds.
 */
export function formatOmmEpoch(epochMs: number): string {
  let wholeSeconds = Math.floor(epochMs / 1000);
  let micros = Math.round((epochMs - wholeSeconds * 1000) * 1000);
  if (micros === 1_000_000) {
    wholeSeconds += 1;
    micros = 0;
  }
  return `${new Date(wholeSeconds * 1000).toISOString().slice(0, 19)}.${String(micros).padStart(6, '0')}`;
}
