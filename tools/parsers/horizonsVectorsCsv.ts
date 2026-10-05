/**
 * parseHorizonsVectorsCsv — the data rows of a Horizons VECTORS result (CSV_FORMAT=YES,
 * VEC_TABLE=1): everything between `$$SOE` and `$$EOE`, columns `JDUT, Calendar, X, Y, Z,`.
 * The calendar column carries no comma of its own, so a plain split is safe.
 */

import type { HorizonsVectorRow } from './@types/HorizonsVectorRow';

export function parseHorizonsVectorsCsv(result: string): HorizonsVectorRow[] {
  const start = result.indexOf('$$SOE');
  const end = result.indexOf('$$EOE');
  if (start < 0 || end < start) throw new Error('parseHorizonsVectorsCsv: no $$SOE/$$EOE block');

  return result
    .slice(start + '$$SOE'.length, end)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const cols = line.split(',').map((c) => c.trim());
      const row = {
        jd: Number(cols[0]),
        xKm: Number(cols[2]),
        yKm: Number(cols[3]),
        zKm: Number(cols[4]),
      };
      if (![row.jd, row.xKm, row.yKm, row.zKm].every(Number.isFinite)) {
        throw new Error(`parseHorizonsVectorsCsv: unparseable row "${line}"`);
      }
      return row;
    });
}
