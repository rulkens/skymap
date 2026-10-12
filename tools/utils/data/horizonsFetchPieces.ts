/**
 * horizonsFetchPieces — the `[start, stop]` queries (`YYYY-MM-DD HH:MM` UT) that cover a span:
 * the span is cut at 50-year boundaries, then each cut is split into equal whole-step pieces of
 * ≤ 89,000 rows (Horizons caps one answer at ~90k). A span starting mid-chunk yields nothing
 * before its start. Steps divide a day, so a piece starting on a date starts on the step grid.
 */

const CHUNK_YEARS = 50;
const MAX_ROWS = 89_000;
const MS_PER_MINUTE = 60_000;

const calendar = (ms: number): string => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');

export function horizonsFetchPieces(
  span: readonly [string, string],
  stepMinutes: number,
): [string, string][] {
  const spanStart = Date.parse(`${span[0]}T00:00Z`);
  const spanStop = Date.parse(`${span[1]}T00:00Z`);
  const out: [string, string][] = [];
  const firstYear = Math.floor(new Date(spanStart).getUTCFullYear() / CHUNK_YEARS) * CHUNK_YEARS;
  for (let year = firstYear; Date.UTC(year, 0, 1) < spanStop; year += CHUNK_YEARS) {
    const t0 = Math.max(Date.UTC(year, 0, 1), spanStart);
    const t1 = Math.min(Date.UTC(year + CHUNK_YEARS, 0, 1), spanStop);
    const steps = (t1 - t0) / (stepMinutes * MS_PER_MINUTE);
    const perPiece = Math.ceil(steps / Math.ceil(steps / MAX_ROWS));
    for (let k = 0; k < steps; k += perPiece) {
      const end = Math.min(k + perPiece, steps);
      out.push([
        calendar(t0 + k * stepMinutes * MS_PER_MINUTE),
        calendar(t0 + end * stepMinutes * MS_PER_MINUTE),
      ]);
    }
  }
  return out;
}
