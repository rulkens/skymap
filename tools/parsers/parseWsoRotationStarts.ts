/**
 * parseWsoRotationStarts — Carrington rotation number → start time in days since the Unix
 * epoch, from the WSO tilt table's `CR 1642  1976:05:27 15h` rows. The times are UT, so they
 * go through Date.UTC rather than the local-time Date constructor.
 */

const MS_PER_DAY = 86_400_000;
const ROW = /CR (\d+)\s+(\d{4}):(\d\d):(\d\d) (\d\d)h/g;

export function parseWsoRotationStarts(html: string): Map<number, number> {
  const starts = new Map<number, number>();
  for (const [, cr, year, month, day, hour] of html.matchAll(ROW)) {
    starts.set(
      Number(cr),
      Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour)) / MS_PER_DAY,
    );
  }
  return starts;
}
